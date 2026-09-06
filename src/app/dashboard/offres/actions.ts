'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { bookings } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { createBookingWithOffer, attachOfferToBooking, rebuildBookingOffer, type CreateOfferInput, type AttachOfferInput, type RebuildOfferInput } from '@/lib/booking-offers';
import { createDepositCheckoutSession, appBaseUrl } from '@/lib/integrations/stripe';
import { cancelBooking } from '@/lib/payments';
import { ensureClientAccessToken } from '@/lib/client-access';
import { sendBookingEmailOnce } from '@/lib/outbound-emails';
import { layoutHtml } from '@/lib/integrations/email';
import { getPensionSettings } from '@/lib/settings';
import { inviteMissingPetInfo, requestTimeSlots } from '@/lib/booking-emails';
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
      where: { RAW: (t) => eq(t.id, bookingId) },
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

/**
 * Valide une demande `proposed` → `offered` et envoie l'email avec le lien de
 * paiement (dossier client). Rôle secretary/owner.
 */
export async function validateProposedBookingAction(bookingId: string): Promise<ActionState> {
  await requireRole('secretary');

  try {
    const booking = await db.query.bookings.findFirst({
      where: { RAW: (t) => eq(t.id, bookingId) },
      with: { client: true },
    });
    if (!booking) return { success: false, message: 'Réservation introuvable.' };
    if (booking.status !== 'proposed') {
      return { success: false, message: 'Seule une demande en attente peut être validée.' };
    }
    if (!booking.client) return { success: false, message: 'Client introuvable.' };

    const token = await db.transaction(async (tx) => ensureClientAccessToken(tx, booking.clientId));

    await db.update(bookings).set({ status: 'offered' }).where(eq(bookings.id, bookingId));

    const settings = await getPensionSettings();
    const link = `${appBaseUrl()}/espace/${token}`;
    try {
      await sendBookingEmailOnce({
        bookingId,
        kind: 'liens_paiement',
        to: booking.client.email,
        subject: 'Votre séjour est validé — paiement en ligne',
        html: layoutHtml(
          `<h2>Bonjour ${booking.client.firstName},</h2>
           <p>Votre séjour du ${booking.checkInDate.toISOString().slice(0, 10)} au ${booking.checkOutDate
            .toISOString()
            .slice(0, 10)} est validé.</p>
           <p><a href="${link}" style="display:inline-block;background:#065f46;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Accéder à mon dossier</a></p>
           <p>Vous pourrez y régler l’acompte (ou le séjour complet) et préciser vos heures d’arrivée/départ.</p>`,
          settings.pensionName
        ),
      });
    } catch (error) {
      console.error('validateProposedBookingAction — email :', error);
    }

    // E5 : invite à compléter les fiches animales incomplètes (best effort).
    try {
      await inviteMissingPetInfo(bookingId);
    } catch (error) {
      console.error('validateProposedBookingAction — E5 :', error);
    }

    revalidatePath('/dashboard/offres');
    return { success: true, message: 'Demande validée, email de paiement envoyé.' };
  } catch (error) {
    console.error('validateProposedBookingAction :', error);
    return { success: false, message: 'Erreur lors de la validation.' };
  }
}

/**
 * Valide une demande SANS paiement (acompte non reçu mais réservation
 * maintenue). `proposed`/`offered` → `confirmed` (unpaid) ; le lien de solde
 * reste disponible. Rôle secretary/owner.
 */
export async function validateWithoutPaymentAction(bookingId: string): Promise<ActionState> {
  await requireRole('secretary');

  try {
    const booking = await db.query.bookings.findFirst({
      where: { RAW: (t) => eq(t.id, bookingId) },
      with: { client: true },
    });
    if (!booking) return { success: false, message: 'Réservation introuvable.' };
    if (!['proposed', 'offered'].includes(booking.status)) {
      return { success: false, message: 'Statut non modifiable.' };
    }
    if (!booking.client) return { success: false, message: 'Client introuvable.' };

    const token = await db.transaction(async (tx) => ensureClientAccessToken(tx, booking.clientId));
    await db
      .update(bookings)
      .set({ status: 'confirmed', paymentStatus: 'unpaid' })
      .where(eq(bookings.id, bookingId));

    const settings = await getPensionSettings();
    const link = `${appBaseUrl()}/espace/${token}`;
    try {
      await sendBookingEmailOnce({
        bookingId,
        kind: 'validation_sans_acompte',
        to: booking.client.email,
        subject: 'Votre réservation est confirmée',
        html: layoutHtml(
          `<h2>Bonjour ${booking.client.firstName},</h2>
           <p>Votre réservation du ${booking.checkInDate.toISOString().slice(0, 10)} est confirmée.
           Aucun paiement en ligne n’est exigé.</p>
           <p><a href="${link}">Voir mon dossier</a></p>`,
          settings.pensionName
        ),
      });
    } catch (error) {
      console.error('validateWithoutPaymentAction — email :', error);
    }

    // E5/E6 compléments (best effort).
    try {
      await inviteMissingPetInfo(bookingId);
      await requestTimeSlots(bookingId);
    } catch (error) {
      console.error('validateWithoutPaymentAction — E5/E6 :', error);
    }

    revalidatePath('/dashboard/offres');
    return { success: true, message: 'Réservation confirmée (sans acompte).' };
  } catch (error) {
    console.error('validateWithoutPaymentAction :', error);
    return { success: false, message: 'Erreur lors de la validation.' };
  }
}

/**
 * Ajuste une réservation non payée (mini-éditeur) — secretary/owner.
 */
export async function adjustOfferAction(input: RebuildOfferInput): Promise<ActionState> {
  await requireRole('secretary');

  const result = await rebuildBookingOffer(input);
  if (!result.ok) return { success: false, message: result.message };

  revalidatePath('/dashboard/offres');
  revalidatePath(`/dashboard/offres/ajuster/${input.bookingId}`);

  return {
    success: true,
    message: 'Réservation ajustée (segments recalculés).',
    data: { totalPrice: result.totalPrice, depositAmount: result.depositAmount },
  };
}
