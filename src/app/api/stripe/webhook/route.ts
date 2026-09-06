import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { db } from '@/db';
import { bookings, clients } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { serverEnv } from '@/lib/env';
import { getStripe } from '@/lib/integrations/stripe';
import { confirmOnlinePayment, type OnlinePaymentKind } from '@/lib/payments';
import { sendMail, layoutHtml } from '@/lib/integrations/email';
import { formatCents } from '@/lib/money';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Webhook Stripe (G3/G9) — confirmation des paiements en ligne (acompte OU
 * séjour complet/solde). `checkout.session.completed` (payment_status = 'paid')
 * déclenche la confirmation ; le montant attendu est recalculé côté serveur.
 */
export async function POST(request: Request) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: 'Stripe non configuré.' }, { status: 500 });
  }
  if (!serverEnv.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Webhook secret non configuré.' }, { status: 500 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Signature manquante.' }, { status: 400 });
  }

  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, serverEnv.STRIPE_WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: 'Signature invalide.' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status === 'paid' && session.client_reference_id) {
      const bookingId = session.client_reference_id;
      const kind: OnlinePaymentKind =
        session.metadata?.kind === 'payment' ? 'payment' : 'deposit';

      const result = await confirmOnlinePayment({
        bookingId,
        amountCents: session.amount_total ?? 0,
        kind,
        stripeSessionId: session.id,
        stripePaymentIntentId:
          typeof session.payment_intent === 'string' ? session.payment_intent : null,
      });
      if (!result.ok) {
        console.error('webhook stripe :', result.message);
        return NextResponse.json({ error: result.message }, { status: 500 });
      }

      // Email de confirmation au client (best effort).
      try {
        const [booking] = await db
          .select({
            depositAmount: bookings.depositAmount,
            totalPrice: bookings.totalPrice,
            checkInDate: bookings.checkInDate,
            email: clients.email,
            firstName: clients.firstName,
          })
          .from(bookings)
          .innerJoin(clients, eq(bookings.clientId, clients.id))
          .where(eq(bookings.id, bookingId))
          .limit(1);

        if (booking?.email) {
          const remaining = Math.max(0, booking.totalPrice - booking.depositAmount);
          const isFull = result.fullyPaid;
          await sendMail({
            to: booking.email,
            subject: isFull ? 'Séjour payé — merci !' : 'Réservation confirmée — merci !',
            html: layoutHtml(
              `<h2>Bonjour ${booking.firstName},</h2>
               ${
                 isFull
                   ? `<p>Votre séjour du ${booking.checkInDate.toISOString().slice(0, 10)} est intégralement réglé
                       (<strong>${formatCents(booking.totalPrice)}</strong>). Merci !</p>`
                   : `<p>Votre acompte de <strong>${formatCents(booking.depositAmount)}</strong> a bien été reçu :
                       votre réservation du ${booking.checkInDate.toISOString().slice(0, 10)} est confirmée.</p>
                       ${
                         remaining > 0
                           ? `<p>Solde restant : <strong>${formatCents(remaining)}</strong>.</p>`
                           : ''
                       }`
               }`
            ),
          });
        }
      } catch (error) {
        console.error('webhook stripe — email de confirmation :', error);
      }
    }
  }

  return NextResponse.json({ received: true });
}
