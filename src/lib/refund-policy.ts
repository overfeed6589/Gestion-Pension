// ---------------------------------------------------------------------------
// Politique de remboursement de l'acompte (pure, testable sans DB)
// ---------------------------------------------------------------------------
// Règle itération 1 : l'acompte est remboursé si la réservation (confirmée) est
// annulée au moins `refundDays` jours avant l'arrivée ; sinon il est retenu.
// ---------------------------------------------------------------------------

/** Jours pleins avant l'arrivée (négatif si l'arrivée est passée). */
export function daysBeforeArrival(now: string | Date, checkIn: string | Date): number {
  const nowMs = new Date(now).getTime();
  const checkInMs = new Date(checkIn).getTime();
  return Math.floor((checkInMs - nowMs) / 86_400_000);
}

export function shouldRefundDeposit(params: {
  status: string;
  checkInDate: string | Date;
  now: string | Date;
  depositAmount: number;
  refundDays: number;
}): boolean {
  if (params.status !== 'confirmed') return false;
  if (params.depositAmount <= 0) return false;
  return daysBeforeArrival(params.now, params.checkInDate) >= params.refundDays;
}
