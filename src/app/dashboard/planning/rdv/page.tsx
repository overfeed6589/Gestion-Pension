import Link from 'next/link';
import { db } from '@/db';
import { requireRole } from '@/lib/auth';
import { getWeekPlanning, addDaysIso } from '@/lib/planning/views';
import { todayIso } from '@/lib/dashboard/events';
import { isCalendarConfigured } from '@/lib/integrations/google-calendar';
import { submitAppointmentFormAction } from '@/app/dashboard/planning/actions';
import { AppointmentDeleteButton } from '@/components/planning/AppointmentDeleteButton';
import { FicheLink } from '@/components/fiches/FicheLink';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Planning » RDV (Phase H4) — vue semaine
// ---------------------------------------------------------------------------
// Arrivées / départs (réservations) + visites et autres rdv sur une semaine.
// Les rdv sont exportés one-way vers Google Calendar (si configuré).
// ---------------------------------------------------------------------------

function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay(); // 0 = dimanche
  const offset = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

function fmtDayHeader(dateStr: string): { weekday: string; day: string } {
  const d = new Date(`${dateStr}T12:00:00Z`);
  return {
    weekday: d.toLocaleDateString('fr-FR', { weekday: 'short' }),
    day: d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
  };
}

export default async function PlanningRdvPage({
  searchParams,
}: {
  searchParams: Promise<{ debut?: string }>;
}) {
  await requireRole('secretary', 'staff');

  const params = await searchParams;
  const today = todayIso();
  const weekStart = mondayOf(/^\d{4}-\d{2}-\d{2}$/.test(params.debut ?? '') ? params.debut! : today);
  const prevWeek = addDaysIso(weekStart, -7);
  const nextWeek = addDaysIso(weekStart, 7);

  const [days, clientsRows] = await Promise.all([
    getWeekPlanning(weekStart),
    db.query.clients.findMany({ orderBy: (c, { asc }) => [asc(c.lastName)] }),
  ]);
  const calendarConnected = isCalendarConfigured();

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Planning — rendez-vous</h1>
          <p className="text-slate-700 text-sm mt-1">
            Semaine du {new Date(`${weekStart}T12:00:00Z`).toLocaleDateString('fr-FR')} —{' '}
            {new Date(`${addDaysIso(weekStart, 6)}T12:00:00Z`).toLocaleDateString('fr-FR')}
            {calendarConnected ? ' • Export Google Calendar actif' : ' • Export Google Calendar : non configuré (inactif, non bloquant)'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/dashboard/planning/rdv?debut=${prevWeek}`} className="border rounded-lg px-3 py-1.5 text-sm bg-white hover:border-slate-400">
            ← Semaine
          </Link>
          <Link href="/dashboard/planning/rdv" className="border rounded-lg px-3 py-1.5 text-sm bg-white hover:border-slate-400">
            Aujourd’hui
          </Link>
          <Link href={`/dashboard/planning/rdv?debut=${nextWeek}`} className="border rounded-lg px-3 py-1.5 text-sm bg-white hover:border-slate-400">
            Semaine →
          </Link>
        </div>
      </div>

      {/* Grille de la semaine */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
        {days.map((day) => {
          const isToday = day.date === today;
          const header = fmtDayHeader(day.date);
          const weekend = [0, 6].includes(new Date(`${day.date}T12:00:00Z`).getUTCDay());
          return (
            <div
              key={day.date}
              className={`border rounded-xl p-2 min-h-48 ${isToday ? 'ring-2 ring-slate-800' : ''} ${weekend ? 'bg-slate-100' : 'bg-white'}`}
            >
              <p className={`text-xs font-semibold ${isToday ? 'text-slate-900' : 'text-slate-600'}`}>
                {header.weekday} {header.day}
              </p>
              <div className="mt-2 space-y-1.5 text-xs">
                {day.arrivals.map((a) => (
                  <div key={`arr-${a.bookingId}`} className="rounded-lg bg-blue-50 border border-blue-200 px-2 py-1">
                    <span className="font-medium text-blue-900">Arrivée {a.timeSlot ?? ''}</span>
                    <p className="text-blue-800">
                      {a.petNames.map((p, i) => (
                        <span key={p.id}>
                          {i > 0 && ', '}
                          <FicheLink kind="pet" id={p.id}>{p.name}</FicheLink>
                        </span>
                      ))}
                    </p>
                    <p className="text-blue-700">
                      <FicheLink kind="client" id={a.clientId}>{a.clientName}</FicheLink>
                    </p>
                  </div>
                ))}
                {day.departures.map((d) => (
                  <div key={`dep-${d.bookingId}`} className="rounded-lg bg-emerald-50 border border-emerald-200 px-2 py-1">
                    <span className="font-medium text-emerald-900">Départ {d.timeSlot ?? ''}</span>
                    <p className="text-emerald-800">
                      {d.petNames.map((p, i) => (
                        <span key={p.id}>
                          {i > 0 && ', '}
                          <FicheLink kind="pet" id={p.id}>{p.name}</FicheLink>
                        </span>
                      ))}
                    </p>
                    <p className="text-emerald-700">
                      <FicheLink kind="client" id={d.clientId}>{d.clientName}</FicheLink>
                    </p>
                  </div>
                ))}
                {day.appointments.map((a) => (
                  <div key={a.id} className="rounded-lg bg-purple-50 border border-purple-200 px-2 py-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-medium text-purple-900">
                        {a.type === 'visit' ? 'Visite' : 'RDV'}{' '}
                        {a.startsAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', hour12: false })}
                      </span>
                      <AppointmentDeleteButton id={a.id} />
                    </div>
                    <p className="text-purple-900 font-medium">{a.title}</p>
                    {a.clientName && a.clientId && (
                      <p className="text-purple-700">
                        <FicheLink kind="client" id={a.clientId}>{a.clientName}</FicheLink>
                      </p>
                    )}
                  </div>
                ))}
                {day.arrivals.length === 0 && day.departures.length === 0 && day.appointments.length === 0 && (
                  <p className="text-slate-400 italic">—</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Création de rdv (staff/owner) */}
      <section className="bg-white border rounded-xl p-4 space-y-3 max-w-2xl">
        <h2 className="font-semibold text-sm">Nouveau rendez-vous (visite / autre)</h2>
        <form action={submitAppointmentFormAction} className="grid grid-cols-2 gap-3 text-sm">
          <label className="col-span-2 space-y-1">
            <span className="text-xs text-slate-600">Titre</span>
            <input name="title" required placeholder="Visite Mme Dupont, livreur,…" className="border rounded-lg px-3 py-2 w-full text-sm" />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-slate-600">Type</span>
            <select name="type" className="border rounded-lg px-3 py-2 w-full text-sm">
              <option value="visit">Visite</option>
              <option value="other">Autre</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-slate-600">Durée (min)</span>
            <input name="durationMinutes" type="number" defaultValue={30} min={5} className="border rounded-lg px-3 py-2 w-full text-sm" />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-slate-600">Date</span>
            <input name="startsAtDate" type="date" required defaultValue={today} className="border rounded-lg px-3 py-2 w-full text-sm" />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-slate-600">Heure</span>
            <input name="startsAtTime" type="time" defaultValue="14:00" className="border rounded-lg px-3 py-2 w-full text-sm" />
          </label>
          <label className="col-span-2 space-y-1">
            <span className="text-xs text-slate-600">Client (optionnel)</span>
            <select name="clientId" className="border rounded-lg px-3 py-2 w-full text-sm">
              <option value="">— Aucun (prospect) —</option>
              {clientsRows.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.lastName} {c.firstName}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2 space-y-1">
            <span className="text-xs text-slate-600">Notes</span>
            <input name="notes" className="border rounded-lg px-3 py-2 w-full text-sm" />
          </label>
          <button type="submit" className="col-span-2 bg-slate-900 text-white text-sm rounded-lg py-2">
            Créer le rendez-vous
          </button>
        </form>
      </section>
    </div>
  );
}