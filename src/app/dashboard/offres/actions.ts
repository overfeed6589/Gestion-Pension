'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { bookings } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { createBookingWithOffer, attachOfferToBooking, type CreateOfferInput, type AttachOfferInput } from '@/lib/booking-offers';
import { createDepositCheckoutSession } from '@/lib/integrations/stripe';
import { cancelBooking } from '@/lib/payments';
import { ActionState } from '@/types/actions';
import { requireRole } from '@/lib/auth';

/** Union : création depuis zéro OU transformation d'une demande (`requested`). */
export type OfferMutationInput =
  | ({ kind: 'create' } & CreateOfferInput)
  | ({ kind: 'attach' } & AttachOfferInput);

/**
 * Crée une offre (segments bloquants) soit sur un nouveau booking, soit sur une
 * demande web existante. Rôle `secretary`.
 */
export async function upsertOfferAction(input: OfferMutationInput): Promise<ActionState> {
  await requireRole('secretary');

  const result =
    input.kind === 'create'
      ? await createBookingWithOffer(input)
      : await attachOfferToBooking(input);

  if (!result.ok) {
    return { success: false, message: result.message };
  }

  revalidatePath('/dashboard/offres');
  revalidatePath('/dashboard/register');
  if (input.kind === 'attach') revalidatePath(`/dashboard/offres/nouvelle`);

  return {
    success: true,
    message:
      input.kind === 'attach'
        ? 'Demande transformée en offre : espaces bloqués. Envoyez le lien d’acompte au client.'
        : 'Offre créée et espaces bloqués. Envoyez le lien d’acompte au client.',
    data: { bookingId: result.bookingId, depositAmount: result.depositAmount },
  };
}

/**
 * Crée une réservation + offre (segments bloquants) — rôle `secretary`
 * (dev/owner couverts). Payload typé (UI construite en JS, pas de FormData).
 */
export async function createBookingWithOfferAction(
  input: CreateOfferInput
): Promise<ActionState> {
  await requireRole('secretary');

  const result = await createBookingWithOffer(input);
  if (!result.ok) {
    return { success: false, message: result.message };
  }

  revalidatePath('/dashboard/offres');
  revalidatePath('/dashboard/register');

  return {
    success: true,
    message: 'Offre créée et espaces bloqués. Envoyez le lien d’acompte au client.',
    data: { bookingId: result.bookingId, depositAmount: result.depositAmount },
  };
}

/**
 * Génère (ou régénère) le lien de paiement Stripe de l'acompte d'une offre.
 */
export async function createDepositPaymentLinkAction(bookingId: string): Promise<ActionState> {
  await requireRole('secretary');

  try {
    const booking = await db.query.bookings.findFirst({
      where: { RAW: () => eq(bookings.id, bookingId) },
      with: {
        client: true,
        segments: { with: { category: true } },
      },
    });

    if (!booking) return { success: false, message: 'Réservation introuvable.' };
    if (booking.status !== 'offered') {
      return { success: false, message: 'Seule une offre en attente peut générer un lien.' };
    }
    if (!booking.client) return { success: false, message: 'Client introuvable.' };

    const categories = booking.segments
      .map((s) => s.category?.name)
      .filter(Boolean)
      .join(' + ');
    const session = await createDepositCheckoutSession({
      bookingId: booking.id,
      depositAmountCents: booking.depositAmount,
      customerEmail: booking.client.email,
      description: `Séjour ${booking.checkInDate.toISOString().slice(0, 10)} → ${booking.checkOutDate
        .toISOString()
        .slice(0, 10)}${categories ? ` (${categories})` : ''}`,
    });

    if (!session.ok) return { success: false, message: session.message };

    await db
      .update(bookings)
      .set({ stripeCheckoutSessionId: session.data.sessionId })
      .where(eq(bookings.id, booking.id));

    revalidatePath(`/dashboard/offres`);

    return {
      success: true,
      message: 'Lien de paiement généré.',
      data: { paymentUrl: session.data.url },
    };
  } catch (error) {
    console.error('createDepositPaymentLinkAction :', error);
    return { success: false, message: 'Erreur lors de la génération du lien.' };
  }
}

/**
 * Annule une réservation (règle d'annulation appliquée côté service).
 */
export async function cancelBookingAction(bookingId: string, reason: string): Promise<ActionState> {
  await requireRole('secretary');

  const result = await cancelBooking(bookingId, reason);
  if (!result.ok) return { success: false, message: result.message };

  revalidatePath('/dashboard/offres');
  revalidatePath('/dashboard/register');
  revalidatePath(`/dashboard/bookings/${bookingId}`);

  return { success: true, message: result.message };
}
