// ---------------------------------------------------------------------------
// Helpers monétaires (Phase G)
// ---------------------------------------------------------------------------
// Tout le schéma stocke l'argent en centimes (entiers). Ces helpers centralisent
// la conversion euros <-> centimes et le formatage d'affichage, pour éviter les
// erreurs d'arrondi flottant et les `Math.round` dispersés.
// ---------------------------------------------------------------------------

/** Convertit un montant en euros (saisie utilisateur) en centimes entiers. */
export function eurosToCents(euros: number): number {
  return Math.round(euros * 100);
}

/** Convertit des centimes entiers en euros. */
export function centsToEuros(cents: number): number {
  return cents / 100;
}

/**
 * Formate un montant en centimes pour l'affichage (ex: 1234 -> "12,34 €").
 * `Intl.NumberFormat` gère la locale française sans lib externe.
 */
export function formatCents(cents: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency,
  }).format(centsToEuros(cents));
}

/**
 * Nombre de nuits d'un séjour défini par [start, end) (fin exclusive, cohérent
 * avec la sémantique d'occupation des segments : une nuit = 1 jour commencé).
 * Retourne au minimum 1 nuit (le jour d'arrivée est facturé).
 */
export function computeNights(start: Date | string, end: Date | string): number {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const nights = Math.ceil((endMs - startMs) / (1000 * 3600 * 24));
  return Math.max(1, nights);
}
