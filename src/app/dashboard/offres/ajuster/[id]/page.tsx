import Link from 'next/link';
import { db } from '@/db';
import { eq } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { OfferEditForm } from '@/components/offers/OfferEditForm';

export const dynamic = 'force-dynamic';

export default async function AjusterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole('secretary');
  const { id } = await params;

  const booking = await db.query.bookings.findFirst({
    where: { RAW: (t) => eq(t.id, id) },
    with: {
      client: { with: { pets: true } },
      segments: {
        with: { category: true, occupantLinks: { with: { pet: true } } },
      },
    },
  });

  if (!booking) {
    return (
      <p className="text-sm text-red-600 bg-red-50 rounded-xl p-6">
        Réservation introuvable.{' '}
        <Link href="/dashboard/offres" className="underline">Retour</Link>
      </p>
    );
  }
  if (!['proposed', 'offered'].includes(booking.status)) {
    return (
      <p className="text-sm text-amber-700 bg-amber-50 rounded-xl p-6">
        Cette réservation n’est plus ajustable (statut {booking.status}).{' '}
        <Link href="/dashboard/offres" className="underline">Retour</Link>
      </p>
    );
  }

  const categories = await db.query.housingCategories.findMany({
    orderBy: (categories, { asc }) => [asc(categories.name)],
  });

  const petIds = [...new Set(booking.segments.flatMap((s) => s.occupantLinks.map((ol) => ol.petId)))];
  const seen = new Set<string>();
  const initialRows = booking.segments
    .map((s) => ({ startDate: s.startDate, endDate: s.endDate, categoryId: s.categoryId }))
    .filter((r) => {
      const key = `${r.startDate}|${r.endDate}|${r.categoryId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  const pets =
    booking.client?.pets.map((p) => ({ id: p.id, name: p.name })) ?? [];

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ajustement de réservation</h1>
        <p className="text-slate-800">
          Modifiez dates, catégories ou animaux : les espaces sont libérés puis re-bloqués, le prix
          et l’acompte sont recalculés.
        </p>
        <Link href="/dashboard/offres" className="text-xs underline text-slate-700">
          ← Retour aux offres & demandes
        </Link>
      </div>

      <OfferEditForm
        bookingId={booking.id}
        clientLabel={`${booking.client?.firstName ?? ''} ${booking.client?.lastName ?? ''}`}
        pets={pets}
        categories={categories}
        initialPetIds={petIds}
        initialRows={initialRows}
        initialStart={booking.checkInDate.toISOString().slice(0, 10)}
        initialEnd={booking.checkOutDate.toISOString().slice(0, 10)}
      />
    </div>
  );
}
