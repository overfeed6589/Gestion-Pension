import { db } from '@/db';
import { requireRole } from '@/lib/auth';
import { FicheLink } from '@/components/fiches/FicheLink';
import { StatusBadge } from '@/components/fiches/fiche-parts';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Informations » Animaux (Phase H3) — liste des animaux enregistrés
// ---------------------------------------------------------------------------
// Nouvelle page (n'existait pas) : chaque nom ouvre la fiche animal en pop-up ;
// le propriétaire ouvre la fiche client.
// ---------------------------------------------------------------------------

export default async function InformationsAnimauxPage() {
  await requireRole('staff');

  const petsRows = await db.query.pets.findMany({
    with: {
      owner: true,
      segmentLinks: { with: { segment: { with: { booking: true } } } },
    },
    orderBy: (pets, { asc }) => [asc(pets.name)],
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Animaux</h1>
        <p className="text-slate-700 text-sm mt-1">
          {petsRows.length} animal(aux) enregistré(s). Cliquez sur un nom pour ouvrir la fiche.
        </p>
      </div>

      <div className="overflow-x-auto border rounded-xl bg-white">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-600 border-b bg-slate-50">
            <tr>
              <th className="px-3 py-2">Nom</th>
              <th className="px-3 py-2">Espèce / race</th>
              <th className="px-3 py-2">Propriétaire</th>
              <th className="px-3 py-2">Identification</th>
              <th className="px-3 py-2">Vaccins</th>
              <th className="px-3 py-2">Séjours</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {petsRows.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-4 text-slate-600">Aucun animal.</td></tr>
            )}
            {petsRows.map((pet) => (
              <tr key={pet.id}>
                <td className="px-3 py-2 font-medium">
                  <FicheLink kind="pet" id={pet.id}>{pet.name}</FicheLink>
                </td>
                <td className="px-3 py-2 text-xs text-slate-700">
                  {pet.species}
                  {pet.breed ? ` — ${pet.breed}` : ''}
                </td>
                <td className="px-3 py-2">
                  {pet.owner ? (
                    <FicheLink kind="client" id={pet.owner.id}>
                      {pet.owner.firstName} {pet.owner.lastName}
                    </FicheLink>
                  ) : '—'}
                </td>
                <td className="px-3 py-2 text-xs font-mono">{pet.identificationNumber ?? '—'}</td>
                <td className="px-3 py-2">
                  <StatusBadge tone={pet.vaccinesUpToDate ? 'ok' : 'bad'}>
                    {pet.vaccinesUpToDate ? 'À jour' : 'À faire'}
                  </StatusBadge>
                </td>
                <td className="px-3 py-2 text-xs text-slate-700">
                  {new Set(pet.segmentLinks.map((l) => l.segment?.bookingId).filter(Boolean)).size}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}