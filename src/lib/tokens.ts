import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

// ---------------------------------------------------------------------------
// Jetons d'accès client (G9) — utilitaires purs (sans accès DB, testables).
// ---------------------------------------------------------------------------

/** Jeton aléatoire 192 bits (hexadécimal). */
export function generateToken(): string {
  return randomBytes(24).toString('hex');
}

/** Hash de stockage d'un jeton (SHA-256 hexadécimal) — jamais le jeton en clair. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Comparaison en temps constant entre deux jetons (ou leurs hash). */
export function tokensMatch(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}
