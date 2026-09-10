import { db } from '@/db';
import { clients, clientResumeLinks } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { generateToken, hashToken } from '@/lib/tokens';

// ---------------------------------------------------------------------------
// Accès client par jeton (G9)
// ---------------------------------------------------------------------------
// Pas de compte/mot de passe. Chaque client possède un jeton dossier (généré à
// la première demande) envoyé par email : il ouvre l'espace client
// `/espace/<token>`. Le « lien de reprise » (client connu au moment de la
// demande) est un jeton court, à usage unique, stocké dans client_resume_links.
// Sécurité (M1/M2) : seul le hash SHA-256 des jetons est stocké en base ; le
// jeton dossier est rotatable (voir rotateClientAccessToken). Les jetons ne
// sont jamais loggués.
// ---------------------------------------------------------------------------

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// generateToken / hashToken / tokensMatch vivent dans `@/lib/tokens`
// (utilitaires purs, testables sans DB) et sont ré-exportés ici.
export { generateToken, hashToken, tokensMatch } from '@/lib/tokens';

/**
 * Garantit un jeton dossier pour le client (crée s'il manque), en transaction.
 * Le jeton en clair n'est jamais persisté — seulement son hash. Si un jeton
 * existe déjà, il n'est PAS retourné (irrécupérable par design) : `created`
 * vaut false et l'appelant doit utiliser un lien de reprise à usage unique.
 */
export async function ensureClientAccessToken(
  tx: Tx,
  clientId: string
): Promise<{ token: string; created: boolean }> {
  const [client] = await tx
    .select({ id: clients.id, accessTokenHash: clients.accessTokenHash })
    .from(clients)
    .where(eq(clients.id, clientId))
    .for('update')
    .limit(1);
  if (!client) throw new Error('Client introuvable.');

  if (client.accessTokenHash) return { token: '', created: false };

  const token = generateToken();
  await tx
    .update(clients)
    .set({ accessTokenHash: hashToken(token) })
    .where(eq(clients.id, clientId));
  return { token, created: true };
}

/**
 * URL d'accès à l'espace client pour un email :
 *  - premier jeton → lien durable `/espace/<token>` ;
 *  - sinon → lien de reprise à usage unique (TTL long, révocable) qui
 *    redirige vers l'espace sans jamais exposer le jeton dossier.
 * `base` = URL racine de l'app (ex: appBaseUrl()).
 */
export async function espaceLinkForClient(
  tx: Tx,
  clientId: string,
  base: string,
  resumeTtlMinutes = 60 * 24 * 30
): Promise<{ url: string; created: boolean }> {
  const { token, created } = await ensureClientAccessToken(tx, clientId);
  if (created && token) {
    return { url: `${base}/espace/${token}`, created: true };
  }
  const resumeToken = await createResumeLink(tx, clientId, resumeTtlMinutes);
  return { url: `${base}/espace?resume=${resumeToken}`, created: false };
}

/**
 * Rotation du jeton dossier (M2) : révoque l'ancien accès et en émet un neuf.
 * Retourne le jeton en clair (à envoyer par email) ou null si client introuvable.
 */
export async function rotateClientAccessToken(clientId: string): Promise<string | null> {
  return db.transaction(async (tx) => {
    const [client] = await tx
      .select({ id: clients.id })
      .from(clients)
      .where(eq(clients.id, clientId))
      .for('update')
      .limit(1);
    if (!client) return null;

    const token = generateToken();
    await tx
      .update(clients)
      .set({ accessTokenHash: hashToken(token), accessTokenRotatedAt: new Date() })
      .where(eq(clients.id, clientId));
    return token;
  });
}

/** Crée un lien de reprise pour un client connu (usage unique, TTL). */
export async function createResumeLink(
  tx: Tx,
  clientId: string,
  ttlMinutes = 30
): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
  await tx.insert(clientResumeLinks).values({ clientId, tokenHash: hashToken(token), expiresAt });
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
      .where(eq(clientResumeLinks.tokenHash, hashToken(token)))
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

/**
 * Retrouve un client par son jeton dossier (accès /espace/<token>).
 * Lookup principal par hash ; repli sur la colonne legacy en clair (transition),
 * avec re-hash à la volée pour migrer progressivement.
 */
export async function findClientByAccessToken(token: string) {
  const hashed = hashToken(token);

  const [byHash] = await db
    .select()
    .from(clients)
    .where(eq(clients.accessTokenHash, hashed))
    .limit(1);
  if (byHash) return byHash;

  // Transition : jetons émis avant le hash. On matche la valeur legacy puis on
  // renseigne le hash pour que la colonne en clair devienne inutile.
  const [legacy] = await db
    .select()
    .from(clients)
    .where(eq(clients.accessToken, token))
    .limit(1);
  if (legacy) {
    if (!legacy.accessTokenHash) {
      await db
        .update(clients)
        .set({ accessTokenHash: hashed })
        .where(eq(clients.id, legacy.id));
      return { ...legacy, accessTokenHash: hashed };
    }
    return legacy;
  }
  return null;
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
