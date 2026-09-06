'use server';

import { z } from 'zod';
import { getPublicAvailability } from '@/lib/availability';
import { createPublicProposal, type CreatePublicProposalInput } from '@/lib/public-reservation';
import { ActionState } from '@/types/actions';

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
});

/**
 * Soumission de la demande publique → booking `proposed` (+ email E1).
 */
export async function submitProposalAction(
  input: CreatePublicProposalInput
): Promise<ActionState> {
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

  const result = await createPublicProposal(parsed.data);
  if (!result.ok) return { success: false, message: result.message };

  return {
    success: true,
    message: 'Demande envoyée ! Nous revenons vers vous sous 24/48 h avec le lien de paiement.',
    data: { bookingId: result.bookingId },
  };
}
