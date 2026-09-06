'use server';

import { db } from '@/db';
import { bookings, pets, payments } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { findClientByAccessToken } from '@/lib/client-access';
import { createDepositCheckoutSession } from '@/lib/integrations/stripe';
import { getPensionSettings } from '@/lib/settings';
import { ActionState } from '@/types/actions';

// ---------------------------------------------------------------------------
// Espace client (jeton) — G9. PAS de compte : le jeton = le moyen d'accès.
// Toutes les actions vérifient d'abord que le client possède l'élément.
// ---------------------------------------------------------------------------

async function guardClient(token: string) {
  const client = await findClientByAccessToken(token);
  if (!client) throw new Error('Lien invalide ou expiré.');
  return client;
}

/** Vérifie que le booking appartient bien au client. */
async function ownBooking(clientId: string, bookingId: string) {
  const [b] = await db
    .select()
    .from(bookings)
    .where(sql`${bookings.id} = ${bookingId} AND ${bookings.clientId} = ${clientId}`)
    .limit(1);
  return b ?? null;
}

export type PetCompletionFields = {
  identificationNumber?: string | null;
  birthDate?: string | null;
  breed?: string | null;
  sex?: string;
  isSterilized?: boolean;
  passportNumber?: string | null;
  veterinarianName?: string | null;
  veterinarianPhone?: string | null;
  vaccinesUpToDate?: boolean;
  medicalNotes?: string | null;
};

export async function completePetAction(
  token: string,
  petId: string,
  fields: PetCompletionFields
): Promise<ActionState> {
  try {
    const client = await guardClient(token);
    const [pet] = await db
      .select({ id: pets.id })
      .from(pets)
      .where(sql`${pets.id} = ${petId} AND ${pets.clientId} = ${client.id}`)
      .limit(1);
    if (!pet) return { success: false, message: 'Animal introuvable.' };

    await db.update(pets).set({ ...fields }).where(eq(pets.id, petId));
    return { success: true, message: 'Informations mises à jour.' };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Erreur.' };
  }
}

export async function setTimeSlotsAction(
  token: string,
  bookingId: string,
  arrivalTimeSlot: string | null,
  departureTimeSlot: string | null
): Promise<ActionState> {
  try {
    const client = await guardClient(token);
    const booking = await ownBooking(client.id, bookingId);
    if (!booking) return { success: false, message: 'Réservation introuvable.' };
    if (!['offered', 'confirmed', 'checked_in'].includes(booking.status)) {
      return { success: false, message: 'Heures modifiables seulement après validation.' };
    }

    const settings = await getPensionSettings();
    if (arrivalTimeSlot && !settings.arrivalSlots.includes(arrivalTimeSlot)) {
      return { success: false, message: 'Créneau d’arrivée invalide.' };
    }
    if (departureTimeSlot && !settings.departureSlots.includes(departureTimeSlot)) {
      return { success: false, message: 'Créneau de départ invalide.' };
    }

    await db
      .update(bookings)
      .set({ arrivalTimeSlot, departureTimeSlot })
      .where(eq(bookings.id, bookingId));
    return { success: true, message: 'Heures enregistrées.' };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Erreur.' };
  }
}

async function bookingPaidSum(bookingId: string): Promise<number> {
  const rows = await db
    .select({ sum: sql<number>`coalesce(sum(${payments.amount}), 0)::int` })
    .from(payments)
    .where(sql`${payments.bookingId} = ${bookingId} AND ${payments.status} = 'succeeded'`);
  return rows[0]?.sum ?? 0;
}

/**
 * Ouvre la page de paiement pour un montant CHOISI (acompte ou solde/complet).
 * Montant recalculé et refusé si périmé.
 */
export async function payBookingAction(
  token: string,
  bookingId: string,
  kind: 'deposit' | 'payment'
): Promise<ActionState> {
  try {
    const client = await guardClient(token);
    const booking = await ownBooking(client.id, bookingId);
    if (!booking) return { success: false, message: 'Réservation introuvable.' };
    if (!['offered', 'confirmed'].includes(booking.status)) {
      return { success: false, message: 'Paiement indisponible pour cette réservation.' };
    }

    const paid = await bookingPaidSum(bookingId);
    const outstanding = Math.max(0, booking.totalPrice - paid);

    let amountCents: number;
    if (kind === 'deposit') {
      if (paid > 0 || booking.depositAmount <= 0) {
        return { success: false, message: 'Acompte déjà réglé ou non requis.' };
      }
      amountCents = booking.depositAmount;
    } else {
      if (outstanding <= 0) return { success: false, message: 'Séjour déjà réglé.' };
      amountCents = outstanding;
    }

    const session = await createDepositCheckoutSession({
      bookingId,
      depositAmountCents: amountCents,
      customerEmail: client.email,
      kind,
      description: `Réservation du ${booking.checkInDate.toISOString().slice(0, 10)} → ${booking.checkOutDate
        .toISOString()
        .slice(0, 10)}`,
      successPath: `/espace/${token}`,
      cancelPath: `/espace/${token}`,
    });
    if (!session.ok) return { success: false, message: session.message };

    await db
      .update(bookings)
      .set({ stripeCheckoutSessionId: session.data.sessionId })
      .where(eq(bookings.id, bookingId));

    return { success: true, data: { paymentUrl: session.data.url } };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Erreur.' };
  }
}

/** Statut d'un booking pour affichage (et soldes). */
export async function bookingFinancialState(token: string, bookingId: string) {
  const client = await guardClient(token);
  const booking = await ownBooking(client.id, bookingId);
  if (!booking) return null;
  const paid = await bookingPaidSum(bookingId);
  const outstanding = Math.max(0, booking.totalPrice - paid);
  return {
    bookingId: booking.id,
    status: booking.status,
    paid,
    outstanding,
    depositAmount: booking.depositAmount,
    totalPrice: booking.totalPrice,
  };
}
