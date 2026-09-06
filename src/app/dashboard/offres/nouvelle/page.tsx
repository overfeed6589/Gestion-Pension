import Link from 'next/link';
import { db } from '@/db';
import { eq } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { OfferForm } from '@/components/offers/OfferForm';

export const dynamic = 'force-dynamic';

export default async function NouvelleOffrePage({
  searchParams,
}: {
  searchParams: Promise<{ demande?: string }>;
}) {
  await requireRole('secretary');

  const params = await searchParams;
  const demandeId = params.demande;

  const [categories, clients] = await Promise.all([
    db.query.housingCategories.findMany({
      orderBy: (categories, { asc }) => [asc(categories.name)],
    }),
    db.query.clients.findMany({
      with: { pets: true },
      orderBy: (clients, { asc }) => [asc(clients.lastName)],
    }),
  ]);

  let existing: { bookingId: string; clientId: string; startDate: string; endDate: string } | undefined;

  if (demandeId) {
    const demande = await db.query.bookings.findFirst({
      where: { RAW: (t) => eq(t.id, demandeId) },
      with: { client: { with: { pets: true } } },
    });
    if (!demande) {
      return (
        <p className="text-sm text-red-600 bg-red-50 rounded-xl p-6">
          Demande introuvable. <Link href="/dashboard/offres" className="underline">Retour aux offres</Link>
        </p>
      );
    }
    if (demande.status !== 'requested') {
      return (
        <p className="text-sm text-amber-700 bg-amber-50 rounded-xl p-6">
          Cette demande a déjà été traitée ({demande.status}).{' '}
          <Link href="/dashboard/offres" className="underline">Retour aux offres</Link>
        </p>
      );
    }
    existing = {
      bookingId: demande.id,
      clientId: demande.clientId,
      startDate: demande.checkInDate.toISOString().slice(0, 10),
      endDate: demande.checkOutDate.toISOString().slice(0, 10),
    };
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {existing ? 'Répondre à la demande web' : 'Nouvelle offre'}
        </h1>
        <p className="text-slate-700">
          {existing
            ? 'Sélectionnez les animaux du client, vérifiez les dates, choisissez les espaces : la demande devient une offre bloquante.'
            : 'Créez une réservation pour un client existant.'}
        </p>
        <Link href="/dashboard/offres" className="text-xs text-slate-700 underline">
          ← Retour aux offres & demandes
        </Link>
      </div>

      <OfferForm clients={clients} categories={categories} existing={existing} />
    </div>
  );
}
