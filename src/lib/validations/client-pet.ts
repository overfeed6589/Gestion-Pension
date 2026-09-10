import { z } from 'zod';

// Validation d'un vaccin individuel (Stocké en JSONB)
export const vaccineSchema = z.object({
  name: z.string().min(1, 'Le nom du vaccin est requis'),
  administeredAt: z.string().optional(),
  expiresAt: z.string().optional(),
  isMandatory: z.coerce.boolean().default(false),
});

// Validation des informations de l'animal & I-CAD
export const createPetSchema = z.object({
  name: z.string().min(1, "Le nom de l'animal est requis"),
  species: z.string().min(1, "L'espèce est requise (ex: Chien, Chat)"),
  breed: z.string().optional(),
  sex: z.string().min(1, 'Le sexe est requis'),
  isSterilized: z.coerce.boolean().default(false),
  birthDate: z.string().optional(),

  // Registre réglementaire I-CAD (Puce électronique / Tatouage)
  identificationNumber: z
    .string()
    .min(1, "Le numéro I-CAD est obligatoire")
    .regex(/^[A-Za-z0-9]{10,15}$/, "Numéro I-CAD invalide (10 à 15 caractères alphanumériques)"),
  passportNumber: z.string().optional(),
  veterinarianName: z.string().optional(),
  veterinarianPhone: z.string().optional(),

  vaccinesUpToDate: z.coerce.boolean().default(true),
  vaccines: z.array(vaccineSchema).default([]),
});

// Schéma global combiné pour le formulaire d'inscription
export const createClientWithPetSchema = z.object({
  firstName: z.string().min(2, 'Le prénom doit contenir au moins 2 caractères'),
  lastName: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
  email: z.string().email('Adresse email invalide'),
  phone: z.string().min(10, 'Numéro de téléphone invalide (10 chiffres min.)'),
  address: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),

  pet: createPetSchema,
});

// Complétion par le client depuis /espace (G9) : allow-list stricte des champs
// modifiables par le détenteur du jeton — jamais `clientId`, `species`, `name`
// ni le JSONB `vaccines` (réservés au personnel).
export const clientPetCompletionSchema = z
  .object({
    identificationNumber: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9]{10,15}$/, 'Numéro I-CAD invalide (10 à 15 caractères alphanumériques)')
      .nullish(),
    birthDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date de naissance invalide')
      .nullish(),
    breed: z.string().trim().max(100).nullish(),
    sex: z.enum(['M', 'F']).optional(),
    isSterilized: z.boolean().optional(),
    passportNumber: z.string().trim().max(50).nullish(),
    veterinarianName: z.string().trim().max(120).nullish(),
    veterinarianPhone: z.string().trim().max(30).nullish(),
    vaccinesUpToDate: z.boolean().optional(),
    medicalNotes: z.string().trim().max(2000).nullish(),
  })
  .strict();

export type ClientPetCompletionInput = z.infer<typeof clientPetCompletionSchema>;

export type VaccineInput = z.infer<typeof vaccineSchema>;
export type CreatePetInput = z.infer<typeof createPetSchema>;
export type CreateClientWithPetInput = z.infer<typeof createClientWithPetSchema>;