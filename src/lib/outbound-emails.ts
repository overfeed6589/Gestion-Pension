import { db } from '@/db';
import { outboundEmails } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { sendMail } from '@/lib/integrations/email';

// ---------------------------------------------------------------------------
// Emails transactionnels avec DÉDUP (G9)
// ---------------------------------------------------------------------------
// Chaque email d'un type (`kind`) n'est envoyé qu'UNE fois par réservation
// (table outbound_emails). Un envoi échoué n'est pas enregistré → relancé au
// prochain passage.
// ---------------------------------------------------------------------------

export async function hasEmailBeenSent(bookingId: string, kind: string): Promise<boolean> {
  const rows = await db
    .select({ id: outboundEmails.id })
    .from(outboundEmails)
    .where(and(eq(outboundEmails.bookingId, bookingId), eq(outboundEmails.kind, kind)))
    .limit(1);
  return rows.length > 0;
}

export async function recordEmailSent(
  bookingId: string,
  kind: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await db.insert(outboundEmails).values({
    bookingId,
    kind,
    metadata: metadata ? (JSON.parse(JSON.stringify(metadata)) as object) : null,
  });
}

export type SendOnceStatus = 'sent' | 'already' | 'failed';

/** Envoie un email si le (booking, kind) n'a pas encore été envoyé. */
export async function sendBookingEmailOnce(input: {
  bookingId: string;
  kind: string;
  to: string;
  subject: string;
  html: string;
  metadata?: Record<string, unknown>;
}): Promise<SendOnceStatus> {
  if (await hasEmailBeenSent(input.bookingId, input.kind)) return 'already';

  const result = await sendMail({
    to: input.to,
    subject: input.subject,
    html: input.html,
  });
  if (!result.ok) return 'failed';

  await recordEmailSent(input.bookingId, input.kind, input.metadata);
  return 'sent';
}
