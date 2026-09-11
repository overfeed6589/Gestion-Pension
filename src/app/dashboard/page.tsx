import { db } from '@/db';
import { bookings, pets } from '@/db/schema';
import { sql } from 'drizzle-orm';
import { getCurrentProfile, requireUser, canAccess } from '@/lib/auth';
import { getOccupancyRateForDate } from '@/lib/scheduling/occupancy';
import { getDashboardDay, addDaysIso, todayIso, type DashboardDay } from '@/lib/dashboard/events';
import { formatCents } from '@/lib/money';
import { FicheLink } from '@/components/fiches/FicheLink';
import { TaskDoneCheckbox } from '@/components/taches/TaskDoneCheckbox';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Tableau de bord « événements du jour » (Phase H2)
// ---------------------------------------------------------------------------
// Uniquement les événements du jour ; le lendemain est résumé en colonne de
// gauche. Chaque information est cliquable et ouvre la fiche source en
// pop-up (client / animal / réservation), sans navigation.
// Remplace la page « Vue d'ensemble » et la page « Tâches du jour » (G5).
// ---------------------------------------------------------------------------

function formatDay(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border rounded-xl shadow-sm">
      <header className="flex items-center justify-between border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs rounded-full bg-slate-100 px-2 py-0.5">{count}</span>
      </header>
      <div className="divide-y">{children}</div>
    </section>
  );
}

function EmptyRow({ message }: { message: string }) {
  return <p className="px-4 py-3 text-sm italic text-slate-600">{message}</p>;
}

function StayEventRows({ day }: { day: DashboardDay }) {
  return (
    <>
      {day.arrivals.map((a) => (
        <div key={a.bookingId} className="px-4 py-2.5 text-sm flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="w-20 text-xs text-slate-600">{a.timeSlot ?? 'Créneau à fixer'}</span>
          <span className="font-medium">
            {a.pets.length > 0
              ? a.pets.map((p, i) => (
                  <span key={p.id}>
                    {i > 0 && ', '}
                    <FicheLink kind="pet" id={p.id}>{p.name}</FicheLink>
                  </span>
                ))
              : '—'}
          </span>
          <span className="text-slate-600">
            <FicheLink kind="client" id={a.clientId}>{a.clientName}</FicheLink>
            {a.unitNames ? ` • ${a.unitNames}` : ''}
          </span>
          {a.paymentStatus === 'unpaid' && (
            <span className="text-xs rounded-full bg-red-50 text-red-800 border border-red-200 px-2 py-0.5">
              Aucun acompte
            </span>
          )}
          <FicheLink kind="booking" id={a.bookingId} className="ml-auto text-xs underline underline-offset-2 decoration-slate-300 hover:decoration-slate-800">
            Fiche réservation
          </FicheLink>
        </div>
      ))}
      {day.arrivals.length === 0 && <EmptyRow message="Aucune arrivée." />}
    </>
  );
}

export default async function DashboardHomePage() {
  await requireUser();
  const profile = await getCurrentProfile();
  const isStaff = profile ? canAccess(profile.role, ['staff']) : false;
  const today = todayIso();
  const tomorrow = addDaysIso(today, 1);

  const [day, tomorrowDay, occupancy, inPension] = await Promise.all([
    getDashboardDay(today),
    getDashboardDay(tomorrow),
    getOccupancyRateForDate(today),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(pets)
      .innerJoin(sql`segment_pets sp`, sql`sp.pet_id = ${pets.id}`)
      .innerJoin(sql`booking_segments bs`, sql`bs.id = sp.segment_id`)
      .innerJoin(bookings, sql`${bookings.id} = bs.booking_id`)
      .where(
        sql`${bookings.status} in ('confirmed','checked_in')
          and bs.start_date <= ${today}::date
          and coalesce(${bookings.actualCheckOut}::date, bs.end_date) > ${today}::date`
      ),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight capitalize">Événements du jour</h1>
        <p className="text-slate-700 text-sm mt-1">
          {formatDay(today)} • {inPension[0]?.count ?? 0} animal(aux) en pension • occupation{' '}
          {Math.round(occupancy.occupancyRate)} %
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6 items-start">
        {/* Colonne gauche : résumé de demain */}
        <div className="space-y-3 order-2 lg:order-1">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Demain ({formatDay(tomorrow)})
          </h2>
          <div className="bg-white border rounded-xl p-3 text-sm space-y-2 shadow-sm">
            <div>
              <p className="text-xs text-slate-600 font-medium">Arrivées ({tomorrowDay.arrivals.length})</p>
              {tomorrowDay.arrivals.length === 0 ? (
                <p className="text-xs italic text-slate-500">—</p>
              ) : (
                tomorrowDay.arrivals.map((a) => (
                  <p key={a.bookingId} className="text-xs">
                    <FicheLink kind="booking" id={a.bookingId}>{a.clientName}</FicheLink>
                    <span className="text-slate-600"> • {a.pets.map((p) => p.name).join(', ')}</span>
                  </p>
                ))
              )}
            </div>
            <div className="border-t pt-2">
              <p className="text-xs text-slate-600 font-medium">Départs ({tomorrowDay.departures.length})</p>
              {tomorrowDay.departures.length === 0 ? (
                <p className="text-xs italic text-slate-500">—</p>
              ) : (
                tomorrowDay.departures.map((d) => (
                  <p key={d.bookingId} className="text-xs">
                    <FicheLink kind="booking" id={d.bookingId}>{d.clientName}</FicheLink>
                    <span className="text-slate-600"> • {d.pets.map((p) => p.name).join(', ')}</span>
                  </p>
                ))
              )}
            </div>
            <div className="border-t pt-2">
              <p className="text-xs text-slate-600 font-medium">
                Tâches à faire ({tomorrowDay.tasks.filter((t) => !t.done).length})
              </p>
              {tomorrowDay.tasks.filter((t) => !t.done).length === 0 ? (
                <p className="text-xs italic text-slate-500">—</p>
              ) : (
                tomorrowDay.tasks.map((t) => (
                  <p key={t.petId} className="text-xs">
                    <FicheLink kind="pet" id={t.petId}>{t.petName}</FicheLink>
                    <span className="text-slate-600"> • {t.unitName}</span>
                  </p>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Colonne principale : événements du jour */}
        <div className="space-y-4 order-1 lg:order-2">
          <Section title="Arrivées du jour" count={day.arrivals.length}>
            <StayEventRows day={day} />
          </Section>

          <Section title="Départs du jour" count={day.departures.length}>
            <>
              {day.departures.map((d) => (
                <div key={d.bookingId} className="px-4 py-2.5 text-sm flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="w-20 text-xs text-slate-600">{d.timeSlot ?? 'Créneau à fixer'}</span>
                  <span className="font-medium">
                    {d.pets.length === 0
                      ? '—'
                      : d.pets.map((p, i) => (
                          <span key={p.id}>
                            {i > 0 && ', '}
                            <FicheLink kind="pet" id={p.id}>{p.name}</FicheLink>
                          </span>
                        ))}
                  </span>
                  <span className="text-slate-600">
                    <FicheLink kind="client" id={d.clientId}>{d.clientName}</FicheLink>
                  </span>
                  {(d.totalPrice - d.paidAmount) > 0 && (
                    <span className="text-xs rounded-full bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5">
                      Solde dû : {formatCents(d.totalPrice - d.paidAmount)}
                    </span>
                  )}
                  <FicheLink kind="booking" id={d.bookingId} className="ml-auto text-xs underline underline-offset-2 decoration-slate-300 hover:decoration-slate-800">
                    Fiche réservation
                  </FicheLink>
                </div>
              ))}
              {day.departures.length === 0 && <EmptyRow message="Aucun départ." />}
            </>
          </Section>

          <Section title="Paiements attendus" count={day.paymentsDue.length}>
            <>
              {day.paymentsDue.map((p) => (
                <div key={p.bookingId} className="px-4 py-2.5 text-sm flex items-center gap-3">
                  <span>
                    <FicheLink kind="booking" id={p.bookingId}>{p.clientName}</FicheLink>
                  </span>
                  <span className="ml-auto font-medium">{formatCents(p.remainingCents)}</span>
                </div>
              ))}
              {day.paymentsDue.length === 0 && <EmptyRow message="Rien à encaisser." />}
            </>
          </Section>

          <Section title="Relances de créneaux" count={day.reminders.length}>
            <>
              {day.reminders.map((r) => (
                <div key={r.bookingId} className="px-4 py-2.5 text-sm flex items-center gap-3">
                  <span className="text-xs rounded-full bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5">
                    J-{r.daysLeft}
                  </span>
                  <span>
                    <FicheLink kind="booking" id={r.bookingId}>{r.clientName}</FicheLink>
                  </span>
                  <span className="ml-auto text-xs text-slate-600">créneau d’arrivée non renseigné</span>
                </div>
              ))}
              {day.reminders.length === 0 && <EmptyRow message="Aucune relance à faire." />}
            </>
          </Section>

          {isStaff && (
            <Section
              title="Tâches staff (repas & soins)"
              count={day.tasks.filter((t) => !t.done).length}
            >
              <>
                {day.tasks.map((t) => (
                  <div key={t.petId} className="px-4 py-2.5 text-sm space-y-1">
                    <div className="flex items-center gap-3">
                      <FicheLink kind="pet" id={t.petId} className="font-medium">{t.petName}</FicheLink>
                      <span className="text-xs text-slate-600">
                        {t.unitName} • <FicheLink kind="client" id={t.clientId}>{t.clientName}</FicheLink>
                      </span>
                      <span className="ml-auto">
                        <TaskDoneCheckbox petId={t.petId} segmentId={t.segmentId} date={day.date} done={t.done} />
                      </span>
                    </div>
                    {t.dietNotes && (
                      <p className="text-xs">
                        <span className="font-medium text-amber-700">🍽 Alimentation :</span> {t.dietNotes}
                      </p>
                    )}
                    {t.medicalNotes && (
                      <p className="text-xs">
                        <span className="font-medium text-blue-700">💊 Soins/vigilance :</span> {t.medicalNotes}
                      </p>
                    )}
                    {t.importantNotes && (
                      <p className="text-xs">
                        <span className="font-medium text-red-700">⚠ Note importante :</span> {t.importantNotes}
                      </p>
                    )}
                  </div>
                ))}
                {day.tasks.length === 0 && <EmptyRow message="Aucun animal présent." />}
              </>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}