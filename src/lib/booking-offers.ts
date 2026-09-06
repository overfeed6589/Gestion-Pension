import { db } from '@/db';
import { bookings, segmentPets, housingCategories, clients, pets } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { toDateString } from '@/lib/scheduling/checker';
import { createBookingSegmentTx } from '@/lib/scheduling/allocation';
import { computeDepositAmount } from '@/lib/pricing';
import { getPensionSettings } from '@/lib/settings';
import {
  buildOfferPlan,
  type OfferSegmentInput,
  type PricedOfferSegment,
} from '@/lib/offer-plan';
import type { BookingSource } from '@/db/schema';

// Re-exports pour compatibilité (le plan d'offre pur vit dans lib/offer-plan).
export type { OfferSegmentInput, OfferPlanCategory, PricedOfferSegment, OfferPlan } from '@/lib/offer-plan';
export { buildOfferPlan } from '@/lib/offer-plan';

// ---------------------------------------------------------------------------
// Création d'une réservation avec OFFRE (Phase G3)
// ---------------------------------------------------------------------------
// Une « offre » = un booking `offered` + des `booking_segments` créés ATOMiquement
// avec attribution d'unité (autoAssign). Les segments d'un booking `offered`
// BLOQUENT les unités (checker/allocation n'excluent que cancelled/expired) :
// c'est le verrou anti-double-offre. Le paiement de l'acompte convertit ensuite
// le booking en `confirmed`.
//
// La VALIDATION (dates, capacité, couverture) et le CALCUL DE PRIX sont PURE
// (`buildOfferPlan` dans lib/offer-plan, testée sans DB) ; les fonctions qui
// touchent la base s'appuient dessus avant toute écriture.
// ---------------------------------------------------------------------------

export type CreateOfferInput = {
  clientId: string;
  checkInDate: string;
  checkOutDate: string;
  segments: OfferSegmentInput[];
  source?: BookingSource;
  /** Statut du booking créé : 'offered' (défaut) ou 'proposed' (hold G9). */
  status?: 'offered' | 'proposed';
  requestNotes?: string | null;
  rgpdConsentAt?: Date | null;
};

export type AttachOfferInput = {
  bookingId: string;
  checkInDate: string;
  checkOutDate: string;
  segments: OfferSegmentInput[];
};

export type CreateOfferResult =
  | {
      ok: true;
      bookingId: string;
      totalPrice: number;
      depositAmount: number;
      offeredExpiresAt: Date;
    }
  | { ok: false; message: string };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// ---------------------------------------------------------------------------
// Création directe (booking + offre)
// ---------------------------------------------------------------------------

async function createOfferInTx(
  tx: Tx,
  input: CreateOfferInput,
  opts: { depositPercent: number; offerValidityHours: number }
): Promise<CreateOfferResult> {
  // 1. Client + animaux doivent exister et appartenir au client.
  const [client] = await tx.select().from(clients).where(eq(clients.id, input.clientId)).limit(1);
  if (!client) return { ok: false, message: 'Client introuvable.' };

  const clientPets = await tx
    .select({ id: pets.id })
    .from(pets)
    .where(eq(pets.clientId, input.clientId));
  const clientPetIds = new Set(clientPets.map((p) => p.id));
  const allPetIds = [...new Set(input.segments.flatMap((s) => s.petIds))];
  if (allPetIds.length === 0) return { ok: false, message: 'Aucun animal sur cette offre.' };
  if (allPetIds.some((id) => !clientPetIds.has(id))) {
    return { ok: false, message: 'Un animal de l’offre n’appartient pas à ce client.' };
  }

  // 2. Plan d'offre (validation + prix) : aucune écriture si invalide.
  const categoryIds = [...new Set(input.segments.map((s) => s.categoryId))];
  const categories = await tx
    .select()
    .from(housingCategories)
    .where(inArray(housingCategories.id, categoryIds));
  const plan = buildOfferPlan({
    checkInDate: input.checkInDate,
    checkOutDate: input.checkOutDate,
    segments: input.segments,
    categories,
  });
  if (!plan.ok) return plan;

  // 3. Booking `offered` — segments bloquants.
  const startStr = toDateString(input.checkInDate);
  const endStr = toDateString(input.checkOutDate);
  const depositAmount = computeDepositAmount(plan.totalPrice, opts.depositPercent);
  const offeredExpiresAt = new Date(Date.now() + opts.offerValidityHours * 3600 * 1000);

  const [newBooking] = await tx
    .insert(bookings)
    .values({
      clientId: input.clientId,
      status: input.status ?? 'offered',
      source: input.source ?? 'phone',
      totalPrice: plan.totalPrice,
      depositAmount,
      paymentStatus: 'unpaid',
      checkInDate: new Date(`${startStr}T00:00:00Z`),
      checkOutDate: new Date(`${endStr}T00:00:00Z`),
      offeredExpiresAt,
      requestNotes: input.requestNotes ?? null,
      rgpdConsentAt: input.rgpdConsentAt ?? null,
    })
    .returning({ id: bookings.id });

  const segmentError = await insertPlanSegments(tx, newBooking.id, plan.segments);
  if (segmentError) return { ok: false, message: segmentError };

  return {
    ok: true,
    bookingId: newBooking.id,
    totalPrice: plan.totalPrice,
    depositAmount,
    offeredExpiresAt,
  };
}

// ---------------------------------------------------------------------------
// Demande web → offre (booking `requested` existant)
// ---------------------------------------------------------------------------

async function attachOfferInTx(
  tx: Tx,
  input: AttachOfferInput,
  opts: { depositPercent: number; offerValidityHours: number }
): Promise<CreateOfferResult> {
  const [booking] = await tx
    .select()
    .from(bookings)
    .where(eq(bookings.id, input.bookingId))
    .for('update')
    .limit(1);
  if (!booking) return { ok: false, message: 'Demande introuvable.' };
  if (booking.status !== 'requested') {
    return { ok: false, message: 'Seule une demande en attente peut recevoir une offre.' };
  }

  const clientPets = await tx
    .select({ id: pets.id })
    .from(pets)
    .where(eq(pets.clientId, booking.clientId));
  const clientPetIds = new Set(clientPets.map((p) => p.id));
  const allPetIds = [...new Set(input.segments.flatMap((s) => s.petIds))];
  if (allPetIds.length === 0) return { ok: false, message: 'Aucun animal sur cette offre.' };
  if (allPetIds.some((id) => !clientPetIds.has(id))) {
    return { ok: false, message: 'Un animal de l’offre n’appartient pas à ce client.' };
  }

  const categoryIds = [...new Set(input.segments.map((s) => s.categoryId))];
  const categories = await tx
    .select()
    .from(housingCategories)
    .where(inArray(housingCategories.id, categoryIds));
  const plan = buildOfferPlan({
    checkInDate: input.checkInDate,
    checkOutDate: input.checkOutDate,
    segments: input.segments,
    categories,
  });
  if (!plan.ok) return plan;

  const startStr = toDateString(input.checkInDate);
  const endStr = toDateString(input.checkOutDate);
  const depositAmount = computeDepositAmount(plan.totalPrice, opts.depositPercent);
  const offeredExpiresAt = new Date(Date.now() + opts.offerValidityHours * 3600 * 1000);

  await tx
    .update(bookings)
    .set({
      status: 'offered',
      totalPrice: plan.totalPrice,
      depositAmount,
      paymentStatus: 'unpaid',
      checkInDate: new Date(`${startStr}T00:00:00Z`),
      checkOutDate: new Date(`${endStr}T00:00:00Z`),
      offeredExpiresAt,
    })
    .where(eq(bookings.id, booking.id));

  const segmentError = await insertPlanSegments(tx, booking.id, plan.segments);
  if (segmentError) return { ok: false, message: segmentError };

  return {
    ok: true,
    bookingId: booking.id,
    totalPrice: plan.totalPrice,
    depositAmount,
    offeredExpiresAt,
  };
}

/** Crée les segments validés du plan + lie les animaux. Retourne null si OK. */
async function insertPlanSegments(
  tx: Tx,
  bookingId: string,
  segments: PricedOfferSegment[]
): Promise<string | null> {
  for (const seg of segments) {
    const created = await createBookingSegmentTx(tx, {
      bookingId,
      categoryId: seg.categoryId,
      checkInDate: seg.startDate,
      checkOutDate: seg.endDate,
      segmentPrice: seg.price,
      autoAssign: true,
    });
    if (!created.ok) {
      return created.message;
    }
    if (created.unitId == null) {
      return 'Attribution de box impossible pour un segment.';
    }
    await tx.insert(segmentPets).values(
      seg.petIds.map((petId) => ({ segmentId: created.segmentId, petId }))
    );
  }
  return null;
}

/**
 * Transforme une DEMANDE (`requested`) en OFFRE (`offered`) : mêmes validations
 * et blocage des espaces que la création directe, mais sur un booking existant
 * (issu du site public). Transaction unique.
 */
export async function attachOfferToBooking(
  input: AttachOfferInput
): Promise<CreateOfferResult> {
  const settings = await getPensionSettings();
  try {
    return await db.transaction(async (tx) =>
      attachOfferInTx(tx, input, {
        depositPercent: settings.depositPercent,
        offerValidityHours: settings.offerValidityHours,
      })
    );
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === '23P01' || code === '40001') {
      return { ok: false, message: 'Conflit : une unité vient d’être réservée sur cette période.' };
    }
    console.error('attachOfferToBooking :', err);
    return { ok: false, message: 'Erreur lors de la création de l’offre.' };
  }
}

/**
 * Crée la réservation + ses segments dans une transaction unique.
 * Une seule transaction : si un segment échoue (box indisponible), tout est
 * annulé (pas de booking orphelin).
 */
export async function createBookingWithOffer(input: CreateOfferInput): Promise<CreateOfferResult> {
  const settings = await getPensionSettings();

  try {
    return await db.transaction(async (tx) =>
      createOfferInTx(tx, input, {
        depositPercent: settings.depositPercent,
        offerValidityHours: settings.offerValidityHours,
      })
    );
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === '23P01' || code === '40001') {
      return { ok: false, message: 'Conflit : une unité vient d’être réservée sur cette période.' };
    }
    if (code === '23505') {
      return { ok: false, message: 'Conflit d’unicité sur cette offre.' };
    }
    console.error('createBookingWithOffer :', err);
    return { ok: false, message: 'Erreur lors de la création de l’offre.' };
  }
}
