import { db } from '@/db';
import {
  bookings,
  segmentPets,
  housingCategories,
  clients,
  pets,
} from '@/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { toDateString } from '@/lib/scheduling/checker';
import { createBookingSegmentTx } from '@/lib/scheduling/allocation';
import { computeSegmentPrice, computeDepositAmount } from '@/lib/pricing';
import { getPensionSettings } from '@/lib/settings';
import type { BookingSource } from '@/db/schema';

// ---------------------------------------------------------------------------
// Création d'une réservation avec OFFRE (Phase G3)
// ---------------------------------------------------------------------------
// Une « offre » = un booking `offered` + des `booking_segments` créés ATOMiquement
// avec attribution d'unité (autoAssign). Les segments d'un booking `offered`
// BLOQUENT les unités (checker/allocation n'excluent que cancelled/expired) :
// c'est le verrou anti-double-offre. Le paiement de l'acompte convertit ensuite
// le booking en `confirmed`.
//
// Le découpage temporel est flexible :
//  - segments SÉQUENTIELS (séjour scindé dans le temps, ex: 11 j type 1 + 2 j type 2)
//  - segments PARALLÈLES (groupe dépassant la capacité d'un espace → réparti sur
//    plusieurs espaces la même nuit)
// Chaque segment porte la liste des animaux qui l'occupent (`segment_pets`) :
// la tarification se fait par segment (base + supplément/animal au-delà du 1er).
// ---------------------------------------------------------------------------

export type OfferSegmentInput = {
  startDate: string; // 'YYYY-MM-DD'
  endDate: string; // 'YYYY-MM-DD' (fin exclusive)
  categoryId: string;
  petIds: string[]; // animaux occupant CE segment
};

export type CreateOfferInput = {
  clientId: string;
  checkInDate: string;
  checkOutDate: string;
  segments: OfferSegmentInput[];
  source?: BookingSource;
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

/** Liste des nuits (dates 'YYYY-MM-DD') couvertes par [start, end). */
function nightsBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const limit = new Date(`${end}T00:00:00Z`);
  while (cursor < limit) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/** Vérifie que chaque animal couvre EXACTEMENT chaque nuit du séjour. */
function validateCoverage(
  allPetIds: string[],
  segments: OfferSegmentInput[],
  stayNights: string[]
): string | null {
  const staySet = new Set(stayNights);
  for (const petId of allPetIds) {
    const coveredNights: string[] = [];
    for (const seg of segments) {
      if (!seg.petIds.includes(petId)) continue;
      coveredNights.push(...nightsBetween(seg.startDate, seg.endDate));
    }
    // Pas de doublon (un animal ne peut pas être dans 2 espaces la même nuit).
    const seen = new Set<string>();
    for (const night of coveredNights) {
      if (seen.has(night)) return 'Un animal apparaît dans plusieurs espaces la même nuit.';
      seen.add(night);
    }
    // Couverture complète du séjour.
    if (seen.size !== staySet.size) return 'Un animal ne couvre pas la totalité du séjour.';
    for (const night of staySet) {
      if (!seen.has(night)) return 'Un animal ne couvre pas la totalité du séjour.';
    }
  }
  return null;
}

async function createOfferInTx(
  tx: Tx,
  input: CreateOfferInput,
  opts: { depositPercent: number; offerValidityHours: number }
): Promise<CreateOfferResult> {
  const startStr = toDateString(input.checkInDate);
  const endStr = toDateString(input.checkOutDate);
  if (startStr >= endStr) {
    return { ok: false, message: 'La date de sortie doit être postérieure à la date d’entrée.' };
  }

  // 1. Client + animaux (+ les catégories utilisées, verrouillées en lecture).
  const [client] = await tx.select().from(clients).where(eq(clients.id, input.clientId)).limit(1);
  if (!client) return { ok: false, message: 'Client introuvable.' };

  const clientPets = await tx
    .select({ id: pets.id })
    .from(pets)
    .where(and(eq(pets.clientId, input.clientId)));
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
  const catById = new Map(categories.map((c) => [c.id, c]));
  if (catById.size !== categoryIds.length) {
    return { ok: false, message: 'Une catégorie de l’offre est introuvable.' };
  }

  // 2. Validation : ranges valides, capacité respectée par segment, couverture exacte.
  const stayNights = nightsBetween(startStr, endStr);
  if (stayNights.length < 1) return { ok: false, message: 'Séjour trop court.' };

  for (const seg of input.segments) {
    const cat = catById.get(seg.categoryId)!;
    if (toDateString(seg.startDate) >= toDateString(seg.endDate)) {
      return { ok: false, message: 'Une période de segment est invalide.' };
    }
    if (seg.petIds.length === 0) return { ok: false, message: 'Un segment est sans animal.' };
    if (seg.petIds.length > cat.capacity) {
      return {
        ok: false,
        message: `Capacité dépassée pour « ${cat.name} » (max ${cat.capacity} animal/animaux par espace).`,
      };
    }
  }
  const coverageError = validateCoverage(allPetIds, input.segments, stayNights);
  if (coverageError) return { ok: false, message: coverageError };

  // 3. Prix (par segment : base + supplément/animal au-delà du 1er).
  const pricedSegments = input.segments.map((seg) => {
    const cat = catById.get(seg.categoryId)!;
    const nights = nightsBetween(seg.startDate, seg.endDate).length;
    const price = computeSegmentPrice({
      nights,
      basePricePerNight: cat.basePricePerNight,
      surchargePerAnimal: cat.surchargePerAnimal,
      petCount: seg.petIds.length,
    });
    return { ...seg, nights, price, category: cat };
  });

  const totalPrice = pricedSegments.reduce((sum, s) => sum + s.price, 0);
  const depositAmount = computeDepositAmount(totalPrice, opts.depositPercent);

  // 4. Booking (statut `offered` — segments bloquants).
  const now = new Date();
  const offeredExpiresAt = new Date(now.getTime() + opts.offerValidityHours * 3600 * 1000);

  const [newBooking] = await tx
    .insert(bookings)
    .values({
      clientId: input.clientId,
      status: 'offered',
      source: input.source ?? 'phone',
      totalPrice,
      depositAmount,
      paymentStatus: 'unpaid',
      checkInDate: new Date(`${startStr}T00:00:00Z`),
      checkOutDate: new Date(`${endStr}T00:00:00Z`),
      offeredExpiresAt,
    })
    .returning({ id: bookings.id });

  // 5. Segments + attribution atomique d'unité + animaux par segment.
  for (const seg of pricedSegments) {
    const created = await createBookingSegmentTx(tx, {
      bookingId: newBooking.id,
      categoryId: seg.categoryId,
      checkInDate: seg.startDate,
      checkOutDate: seg.endDate,
      segmentPrice: seg.price,
      autoAssign: true,
    });
    if (!created.ok) {
      return { ok: false, message: created.message };
    }
    if (created.unitId == null) {
      return { ok: false, message: 'Attribution de box impossible pour un segment.' };
    }
    await tx.insert(segmentPets).values(
      seg.petIds.map((petId) => ({ segmentId: created.segmentId, petId }))
    );
  }

  return {
    ok: true,
    bookingId: newBooking.id,
    totalPrice,
    depositAmount,
    offeredExpiresAt,
  };
}

export type AttachOfferInput = {
  bookingId: string;
  checkInDate: string;
  checkOutDate: string;
  segments: OfferSegmentInput[];
};

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

  const startStr = toDateString(input.checkInDate);
  const endStr = toDateString(input.checkOutDate);
  if (startStr >= endStr) {
    return { ok: false, message: 'La date de sortie doit être postérieure à la date d’entrée.' };
  }

  // Client + animaux + catégories.
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
  const catById = new Map(categories.map((c) => [c.id, c]));
  if (catById.size !== categoryIds.length) {
    return { ok: false, message: 'Une catégorie de l’offre est introuvable.' };
  }

  // Validation (ranges, capacité, couverture).
  const stayNights = nightsBetween(startStr, endStr);
  for (const seg of input.segments) {
    const cat = catById.get(seg.categoryId)!;
    if (toDateString(seg.startDate) >= toDateString(seg.endDate)) {
      return { ok: false, message: 'Une période de segment est invalide.' };
    }
    if (seg.petIds.length === 0) return { ok: false, message: 'Un segment est sans animal.' };
    if (seg.petIds.length > cat.capacity) {
      return {
        ok: false,
        message: `Capacité dépassée pour « ${cat.name} » (max ${cat.capacity} par espace).`,
      };
    }
  }
  const coverageError = validateCoverage(allPetIds, input.segments, stayNights);
  if (coverageError) return { ok: false, message: coverageError };

  const pricedSegments = input.segments.map((seg) => {
    const cat = catById.get(seg.categoryId)!;
    const nights = nightsBetween(seg.startDate, seg.endDate).length;
    const price = computeSegmentPrice({
      nights,
      basePricePerNight: cat.basePricePerNight,
      surchargePerAnimal: cat.surchargePerAnimal,
      petCount: seg.petIds.length,
    });
    return { ...seg, nights, price, category: cat };
  });
  const totalPrice = pricedSegments.reduce((sum, s) => sum + s.price, 0);
  const depositAmount = computeDepositAmount(totalPrice, opts.depositPercent);
  const offeredExpiresAt = new Date(Date.now() + opts.offerValidityHours * 3600 * 1000);

  await tx
    .update(bookings)
    .set({
      status: 'offered',
      totalPrice,
      depositAmount,
      paymentStatus: 'unpaid',
      checkInDate: new Date(`${startStr}T00:00:00Z`),
      checkOutDate: new Date(`${endStr}T00:00:00Z`),
      offeredExpiresAt,
    })
    .where(eq(bookings.id, booking.id));

  for (const seg of pricedSegments) {
    const created = await createBookingSegmentTx(tx, {
      bookingId: booking.id,
      categoryId: seg.categoryId,
      checkInDate: seg.startDate,
      checkOutDate: seg.endDate,
      segmentPrice: seg.price,
      autoAssign: true,
    });
    if (!created.ok) return { ok: false, message: created.message };
    if (created.unitId == null) {
      return { ok: false, message: 'Attribution de box impossible pour un segment.' };
    }
    await tx.insert(segmentPets).values(
      seg.petIds.map((petId) => ({ segmentId: created.segmentId, petId }))
    );
  }

  return {
    ok: true,
    bookingId: booking.id,
    totalPrice,
    depositAmount,
    offeredExpiresAt,
  };
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
