import { db } from '@/db';
import { bookings, bookingSegments, housingBlocks, housingUnits } from '@/db/schema';
import { and, eq, ne, sql } from 'drizzle-orm';
import { toDateString } from './checker';

// ---------------------------------------------------------------------------
// Opérations d'allocation ATOMIQUES (Phase B1)
// ---------------------------------------------------------------------------
// Raisons :
//  - L'ancien flux « vérifier puis écrire » (2 requêtes séparées) laissait une
//    fenêtre de course : deux gestionnaires simultanés pouvaient réserver le même
//    box (le contrôle de disponibilité se faisait hors transaction, sans verrou).
//  - Ici, toute attribution se fait DANS une transaction : on verrouille la ligne
//    unité (`FOR UPDATE`, sérialise les attributions du même box), on RE-vérifie
//    le chevauchement dans la même transaction, puis on écrit. La contrainte
//    d'exclusion (Phase B2) reste la garantie ultime si une écriture contourne
//    ce code (insert direct, requête ad hoc).
//  - Correctif review : le chevauchement est vérifié sur les dates STOCKÉES du
//    segment (lues sous verrou), pas sur des dates fournies par l'appelant qui
//    pourraient diverger. Les violations de contrainte (23P01/23505) sont aussi
//    traduites en « box occupé » au lieu de remonter comme erreur 500.
// ---------------------------------------------------------------------------

// Type de la transaction drizzle (inféré depuis db.transaction).
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type AllocationConflictReason = 'segment' | 'maintenance' | 'unit_unavailable';

/** Erreur Postgres émise par la contrainte d'exclusion / d'unicité (Phase B2). */
function isConstraintViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as { code?: unknown }).code === 'string' &&
    ['23P01', '23505', '40001'].includes((err as { code: string }).code)
  );
}

/**
 * Recherche un conflit sur l'unité dans [startStr, endStr), au sein de la
 * transaction (donc cohérent avec le verrou FOR UPDATE posé au préalable).
 * Le départ réel (`actual_check_out`) libère l'unité dès qu'il est passé :
 * on compare donc la fin de l'autre segment à `actual_check_out` si renseigné.
 */
async function findConflictInUnit(
  tx: Tx,
  unitId: string,
  startStr: string,
  endStr: string,
  excludeSegmentId?: string
): Promise<AllocationConflictReason | null> {
  const [segmentConflict] = await tx
    .select({ id: bookingSegments.id })
    .from(bookingSegments)
    .innerJoin(bookings, eq(bookingSegments.bookingId, bookings.id))
    .where(
      and(
        eq(bookingSegments.unitId, unitId),
        ne(bookings.status, 'cancelled'),
        excludeSegmentId ? ne(bookingSegments.id, excludeSegmentId) : undefined,
        sql`${bookingSegments.startDate} < ${endStr}::date`,
        sql`COALESCE(${bookings.actualCheckOut}::date, ${bookingSegments.endDate}) > ${startStr}::date`
      )
    )
    .limit(1);

  if (segmentConflict) return 'segment';

  const [blockConflict] = await tx
    .select({ id: housingBlocks.id })
    .from(housingBlocks)
    .where(
      and(
        eq(housingBlocks.unitId, unitId),
        sql`${housingBlocks.startDate} < ${endStr}::date`,
        sql`${housingBlocks.endDate} > ${startStr}::date`
      )
    )
    .limit(1);

  if (blockConflict) return 'maintenance';

  return null;
}

export type AssignUnitResult =
  | { ok: true; message?: string }
  | { ok: false; code: 'not_found' | 'conflict' | 'invalid_range'; reason?: AllocationConflictReason; message: string };

export interface AssignUnitInput {
  bookingId: string;
  segmentId: string;
  unitId: string;
}

/**
 * Affecte une unité à un segment de réservation, de façon atomique.
 * Ne modifie la base que si l'unité est effectivement libre sur la période du
 * segment (dates stockées, lues sous verrou).
 */
export async function assignUnitToSegment(input: AssignUnitInput): Promise<AssignUnitResult> {
  try {
    return await db.transaction(async (tx) => {
      // 1. Verrouille l'unité : sérialise toutes les attributions de ce box.
      const [unit] = await tx
        .select({ id: housingUnits.id, isAvailable: housingUnits.isAvailable })
        .from(housingUnits)
        .where(eq(housingUnits.id, input.unitId))
        .for('update')
        .limit(1);

      if (!unit) {
        return { ok: false, code: 'not_found', message: 'Unité de logement introuvable.' } as AssignUnitResult;
      }

      // 2. Verrouille le segment et lit SA période (source de vérité des dates).
      const [segment] = await tx
        .select({
          id: bookingSegments.id,
          bookingId: bookingSegments.bookingId,
          startDate: bookingSegments.startDate,
          endDate: bookingSegments.endDate,
        })
        .from(bookingSegments)
        .where(eq(bookingSegments.id, input.segmentId))
        .for('update')
        .limit(1);

      if (!segment || segment.bookingId !== input.bookingId) {
        return { ok: false, code: 'not_found', message: 'Segment de réservation introuvable ou incohérent.' } as AssignUnitResult;
      }

      const startStr = toDateString(segment.startDate);
      const endStr = toDateString(segment.endDate);

      if (startStr >= endStr) {
        return { ok: false, code: 'invalid_range', message: 'La période du segment est invalide (sortie ≤ entrée).' } as AssignUnitResult;
      }

      // 3. Re-vérification dans la transaction (exclut le segment en cours).
      if (!unit.isAvailable) {
        return { ok: false, code: 'conflict', reason: 'unit_unavailable', message: 'Ce box est marqué indisponible.' } as AssignUnitResult;
      }
      const conflict = await findConflictInUnit(tx, input.unitId, startStr, endStr, input.segmentId);
      if (conflict) {
        return {
          ok: false,
          code: 'conflict',
          reason: conflict,
          message: 'Conflit détecté : ce box est déjà occupé ou réservé sur cette période.',
        } as AssignUnitResult;
      }

      // 4. Écriture.
      await tx
        .update(bookingSegments)
        .set({ unitId: input.unitId })
        .where(eq(bookingSegments.id, input.segmentId));

      return { ok: true, message: 'Box assigné avec succès au séjour.' };
    });
  } catch (err) {
    if (isConstraintViolation(err)) {
      // Course gagnée par un autre process : la contrainte d'exclusion rejette
      // notre écriture. On renvoie un conflit lisible plutôt qu'une erreur brute.
      return {
        ok: false,
        code: 'conflict',
        reason: 'segment',
        message: 'Conflit détecté : ce box vient d’être réservé par un autre gestionnaire sur cette période.',
      };
    }
    throw err;
  }
}

export type CreateSegmentInput = {
  bookingId: string;
  categoryId: string;
  checkInDate: Date | string;
  checkOutDate: Date | string;
  segmentPrice: number;
  /** Si vrai, attribue automatiquement la première unité libre de la catégorie. */
  autoAssign?: boolean;
};

export type CreateSegmentResult =
  | { ok: true; segmentId: string; unitId: string | null }
  | { ok: false; code: 'conflict' | 'invalid_range' | 'no_unit_available' | 'not_found'; message: string };

/** Choisit une unité libre de la catégorie en verrouillant/ré-vérifiant. */
async function pickAndLockFreeUnit(
  tx: Tx,
  categoryId: string,
  startStr: string,
  endStr: string
): Promise<string | null> {
  const candidates = await tx
    .select({ id: housingUnits.id })
    .from(housingUnits)
    .where(and(eq(housingUnits.categoryId, categoryId), eq(housingUnits.isAvailable, true)));

  for (const candidate of candidates) {
    const [unit] = await tx
      .select({ id: housingUnits.id })
      .from(housingUnits)
      .where(eq(housingUnits.id, candidate.id))
      .for('update')
      .limit(1);

    if (!unit) continue;

    const conflict = await findConflictInUnit(tx, candidate.id, startStr, endStr);
    if (!conflict) return candidate.id;
  }

  return null;
}

/**
 * Crée un segment de séjour (période + catégorie) et, si autoAssign, lui
 * attribue atomiquement une unité libre.
 */
export async function createBookingSegment(input: CreateSegmentInput): Promise<CreateSegmentResult> {
  const startStr = toDateString(input.checkInDate);
  const endStr = toDateString(input.checkOutDate);

  if (startStr >= endStr) {
    return { ok: false, code: 'invalid_range', message: 'La date de sortie doit être postérieure à la date d’entrée.' };
  }

  try {
    return await db.transaction(async (tx) => {
      let unitId: string | null = null;

      if (input.autoAssign) {
        unitId = await pickAndLockFreeUnit(tx, input.categoryId, startStr, endStr);
        if (!unitId) {
          return { ok: false, code: 'no_unit_available', message: 'Aucune unité disponible dans cette catégorie sur cette période.' } as CreateSegmentResult;
        }
      }

      const [newSegment] = await tx
        .insert(bookingSegments)
        .values({
          bookingId: input.bookingId,
          categoryId: input.categoryId,
          unitId,
          startDate: startStr,
          endDate: endStr,
          segmentPrice: input.segmentPrice,
        })
        .returning({ id: bookingSegments.id });

      return { ok: true, segmentId: newSegment.id, unitId };
    });
  } catch (err) {
    if (isConstraintViolation(err)) {
      return { ok: false, code: 'conflict', message: 'Conflit détecté : le box vient d’être réservé par un autre gestionnaire.' };
    }
    throw err;
  }
}
