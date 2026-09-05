import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { serverEnv } from '@/lib/env';
import { getStripe } from '@/lib/integrations/stripe';
import { confirmDepositPayment } from '@/lib/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Webhook Stripe (Phase G3) — confirmation des acomptes.
 * Seul `checkout.session.completed` (payment_status = 'paid') déclenche la
 * conversion offered → confirmed + facture d'acompte (idempotent côté DB).
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
      const result = await confirmDepositPayment({
        bookingId,
        amountCents: session.amount_total ?? 0,
        stripeSessionId: session.id,
        stripePaymentIntentId:
          typeof session.payment_intent === 'string' ? session.payment_intent : null,
      });
      if (!result.ok) {
        // Erreur métier (ex: montant inattendu) : on répond 500 pour que Stripe
        // rejoue l'événement et que l'on puisse corriger.
        console.error('webhook stripe :', result.message);
        return NextResponse.json({ error: result.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ received: true });
}
