import Link from 'next/link';
import { db } from '@/db';
import { ne } from 'drizzle-orm';
import { requireRole, canAccess, getCurrentProfile } from '@/lib/auth';
import { PaymentLinkButton } from '@/components/offers/PaymentLinkButton';
import { DemandValidateActions } from '@/components/offers/DemandValidateActions';
import { formatCents } from '@/lib/money';
import { FicheLink } from '@/components/fiches/FicheLink';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Informations » Réservations (Phase H3) — liste unifiée
// ---------------------------------------------------------------------------
// Fusion de l'ancienne page Offres et de la liste Réservations : les demandes
// non traitées (requested/proposed) sont marquées « Non traitée » mais
// apparaissent dans le même tableau que le reste. Les actions de traitement
// (offre, lien acompte) restent celles de l'itération 1.
// ---------------------------------------------------------------------------

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

const UNPROCESSED_STATUSES = new Set(['requested', 'proposed']);

async function loadReservationsData() {
  return db.query.bookings.findMany({
    with: {
      client: true,
      segments: {
        with: {
          category: true,
          assignedUnit: true,
          occupantLinks: { with: { pet: true } },
        },
      },
    },
    where: { RAW: (t) => ne(t.status, 'cancelled') },
    orderBy: (bookings, { desc }) => [desc(bookings.createdAt)],
    limit: 100,
  });
}

export default async function InformationsReservationsPage() {
  await requireRole('secretary', 'staff');
  const profile = await getCurrentProfile();
  const canTreat = profile ? canAccess(profile.role, ['secretary']) : false;

  const bookingsRows = await loadReservationsData();
  const webRequests = bookingsRows.filter((b) => b.status === 'requested' && b.source === 'web');
  const proposedBookings = bookingsRows.filter((b) => b.status === 'proposed');
  const pendingOffers = bookingsRows.filter((b) => b.status === 'offered');

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Réservations</h1>
          <p className="text-slate-700 text-sm mt-1">
            Vue unifiée : demandes à traiter, offres et séjours. Cliquez sur un nom ou une date
            pour ouvrir la fiche.
          </p>
        </div>
        {canTreat && (
          <Link
            href="/dashboard/offres/nouvelle"
            className="bg-slate-900 text-white text-xs font-medium py-2 px-3 rounded whitespace-nowrap"
          >
            Nouvelle offre →
          </Link>
        )}
      </div>

      {canTreat && (
        <section className="space-y-3">
          <h2 className="font-semibold">Non traitées ({webRequests.length + proposedBookings.length})</h2>

          {webRequests.length > 0 && (
            <div className="bg-white border rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-medium text-slate-600">Demandes web ({webRequests.length})</h3>
              {webRequests.map((booking) => (
                <div key={booking.id} className="border-b pb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">
                      <FicheLink kind="client" id={booking.client?.id ?? ''}>
                        {booking.client?.firstName} {booking.client?.lastName}
                      </FicheLink>
                    </p>
                    <p className="text-xs text-slate-700">
                      Arrivée {booking.checkInDate.toISOString().slice(0, 10)} →{' '}
                      {booking.checkOutDate.toISOString().slice(0, 10)}
                    </p>
                    {booking.requestNotes && (
                      <p className="text-xs text-slate-700 mt-0.5">{booking.requestNotes}</p>
                    )}
                  </div>
                  <Link
                    href={`/dashboard/offres/nouvelle?demande=${booking.id}`}
                    className="bg-slate-900 text-white text-xs font-medium py-1.5 px-3 rounded whitespace-nowrap"
                  >
                    Créer l’offre →
                  </Link>
                </div>
              ))}
            </div>
          )}

          {proposedBookings.length > 0 && (
            <div className="bg-white border rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-medium text-slate-600">
                Demandes en attente de validation ({proposedBookings.length})
              </h3>
              {proposedBookings.map((booking) => {
                const petsLabel = booking.segments
                  .flatMap((s) => s.occupantLinks.map((ol) => ol.pet?.name))
                  .filter(Boolean)
                  .join(', ');
                return (
                  <div key={booking.id} className="border-b pb-3 space-y-2">
                    <div className="space-y-0.5">
                      <p className="text-sm font-semibold">
                        <FicheLink kind="client" id={booking.client?.id ?? ''}>
                        {booking.client?.firstName} {booking.client?.lastName}
                      </FicheLink>
                      </p>
                      <p className="text-sm text-slate-800">{petsLabel || 'Animal'}</p>
                      <p className="text-xs text-slate-700">
                        {booking.checkInDate.toISOString().slice(0, 10)} →{' '}
                        {booking.checkOutDate.toISOString().slice(0, 10)} · Total{' '}
                        {formatCents(booking.totalPrice)} · Acompte {formatCents(booking.depositAmount)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <Link href={`/dashboard/offres/ajuster/${booking.id}`} className="text-xs underline text-slate-700">
                        Ajuster
                      </Link>
                      <DemandValidateActions bookingId={booking.id} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {pendingOffers.length > 0 && (
            <div className="bg-white border rounded-xl p-4 space-y-2">
              <h3 className="text-sm font-medium text-slate-600">
                Offres en attente de paiement ({pendingOffers.length})
              </h3>
              {pendingOffers.map((booking) => {
                const petsLabel = booking.segments
                  .flatMap((s) => s.occupantLinks.map((ol) => ol.pet?.name))
                  .filter(Boolean)
                  .join(', ');
                return (
                  <div key={booking.id} className="border-b pb-2 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{petsLabel || 'Animal'}</p>
                      <p className="text-xs text-slate-700">
                        <FicheLink kind="client" id={booking.client?.id ?? ''}>
                        {booking.client?.firstName} {booking.client?.lastName}
                      </FicheLink>{' '}
                        • Acompte {formatCents(booking.depositAmount)} / total {formatCents(booking.totalPrice)}
                      </p>
                    </div>
                    <PaymentLinkButton bookingId={booking.id} />
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-semibold">Toutes les réservations ({bookingsRows.length})</h2>
        <div className="overflow-x-auto border rounded-xl bg-white">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-600 border-b bg-slate-50">
              <tr>
                <th className="px-3 py-2">Client</th>
                <th className="px-3 py-2">Animaux</th>
                <th className="px-3 py-2">Séjour</th>
                <th className="px-3 py-2">Statut</th>
                <th className="px-3 py-2">Paiement</th>
                <th className="px-3 py-2">Total</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {bookingsRows.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-4 text-slate-600">Aucune réservation.</td></tr>
              )}
              {bookingsRows.map((b) => {
                const petsLabel = b.segments
                  .flatMap((s) => s.occupantLinks.map((ol) => ol.pet?.name))
                  .filter(Boolean)
                  .join(', ');
                return (
                  <tr key={b.id} className={UNPROCESSED_STATUSES.has(b.status) ? 'bg-amber-50/60' : undefined}>
                    <td className="px-3 py-2">
                      {b.client ? (
                        <FicheLink kind="client" id={b.client.id}>
                          {b.client.firstName} {b.client.lastName}
                        </FicheLink>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-700">{petsLabel || '—'}</td>
                    <td className="px-3 py-2">
                      <FicheLink kind="booking" id={b.id}>
                        {b.checkInDate.toISOString().slice(0, 10)} → {b.checkOutDate.toISOString().slice(0, 10)}
                      </FicheLink>
                    </td>
                    <td className="px-3 py-2">
                      {STATUS_LABELS[b.status] ?? b.status}
                      {UNPROCESSED_STATUSES.has(b.status) && (
                        <span className="ml-2 text-[11px] font-medium rounded-full bg-amber-100 text-amber-900 border border-amber-200 px-2 py-0.5">
                          Non traitée
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{b.paymentStatus}</td>
                    <td className="px-3 py-2">{formatCents(b.totalPrice)}</td>
                    <td className="px-3 py-2">
                      <Link href={`/dashboard/bookings/${b.id}`} className="text-xs underline text-slate-700">
                        Détail
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}