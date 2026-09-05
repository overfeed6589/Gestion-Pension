// src/app/dashboard/housing/page.tsx
import { db } from '@/db';

export default async function HousingManagementPage() {
  const categories = await db.query.housingCategories.findMany({
    with: {
      units: true,
    },
  });

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Parc de Logements & Box</h1>
        <p className="text-muted-foreground">
          Visualisez en temps réel l’occupation et la disponibilité de chaque box de la pension.
        </p>
      </div>

      <div className="space-y-6">
        {categories.length === 0 ? (
          <div className="bg-card border rounded-xl p-6 text-center text-muted-foreground italic">
            Aucune catégorie de logement configurée pour l’instant.
          </div>
        ) : (
          categories.map((category) => (
            <div key={category.id} className="bg-card border rounded-xl p-6 space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b pb-3">
                <div>
                  <h2 className="font-semibold text-lg">{category.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    Tarif de base : {(category.basePricePerNight / 100).toFixed(2)} € / jour
                  </p>
                </div>
                <span className="text-xs bg-muted px-3 py-1 rounded-full font-medium">
                  {category.units.length} unité{category.units.length > 1 ? 's' : ''} au total
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {category.units.map((unit) => {
                  const isFree = unit.isAvailable;

                  return (
                    <div
                      key={unit.id}
                      className={`border rounded-lg p-3 flex flex-col justify-between space-y-3 transition-all ${
                        isFree
                          ? 'bg-emerald-50/50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900'
                          : 'bg-rose-50/50 border-rose-200 dark:bg-rose-950/20 dark:border-rose-900'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-bold text-sm">{unit.name}</span>
                        <span
                          className={`inline-block w-2.5 h-2.5 rounded-full ${
                            isFree ? 'bg-emerald-500' : 'bg-rose-500'
                          }`}
                          title={isFree ? 'Disponible' : 'Occupé'}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] pt-2 border-t border-border/50">
                        {isFree ? (
                          <span className="text-emerald-700 dark:text-emerald-400 font-semibold">Libre</span>
                        ) : (
                          <span className="text-rose-700 dark:text-rose-400 font-semibold">Occupé</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}