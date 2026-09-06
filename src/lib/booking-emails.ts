import { db } from '@/db';
import { bookings, clients, pets } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { ensureClientAccessToken } from '@/lib/client-access';
import { sendBookingEmailOnce } from '@/lib/outbound-emails';
import { layoutHtml } from '@/lib/integrations/email';
import { appBaseUrl } from '@/lib/integrations/stripe';
import { getPensionSettings } from '@/lib/settings';

// ---------------------------------------------------------------------------
// Emails du cycle de vie client (G9) — E5 / E6 / E7
// ---------------------------------------------------------------------------
//  E5 : inviter à compléter les infos animal manquantes (I-CAD…).
//  E6 : demander les heures d'arrivée/départ (après confirmation).
//  E7 : relances des heures à J-15 / J-7 / J-1 avant l'arrivée (dédupliquées).
// ---------------------------------------------------------------------------

async function clientAccessForBooking(bookingId: string) {
  const booking = await db.query.bookings.findFirst({
    where: { RAW: (t) => eq(t.id, bookingId) },
    with: { client: true },
  });
  if (!booking?.client) return null;
  const token = await db.transaction(async (tx) =>
    ensureClientAccessToken(tx, booking.clientId)
  );
  const settings = await getPensionSettings();
  return {
    booking,
    token,
    email: booking.client.email,
    firstName: booking.client.firstName,
    link: `${appBaseUrl()}/espace/${token}`,
    pensionName: settings.pensionName,
  };
}

/** E5 : un (ou plusieurs) animal du séjour manque d'infos (I-CAD). */
export async function inviteMissingPetInfo(bookingId: string): Promise<'sent' | 'already' | 'failed' | 'skip'> {
  const ctx = await clientAccessForBooking(bookingId);
  if (!ctx) return 'skip';

  const missing = await db
    .select({ id: pets.id, name: pets.name })
    .from(pets)
    .where(
      and(
        eq(pets.clientId, ctx.booking.clientId),
        sql`(${pets.identificationNumber} IS NULL OR ${pets.identificationNumber} = '')`
      )
    );

  if (missing.length === 0) return 'skip';

  return sendBookingEmailOnce({
    bookingId,
    kind: 'completion_infos',
    to: ctx.email,
    subject: 'Complétez les informations de votre animal',
    html: layoutHtml(
      `<h2>Bonjour ${ctx.firstName},</h2>
       <p>Pour finaliser votre réservation, il manque des informations pour :
       <strong>${missing.map((p) => p.name).join(', ')}</strong> (n° I-CAD / vaccins).</p>
       <p><a href="${ctx.link}" style="display:inline-block;background:#065f46;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Compléter mon dossier</a></p>`,
      ctx.pensionName
    ),
  });
}

/** E6 : demander les heures d'arrivée/départ (réservation confirmée). */
export async function requestTimeSlots(bookingId: string): Promise<'sent' | 'already' | 'failed' | 'skip'> {
  const ctx = await clientAccessForBooking(bookingId);
  if (!ctx) return 'skip';
  if (ctx.booking.arrivalTimeSlot && ctx.booking.departureTimeSlot) return 'skip';

  return sendBookingEmailOnce({
    bookingId,
    kind: 'heures_demande',
    to: ctx.email,
    subject: 'Précisez vos heures d’arrivée et de départ',
    html: layoutHtml(
      `<h2>Bonjour ${ctx.firstName},</h2>
       <p>Votre réservation est confirmée. Merci de préciser vos horaires d’arrivée et de départ
       pour préparer l’accueil de votre chat.</p>
       <p><a href="${ctx.link}" style="display:inline-block;background:#065f46;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Choisir mes heures</a></p>`,
      ctx.pensionName
    ),
  });
}

/**
 * E7 (cron) : relance les heures manquantes aux jours configurables avant
 * l'arrivée (ex: J-15, J-7, J-1). Dédupliqué par kind = heures_relance_<jours>.
 */
export async function remindMissingTimeSlots(): Promise<string[]> {
  const settings = await getPensionSettings();
  const report: string[] = [];

  const due = await db
    .select({
      id: bookings.id,
      email: clients.email,
      firstName: clients.firstName,
      checkInDate: bookings.checkInDate,
    })
    .from(bookings)
    .innerJoin(clients, eq(bookings.clientId, clients.id))
    .where(
      and(
        sql`${bookings.status} in ('confirmed')`,
        sql`(${bookings.arrivalTimeSlot} IS NULL OR ${bookings.departureTimeSlot} IS NULL)`,
        sql`${bookings.checkInDate}::date > now()::date`
      )
    );

  for (const b of due) {
    const days = Math.ceil(
      (new Date(b.checkInDate).getTime() - Date.now()) / 86_400_000
    );
    const isReminderDay = settings.reminderDays.includes(days);
    if (!isReminderDay) continue;

    const ctx = await clientAccessForBooking(b.id);
    if (!ctx) continue;
    const status = await sendBookingEmailOnce({
      bookingId: b.id,
      kind: `heures_relance_${days}`,
      to: ctx.email,
      subject: `J-${days} : pensez à préciser vos heures (${b.checkInDate.toISOString().slice(0, 10)})`,
      html: layoutHtml(
        `<h2>Bonjour ${ctx.firstName},</h2>
         <p>Votre séjour approche (le ${b.checkInDate.toISOString().slice(0, 10)}).
         Il nous manque encore vos heures d’arrivée/départ.</p>
         <p><a href="${ctx.link}" style="display:inline-block;background:#065f46;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Choisir mes heures</a></p>`,
        ctx.pensionName
      ),
    });
    report.push(`${b.id}:heures_${days}:${status}`);
  }

  return report;
}

/** Envois ponctuels E5 pour les séjours actifs (cron, complément). */
export async function sendCompletionInvites(): Promise<string[]> {
  const rows = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(sql`${bookings.status} in ('offered', 'confirmed')`);

  const report: string[] = [];
  for (const row of rows) {
    const status = await inviteMissingPetInfo(row.id);
    if (status === 'sent') report.push(`${row.id}:completion:${status}`);
  }
  return report;
}
