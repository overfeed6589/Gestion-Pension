import crypto from 'node:crypto';
import { serverEnv } from '@/lib/env';

// ---------------------------------------------------------------------------
// Export Google Calendar one-way (Phase H4)
// ---------------------------------------------------------------------------
// Principe : NON-BLOQUANT. Sans GOOGLE_CALENDAR_ID / GOOGLE_SERVICE_ACCOUNT_KEY
// toutes les fonctions renvoient { ok: false, reason: 'not_configured' } et
// l'application continue de fonctionner. Les erreurs réseau/API sont capturées
// et journalisées, jamais propagées aux actions métier.
//
// Auth : compte de service (clé RS256 signée à la main, aucun `googleapis`)
// → jeton d'accès OAuth2 → API Calendar v3 en REST.
// ---------------------------------------------------------------------------

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
// Les événements de la pension sont préfixés pour pouvoir être listés/purgés
// lors de la réconciliation quotidienne sans toucher aux autres événements.
export const EVENT_ID_PREFIX = 'pension-';

let cachedToken: { token: string; expiresAt: number } | null = null;

type ServiceAccountKey = {
  client_email: string;
  private_key: string;
};

function getServiceAccount(): ServiceAccountKey | null {
  const raw = serverEnv.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ServiceAccountKey;
  } catch {
    console.error('google-calendar : GOOGLE_SERVICE_ACCOUNT_KEY n\'est pas un JSON valide.');
    return null;
  }
}

export function isCalendarConfigured(): boolean {
  return Boolean(serverEnv.GOOGLE_CALENDAR_ID && serverEnv.GOOGLE_SERVICE_ACCOUNT_KEY);
}

async function getAccessToken(): Promise<string | null> {
  const account = getServiceAccount();
  if (!account || !serverEnv.GOOGLE_CALENDAR_ID) return null;

  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 60) {
    return cachedToken.token;
  }

  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/calendar',
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };
  const enc = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsigned = `${enc(header)}.${enc(claim)}`;
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(unsigned)
    .sign(account.private_key.replace(/\\n/g, '\n'))
    .toString('base64url');

  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${unsigned}.${signature}`,
      }),
    });
    if (!res.ok) {
      console.error('google-calendar : échec du jeton OAuth2', res.status, await res.text());
      return null;
    }
    const data = (await res.json()) as { access_token: string; expires_in: number };
    cachedToken = { token: data.access_token, expiresAt: now + data.expires_in };
    return data.access_token;
  } catch (error) {
    console.error('google-calendar : échec du jeton OAuth2', error);
    return null;
  }
}

export type CalendarEventInput = {
  /** Identifiant stable côté app (ex: pension-arr-<bookingId>). */
  eventId: string;
  title: string;
  description?: string;
  start: Date;
  durationMinutes: number;
};

function buildEventResource(input: CalendarEventInput) {
  const start = new Date(input.start);
  const end = new Date(start.getTime() + input.durationMinutes * 60_000);
  return {
    summary: input.title,
    description: input.description,
    // L'agenda de la pension est un agenda "maison" : heure locale sans fuseau
    // exotique (Europe/Paris par défaut) — les créneaux sont des plages horaires.
    start: { dateTime: start.toISOString(), timeZone: 'Europe/Paris' },
    end: { dateTime: end.toISOString(), timeZone: 'Europe/Paris' },
  };
}

/**
 * Crée ou met à jour un événement (id déterministe = idempotent).
 * Renvoie toujours un résultat non-bloquant.
 */
export async function upsertCalendarEvent(input: CalendarEventInput): Promise<{
  ok: boolean;
  reason?: string;
}> {
  if (!isCalendarConfigured()) return { ok: false, reason: 'not_configured' };

  const token = await getAccessToken();
  if (!token) return { ok: false, reason: 'token_failed' };

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  try {
    // PUT avec eventId déterministe : crée si absent, met à jour sinon
    // (idempotent — la réconciliation quotidienne peut être relancée sans peur).
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        serverEnv.GOOGLE_CALENDAR_ID!
      )}/events/${encodeURIComponent(input.eventId)}`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify(buildEventResource(input)),
      }
    );
    if (!res.ok) {
      console.error(`google-calendar : PUT ${input.eventId} → ${res.status}`);
      return { ok: false, reason: `http_${res.status}` };
    }
    return { ok: true };
  } catch (error) {
    console.error(`google-calendar : PUT ${input.eventId} a échoué`, error);
    return { ok: false, reason: 'network_error' };
  }
}

export async function deleteCalendarEvent(eventId: string): Promise<{ ok: boolean; reason?: string }> {
  if (!isCalendarConfigured()) return { ok: false, reason: 'not_configured' };

  const token = await getAccessToken();
  if (!token) return { ok: false, reason: 'token_failed' };

  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(serverEnv.GOOGLE_CALENDAR_ID!)}/events/${encodeURIComponent(eventId)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
    );
    // 410 = déjà absent : considéré comme succès (idempotent).
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      console.error(`google-calendar : DELETE ${eventId} → ${res.status}`);
      return { ok: false, reason: `http_${res.status}` };
    }
    return { ok: true };
  } catch (error) {
    console.error(`google-calendar : DELETE ${eventId} a échoué`, error);
    return { ok: false, reason: 'network_error' };
  }
}