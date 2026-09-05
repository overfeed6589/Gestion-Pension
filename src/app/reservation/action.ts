'use server';

import { publicDemandeSchema } from '@/lib/validations/public';
import { createPublicDemande } from '@/lib/public-demandes';
import { ActionState } from '@/types/actions';

/**
 * Reçoit une demande de séjour depuis le site public. PAS de garde d'accès :
 * c'est un formulaire public. L'anti-spam = honeypot (validé ici) ; la donnée
 * est minimale et le consentement RGPD est horodaté.
 */
export async function submitPublicDemandeAction(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const validated = publicDemandeSchema.safeParse({
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    checkInDate: formData.get('checkInDate'),
    checkOutDate: formData.get('checkOutDate'),
    petCount: formData.get('petCount'),
    message: formData.get('message') || undefined,
    consent: formData.get('consent'),
    website: formData.get('website'),
  });

  if (!validated.success) {
    return {
      success: false,
      message: 'Certains champs sont invalides.',
      errors: validated.error.flatten().fieldErrors,
    };
  }

  const result = await createPublicDemande(validated.data);
  if (!result.ok) {
    return { success: false, message: result.message };
  }

  return {
    success: true,
    message: 'Demande bien reçue ! Nous revenons vers vous sous 24/48 h avec une proposition.',
    data: { bookingId: result.bookingId },
  };
}
