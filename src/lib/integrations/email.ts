import { Resend } from 'resend';
import { serverEnv } from '@/lib/env';

// ---------------------------------------------------------------------------
// Email sortant (Phase G — Resend)
// ---------------------------------------------------------------------------
// Fournisseur à coût quasi nul (free tier 3000/mois). En dev, sans clé, les
// envois sont simplement désactivés (retour ok=false « non configuré ») : le
// reste de l'app ne plante pas. `EMAIL_FROM` doit pointer un domaine vérifié
// chez Resend (SPF/DKIM) en production.
// ---------------------------------------------------------------------------

export type SendMailResult = { ok: true; id: string } | { ok: false; message: string };

export async function sendMail(input: {
  to: string;
  subject: string;
  html: string;
}): Promise<SendMailResult> {
  if (!serverEnv.RESEND_API_KEY) {
    console.warn('sendMail ignoré : RESEND_API_KEY absente.');
    return { ok: false, message: 'Email non configuré (RESEND_API_KEY absente).' };
  }
  const from = serverEnv.EMAIL_FROM ?? 'Pension <onboarding@resend.dev>';

  try {
    const resend = new Resend(serverEnv.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
    });
    if (error) {
      console.error('sendMail :', error.message);
      return { ok: false, message: error.message };
    }
    return { ok: true, id: data?.id ?? '' };
  } catch (error) {
    console.error('sendMail :', error);
    return { ok: false, message: 'Erreur lors de l’envoi.' };
  }
}

/** Petite mise en forme HTML commune aux emails transactionnels. */
export function layoutHtml(bodyHtml: string, pensionName = 'Pension'): string {
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#1f2937;max-width:560px;margin:0 auto">
    <div style="padding:16px 24px">${bodyHtml}</div>
    <hr style="border:none;border-top:1px solid #e5e7eb" />
    <p style="color:#9ca3af;font-size:12px">${pensionName} — application de gestion des séjours.</p>
  </body></html>`;
}
