import { db } from '@/db';
import { bookings, payments, housingUnits } from '@/db/schema';
import { sql } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { getOccupancyRateForDate } from '@/lib/scheduling/occupancy';
import { formatCents } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function RapportsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; periode?: string }>;
}) {
  await requireRole('owner');

  const params = await searchParams;
  const rawDate = params.date || new Date().toISOString().slice(0, 10);
  const isDay = (params.periode ?? 'jour') === 'jour';

  const start = new Date(`${rawDate}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 6);
  const startStr = start.toISOString().slice(0, 10);

  const [occupancy, dayCounts, agg, ahead, units] = await Promise.all([
    getOccupancyRateForDate(rawDate),
    db
      .select({
        arrivals: sql<number>`count(*) filter (where ${bookings.status} in ('offered','confirmed') and ${bookings.checkInDate}::date = ${rawDate}::date)::int`,
        departures: sql<number>`count(*) filter (where ${bookings.status} in ('confirmed','checked_in') and ${bookings.checkOutDate}::date = ${rawDate}::date)::int`,
        created: sql<number>`count(*) filter (where ${bookings.createdAt}::date = ${rawDate}::date)::int`,
      })
      .from(bookings),
    db
      .select({
        created: sql<number>`count(*)::int`,
        collected: sql<number>`coalesce(sum(${payments.amount}) filter (where ${payments.status} = 'succeeded'), 0)::int`,
      })
      .from(bookings)
      .leftJoin(payments, sql`${payments.bookingId} = ${bookings.id}`)
      .where(sql`${bookings.createdAt}::date between ${startStr}::date and ${rawDate}::date`),
    db
      .select({
        forecast: sql<number>`coalesce(sum(${bookings.totalPrice}) filter (where ${bookings.status} in ('offered','confirmed')), 0)::int`,
        pendingDeposits: sql<number>`count(*) filter (where ${bookings.status} = 'offered')::int`,
      })
      .from(bookings),
    db.select({ n: sql<number>`count(*)::int` }).from(housingUnits),
  ]);

  const day = dayCounts[0] ?? { arrivals: 0, departures: 0, created: 0 };
  const window = agg[0] ?? { created: 0, collected: 0 };
  const upcoming = ahead[0] ?? { forecast: 0, pendingDeposits: 0 };
  const unitTotal = units[0]?.n ?? 0;

  const label = isDay ? `Journée du ${rawDate}` : `Semaine : ${startStr} → ${rawDate}`;

  const card = (heading: string, value: string | number) => (
    <div className="bg-white border rounded-xl p-5">
      <p className="text-xs text-slate-500 uppercase tracking-wide">{heading}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Rapports</h1>
        <p className="text-slate-700">Synthèse quotidienne et hebdomadaire (owner).</p>
      </div>

      <form method="get" className="flex items-end gap-3 bg-white border rounded-xl p-4">
        <div>
          <label className="block text-xs font-medium">Date de référence</label>
          <input type="date" name="date" defaultValue={rawDate} className="border rounded p-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium">Période</label>
          <select name="periode" defaultValue={isDay ? 'jour' : 'semaine'} className="border rounded p-2 text-sm">
            <option value="jour">Journée</option>
            <option value="semaine">Semaine (7 j)</option>
          </select>
        </div>
        <button type="submit" className="bg-slate-900 text-white text-sm rounded px-4 py-2">Afficher</button>
      </form>

      <div className="space-y-4">
        <h2 className="font-semibold text-lg">{label}</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {card('Occupation du parc', `${Math.round(occupancy.occupancyRate)} %`)}
          {card('Arrivées', day.arrivals)}
          {card('Départs', day.departures)}
          {card('Réservations créées', isDay ? day.created : window.created)}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {card('CA prévisionnel', formatCents(upcoming.forecast))}
          {card('Encaissé', formatCents(window.collected))}
          {card('Acomptes en attente', upcoming.pendingDeposits)}
          {card('Unités au total', unitTotal)}
        </div>
        <p className="text-xs text-slate-600">
          {occupancy.occupiedUnits} box occupés le {rawDate} sur {occupancy.totalUnits}.
        </p>
      </div>
    </div>
  );
}
