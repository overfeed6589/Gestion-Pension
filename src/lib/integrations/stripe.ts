import Stripe from 'stripe';
import { serverEnv } from '@/lib/env';

// ---------------------------------------------------------------------------
// Intégration Stripe (Phase G3) — uniquement côté serveur.
// ---------------------------------------------------------------------------
// Stripe sert au paiement des ACOMPTES (Checkout Session). Clés optionnelles en
// dev : toute fonction renvoie une erreur claire si la clé manque, plutôt que
// de planter au chargement du module.
// ---------------------------------------------------------------------------

export type StripeResult<T> = { ok: true; data: T } | { ok: false; message: string };

/** Instance Stripe (null si clé absente). */
export function getStripe(): Stripe | null {
  if (!serverEnv.STRIPE_SECRET_KEY) return null;
  return new Stripe(serverEnv.STRIPE_SECRET_KEY);
}

/**
 * URL de base de l'app pour les redirections Stripe (success/cancel) et les
 * emails. En production Vercel, on PRÉFÈRE `VERCEL_PROJECT_PRODUCTION_URL` :
 * c'est le domaine de production STABLE du projet (l'URL ne change pas à chaque
 * commit/preview, contrairement à `VERCEL_URL`). `NEXT_PUBLIC_SITE_URL` n'est
 * qu'un repli (utile hors Vercel ou pour un domaine personnalisé).
 */
export function appBaseUrl(): string {
  if (process.env.NODE_ENV === 'production') {
    const prodUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    if (prodUrl) return `https://${prodUrl}`;
  }
  if (serverEnv.NEXT_PUBLIC_SITE_URL) return serverEnv.NEXT_PUBLIC_SITE_URL;
  return 'http://localhost:3000';
}

export type CreateCheckoutInput = {
  bookingId: string;
  depositAmountCents: number;
  customerEmail?: string | null;
  description: string;
  kind?: 'deposit' | 'payment';
  /** Chemin de redirection après paiement (client → /espace/<token>). */
  successPath?: string;
  cancelPath?: string;
};

/**
 * Crée une session Checkout (acompte OU paiement/solde). La référence du
 * booking est portée par `client_reference_id` + `metadata` (retrouvée au
 * webhook) avec le `kind` pour recalculer le montant attendu.
 */
export async function createDepositCheckoutSession(
  input: CreateCheckoutInput
): Promise<StripeResult<{ url: string; sessionId: string }>> {
  const stripe = getStripe();
  if (!stripe) {
    return { ok: false, message: 'Stripe non configuré (STRIPE_SECRET_KEY absente).' };
  }
  const kind = input.kind ?? 'deposit';
  const base = appBaseUrl();
  const successPath = input.successPath ?? `/dashboard/offres?paiement=succes&reservation=${input.bookingId}`;
  const cancelPath = input.cancelPath ?? `/dashboard/offres?paiement=annule&reservation=${input.bookingId}`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      client_reference_id: input.bookingId,
      customer_email: input.customerEmail ?? undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'eur',
            unit_amount: input.depositAmountCents,
            product_data: {
              name: kind === 'deposit' ? 'Acompte de réservation' : 'Paiement du séjour',
              description: input.description.slice(0, 400),
            },
          },
        },
      ],
      metadata: { bookingId: input.bookingId, kind },
      success_url: `${base}${successPath}`,
      cancel_url: `${base}${cancelPath}`,
    });

    if (!session.url) {
      return { ok: false, message: 'Stripe n’a pas retourné d’URL de paiement.' };
    }
    return { ok: true, data: { url: session.url, sessionId: session.id } };
  } catch (error) {
    console.error('createDepositCheckoutSession :', error);
    return { ok: false, message: 'Erreur lors de la création de la session de paiement.' };
  }
}

/** Rembourse un PaymentIntent Stripe. */
export async function refundPaymentIntent(
  paymentIntentId: string,
  amountCents?: number
): Promise<StripeResult<{ refundId: string }>> {
  const stripe = getStripe();
  if (!stripe) {
    return { ok: false, message: 'Stripe non configuré (STRIPE_SECRET_KEY absente).' };
  }
  try {
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      ...(amountCents !== undefined ? { amount: amountCents } : {}),
    });
    return { ok: true, data: { refundId: refund.id } };
  } catch (error) {
    console.error('refundPaymentIntent :', error);
    return { ok: false, message: 'Erreur lors du remboursement Stripe.' };
  }
}
