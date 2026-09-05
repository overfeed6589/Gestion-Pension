// ---------------------------------------------------------------------------
// Moteur de tarification (Phase G4)
// ---------------------------------------------------------------------------
// Règle validée : le prix d'un espace est facturé PAR ESPACE (base) + un
// SUPPLEMENT par animal AU-DELÀ du 1er occupant du segment. Le tout en
// centimes entiers (cohérent avec le schéma).
//
// Un groupe d'animaux dépassant la capacité d'un espace est réparti sur
// plusieurs segments parallèles (mêmes dates) : la tarification se calcule
// donc SEGMENT par SEGMENT, en fonction du nombre d'occupants du segment
// (via `segment_pets`), pas au niveau du booking entier.
// ---------------------------------------------------------------------------

/** Données d'un segment nécessaires au calcul. Structurel (pas de dépendance DB). */
export type SegmentPricingInput = {
  /** Nombre de nuits du segment (déjà calculé, fin exclusive). */
  nights: number;
  /** Prix de base de l'espace, en centimes/nuit. */
  basePricePerNight: number;
  /** Supplément par animal au-delà du 1er, en centimes/nuit. */
  surchargePerAnimal: number;
  /** Nombre d'animaux occupant ce segment. */
  petCount: number;
};

/** Calcul pur du prix d'un segment (centimes). */
export function computeSegmentPrice(input: SegmentPricingInput): number {
  const { nights, basePricePerNight, surchargePerAnimal, petCount } = input;
  if (nights < 1) throw new Error('computeSegmentPrice : nights doit être ≥ 1.');
  if (petCount < 1) throw new Error('computeSegmentPrice : petCount doit être ≥ 1.');

  const extraAnimals = Math.max(0, petCount - 1);
  const pricePerNight = basePricePerNight + extraAnimals * surchargePerAnimal;
  return nights * pricePerNight;
}

/** Prix total du séjour : somme des segments (centimes). */
export function computeStayPrice(segments: SegmentPricingInput[]): number {
  return segments.reduce((sum, s) => sum + computeSegmentPrice(s), 0);
}

/**
 * Montant de l'acompte (centimes), arrondi à l'euro près (Math.round).
 * Ex: total 12345 cts, depositPercent 30 → 3704 cts.
 */
export function computeDepositAmount(totalPriceCents: number, depositPercent: number): number {
  if (totalPriceCents < 0) throw new Error('computeDepositAmount : total négatif.');
  return Math.round((totalPriceCents * depositPercent) / 100);
}

/** Solde restant dû après versement de l'acompte (centimes). */
export function computeRemainingBalance(totalPriceCents: number, depositAmountCents: number): number {
  return Math.max(0, totalPriceCents - depositAmountCents);
}
