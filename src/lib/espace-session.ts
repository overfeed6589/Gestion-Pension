import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { serverEnv } from '@/lib/env';

// ---------------------------------------------------------------------------
// Session espace client (sans compte) — suite de la sécurisation des jetons.
// Les liens de reprise (`/espace?resume=…`) consomment un jeton à usage unique
// puis posent un cookie signé (HMAC) qui maintient l'accès à l'espace. Le jeton
// dossier (hashé en base) n'est jamais remis en circulation.
// ---------------------------------------------------------------------------

const COOKIE_NAME = 'espace_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 jours

function secret(): string {
  return serverEnv.ESPACE_SESSION_SECRET ?? `espace-dev-${serverEnv.DATABASE_URL}`;
}

function sign(clientId: string): string {
  return createHmac('sha256', secret()).update(clientId).digest('base64url');
}

/** Pose le cookie de session espace pour ce client. */
export async function createEspaceSession(clientId: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, `${clientId}.${sign(clientId)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE_SECONDS,
    path: '/',
  });
}

/** Vérifie le cookie de session et renvoie le clientId, sinon null. */
export async function readEspaceSession(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const dot = raw.lastIndexOf('.');
  if (dot <= 0) return null;
  const clientId = raw.slice(0, dot);
  const sig = Buffer.from(raw.slice(dot + 1));
  const expected = Buffer.from(sign(clientId));
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null;
  return clientId;
}

/** Supprime la session espace (bouton « Fermer ma session »). */
export async function destroyEspaceSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
