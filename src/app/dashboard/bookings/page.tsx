import Link from 'next/link';
import { db } from '@/db';
import { requireRole } from '@/lib/auth';
import { formatCents } from '@/lib/money';
import { FicheLink } from '@/components/fiches/FicheLink';

export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<string, string> = {
  proposed: 'En attente de validation',
  offered: 'Offre en attente d’acompte',
  confirmed: 'Confirmée',
  checked_in: 'En garde',
  checked_out: 'Terminée',
  cancelled: 'Annulée',
  expired: 'Expirée',
  requested: 'Demande reçue',
};

const PAYMENT_LABELS: Record<string, string> = {
  unpaid: 'Non payée',
  deposit_paid: 'Acompte reçu',
  fully_paid: 'Soldée',
  refunded: 'Remboursée',
};

export default async function BookingsPage() {
  await requireRole('secretary', 'staff');

  const rows = await db.query.bookings.findMany({
    with: { client: true },
    orderBy: (bookings, { desc }) => [desc(bookings.createdAt)],
    limit: 100,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Réservations</h1>
        <p className="text-slate-700 text-sm mt-1">Les 100 dernières réservations créées.</p>
      </div>
      <div className="overflow-x-auto border rounded-xl bg-white">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-600 border-b bg-slate-50">
            <tr>
              <th className="px-3 py-2">Client</th>
              <th className="px-3 py-2">Séjour</th>
              <th className="px-3 py-2">Statut</th>
              <th className="px-3 py-2">Paiement</th>
              <th className="px-3 py-2">Total</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-4 text-slate-600">Aucune réservation.</td></tr>
            )}
            {rows.map((b) => (
              <tr key={b.id}>
                <td className="px-3 py-2">
                  {b.client ? (
                    <FicheLink kind="client" id={b.client.id}>
                      {b.client.firstName} {b.client.lastName}
                    </FicheLink>
                  ) : '—'}
                </td>
                <td className="px-3 py-2">
                  <FicheLink kind="booking" id={b.id}>
                    {b.checkInDate.toISOString().slice(0, 10)} → {b.checkOutDate.toISOString().slice(0, 10)}
                  </FicheLink>
                </td>
                <td className="px-3 py-2">{STATUS_LABELS[b.status] ?? b.status}</td>
                <td className="px-3 py-2">{PAYMENT_LABELS[b.paymentStatus] ?? b.paymentStatus}</td>
                <td className="px-3 py-2">{formatCents(b.totalPrice)}</td>
                <td className="px-3 py-2">
                  <Link href={`/dashboard/bookings/${b.id}`} className="text-xs underline text-slate-700">
                    Détail
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
