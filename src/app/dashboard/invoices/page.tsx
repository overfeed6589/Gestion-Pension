import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { formatCents } from '@/lib/money';
import { GenerateFinalInvoiceButton } from '@/components/invoices/GenerateFinalInvoiceButton';

export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  issued: 'Émise',
  paid: 'Payée',
  refunded: 'Remboursée',
  cancelled: 'Annulée',
};

const TYPE_LABELS: Record<string, string> = {
  deposit: 'Acompte',
  final: 'Finale',
};

function fmtDate(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : '—';
}

async function loadInvoicesData() {
  const [invoices, pendingBookings] = await Promise.all([
    db.query.invoices.findMany({
      with: { client: true, booking: true, items: true },
      orderBy: (invoices, { desc }) => [desc(invoices.createdAt)],
      limit: 100,
    }),
    // Séjours soldés / terminés sans facture finale encore générée.
    db.query.bookings.findMany({
      with: { client: true },
      where: {
        RAW: (t) =>
          sql`${t.status} in ('checked_out') OR (${t.status} = 'confirmed' AND ${t.paymentStatus} = 'fully_paid')`,
      },
      orderBy: (bookings, { desc }) => [desc(bookings.checkOutDate)],
      limit: 50,
    }),
  ]);

  const withFinal = new Set(
    invoices.filter((i) => i.type === 'final').map((i) => i.bookingId)
  );

  return {
    invoices,
    pendingBookings: pendingBookings.filter((b) => !withFinal.has(b.id)),
  };
}

export default async function InvoicesPage() {
  await requireRole('secretary');

  const { invoices, pendingBookings } = await loadInvoicesData();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Factures</h1>
        <p className="text-slate-700 text-sm mt-1">
          Factures d’acompte (à la confirmation) et factures finales (solde). La génération est
          idempotente et la synchronisation Pennylane est automatique.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold">Factures finales à générer ({pendingBookings.length})</h2>
        {pendingBookings.length === 0 ? (
          <p className="text-sm text-slate-600">Rien à faire : tout est facturé.</p>
        ) : (
          <ul className="divide-y border rounded-xl bg-white">
            {pendingBookings.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="text-sm">
                  <p className="font-medium">
                    {b.client?.firstName} {b.client?.lastName} —{' '}
                    {b.checkInDate.toISOString().slice(0, 10)} → {b.checkOutDate.toISOString().slice(0, 10)}
                  </p>
                  <p className="text-xs text-slate-600">
                    Total {formatCents(b.totalPrice)} · acompte {formatCents(b.depositAmount)} ·{' '}
                    {b.status}
                  </p>
                </div>
                <GenerateFinalInvoiceButton bookingId={b.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Historique ({invoices.length})</h2>
        <div className="overflow-x-auto border rounded-xl bg-white">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-600 border-b bg-slate-50">
              <tr>
                <th className="px-3 py-2">Numéro</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Client</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Montant TTC</th>
                <th className="px-3 py-2">Statut</th>
                <th className="px-3 py-2">Pennylane</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-slate-600">Aucune facture pour le moment.</td>
                </tr>
              )}
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="px-3 py-2 font-mono text-xs">{inv.invoiceNumber}</td>
                  <td className="px-3 py-2">{TYPE_LABELS[inv.type] ?? inv.type}</td>
                  <td className="px-3 py-2">
                    {inv.client ? `${inv.client.firstName} ${inv.client.lastName}` : '—'}
                  </td>
                  <td className="px-3 py-2">{fmtDate(inv.createdAt)}</td>
                  <td className="px-3 py-2">{formatCents(inv.totalInCents)}</td>
                  <td className="px-3 py-2">{STATUS_LABELS[inv.status] ?? inv.status}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {inv.pennylaneId ? `Sync #${inv.pennylaneId}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
