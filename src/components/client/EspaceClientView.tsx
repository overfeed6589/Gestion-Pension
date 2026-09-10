import Link from 'next/link';
import { db } from '@/db';
import { payments } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { getPensionSettings } from '@/lib/settings';
import { EspacePanel, type EspacePanelData } from '@/components/client/EspacePanel';

// Vue de l'espace client (serveur) — partagée par l'accès direct via jeton
// (/espace/<token>) et par la session resume (/espace?resume=…).

const STATUS_TEXT: Record<string, string> = {
  proposed: 'En attente de validation',
  offered: 'Validée — paiement en attente',
  confirmed: 'Confirmée',
  checked_in: 'En garde',
  checked_out: 'Terminée',
  cancelled: 'Annulée',
  expired: 'Expirée',
  requested: 'Demande reçue',
};

export async function EspaceClientView({ clientId }: { clientId: string }) {
  const client = await db.query.clients.findFirst({
    where: { RAW: (t) => eq(t.id, clientId) },
  });
  if (!client) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="bg-white border rounded-xl p-8 max-w-md text-center space-y-3">
          <p className="font-semibold text-lg">Lien invalide</p>
          <Link href="/" className="text-sm underline text-slate-700">← Retour à l’accueil</Link>
        </div>
      </div>
    );
  }

  const [pets, clientBookings, settings] = await Promise.all([
    db.query.pets.findMany({
      where: { RAW: (t) => eq(t.clientId, clientId) },
      orderBy: (pets, { asc }) => [asc(pets.name)],
    }),
    db.query.bookings.findMany({
      where: { RAW: (t) => eq(t.clientId, clientId) },
      orderBy: (bookings, { desc }) => [desc(bookings.createdAt)],
    }),
    getPensionSettings(),
  ]);

  const paymentsRows = clientBookings.length
    ? await db
        .select({ bookingId: payments.bookingId, amount: payments.amount, status: payments.status })
        .from(payments)
        .where(inArray(payments.bookingId, clientBookings.map((b) => b.id)))
    : [];
  const paidByBooking = new Map<string, number>();
  for (const p of paymentsRows) {
    if (p.status === 'succeeded') {
      paidByBooking.set(p.bookingId, (paidByBooking.get(p.bookingId) ?? 0) + p.amount);
    }
  }

  const data: EspacePanelData = {
    token: '',
    firstName: client.firstName,
    arrivalSlots: settings.arrivalSlots,
    departureSlots: settings.departureSlots,
    pets: pets.map((p) => ({
      id: p.id,
      name: p.name,
      species: p.species,
      sex: p.sex,
      isSterilized: p.isSterilized,
      birthDate: p.birthDate ?? null,
      identificationNumber: p.identificationNumber ?? null,
      breed: p.breed ?? null,
      veterinarianName: p.veterinarianName ?? null,
      veterinarianPhone: p.veterinarianPhone ?? null,
      vaccinesUpToDate: p.vaccinesUpToDate,
      medicalNotes: p.medicalNotes ?? null,
    })),
    bookings: clientBookings.map((b) => {
      const paid = paidByBooking.get(b.id) ?? 0;
      const outstanding = Math.max(0, b.totalPrice - paid);
      return {
        id: b.id,
        status: b.status,
        statusLabel: STATUS_TEXT[b.status] ?? b.status,
        checkInDate: b.checkInDate.toISOString().slice(0, 10),
        checkOutDate: b.checkOutDate.toISOString().slice(0, 10),
        totalPrice: b.totalPrice,
        depositAmount: b.depositAmount,
        paid,
        outstanding,
        arrivalTimeSlot: b.arrivalTimeSlot ?? null,
        departureTimeSlot: b.departureTimeSlot ?? null,
      };
    }),
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <p className="font-semibold">{settings.pensionName} — Espace client</p>
          <Link href="/" className="text-xs text-slate-500 hover:text-slate-800">← Accueil</Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-8">
        <EspacePanel data={data} />
      </main>
    </div>
  );
}
