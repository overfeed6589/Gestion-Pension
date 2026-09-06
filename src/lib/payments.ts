import { db } from '@/db';
import { bookings, payments, invoices, auditLogs } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { generateBookingInvoice } from '@/lib/invoicing/generate';
import { refundPaymentIntent } from '@/lib/integrations/stripe';
import { getPensionSettings } from '@/lib/settings';
import { logAudit } from '@/lib/audit';
import { shouldRefundDeposit } from '@/lib/refund-policy';

// ---------------------------------------------------------------------------
// Cycle de vie financier d'un séjour (Phase G3/G4)
// ---------------------------------------------------------------------------
//  - confirmDepositPayment : appelé au webhook Stripe quand l'acompte est payé.
//    Convertit le booking `offered → confirmed`, enregistre le paiement et émet
//    la FACTURE D'ACOMPTE (trace de remboursement). Idempotent (double webhook).
//  - cancelBooking : annulation + remboursement de l'acompte si l'annulation
//    intervient ≥ N jours avant l'arrivée (settings.cancellationRefundDays).
//  - expireOfferedBooking : offre non payée dans le délai → `expired`
//    (libère les unités sans pénalité — aucun acompte n'a été encaissé).
// ---------------------------------------------------------------------------

export type DepositPaymentResult = { ok: true; bookingId: string } | { ok: false; message: string };

/**
 * Confirme une réservation après encaissement de l'acompte.
 * - booking `offered` → `confirmed`, paymentStatus → `deposit_paid`
 * - insert dans `payments` (méthode stripe, statut succeeded)
 * - facture d'acompte émise (idempotente) et passée `paid`
 */
export async function confirmDepositPayment(input: {
  bookingId: string;
  amountCents: number;
  stripeSessionId?: string | null;
  stripePaymentIntentId?: string | null;
}): Promise<DepositPaymentResult> {
  try {
    return await db.transaction(async (tx) => {
      const [booking] = await tx
        .select()
        .from(bookings)
        .where(eq(bookings.id, input.bookingId))
        .for('update')
        .limit(1);
      if (!booking) return { ok: false, message: 'Réservation introuvable.' };

      // Idempotence : webhook déjà traité.
      if (booking.status === 'confirmed') {
        return { ok: true, bookingId: booking.id };
      }
      if (booking.status !== 'offered') {
        return { ok: false, message: `Statut inattendu : ${booking.status}.` };
      }
      if (input.amountCents !== booking.depositAmount) {
        return {
          ok: false,
          message: `Montant payé (${input.amountCents}) ≠ acompte attendu (${booking.depositAmount}).`,
        };
      }

      const paidAt = new Date();
      await tx
        .update(bookings)
        .set({
          status: 'confirmed',
          paymentStatus: 'deposit_paid',
          stripeCheckoutSessionId: input.stripeSessionId ?? booking.stripeCheckoutSessionId,
          stripePaymentIntentId: input.stripePaymentIntentId ?? booking.stripePaymentIntentId,
        })
        .where(eq(bookings.id, booking.id));

      await tx.insert(payments).values({
        bookingId: booking.id,
        amount: input.amountCents,
        currency: 'EUR',
        method: 'stripe',
        stripePaymentIntentId: input.stripePaymentIntentId ?? null,
        status: 'succeeded',
        paidAt,
      });

      // Facture d'acompte (trace de remboursement) puis marquée payée.
      const inv = await generateBookingInvoice(tx, booking.id, 'deposit');
      if (inv.ok) {
        await tx
          .update(invoices)
          .set({ status: 'paid', paidAt })
          .where(eq(invoices.id, inv.invoiceId));
      }

      await logAudit(tx, {
        action: 'booking.confirmed',
        entityType: 'booking',
        entityId: booking.id,
        metadata: { amountCents: input.amountCents, method: 'stripe', source: 'checkout' },
      });

      return { ok: true, bookingId: booking.id };
    });
  } catch (error) {
    console.error('confirmDepositPayment :', error);
    return { ok: false, message: 'Erreur lors de la confirmation du paiement.' };
  }
}

export type OnlinePaymentKind = 'deposit' | 'payment';

export type OnlinePaymentResult =
  | { ok: true; bookingId: string; fullyPaid: boolean }
  | { ok: false; message: string };

/** Somme des paiements réussis d'un booking. */
async function paidSucceededSum(
  conn: Tx,
  bookingId: string
): Promise<number> {
  const rows = await conn
    .select({ sum: sql<number>`coalesce(sum(${payments.amount}), 0)::int` })
    .from(payments)
    .where(sql`${payments.bookingId} = ${bookingId} AND ${payments.status} = 'succeeded'`);
  return rows[0]?.sum ?? 0;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Marque payée une facture (créée à l'instant si besoin). */
async function payInvoice(
  tx: Tx,
  bookingId: string,
  type: 'deposit' | 'final',
  paidAt: Date
): Promise<void> {
  const inv = await generateBookingInvoice(tx, bookingId, type);
  if (inv.ok) {
    await tx
      .update(invoices)
      .set({ status: 'paid', paidAt })
      .where(eq(invoices.id, inv.invoiceId));
  }
}

/**
 * Confirme un paiement en ligne (acompte OU paiement total/solde) reçu au
 * webhook. Le montant attendu est RECALCULÉ côté serveur (montant périmé
 * refusé/remboursé). Sécurisé : pas de double encaissement, factures cohérentes
 * (acompte puis finale nette de l'acompte si total atteint).
 */
export async function confirmOnlinePayment(input: {
  bookingId: string;
  amountCents: number;
  kind: OnlinePaymentKind;
  stripeSessionId?: string | null;
  stripePaymentIntentId?: string | null;
}): Promise<OnlinePaymentResult> {
  let refundIntent: string | null = null;
  let alreadyHandled = false;

  try {
    const outcome = await db.transaction(async (tx) => {
      const [booking] = await tx
        .select()
        .from(bookings)
        .where(eq(bookings.id, input.bookingId))
        .for('update')
        .limit(1);
      if (!booking) throw new Error('Réservation introuvable.');
      if (booking.status === 'cancelled' || booking.status === 'expired') {
        throw new Error(`Réservation ${booking.status}.`);
      }

      // Idempotence (double webhook, même PaymentIntent déjà enregistré).
      if (input.stripePaymentIntentId) {
        const dup = await tx
          .select({ id: payments.id })
          .from(payments)
          .where(eq(payments.stripePaymentIntentId, input.stripePaymentIntentId))
          .limit(1);
        if (dup[0]) {
          alreadyHandled = true;
          return { bookingId: booking.id, fullyPaid: false, refund: null as string | null };
        }
      }

      const paidBefore = await paidSucceededSum(tx, booking.id);
      const totalPrice = booking.totalPrice;

      // Trop perçu (déjà soldé) → on rembourse ce paiement, on ne l'enregistre pas.
      if (paidBefore >= totalPrice) {
        refundIntent = input.stripePaymentIntentId ?? null;
        return { bookingId: booking.id, fullyPaid: true, refund: refundIntent };
      }

      let expected: number;
      if (input.kind === 'deposit') {
        expected = paidBefore === 0 ? booking.depositAmount : -1;
      } else {
        expected = totalPrice - paidBefore;
      }

      if (input.amountCents !== expected) {
        // Session périmée (montant déjà couvert/partiellement payé) → rembourser.
        refundIntent = input.stripePaymentIntentId ?? null;
        return { bookingId: booking.id, fullyPaid: paidBefore >= totalPrice, refund: refundIntent };
      }

      const paidAt = new Date();
      await tx.insert(payments).values({
        bookingId: booking.id,
        amount: input.amountCents,
        currency: 'EUR',
        method: 'stripe',
        stripePaymentIntentId: input.stripePaymentIntentId ?? null,
        status: 'succeeded',
        paidAt,
      });

      const paidAfter = paidBefore + input.amountCents;
      const fullyPaid = paidAfter >= totalPrice;
      const wasOffered = booking.status === 'offered';

      await tx
        .update(bookings)
        .set({
          status: wasOffered ? 'confirmed' : booking.status,
          paymentStatus: fullyPaid ? 'fully_paid' : 'deposit_paid',
          stripeCheckoutSessionId: input.stripeSessionId ?? booking.stripeCheckoutSessionId,
          stripePaymentIntentId: input.stripePaymentIntentId ?? booking.stripePaymentIntentId,
        })
        .where(eq(bookings.id, booking.id));

      // Factures : acompte (si > 0) puis finale nette quand tout est réglé.
      if (booking.depositAmount > 0) await payInvoice(tx, booking.id, 'deposit', paidAt);
      if (fullyPaid) await payInvoice(tx, booking.id, 'final', paidAt);

      await logAudit(tx, {
        action: wasOffered ? 'booking.confirmed' : 'booking.payment',
        entityType: 'booking',
        entityId: booking.id,
        metadata: { amountCents: input.amountCents, kind: input.kind, method: 'stripe' },
      });

      return { bookingId: booking.id, fullyPaid, refund: null as string | null };
    });

    if (alreadyHandled) {
      return { ok: true, bookingId: outcome.bookingId, fullyPaid: outcome.fullyPaid };
    }
    if (outcome.refund) {
      // Session/montant périmé : rembourser ce que Stripe a encaissé.
      const res = await refundPaymentIntent(outcome.refund, input.amountCents);
      console.warn('confirmOnlinePayment : paiement refusé remboursé —', res.ok ? 'ok' : res.message);
      return { ok: true, bookingId: outcome.bookingId, fullyPaid: outcome.fullyPaid };
    }
    return { ok: true, bookingId: outcome.bookingId, fullyPaid: outcome.fullyPaid };
  } catch (error) {
    console.error('confirmOnlinePayment :', error);
    return { ok: false, message: 'Erreur lors de la confirmation du paiement.' };
  }
}

export type CancelBookingResult =
  | { ok: true; refunded: boolean; message: string }
  | { ok: false; message: string };

/**
 * Annule une réservation. Rembourse l'acompte (Stripe + facture → refunded) si
 * l'annulation est ≥ `cancellationRefundDays` jours avant l'arrivée.
 */
export async function cancelBooking(
  bookingId: string,
  reason: string
): Promise<CancelBookingResult> {
  const settings = await getPensionSettings();

  let mustRefund = false;
  let depositPaymentIntent: string | null = null;
  let depositRefundAmount: number | null = null;

  try {
    await db.transaction(async (tx) => {
      const [booking] = await tx
        .select()
        .from(bookings)
        .where(eq(bookings.id, bookingId))
        .for('update')
        .limit(1);
      if (!booking) throw new Error('Réservation introuvable.');
      if (booking.status === 'cancelled' || booking.status === 'expired') {
        throw new Error('Réservation déjà annulée.');
      }

      const now = Date.now();
      mustRefund = shouldRefundDeposit({
        status: booking.status,
        checkInDate: booking.checkInDate,
        now: new Date(now),
        depositAmount: booking.depositAmount,
        refundDays: settings.cancellationRefundDays,
      });

      await tx
        .update(bookings)
        .set({
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelledReason: reason,
          ...(mustRefund ? { refundedAt: new Date() } : {}),
        })
        .where(eq(bookings.id, booking.id));

      if (mustRefund) {
        const paidDeposit = await tx
          .select({
            paymentIntentId: payments.stripePaymentIntentId,
            amount: payments.amount,
          })
          .from(payments)
          .where(sql`${payments.bookingId} = ${booking.id} AND ${payments.status} = 'succeeded'`)
          .orderBy(payments.paidAt)
          .limit(1);

        depositPaymentIntent = paidDeposit[0]?.paymentIntentId ?? null;
        depositRefundAmount = paidDeposit[0]?.amount ?? null;

        // La facture d'acompte passe en remboursée (trace comptable).
        const depositInvoice = await tx
          .select({ id: invoices.id })
          .from(invoices)
          .where(sql`${invoices.bookingId} = ${booking.id} AND ${invoices.type} = 'deposit'`)
          .limit(1);
        if (depositInvoice[0]) {
          await tx
            .update(invoices)
            .set({ status: 'refunded' })
            .where(eq(invoices.id, depositInvoice[0].id));
        }
      }

      await logAudit(tx, {
        action: 'booking.cancelled',
        entityType: 'booking',
        entityId: booking.id,
        metadata: { reason, refunded: mustRefund },
      });
    });

    // Remboursement Stripe HORS transaction (appel réseau), après validation DB.
    if (mustRefund && depositPaymentIntent) {
      const refund = await refundPaymentIntent(depositPaymentIntent, depositRefundAmount ?? undefined);
      if (!refund.ok) {
        console.error('cancelBooking : remboursement Stripe échoué —', refund.message);
      }
      await db
        .update(payments)
        .set({ status: 'refunded' })
        .where(eq(payments.stripePaymentIntentId, depositPaymentIntent));
    }

    return {
      ok: true,
      refunded: mustRefund,
      message: mustRefund
        ? 'Réservation annulée et acompte remboursé.'
        : 'Réservation annulée (acompte retenu).',
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes('déjà annulée')) {
      return { ok: false, message: error.message };
    }
    console.error('cancelBooking :', error);
    return { ok: false, message: 'Erreur lors de l’annulation.' };
  }
}

/**
 * Expire une offre non payée (cron) : statut `offered` → `expired`. Aucun
 * acompte n'ayant été encaissé, aucune facture/remboursement à traiter. Les
 * unités sont libérées par les vérifications (cancelled/expired exclus).
 */
export async function expireOfferedBooking(bookingId: string): Promise<CancelBookingResult> {
  try {
    const [updated] = await db
      .update(bookings)
      .set({ status: 'expired', cancelledReason: 'Offre expirée (acompte non réglé)' })
      .where(
        sql`${bookings.id} = ${bookingId} AND ${bookings.status} = 'offered' AND ${bookings.offeredExpiresAt} < now()`
      )
      .returning({ id: bookings.id });

    if (!updated) {
      return { ok: false, message: 'Offre non trouvée ou non expirable.' };
    }
    await db.insert(auditLogs).values({
      action: 'booking.expired',
      entityType: 'booking',
      entityId: bookingId,
      metadata: { reason: 'Offre expirée (acompte non réglé)' },
    });
    return { ok: true, refunded: false, message: 'Offre expirée.' };
  } catch (error) {
    console.error('expireOfferedBooking :', error);
    return { ok: false, message: 'Erreur lors de l’expiration de l’offre.' };
  }
}
