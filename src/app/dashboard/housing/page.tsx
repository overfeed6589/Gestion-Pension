import { db } from '@/db';
import { requireRole } from '@/lib/auth';
import { getUnitOccupancyForDate } from '@/lib/scheduling/occupancy';
import { CategoryForm } from '@/components/housing/CategoryForm';
import { UnitForm } from '@/components/housing/UnitForm';
import { UnitAvailabilityButton } from '@/components/housing/UnitAvailabilityButton';
import { formatCents } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function HousingManagementPage() {
  await requireRole('secretary');

  const today = new Date().toISOString().slice(0, 10);
  const [categories, occupancy] = await Promise.all([
    db.query.housingCategories.findMany({ with: { units: true } }),
    getUnitOccupancyForDate(today),
  ]);
  const occupiedIds = new Set(occupancy.filter((u) => u.occupied).map((u) => u.unitId));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Parc de logements & box</h1>
        <p className="text-slate-700">
          Définissez vos espaces (catégorie, capacité, tarifs), puis ajoutez les box physiques.
          L’occupation affichée est dérivée des réservations du jour.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1">
          <CategoryForm />
        </div>

        <div className="lg:col-span-3 space-y-6">
          {categories.length === 0 ? (
            <p className="text-sm text-slate-700 italic bg-white border rounded-xl p-6">
              Aucun espace configuré pour l’instant.
            </p>
          ) : (
            categories.map((category) => (
              <div key={category.id} className="bg-white border rounded-xl p-5 space-y-3 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
                  <div>
                    <h2 className="font-semibold text-lg">
                      {category.name}{' '}
                      {category.isPublic && (
                        <span className="text-[10px] uppercase tracking-wide bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full align-middle">
                          Public
                        </span>
                      )}
                    </h2>
                    <p className="text-xs text-slate-700">
                      Capacité {category.capacity} • {formatCents(category.basePricePerNight)}/nuit
                      {category.surchargePerAnimal > 0
                        ? ` • +${formatCents(category.surchargePerAnimal)}/animal supplémentaire`
                        : ''}
                    </p>
                  </div>
                  <UnitForm categoryId={category.id} />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                  {category.units.length === 0 && (
                    <p className="text-xs text-slate-700 italic col-span-full">
                      Aucun box : ajoutez-en pour pouvoir attribuer les séjours.
                    </p>
                  )}
                  {category.units.map((unit) => {
                    const horsService = !unit.isAvailable;
                    const occupied = !horsService && occupiedIds.has(unit.id);
                    const badge = horsService ? 'bg-red-50 text-red-700 border-red-200' : occupied ? 'bg-slate-100 text-slate-800' : 'bg-emerald-50 text-emerald-700 border-emerald-200';
                    const label = horsService ? 'Hors service' : occupied ? 'Occupé aujourd’hui' : 'Libre';
                    return (
                      <div
                        key={unit.id}
                        className={`border rounded-lg p-3 flex flex-col justify-between space-y-2 ${badge}`}
                      >
                        <div className="flex justify-between items-start">
                          <span className="font-bold text-sm">{unit.name}</span>
                          <span className="text-[11px] font-semibold">{label}</span>
                        </div>
                        <UnitAvailabilityButton unitId={unit.id} />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
