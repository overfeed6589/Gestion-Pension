import { db } from '@/db';
import { bookings } from '@/db/schema';
import { ne } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { OfferForm } from '@/components/offers/OfferForm';
import { PaymentLinkButton } from '@/components/offers/PaymentLinkButton';
import { formatCents } from '@/lib/money';

export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<string, string> = {
  offered: 'Offre en attente d’acompte',
  confirmed: 'Confirmée (acompte reçu)',
  checked_in: 'En garde',
  checked_out: 'Terminée',
  cancelled: 'Annulée',
  expired: 'Expirée',
  requested: 'Demande reçue',
};

export default async function OffresPage() {
  await requireRole('secretary');

  const [clients, categories, latestBookings] = await Promise.all([
    db.query.clients.findMany({
      with: { pets: true },
      orderBy: (clients, { asc }) => [asc(clients.lastName)],
    }),
    db.query.housingCategories.findMany({
      orderBy: (categories, { asc }) => [asc(categories.name)],
    }),
    db.query.bookings.findMany({
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
      where: { RAW: () => ne(bookings.status, 'cancelled') },
      orderBy: (bookings, { desc }) => [desc(bookings.createdAt)],
      limit: 50,
    }),
  ]);

  const activeBookings = latestBookings.filter((b) => b.status === 'offered');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Offres & réservations</h1>
        <p className="text-slate-500">
          Créez une offre (espaces bloqués), envoyez le lien d’acompte : le paiement confirme la
          réservation et émet la facture d’acompte.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2">
          <OfferForm clients={clients} categories={categories} />
        </div>

        <div className="lg:col-span-3 space-y-4">
          {activeBookings.length > 0 && (
            <div className="bg-white border rounded-xl p-4 space-y-2">
              <h2 className="font-semibold">Offres en attente de paiement ({activeBookings.length})</h2>
              {activeBookings.map((booking) => {
                const pets = booking.segments
                  .flatMap((s) => s.occupantLinks.map((ol) => ol.pet?.name))
                  .filter(Boolean)
                  .join(', ');
                return (
                  <div key={booking.id} className="border-b pb-2 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{pets || 'Animal'}</p>
                      <p className="text-xs text-slate-500">
                        {booking.client?.firstName} {booking.client?.lastName} • Acompte{' '}
                        {formatCents(booking.depositAmount)} / total {formatCents(booking.totalPrice)}
                      </p>
                    </div>
                    <PaymentLinkButton bookingId={booking.id} />
                  </div>
                );
              })}
            </div>
          )}

          <div className="space-y-2">
            <h2 className="font-semibold">Séjours récents</h2>
            {latestBookings.length === 0 ? (
              <p className="text-sm text-slate-500 italic bg-white border rounded-xl p-6">
                Aucune réservation pour l’instant.
              </p>
            ) : (
              latestBookings.map((booking) => {
                const pets = booking.segments
                  .flatMap((s) => s.occupantLinks.map((ol) => ol.pet?.name))
                  .filter(Boolean)
                  .join(', ');
                const unit = booking.segments[0]?.assignedUnit?.name || '—';
                return (
                  <div key={booking.id} className="bg-white border rounded-xl p-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium text-sm">{pets || 'Animal'}</p>
                      <p className="text-xs text-slate-500">
                        {booking.client?.firstName} {booking.client?.lastName} •{' '}
                        {booking.checkInDate.toISOString().slice(0, 10)} →{' '}
                        {booking.checkOutDate.toISOString().slice(0, 10)} • Box : {unit}
                      </p>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700 whitespace-nowrap">
                      {STATUS_LABELS[booking.status] ?? booking.status}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
