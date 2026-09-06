import { db } from '@/db';
import { bookings, bookingSegments, pets } from '@/db/schema';
import { and, sql } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Tâches du jour (Phase G5) — tours matin/soir
// ---------------------------------------------------------------------------
// Génération DÉTERMINISTE (aucune IA) : pour une date, on liste chaque animal
// réellement présent (segment couvrant la date, départ réel pris en compte) avec
// son espace et les informations utiles au travail du jour : alimentation
// (diet_notes du séjour), soins/vigilance (medical_notes de la fiche animal),
// et notes internes importantes (comportement craintif/agressif, etc.).
// La validation « fait » sera persistée via `daily_reports` (pas dans ce lot).
// ---------------------------------------------------------------------------

export default async function TachesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  await requireRole('staff');

  const params = await searchParams;
  const dateStr = params.date ?? new Date().toISOString().slice(0, 10);

  // Récupère les segments actifs ce jour-là + pets + notes + booking.
  const rows = await db
    .select({
      petId: pets.id,
      petName: pets.name,
      species: pets.species,
      medicalNotes: pets.medicalNotes,
      unitId: bookingSegments.unitId,
      unitName: sql<string>`u.name`,
      categoryName: sql<string>`c.name`,
      bookingId: bookings.id,
      dietNotes: bookings.dietNotes,
      clientLabel: sql<string>`cl.first_name || ' ' || cl.last_name`,
      importantNotes: sql<string | null>`(
        SELECT string_agg(n.content, ' | ')
        FROM internal_notes n
        WHERE n.pet_id = pets.id AND n.is_important = true
      )`,
    })
    .from(bookingSegments)
    .innerJoin(bookings, sql`${bookingSegments.bookingId} = ${bookings.id}`)
    .innerJoin(pets, sql`EXISTS (
        SELECT 1 FROM segment_pets sp WHERE sp.segment_id = ${bookingSegments.id} AND sp.pet_id = pets.id
      )`)
    .innerJoin(sql`housing_units u`, sql`u.id = ${bookingSegments.unitId}`)
    .innerJoin(sql`housing_categories c`, sql`c.id = u.category_id`)
    .innerJoin(sql`clients cl`, sql`cl.id = ${bookings.clientId}`)
    .where(
      and(
        sql`${bookings.status} in ('confirmed', 'checked_in')`,
        sql`${bookingSegments.startDate} <= ${dateStr}::date`,
        sql`COALESCE(${bookings.actualCheckOut}::date, ${bookingSegments.endDate}) > ${dateStr}::date`,
        sql`${bookingSegments.unitId} is not null`
      )
    )
    .orderBy(sql`u.name`);

  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = row.unitId ?? 'sans espace';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tâches du jour</h1>
          <p className="text-slate-700">
            Tours matin/soir : alimentation, soins et vigilance par espace.
          </p>
        </div>
        <form method="get" className="flex items-center gap-2">
          <input
            type="date"
            name="date"
            defaultValue={dateStr}
            className="border rounded-lg p-2 text-sm bg-white"
          />
          <button type="submit" className="bg-slate-900 text-white text-sm rounded-lg px-3 py-2">
            Voir
          </button>
        </form>
      </div>

      {grouped.size === 0 ? (
        <p className="text-sm text-slate-700 italic bg-white border rounded-xl p-6">
          Aucun animal présent à cette date.
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[...grouped.entries()].map(([unitKey, unitRows]) => {
            const first = unitRows[0];
            return (
              <div key={unitKey} className="bg-white border rounded-xl p-4 space-y-3 shadow-sm">
                <div className="flex items-center justify-between border-b pb-2">
                  <p className="font-semibold text-sm">{first?.unitName}</p>
                  <span className="text-xs bg-slate-100 rounded-full px-2 py-0.5">
                    {first?.categoryName}
                  </span>
                </div>
                {unitRows.map((row) => (
                  <div key={row.petId} className="border rounded-lg p-3 space-y-1">
                    <p className="font-semibold text-sm">
                      {row.petName}{' '}
                      <span className="text-xs font-normal text-slate-700">({row.species})</span>
                    </p>
                    <p className="text-xs text-slate-700">Propriétaire : {row.clientLabel}</p>
                    {row.dietNotes && (
                      <p className="text-xs">
                        <span className="font-medium text-amber-700">🍽 Alimentation :</span>{' '}
                        {row.dietNotes}
                      </p>
                    )}
                    {row.medicalNotes && (
                      <p className="text-xs">
                        <span className="font-medium text-blue-700">💊 Soins/vigilance :</span>{' '}
                        {row.medicalNotes}
                      </p>
                    )}
                    {row.importantNotes && (
                      <p className="text-xs">
                        <span className="font-medium text-red-700">⚠ Note importante :</span>{' '}
                        {row.importantNotes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
