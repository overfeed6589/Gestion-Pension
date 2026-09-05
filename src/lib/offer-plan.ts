import { computeSegmentPrice } from '@/lib/pricing';

// ---------------------------------------------------------------------------
// Plan d'offre — logique PURE (validation + tarification), sans accès base.
// ---------------------------------------------------------------------------
// Les règles de réservation itération 1 :
//  - un espace accueille 1..N animaux d'une même famille (capacity par catégorie) ;
//  - tarif PAR ESPACE + supplément/animal au-delà du 1er (par catégorie) ;
//  - un groupe trop grand est réparti sur des segments PARALLÈLES ;
//  - un séjour peut être SÉQUENTIEL (scindé dans le temps, ex: 11 j + 2 j).
// Chaque animal doit être présent sur CHAQUE nuit, dans exactement un espace.
// ---------------------------------------------------------------------------

/** Normalise une date en 'YYYY-MM-DD' (helper local, sans dépendance DB). */
function toDateString(value: string): string {
  return value.slice(0, 10);
}

export type OfferSegmentInput = {
  startDate: string; // 'YYYY-MM-DD'
  endDate: string; // 'YYYY-MM-DD' (fin exclusive)
  categoryId: string;
  petIds: string[]; // animaux occupant CE segment
};

/** Catégorie d'espace (données minimales nécessaires au calcul). */
export type OfferPlanCategory = {
  id: string;
  name: string;
  capacity: number;
  basePricePerNight: number;
  surchargePerAnimal: number;
};

export type PricedOfferSegment = OfferSegmentInput & { nights: number; price: number };

export type OfferPlan =
  | { ok: true; segments: PricedOfferSegment[]; totalPrice: number }
  | { ok: false; message: string };

/** Liste des nuits (dates 'YYYY-MM-DD') couvertes par [start, end). */
function nightsBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const limit = new Date(`${end}T00:00:00Z`);
  while (cursor < limit) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/** Vérifie que chaque animal couvre EXACTEMENT chaque nuit du séjour. */
function validateCoverage(
  allPetIds: string[],
  segments: OfferSegmentInput[],
  stayNights: string[]
): string | null {
  const staySet = new Set(stayNights);
  for (const petId of allPetIds) {
    const coveredNights: string[] = [];
    for (const seg of segments) {
      if (!seg.petIds.includes(petId)) continue;
      coveredNights.push(...nightsBetween(seg.startDate, seg.endDate));
    }
    // Pas de doublon (un animal ne peut pas être dans 2 espaces la même nuit).
    const seen = new Set<string>();
    for (const night of coveredNights) {
      if (seen.has(night)) return 'Un animal apparaît dans plusieurs espaces la même nuit.';
      seen.add(night);
    }
    // Couverture complète du séjour.
    if (seen.size !== staySet.size) return 'Un animal ne couvre pas la totalité du séjour.';
    for (const night of staySet) {
      if (!seen.has(night)) return 'Un animal ne couvre pas la totalité du séjour.';
    }
  }
  return null;
}

/**
 * Valide un découpage de séjour (plages contiguës/parallèles, capacité par
 * segment, chaque animal présent sur chaque nuit exactement une fois) et calcule
 * le prix total (par espace + supplément/animal). Aucun accès base de données.
 */
export function buildOfferPlan(params: {
  checkInDate: string;
  checkOutDate: string;
  segments: OfferSegmentInput[];
  categories: OfferPlanCategory[];
}): OfferPlan {
  const startStr = toDateString(params.checkInDate);
  const endStr = toDateString(params.checkOutDate);
  if (startStr >= endStr) {
    return { ok: false, message: 'La date de sortie doit être postérieure à la date d’entrée.' };
  }

  const stayNights = nightsBetween(startStr, endStr);
  if (stayNights.length < 1) return { ok: false, message: 'Séjour trop court.' };

  const catById = new Map(params.categories.map((c) => [c.id, c]));
  const allPetIds = [...new Set(params.segments.flatMap((s) => s.petIds))];
  if (allPetIds.length === 0) return { ok: false, message: 'Aucun animal sur cette offre.' };

  for (const seg of params.segments) {
    if (toDateString(seg.startDate) >= toDateString(seg.endDate)) {
      return { ok: false, message: 'Une période de segment est invalide.' };
    }
    if (seg.petIds.length === 0) return { ok: false, message: 'Un segment est sans animal.' };
    const cat = catById.get(seg.categoryId);
    if (!cat) return { ok: false, message: 'Une catégorie de l’offre est introuvable.' };
    if (seg.petIds.length > cat.capacity) {
      return {
        ok: false,
        message: `Capacité dépassée pour « ${cat.name} » (max ${cat.capacity} par espace).`,
      };
    }
  }

  const coverageError = validateCoverage(allPetIds, params.segments, stayNights);
  if (coverageError) return { ok: false, message: coverageError };

  const segments: PricedOfferSegment[] = params.segments.map((seg) => {
    const cat = catById.get(seg.categoryId)!;
    const nights = nightsBetween(toDateString(seg.startDate), toDateString(seg.endDate)).length;
    const price = computeSegmentPrice({
      nights,
      basePricePerNight: cat.basePricePerNight,
      surchargePerAnimal: cat.surchargePerAnimal,
      petCount: seg.petIds.length,
    });
    return { ...seg, nights, price };
  });

  const totalPrice = segments.reduce((sum, s) => sum + s.price, 0);
  return { ok: true, segments, totalPrice };
}
