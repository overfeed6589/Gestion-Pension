import { requireRole } from '@/lib/auth';
import { getBoxOccupancy, addDaysIso, type BoxOccupancyStay } from '@/lib/planning/views';
import { todayIso } from '@/lib/dashboard/events';
import { FicheLink } from '@/components/fiches/FicheLink';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Planning » Animaux présents par box (Phase H4) — vue ~2 mois
// ---------------------------------------------------------------------------
// Une ligne par box, une colonne par jour (aujourd'hui → +61 jours). Chaque
// animal présent ce jour-là apparaît dans la case (clic → fiche animal).
// Dérivé des segments (départ réel pris en compte), hors service marqué.
// ---------------------------------------------------------------------------

const NB_DAYS = 62;

export default async function PlanningAnimauxPage() {
  await requireRole('secretary', 'staff');

  const today = todayIso();
  const rangeEnd = addDaysIso(today, NB_DAYS - 1);
  const [occupancy] = await Promise.all([getBoxOccupancy(today, rangeEnd)]);
  const days = [...Array(NB_DAYS).keys()].map((i) => addDaysIso(today, i));

  // Présence [arrivée, départ] inclusif : le jour du départ, l'animal est
  // encore là (le départ a lieu dans la journée).
  const stayCoversDay = (stay: BoxOccupancyStay, day: string): boolean =>
    stay.startDate <= day && stay.endDate >= day;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Planning — animaux présents par box</h1>
        <p className="text-slate-700 text-sm mt-1">
          {new Date(`${today}T12:00:00Z`).toLocaleDateString('fr-FR')} →{' '}
          {new Date(`${rangeEnd}T12:00:00Z`).toLocaleDateString('fr-FR')} •{' '}
          {occupancy.totalUnits} box. Un nom ouvre la fiche animal.
        </p>
      </div>

      <div className="overflow-x-auto border rounded-xl bg-white">
        <table className="text-xs border-collapse">
          <thead>
            <tr className="text-[10px] text-slate-600">
              <th className="sticky left-0 z-10 bg-slate-50 border-b border-r px-2 py-1 text-left min-w-36">
                Box
              </th>
              {days.map((d) => {
                const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
                const isToday = d === today;
                return (
                  <th
                    key={d}
                    className={`border-b border-l px-1 py-1 text-center font-normal whitespace-nowrap ${
                      isToday ? 'bg-slate-800 text-white' : dow === 0 || dow === 6 ? 'bg-slate-100' : ''
                    }`}
                  >
                    {d.slice(8, 10)}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {occupancy.rows.map((row) => (
              <tr key={row.unitId}>
                <th className="sticky left-0 z-10 bg-white border-r border-b px-2 py-1 text-left align-top">
                  <p className="text-xs font-semibold whitespace-nowrap">{row.unitName}</p>
                  <p className="text-[10px] text-slate-500 font-normal whitespace-nowrap">
                    {row.categoryName}
                    {!row.isAvailable && ' • HS'}
                  </p>
                </th>
                {days.map((day) => {
                  const present = row.stays.filter((s) => stayCoversDay(s, day));
                  const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
                  const arrivalDay = row.stays.some((s) => s.startDate === day);
                  return (
                    <td
                      key={day}
                      className={`border-l border-b px-0.5 py-0.5 align-top text-[11px] ${
                        dow === 0 || dow === 6 ? 'bg-slate-50' : ''
                      } ${arrivalDay ? 'border-l-2 border-l-blue-400' : ''}`}
                    >
                      {present.map((s) => (
                        <div key={s.petId} className="whitespace-nowrap leading-tight">
                          <FicheLink kind="pet" id={s.petId} className="text-slate-800">
                            {s.petName}
                          </FicheLink>
                        </div>
                      ))}
                    </td>
                  );
                })}
              </tr>
            ))}
            {occupancy.rows.length === 0 && (
              <tr>
                <td colSpan={NB_DAYS + 1} className="px-3 py-4 text-slate-600 text-sm">
                  Aucun box configuré.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-600">
        Bordure bleue à gauche = jour d’arrivée. Les départs sont pris en compte dans la case du
        dernier jour (le jour du départ, l’animal est encore là).
      </p>
    </div>
  );
}