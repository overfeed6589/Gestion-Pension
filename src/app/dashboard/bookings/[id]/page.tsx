import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { payments } from '@/db/schema';
import { eq } from 'drizzle-orm';
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

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole('secretary', 'staff');
  const { id } = await params;

  const booking = await db.query.bookings.findFirst({
    where: { RAW: (t) => eq(t.id, id) },
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
  });
  if (!booking) notFound();

  const paidRows = await db
    .select({ amount: payments.amount, status: payments.status, paidAt: payments.paidAt, method: payments.method })
    .from(payments)
    .where(eq(payments.bookingId, id));
  const paid = paidRows
    .filter((p) => p.status === 'succeeded')
    .reduce((sum, p) => sum + p.amount, 0);
  const outstanding = Math.max(0, booking.totalPrice - paid);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/bookings" className="text-xs underline text-slate-600">← Réservations</Link>
        <h1 className="text-2xl font-bold tracking-tight mt-1">
          Séjour du {booking.checkInDate.toISOString().slice(0, 10)} au{' '}
          {booking.checkOutDate.toISOString().slice(0, 10)}
        </h1>
        <p className="text-sm text-slate-700 mt-1">
          {booking.client ? (
            <FicheLink kind="client" id={booking.client.id}>
              {booking.client.firstName} {booking.client.lastName}
            </FicheLink>
          ) : (
            'Client inconnu'
          )}
          {' · '}
          {STATUS_LABELS[booking.status] ?? booking.status} · {formatCents(booking.totalPrice)} ·
          payé {formatCents(paid)} · reste {formatCents(outstanding)}
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="font-semibold">Segments</h2>
        <ul className="divide-y border rounded-xl bg-white text-sm">
          {booking.segments.map((s) => (
            <li key={s.id} className="px-4 py-3 flex flex-wrap justify-between gap-2">
              <span>
                {s.category?.name ?? '—'}
                {s.assignedUnit ? ` · ${s.assignedUnit.name}` : ' · box non assigné'}
              </span>
              <span className="text-slate-600">
                {s.startDate} → {s.endDate} · {formatCents(s.segmentPrice)}
              </span>
              <span className="text-slate-600">
                {s.occupantLinks.some((l) => l.pet)
                  ? s.occupantLinks.map((l, i) =>
                      l.pet ? (
                        <span key={l.pet.id}>
                          {i > 0 && ', '}
                          <FicheLink kind="pet" id={l.pet.id}>{l.pet.name}</FicheLink>
                        </span>
                      ) : null
                    )
                  : '—'}
              </span>
            </li>
          ))}
          {booking.segments.length === 0 && (
            <li className="px-4 py-3 text-slate-600">Aucun segment (réservation annulée/expirée).</li>
          )}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Paiements</h2>
        <ul className="divide-y border rounded-xl bg-white text-sm">
          {paidRows.length === 0 && (
            <li className="px-4 py-3 text-slate-600">Aucun paiement.</li>
          )}
          {paidRows.map((p, i) => (
            <li key={i} className="px-4 py-3 flex justify-between">
              <span>
                {formatCents(p.amount)} · {p.method ?? 'stripe'} · {p.status}
              </span>
              <span className="text-slate-600">{p.paidAt ? p.paidAt.toISOString().slice(0, 16).replace('T', ' ') : '—'}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
