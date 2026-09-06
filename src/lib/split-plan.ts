// ---------------------------------------------------------------------------
// Suggestion de plan d'accueil — logique PURE (testable sans DB)
// ---------------------------------------------------------------------------
// Objectif : étant donnés un séjour [start, end) et un nombre d'animaux,
// construire une proposition par catégorie publique — soit sur TOUTE la durée,
// soit un DÉCOUPAGE MIXTE (ex: 11 j suite + 2 j box) quand aucune catégorie
// n'est libre en continu.
//
// Le nombre d'espaces nécessaires dans une catégorie = ⌈animaux / capacité⌉
// (plusieurs espaces parallèles si le groupe dépasse la capacité d'un box).
//
// Le plan généré est une suite de segments SÉQUENTIELS couvrant exactement le
// séjour, chaque segment portant une catégorie. La faisabilité « combien de
// nuits cette catégorie peut-elle héberger à partir de la date X » est fournie
// par l'appelant (le wrapper DB fait la vraie vérification des unités).
// ---------------------------------------------------------------------------

export function computeRequiredSpaces(petCount: number, capacity: number): number {
  if (petCount < 1) return 0;
  if (capacity < 1) return 0;
  return Math.ceil(petCount / capacity);
}

/** Répartit `petCount` animaux sur `spaces` espaces (le plus équilibré). */
export function partitionPetCount(petCount: number, spaces: number): number[] {
  if (petCount < 1 || spaces < 1) return [];
  const count = Math.min(spaces, petCount);
  const base = Math.floor(petCount / count);
  const remainder = petCount % count;
  const sizes = new Array<number>(count).fill(base);
  for (let i = 0; i < remainder; i += 1) sizes[i] += 1;
  return sizes;
}

import { computeSegmentPrice } from '@/lib/pricing';

/**
 * Prix par nuit TTC du GROUPE (tous animaux) logé dans une catégorie donnée :
 * `spaces` espaces parallèles au besoin (capacité dépassée), supplément par
 * animal au-delà du 1er par espace.
 */
export function computeGroupNightPrice(
  petCount: number,
  capacity: number,
  basePricePerNight: number,
  surchargePerAnimal: number
): number {
  const spaces = computeRequiredSpaces(petCount, capacity);
  const sizes = partitionPetCount(petCount, spaces);
  return sizes.reduce(
    (sum, size) =>
      sum +
      computeSegmentPrice({
        nights: 1,
        basePricePerNight,
        surchargePerAnimal,
        petCount: size,
      }),
    0
  );
}

const MS_DAY = 86_400_000;

function toUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Nombre de nuits entre deux dates (fin exclusive). */
export function nightsRange(start: Date, end: Date): number {
  return Math.max(0, Math.round((toUtc(end).getTime() - toUtc(start).getTime()) / MS_DAY));
}

export type SplitSegment = {
  categoryId: string;
  startDate: string; // 'YYYY-MM-DD'
  endDate: string; // 'YYYY-MM-DD' (fin exclusive)
};

/** Segment « prêt à insérer », structuré comme un OfferSegmentInput. */
export type GroupSegment = SplitSegment & { petIds: string[] };

/**
 * Étend une couverture (une catégorie complète OU un plan de split séquentiel)
 * en segments réels, en répartissant les animaux sur plusieurs espaces
 * PARALLÈLES quand le groupe dépasse la capacité d'un box (⌈chats/capacité⌉).
 * Chaque animal apparaît sur chaque nuit exactement une fois.
 */
export function buildSegmentsForGroup(params: {
  petIds: string[];
  portions: { categoryId: string; startDate: string; endDate: string; capacity: number }[];
}): GroupSegment[] {
  const out: GroupSegment[] = [];
  for (const portion of params.portions) {
    const spaces = computeRequiredSpaces(params.petIds.length, portion.capacity);
    const sizes = partitionPetCount(params.petIds.length, spaces);
    let pointer = 0;
    for (const size of sizes) {
      out.push({
        categoryId: portion.categoryId,
        startDate: portion.startDate,
        endDate: portion.endDate,
        petIds: params.petIds.slice(pointer, pointer + size),
      });
      pointer += size;
    }
  }
  return out;
}

export type SplitPlanResult =
  | { ok: true; segments: SplitSegment[] }
  | { ok: false; message: string };

/**
 * Construit une couverture du séjour en segments séquentiels par catégorie.
 * `prefixNights(categoryId, from)` doit renvoyer le nombre maximal de nuits
 * consécutives (≥ 0) que la catégorie peut héberger à partir de `from` (faisabilité
 * calculée côté DB sur les unités). Greedy : on avance avec la catégorie offrant
 * la plus longue couverture à chaque pas.
 */
export async function buildSplitPlan(params: {
  startDate: string;
  endDate: string;
  categoryIds: string[];
  prefixNights: (categoryId: string, from: Date) => number | Promise<number>;
}): Promise<SplitPlanResult> {
  const start = new Date(`${params.startDate}T00:00:00Z`);
  const end = new Date(`${params.endDate}T00:00:00Z`);
  if (end.getTime() <= start.getTime()) {
    return { ok: false, message: 'La date de sortie doit être postérieure à la date d’entrée.' };
  }
  if (params.categoryIds.length === 0) {
    return { ok: false, message: 'Aucune catégorie disponible.' };
  }

  const segments: SplitSegment[] = [];
  let cursor = start;
  let guard = 0;
  const maxSteps = 600;

  while (cursor.getTime() < end.getTime()) {
    if (guard++ > maxSteps) return { ok: false, message: 'Trop de découpages.' };

    const remainingNights = nightsRange(cursor, end);
    let bestCategory: string | null = null;
    let bestNights = 0;

    for (const categoryId of params.categoryIds) {
      const prefix = await params.prefixNights(categoryId, cursor);
      if (prefix > bestNights) {
        bestNights = prefix;
        bestCategory = categoryId;
        if (prefix >= remainingNights) break; // couvre tout le reste
      }
    }

    if (!bestCategory || bestNights < 1) {
      return { ok: false, message: 'Aucun espace disponible sur une partie du séjour.' };
    }

    const segEnd = addDays(cursor, Math.min(bestNights, remainingNights));
    segments.push({
      categoryId: bestCategory,
      startDate: dateKey(cursor),
      endDate: dateKey(segEnd),
    });
    cursor = segEnd;
  }

  return { ok: true, segments };
}
