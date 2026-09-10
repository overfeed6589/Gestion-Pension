'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { getPublicAvailability } from '@/lib/availability';
import { createPublicProposal, type CreatePublicProposalInput } from '@/lib/public-reservation';
import { checkRateLimit, clientIpFromHeaders, rateLimitIdentifier } from '@/lib/rate-limit';
import { createResumeLink, findClientByEmail } from '@/lib/client-access';
import { sendMail, layoutHtml } from '@/lib/integrations/email';
import { getPensionSettings } from '@/lib/settings';
import { appBaseUrl } from '@/lib/integrations/stripe';
import { db } from '@/db';
import { ActionState } from '@/types/actions';

// Anti-abus : fenêtres glissantes persistantes par IP (H3).
const RESERVATION_LIMIT = { max: 5, window: 3600 } as const;
const SEARCH_LIMIT = { max: 30, window: 3600 } as const;

async function rateLimit(
  scope: string,
  limit: { max: number; window: number }
): Promise<ActionState | null> {
  const h = await headers();
  const ip = clientIpFromHeaders(h);
  const res = await checkRateLimit(scope, rateLimitIdentifier(scope, ip), limit.max, limit.window);
  if (res.allowed) return null;
  return {
    success: false,
    message: `Trop de tentatives. Réessayez dans ${Math.ceil(res.retryAfterSeconds / 60)} minute(s).`,
  };
}

/**
 * Recherche de disponibilité publique (étapes propositions). PAS de garde : public.
 */
export async function proposeAvailabilityAction(input: {
  startDate: string;
  endDate: string;
  petCount: number;
}): Promise<ActionState> {
  const parsed = z
    .object({
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      petCount: z.number().int().min(1).max(6),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { success: false, message: 'Paramètres de recherche invalides.' };
  }
  const limited = await rateLimit('reserver_recherche', SEARCH_LIMIT);
  if (limited) return limited;

  const result = await getPublicAvailability(parsed.data);
  return { success: true, data: result };
}

const petSchema = z.object({
  name: z.string().min(1, 'Le nom de l’animal est requis'),
  species: z.string().min(1),
  breed: z.string().optional().nullable(),
  sex: z.string().min(1),
  isSterilized: z.boolean().default(false),
  birthDate: z.string().optional().nullable(),
  identificationNumber: z.string().optional().nullable(),
});

const proposalSchema = z.object({
  contact: z.object({
    firstName: z.string().min(2, 'Prénom requis'),
    lastName: z.string().min(2, 'Nom requis'),
    email: z.string().email('Email invalide'),
    phone: z.string().min(10, 'Téléphone invalide'),
    address: z.string().optional().nullable(),
  }),
  checkInDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  petCount: z.number().int().min(1).max(6),
  pets: z.array(petSchema),
  option: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('category'), categoryId: z.string(), requiredSpaces: z.number() }),
    z.object({
      kind: z.literal('split'),
      portions: z.array(
        z.object({ categoryId: z.string(), startDate: z.string(), endDate: z.string() })
      ),
    }),
  ]),
  consent: z.literal(true),
  requestNotes: z.string().optional().nullable(),
  // Honeypot anti-spam : champ invisible, doit rester vide.
  website: z.string().max(0).optional(),
});

/**
 * Soumission de la demande publique → booking `proposed` (+ email E1).
 */
export async function submitProposalAction(
  input: CreatePublicProposalInput
): Promise<ActionState> {
  // Honeypot rempli → bot : succès silencieux, rien n'est créé.
  if (input.website) {
    return { success: true, message: 'Demande envoyée !' };
  }

  const parsed = proposalSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: 'Certains champs sont invalides.', errors: parsed.error.flatten().fieldErrors };
  }
  if (parsed.data.pets.length !== parsed.data.petCount) {
    return { success: false, message: 'Le nombre d’animaux renseignés ne correspond pas.' };
  }
  if (parsed.data.checkInDate >= parsed.data.checkOutDate) {
    return { success: false, message: 'La date de départ doit être postérieure à l’arrivée.' };
  }

  const limited = await rateLimit('reserver_soumission', RESERVATION_LIMIT);
  if (limited) return limited;

  const result = await createPublicProposal(parsed.data);
  if (!result.ok) return { success: false, message: result.message };

  return {
    success: true,
    message: 'Demande envoyée ! Nous revenons vers vous sous 24/48 h avec le lien de paiement.',
    data: { bookingId: result.bookingId },
  };
}

/**
 * E2 (parcours client connu) : si l'email renseigné correspond à un dossier
 * existant, on lui envoie un lien de reprise à usage unique (30 min) vers son
 * espace. Réponse volontairement identique que le dossier existe ou non (pas
 * d'énumération d'emails). Rate-limit strict : 3 demandes/heure/IP.
 */
export async function requestResumeLinkAction(email: string): Promise<ActionState> {
  const parsed = z.string().email().safeParse(email.trim().toLowerCase());
  if (!parsed.success) {
    return { success: false, message: 'Adresse email invalide.' };
  }

  const limited = await rateLimit('reserver_reprise', { max: 3, window: 3600 });
  if (limited) return { success: true, message: '' };

  const client = await findClientByEmail(parsed.data);
  if (client) {
    const resumeToken = await db.transaction(async (tx) => createResumeLink(tx, client.id));
    const link = `${appBaseUrl()}/espace?resume=${resumeToken}`;
    const settings = await getPensionSettings();
    await sendMail({
      to: client.email,
      subject: `Votre espace ${settings.pensionName}`,
      html: layoutHtml(
        `<h2>Bonjour ${client.firstName},</h2>
         <p>Voici un lien d'accès à votre dossier (valable 30 minutes, à usage unique) :</p>
         <p><a href="${link}">Ouvrir mon espace</a></p>`,
        settings.pensionName
      ),
    });
  }

  return {
    success: true,
    message: 'Si un dossier existe avec cet email, un lien d’accès vient de vous être envoyé.',
  };
}
