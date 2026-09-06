import { invoices, invoiceItems, bookings } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { generateNextInvoiceNumber } from './numbering';
import { computeNights } from '@/lib/money';
import { splitTtc } from '@/lib/invoicing/ttc';

// ---------------------------------------------------------------------------
// Génération de facture depuis un séjour (Phase G4)
// ---------------------------------------------------------------------------
// Conventions retenues :
//  - Tous les montants stockés (`segment_price`, `default_price`,
//    `deposit_amount`) sont en centimes et en TTC (prix affichés au client).
//  - `total_in_cents` = TTC ; la TVA est DÉRIVÉE (montant TTC → HT/TVA au taux
//    `vat_rate`, défaut 20 %), pas un ajout par-dessus.
//  - facture `deposit` : montant = acompte (trace pour remboursement).
//  - facture `final` : montant = total séjour (segments + prestations) − acompte.
//
// La fonction prend une transaction drizzle (appelée depuis un flux qui verrouille
// déjà le booking ou non) et est idempotente par (booking, type).
// ---------------------------------------------------------------------------

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type BookingInvoiceType = 'deposit' | 'final';

export type GenerateInvoiceResult =
  | { ok: true; invoiceId: string; created: boolean; message?: string }
  | { ok: false; message: string };

/** Charge le booking avec segments (pets + catégorie) et prestations, en verrou. */
async function loadBookingForInvoice(tx: Tx, bookingId: string) {
  // 1. Verrou de ligne : sérialise la génération de facture pour ce booking.
  const [locked] = await tx
    .select({ id: bookings.id })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .for('update');

  if (!locked) return null;

  // 2. Lecture relationnelle complète (le type de transaction drizzle exposé via
  //    l'alias `Tx` ne porte pas les relations typées : on passe par le type db).
  const relational = tx as unknown as typeof db;
  const booking = await relational.query.bookings.findFirst({
    where: { RAW: (t) => eq(t.id, bookingId) },
    with: {
      client: true,
      payments: true,
      extraServices: { with: { service: true, pet: true } },
      segments: {
        with: {
          category: true,
          occupantLinks: { with: { pet: true } },
        },
      },
    },
  });

  return booking;
}

/**
 * Génère (ou renvoie) la facture `type` du booking, dans la transaction fournie.
 */
export async function generateBookingInvoice(
  tx: Tx,
  bookingId: string,
  type: BookingInvoiceType,
  vatRateBp = 2000
): Promise<GenerateInvoiceResult> {
  const booking = await loadBookingForInvoice(tx, bookingId);
  if (!booking) return { ok: false, message: 'Réservation introuvable.' };

  // Idempotence : pas de double facture pour (booking, type) tant qu'elle n'est pas annulée.
  const relational = tx as unknown as typeof db;
  const existing = await relational.query.invoices.findMany({
    where: { RAW: (t) => eq(t.bookingId, booking.id) },
  });
  const already = existing.find((inv) => inv.type === type && inv.status !== 'cancelled');

  if (already) {
    return { ok: true, invoiceId: already.id, created: false, message: 'Facture déjà émise.' };
  }

  // ---- Calcul du montant TTC du séjour --------------------------------
  const stayTtcCents = booking.segments.reduce((sum, s) => sum + s.segmentPrice, 0);
  const extrasTtcCents = booking.extraServices.reduce((sum, item) => sum + item.totalPrice, 0);
  const totalStayTtc = stayTtcCents + extrasTtcCents;
  const depositTtc = booking.depositAmount;

  // ---- Lignes ----------------------------------------------------------
  type ItemRow = {
    description: string;
    quantity: number;
    unitPriceInCents: number;
    totalInCents: number;
  };
  const items: ItemRow[] = [];

  const petNamesFor = (linkList: Array<{ pet: { name: string } | null }>) =>
    linkList.map((l) => l.pet?.name).filter(Boolean).join(', ') || 'Animal';

  if (type === 'deposit') {
    const petNames = booking.segments.map((s) => petNamesFor(s.occupantLinks)).join(', ');
    const categories = booking.segments.map((s) => s.category?.name).filter(Boolean).join(' + ');
    const checkIn = booking.checkInDate.toISOString().slice(0, 10);
    const checkOut = booking.checkOutDate.toISOString().slice(0, 10);
    const pct = depositTtc > 0 ? Math.round((depositTtc / totalStayTtc) * 100) : 0;

    items.push({
      description:
        `Acompte ${pct}% – Séjour ${petNames} du ${checkIn} au ${checkOut}` +
        (categories ? ` (${categories})` : '') +
        ` – Solde à régler au départ : ${((totalStayTtc - depositTtc) / 100).toFixed(2)} €`,
      quantity: 1,
      unitPriceInCents: depositTtc,
      totalInCents: depositTtc,
    });
  } else {
    // final : lignes détaillées + déduction de l'acompte déjà réglé.
    for (const segment of booking.segments) {
      const nights = computeNights(segment.startDate, segment.endDate);
      const petNames = petNamesFor(segment.occupantLinks);
      const unitPerNight = nights > 0 ? Math.round(segment.segmentPrice / nights) : segment.segmentPrice;
      items.push({
        description: `Séjour ${petNames} (${nights} nuitée(s)) – ${segment.category?.name ?? 'Hébergement'}`,
        quantity: nights,
        unitPriceInCents: unitPerNight,
        totalInCents: segment.segmentPrice,
      });
    }
    for (const item of booking.extraServices) {
      items.push({
        description: `Prestation : ${item.service?.name ?? 'Service'}${item.pet ? ` (${item.pet.name})` : ''}`,
        quantity: item.quantity,
        unitPriceInCents: item.unitPrice,
        totalInCents: item.totalPrice,
      });
    }
    if (depositTtc > 0) {
      items.push({
        description: 'Acompte déjà réglé',
        quantity: 1,
        unitPriceInCents: -depositTtc,
        totalInCents: -depositTtc,
      });
    }
  }

  const invoiceTotalTtc =
    type === 'deposit' ? depositTtc : Math.max(0, totalStayTtc - depositTtc);
  const { subtotal, tax } = splitTtc(invoiceTotalTtc, vatRateBp);

  const invoiceNumber = await generateNextInvoiceNumber(tx);

  const [newInvoice] = await tx
    .insert(invoices)
    .values({
      invoiceNumber,
      type,
      status: 'issued',
      eInvoiceStatus: 'pending',
      clientId: booking.clientId,
      bookingId: booking.id,
      subtotalInCents: subtotal,
      taxInCents: tax,
      totalInCents: invoiceTotalTtc,
      vatRate: vatRateBp,
      dueDate: type === 'deposit' ? new Date() : booking.checkOutDate,
    })
    .returning({ id: invoices.id });

  await tx.insert(invoiceItems).values(
    items.map((item) => ({
      invoiceId: newInvoice.id,
      description: item.description.slice(0, 255),
      quantity: item.quantity,
      unitPriceInCents: item.unitPriceInCents,
      totalInCents: item.totalInCents,
    }))
  );

  return { ok: true, invoiceId: newInvoice.id, created: true };
}
