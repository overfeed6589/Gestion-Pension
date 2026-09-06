import { db } from '@/db';
import { clients, clientResumeLinks } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';

// ---------------------------------------------------------------------------
// Accès client par jeton (G9)
// ---------------------------------------------------------------------------
// Pas de compte/mot de passe. Chaque client possède un `accessToken` (jeton
// dossier, généré à la première demande) envoyé par email : il ouvre l'espace
// client `/espace/<token>`. Le « lien de reprise » (client connu au moment de la
// demande) est un jeton court, à usage unique, stocké dans client_resume_links.
// Les jetons ne sont jamais loggués.
// ---------------------------------------------------------------------------

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function generateToken(): string {
  return randomBytes(24).toString('hex');
}

/** Garantit un jeton dossier pour le client (crée s'il manque), en transaction. */
export async function ensureClientAccessToken(tx: Tx, clientId: string): Promise<string> {
  const [client] = await tx
    .select({ id: clients.id, accessToken: clients.accessToken })
    .from(clients)
    .where(eq(clients.id, clientId))
    .for('update')
    .limit(1);
  if (!client) throw new Error('Client introuvable.');

  if (client.accessToken) return client.accessToken;

  const token = generateToken();
  await tx.update(clients).set({ accessToken: token }).where(eq(clients.id, clientId));
  return token;
}

/** Crée un lien de reprise pour un client connu (usage unique, TTL). */
export async function createResumeLink(
  tx: Tx,
  clientId: string,
  ttlMinutes = 30
): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
  await tx.insert(clientResumeLinks).values({ clientId, token, expiresAt });
  return token;
}

/**
 * Consomme un lien de reprise (usage unique + expiration) et renvoie le clientId.
 * Retourne null si inconnu, expiré ou déjà utilisé.
 */
export async function consumeResumeLink(token: string): Promise<string | null> {
  const row = await db.transaction(async (tx) => {
    const [link] = await tx
      .select()
      .from(clientResumeLinks)
      .where(eq(clientResumeLinks.token, token))
      .for('update')
      .limit(1);
    if (!link) return null;
    if (link.usedAt) return null;
    if (link.expiresAt.getTime() < Date.now()) return null;

    await tx
      .update(clientResumeLinks)
      .set({ usedAt: new Date() })
      .where(eq(clientResumeLinks.id, link.id));
    return link.clientId;
  });

  return row;
}

/** Retrouve un client par son jeton dossier (accès /espace/<token>). */
export async function findClientByAccessToken(token: string) {
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.accessToken, token))
    .limit(1);
  return client ?? null;
}

/** Trouve un client par email normalisé (insensible à la casse). */
export async function findClientByEmail(email: string) {
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.email, email.trim().toLowerCase()))
    .limit(1);
  return client ?? null;
}
