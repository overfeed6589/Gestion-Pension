import { NextResponse } from 'next/server';
import { db } from '@/db';
import { bookings, clients, bookingSegments, housingCategories } from '@/db/schema';
import { and, eq, lt, gt, sql } from 'drizzle-orm';
import { expireOfferedBooking } from '@/lib/payments';
import { layoutHtml } from '@/lib/integrations/email';
import { createDepositCheckoutSession } from '@/lib/integrations/stripe';
import { formatCents } from '@/lib/money';
import { serverEnv } from '@/lib/env';
import { remindMissingTimeSlots, sendCompletionInvites } from '@/lib/booking-emails';
import { sendBookingEmailOnce, hasEmailBeenSent } from '@/lib/outbound-emails';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Cron quotidien (Phase G6) — Vercel Cron (voir vercel.json).
 * 1. Expire les offres non réglées avant leur `offeredExpiresAt`.
 * 2. Relance : offres en attente d'acompte depuis > 24 h (nouveau lien de
 *    paiement dans l'email).
 * 3. Séjours confirmés à J-7 : rappel du solde restant dû.
 */
export async function POST(request: Request) {
  if (serverEnv.CRON_SECRET) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${serverEnv.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });
    }
  }

  const report: string[] = [];
  const now = new Date();

  // 1. Expirations d'offres.
  const expiredOffers = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(eq(bookings.status, 'offered'), lt(bookings.offeredExpiresAt, now)));
  for (const offer of expiredOffers) {
    const res = await expireOfferedBooking(offer.id);
    if (res.ok) report.push(`expirée ${offer.id}`);
  }

  // 2. Relance des offres impayées (créées il y a > 24 h, encore valides).
  const pendingOffers = await db
    .select({
      id: bookings.id,
      depositAmount: bookings.depositAmount,
      totalPrice: bookings.totalPrice,
      email: clients.email,
      firstName: clients.firstName,
      lastName: clients.lastName,
    })
    .from(bookings)
    .innerJoin(clients, eq(bookings.clientId, clients.id))
    .where(
      and(
        eq(bookings.status, 'offered'),
        gt(bookings.offeredExpiresAt, now),
        sql`${bookings.createdAt} < now() - interval '24 hours'`
      )
    );

  for (const offer of pendingOffers) {
    // E10 (dédupliqué) : une seule relance acompte par offre.
    const already = await hasEmailBeenSent(offer.id, 'acompte_rappel');
    if (already) {
      report.push(`déjà-relancée ${offer.id}`);
      continue;
    }

    const labels = await db
      .select({ name: housingCategories.name })
      .from(bookingSegments)
      .innerJoin(housingCategories, eq(bookingSegments.categoryId, housingCategories.id))
      .where(eq(bookingSegments.bookingId, offer.id));
    const spaceLabel = labels.map((l) => l.name).filter(Boolean).join(' + ');

    const session = await createDepositCheckoutSession({
      bookingId: offer.id,
      depositAmountCents: offer.depositAmount,
      customerEmail: offer.email,
      description: `Acompte ${formatCents(offer.depositAmount)} — séjour${spaceLabel ? ` (${spaceLabel})` : ''}`,
    });

    if (!session.ok) {
      report.push(`echec-lien ${offer.id}`);
      continue;
    }

    const sent = await sendBookingEmailOnce({
      bookingId: offer.id,
      kind: 'acompte_rappel',
      to: offer.email,
      subject: `Rappel : votre acompte de ${formatCents(offer.depositAmount)}`,
      html: layoutHtml(
        `<h2>Bonjour ${offer.firstName},</h2>
         <p>Votre réservation n’est pas encore confirmée : le paiement de l’acompte
         (${formatCents(offer.depositAmount)}) valide votre séjour.</p>
         <p><a href="${session.data.url}" style="display:inline-block;background:#065f46;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Payer l’acompte</a></p>
         <p style="color:#9ca3af;font-size:12px">Ce lien expire bientôt. Sans paiement, les espaces seront libérés.</p>`
      ),
    });
    if (sent === 'sent') {
      await db
        .update(bookings)
        .set({ stripeCheckoutSessionId: session.data.sessionId })
        .where(eq(bookings.id, offer.id));
      report.push(`relancée ${offer.id}`);
    } else if (sent === 'failed') {
      report.push(`echec-mail ${offer.id}`);
    }
  }

  // 3. Séjours confirmés à J-7 : rappel du solde.
  const upcoming = await db
    .select({
      id: bookings.id,
      totalPrice: bookings.totalPrice,
      depositAmount: bookings.depositAmount,
      checkInDate: bookings.checkInDate,
      email: clients.email,
      firstName: clients.firstName,
      lastName: clients.lastName,
    })
    .from(bookings)
    .innerJoin(clients, eq(bookings.clientId, clients.id))
    .where(
      and(
        eq(bookings.status, 'confirmed'),
        eq(bookings.paymentStatus, 'deposit_paid'),
        sql`${bookings.checkInDate}::date <= (now() + interval '7 days')::date`,
        sql`${bookings.checkInDate}::date > now()::date`
      )
    );

  for (const booking of upcoming) {
    const remaining = booking.totalPrice - booking.depositAmount;
    if (remaining <= 0) continue;
    const sent = await sendBookingEmailOnce({
      bookingId: booking.id,
      kind: 'solde_rappel',
      to: booking.email,
      subject: `Votre séjour approche — solde de ${formatCents(remaining)}`,
      html: layoutHtml(
        `<h2>Bonjour ${booking.firstName},</h2>
         <p>Votre séjour commence le ${booking.checkInDate.toISOString().slice(0, 10)}.</p>
         <p>Solde restant dû : <strong>${formatCents(remaining)}</strong>
         (réglable au check-in).</p>`
      ),
    });
    report.push(`${booking.id}:solde:${sent}`);
  }

  // E7 : relances des heures d'arrivée/départ manquantes (J-15/7/1) + E5 cron.
  try {
    const slotsReport = await remindMissingTimeSlots();
    report.push(...slotsReport.map((r) => `creneaux ${r}`));
    const invites = await sendCompletionInvites();
    report.push(...invites);
  } catch (error) {
    console.error('cron daily — relances heures :', error);
  }

  return NextResponse.json({ received: true, report });
}
