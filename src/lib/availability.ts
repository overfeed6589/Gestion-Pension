import { db } from '@/db';
import { eq } from 'drizzle-orm';
import { isUnitAvailableForPeriod } from '@/lib/scheduling/checker';
import {
  buildSplitPlan,
  computeRequiredSpaces,
  addDays,
  type SplitPlanResult,
} from '@/lib/split-plan';

// ---------------------------------------------------------------------------
// Disponibilité publique (G9)
// ---------------------------------------------------------------------------
// Options présentées au client pour un séjour [start, end) et un nombre
// d'animaux : chaque catégorie publique exposée, avec la faisabilité sur toute
// la durée ET (si aucune ne couvre tout) une suggestion de découpage mixte.
// Un groupe qui dépasse la capacité d'un box exige plusieurs espaces parallèles
// (⌈animaux / capacité⌉) : la « faisabilité » d'une catégorie suppose que ce
// nombre d'espaces est libre en continu.
// ---------------------------------------------------------------------------

export type PublicCategoryOption = {
  categoryId: string;
  name: string;
  publicName: string | null;
  publicDescription: string | null;
  capacity: number;
  requiredSpaces: number;
  /** La catégorie peut héberger le groupe sur TOUTE la durée demandée. */
  freeFullRange: boolean;
};

export type PublicAvailabilityResult = {
  options: PublicCategoryOption[];
  /** Suggestion de découpage (null si aucune option n'existe du tout). */
  split: SplitPlanResult | null;
};

async function fetchPublicCategories() {
  const cats = await db.query.housingCategories.findMany({
    where: { RAW: (t) => eq(t.isPublic, true) },
    with: { units: true },
  });
  return cats.map((c) => ({ ...c, units: c.units.filter((u) => u.isAvailable) }));
}

/** Nombre d'espaces (unités) libres de la catégorie sur [start, end). */
async function countFreeUnitsInCategory(
  units: { id: string }[],
  start: Date,
  end: Date
): Promise<number> {
  let free = 0;
  for (const unit of units) {
    const res = await isUnitAvailableForPeriod(unit.id, start, end);
    if (res.available) free += 1;
  }
  return free;
}

export async function getPublicAvailability(input: {
  startDate: string;
  endDate: string;
  petCount: number;
}): Promise<PublicAvailabilityResult> {
  const categories = await fetchPublicCategories();
  const start = new Date(`${input.startDate}T00:00:00Z`);
  const end = new Date(`${input.endDate}T00:00:00Z`);

  const options: PublicCategoryOption[] = [];
  const requiredByCategory = new Map<string, number>();
  const unitsByCategory = new Map<string, { id: string }[]>();

  for (const cat of categories) {
    if (cat.units.length === 0) continue;
    const requiredSpaces = computeRequiredSpaces(input.petCount, cat.capacity);
    if (requiredSpaces < 1 || requiredSpaces > cat.units.length) continue;

    const free = await countFreeUnitsInCategory(cat.units, start, end);
    requiredByCategory.set(cat.id, requiredSpaces);
    unitsByCategory.set(cat.id, cat.units);

    options.push({
      categoryId: cat.id,
      name: cat.name,
      publicName: cat.publicName,
      publicDescription: cat.publicDescription,
      capacity: cat.capacity,
      requiredSpaces,
      freeFullRange: free >= requiredSpaces,
    });
  }

  const anyFullRange = options.some((o) => o.freeFullRange);
  let split: SplitPlanResult | null = null;

  if (!anyFullRange && options.length > 0) {
    // Recherche dichotomique du plus long créneau disponible par catégorie.
    const prefixNights = async (categoryId: string, from: Date): Promise<number> => {
      const required = requiredByCategory.get(categoryId) ?? 0;
      const units = unitsByCategory.get(categoryId) ?? [];
      if (required < 1 || units.length === 0) return 0;
      const remaining = Math.max(
        0,
        Math.round((end.getTime() - from.getTime()) / 86_400_000)
      );
      if (remaining < 1) return 0;

      const ok = async (k: number): Promise<boolean> =>
        (await countFreeUnitsInCategory(units, from, addDays(from, k))) >= required;

      if (!(await ok(1))) return 0;
      let lo = 1;
      let hi = remaining;
      let best = 1;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (await ok(mid)) {
          best = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      return best;
    };

    split = await buildSplitPlan({
      startDate: input.startDate,
      endDate: input.endDate,
      categoryIds: options.map((o) => o.categoryId),
      prefixNights,
    });
  }

  return { options, split };
}
