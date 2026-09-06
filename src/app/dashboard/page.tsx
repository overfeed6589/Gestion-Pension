import { db } from '@/db';
import { bookings, payments } from '@/db/schema';
import { sql } from 'drizzle-orm';
import Link from 'next/link';
import { getCurrentProfile, canAccess, requireUser } from '@/lib/auth';
import { getOccupancyRateForDate } from '@/lib/scheduling/occupancy';
import { formatCents } from '@/lib/money';

export const dynamic = 'force-dynamic';

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function DashboardHomePage() {
  const user = await requireUser();
  const profile = await getCurrentProfile();
  const isOwner = profile ? canAccess(profile.role, ['owner']) : false;
  const today = toDateStr(new Date());

  const [occupancy, statusCounts, financials] = await Promise.all([
    getOccupancyRateForDate(today),
    db
      .select({
        offered: sql<number>`count(*) filter (where ${bookings.status} = 'offered')::int`,
        confirmed: sql<number>`count(*) filter (where ${bookings.status} = 'confirmed')::int`,
        checkedIn: sql<number>`count(*) filter (where ${bookings.status} = 'checked_in')::int`,
        arrivalsToday: sql<number>`count(*) filter (where ${bookings.status} = 'confirmed' and ${bookings.checkInDate}::date = ${today}::date)::int`,
        departuresToday: sql<number>`count(*) filter (where ${bookings.status} = 'checked_in' and ${bookings.checkOutDate}::date = ${today}::date)::int`,
      })
      .from(bookings)
      .where(sql`${bookings.status} in ('offered','confirmed','checked_in')`),
    db
      .select({
        forecast: sql<number>`coalesce(sum(${bookings.totalPrice}) filter (where ${bookings.status} in ('confirmed','checked_in')), 0)::int`,
        collected: sql<number>`coalesce(sum(${payments.amount}) filter (where ${payments.status} = 'succeeded'), 0)::int`,
      })
      .from(bookings)
      .leftJoin(payments, sql`${payments.bookingId} = ${bookings.id}`),
  ]);

  const card = (label: string, value: string | number, hint?: string) => (
    <div className="bg-white border rounded-xl p-5 shadow-sm">
      <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {hint && <p className="text-xs text-slate-600 mt-1">{hint}</p>}
    </div>
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Vue d’ensemble</h1>
        <p className="text-slate-500">
          Bienvenue{profile?.fullName ? `, ${profile.fullName}` : ''}. Activité du {new Date().toLocaleDateString('fr-FR')}.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {card('Occupation du parc', `${Math.round(occupancy.occupancyRate)} %`, `${occupancy.occupiedUnits}/${occupancy.totalUnits} box occupés`)}
        {card('Offres en attente d’acompte', statusCounts[0]?.offered ?? 0)}
        {card('Séjours confirmés', statusCounts[0]?.confirmed ?? 0)}
        {card('Animaux en pension', statusCounts[0]?.checkedIn ?? 0)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {card('Arrivées aujourd’hui', statusCounts[0]?.arrivalsToday ?? 0)}
        {card('Départs aujourd’hui', statusCounts[0]?.departuresToday ?? 0)}
        <div className="bg-white border rounded-xl p-5 flex items-center justify-between">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Se connecter pour les détails</p>
          <p className="text-xs text-slate-500">{user.email}</p>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="font-semibold">Actions rapides</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { href: '/dashboard/offres', label: 'Offres & demandes' },
            { href: '/dashboard/offres/nouvelle', label: 'Nouvelle offre' },
            { href: '/dashboard/clients', label: 'Clients' },
            { href: '/dashboard/register', label: 'Registre' },
            { href: '/dashboard/taches', label: 'Tâches du jour' },
            { href: '/dashboard/housing', label: 'Logements' },
          ].map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="bg-white border rounded-xl px-3 py-4 text-center text-sm font-medium text-slate-700 hover:border-slate-400 hover:shadow-sm transition"
            >
              {a.label}
            </Link>
          ))}
        </div>
      </div>

      {isOwner && (
        <div className="bg-white border rounded-xl p-5 space-y-3 shadow-sm">
          <h2 className="font-semibold">Finances (owner)</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500">CA prévisionnel (séjours confirmés/en cours)</p>
              <p className="text-xl font-bold text-emerald-700">{formatCents(financials[0]?.forecast ?? 0)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Encaissé (acomptes et règlements reçus)</p>
              <p className="text-xl font-bold text-emerald-700">{formatCents(financials[0]?.collected ?? 0)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
