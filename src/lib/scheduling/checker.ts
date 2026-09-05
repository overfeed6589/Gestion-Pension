import { db } from '@/db';
import { bookings, bookingSegments, housingBlocks, housingUnits } from '@/db/schema';
import { and, eq, ne, sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Vérifications de disponibilité (Phase B1)
// ---------------------------------------------------------------------------
// Raisons de la réécriture :
//  - L'ancien `isHousingUnitAvailable` chargeait TOUS les segments d'une unité
//    puis filtrait en JS : sans filtre SQL sur les dates, et en comparant les
//    dates du booking (checkIn/out) au lieu de celles du segment. Pire : il
//    renvoyait toujours `{ available: false }`.
//  - Ici les chevauchements sont calculés en SQL (une seule requête) et on
//    respecte une sémantique de séjour par nuit [start, end) : deux séjours se
//    chevauchent ssi `existing.start < end && existing.end > start`.
//  - Correctif review (B3/B4) : la fin effective d'un séjour tient compte du
//    départ réel — `COALESCE(actual_check_out, segment.end_date)` — pour libérer
//    l'unité dès qu'un animal est réellement sorti (départ anticipé).
//  - Ces fonctions sont READ-ONLY (pré-visualisation UI / planning). Les
//    écritures atomiques vivent dans allocation.ts (verrou + re-vérification).
// ---------------------------------------------------------------------------

/** Normalise une date (Date ou ISO) en chaîne 'YYYY-MM-DD'. */
export function toDateString(value: Date | string): string {
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

export type SegmentOverlap = {
  id: string;
  bookingId: string;
  unitId: string | null;
  startDate: string;
  endDate: string;
  bookingStatus: string;
};

/**
 * Segments actifs (réservation non annulée) qui se chevauchent sur l'unité
 * donnée pour la période [start, end). Exclut éventuellement un segment
 * (cas d'une modification : le segment en cours ne doit pas se « confliter »
 * avec lui-même).
 */
export async function getUnitSegmentOverlaps(
  unitId: string,
  start: Date | string,
  end: Date | string,
  excludeSegmentId?: string
): Promise<SegmentOverlap[]> {
  const startStr = toDateString(start);
  const endStr = toDateString(end);

  const rows = await db
    .select({
      id: bookingSegments.id,
      bookingId: bookingSegments.bookingId,
      unitId: bookingSegments.unitId,
      startDate: bookingSegments.startDate,
      endDate: bookingSegments.endDate,
      bookingStatus: bookings.status,
    })
    .from(bookingSegments)
    .innerJoin(bookings, eq(bookingSegments.bookingId, bookings.id))
    .where(
      and(
        eq(bookingSegments.unitId, unitId),
        // Seuls `cancelled` et `expired` libèrent l'unité (offres non honorées).
        sql`${bookings.status} not in ('cancelled', 'expired')`,
        excludeSegmentId ? ne(bookingSegments.id, excludeSegmentId) : undefined,
        sql`${bookingSegments.startDate} < ${endStr}::date`,
        sql`COALESCE(${bookings.actualCheckOut}::date, ${bookingSegments.endDate}) > ${startStr}::date`
      )
    );

  return rows.map((r) => ({
    ...r,
    startDate: toDateString(r.startDate),
    endDate: toDateString(r.endDate),
  }));
}

/** Blocages de maintenance (housing_blocks) chevauchant [start, end). */
export async function getUnitMaintenanceOverlaps(
  unitId: string,
  start: Date | string,
  end: Date | string
): Promise<Array<{ id: string; reason: string | null; startDate: string; endDate: string }>> {
  const startStr = toDateString(start);
  const endStr = toDateString(end);

  const rows = await db
    .select({
      id: housingBlocks.id,
      reason: housingBlocks.reason,
      startDate: housingBlocks.startDate,
      endDate: housingBlocks.endDate,
    })
    .from(housingBlocks)
    .where(
      and(
        eq(housingBlocks.unitId, unitId),
        sql`${housingBlocks.startDate} < ${endStr}::date`,
        sql`${housingBlocks.endDate} > ${startStr}::date`
      )
    );

  return rows.map((r) => ({
    ...r,
    startDate: toDateString(r.startDate),
    endDate: toDateString(r.endDate),
  }));
}

export type UnitAvailabilityResult = {
  available: boolean;
  reason?: 'segment' | 'maintenance' | 'unit_inactive';
  conflictingSegmentId?: string;
};

/**
 * L'unité est-elle libre sur [start, end) ?
 * Vrai uniquement si : aucun segment actif en conflit, aucun blocage
 * maintenance, et l'unité n'est pas marquée indisponible (is_available=false,
 * ex. box hors service).
 */
export async function isUnitAvailableForPeriod(
  unitId: string,
  start: Date | string,
  end: Date | string,
  excludeSegmentId?: string
): Promise<UnitAvailabilityResult> {
  const [unit] = await db
    .select({ id: housingUnits.id, isAvailable: housingUnits.isAvailable })
    .from(housingUnits)
    .where(eq(housingUnits.id, unitId))
    .limit(1);

  if (!unit) {
    return { available: false, reason: 'unit_inactive' };
  }

  const [overlap] = await getUnitSegmentOverlaps(unitId, start, end, excludeSegmentId);
  if (overlap) {
    return {
      available: false,
      reason: 'segment',
      conflictingSegmentId: overlap.id,
    };
  }

  const maintenance = await getUnitMaintenanceOverlaps(unitId, start, end);
  if (maintenance.length > 0) {
    return { available: false, reason: 'maintenance' };
  }

  if (!unit.isAvailable) {
    return { available: false, reason: 'unit_inactive' };
  }

  return { available: true };
}

/**
 * Première unité libre de la catégorie sur [start, end), ou null.
 * (Planning manuel : propose une unité, la validation finale reste atomique
 * dans allocation.ts.)
 */
export async function findFreeUnitInCategory(
  categoryId: string,
  start: Date | string,
  end: Date | string,
  excludeSegmentId?: string
): Promise<string | null> {
  const units = await db
    .select({ id: housingUnits.id })
    .from(housingUnits)
    .where(and(eq(housingUnits.categoryId, categoryId), eq(housingUnits.isAvailable, true)));

  for (const unit of units) {
    const result = await isUnitAvailableForPeriod(unit.id, start, end, excludeSegmentId);
    if (result.available) return unit.id;
  }

  return null;
}
