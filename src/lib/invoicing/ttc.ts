// ---------------------------------------------------------------------------
// Décomposition TVA d'un montant TTC (pure)
// ---------------------------------------------------------------------------
// Les prix sont stockés TTC. `splitTtc` déduit HT et TVA au taux donné
// (en points de base, ex: 2000 = 20 %). Le total TTC reste exact par
// construction : subtotal + tax === ttc.
// ---------------------------------------------------------------------------

export function splitTtc(
  ttcCents: number,
  vatRateBp: number
): { subtotal: number; tax: number } {
  const tax = Math.round((ttcCents * vatRateBp) / (vatRateBp + 10000));
  return { subtotal: ttcCents - tax, tax };
}
