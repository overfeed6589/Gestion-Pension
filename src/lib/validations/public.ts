import { z } from 'zod';

// ---------------------------------------------------------------------------
// Formulaire public de demande de séjour (Phase G — Lot 2)
// ---------------------------------------------------------------------------
// Données MINIMALES côté public : le dossier animal complet (I-CAD, vaccins)
// est saisi par le personnel avant de bâtir l'offre. Le consentement RGPD est
// obligatoire et horodaté à l'enregistrement.
// ---------------------------------------------------------------------------

export const publicDemandeSchema = z.object({
  firstName: z.string().min(2, 'Votre prénom est requis'),
  lastName: z.string().min(2, 'Votre nom est requis'),
  email: z.string().email('Adresse email invalide'),
  phone: z.string().min(10, 'Numéro de téléphone invalide'),
  checkInDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date d’arrivée invalide'),
  checkOutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date de départ invalide'),
  petCount: z.coerce
    .number({ message: 'Nombre d’animaux invalide' })
    .int('Nombre entier')
    .min(1, 'Au moins 1 animal')
    .max(6, '6 animaux maximum par demande'),
  message: z.string().max(1000).optional(),
  consent: z.literal('on', { message: 'Consentement requis pour traiter votre demande' }),
  // Honeypot anti-spam : ce champ doit rester vide.
  website: z.string().max(0, 'Formulaire invalide').default(''),
});

export type PublicDemandeInput = z.infer<typeof publicDemandeSchema>;
