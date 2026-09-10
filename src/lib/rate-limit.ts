import { createHash } from 'node:crypto';
import { and, eq, gt, sql } from 'drizzle-orm';
import { db } from '@/db';
import { rateLimitHits } from '@/db/schema';

// ---------------------------------------------------------------------------
// Rate-limit persistant pour les parcours publics (H3).
// Sans dépendance externe : compteur en base (fonctionne sur serverless où la
// mémoire d'une instance n'est pas partagée). L'IP n'est jamais stockée en
// clair — uniquement son hash SHA-256.
// ---------------------------------------------------------------------------

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

/** Hash d'identification (IP + éventuellement email) sans donnée personnelle en clair. */
export function rateLimitIdentifier(...parts: (string | null | undefined)[]): string {
  return createHash('sha256').update(parts.filter(Boolean).join('|')).digest('hex');
}

/** IP du client depuis les headers (Vercel : x-forwarded-for / x-real-ip). */
export function clientIpFromHeaders(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip');
}

/**
 * Vérifie et enregistre une tentative. `max` tentatives par fenêtre glissante.
 * Les vieilles lignes du couple (scope, identifier) sont purgées à chaque appel.
 */
export async function checkRateLimit(
  scope: string,
  identifier: string,
  max: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  try {
    return await db.transaction(async (tx) => {
      const since = new Date(Date.now() - windowSeconds * 1000);
      await tx
        .delete(rateLimitHits)
        .where(and(eq(rateLimitHits.scope, scope), eq(rateLimitHits.identifier, identifier), sql`${rateLimitHits.createdAt} < now() - (${windowSeconds} || ' seconds')::interval`));

      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(rateLimitHits)
        .where(and(eq(rateLimitHits.scope, scope), eq(rateLimitHits.identifier, identifier), gt(rateLimitHits.createdAt, since)));

      if (count >= max) {
        return { allowed: false, retryAfterSeconds: windowSeconds };
      }

      await tx.insert(rateLimitHits).values({ scope, identifier });
      return { allowed: true, retryAfterSeconds: 0 };
    });
  } catch (error) {
    // En cas d'indisponibilité DB, on laisse passer (disponibilité > strict blocage)
    // mais on log pour investigation.
    console.error(`rate-limit (${scope}) :`, error);
    return { allowed: true, retryAfterSeconds: 0 };
  }
}
