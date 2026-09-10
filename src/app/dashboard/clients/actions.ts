'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { clients, pets } from '@/db/schema';
import { createClientWithPetSchema, createPetSchema } from '@/lib/validations/client-pet';
import { rotateClientAccessToken } from '@/lib/client-access';
import { appBaseUrl } from '@/lib/integrations/stripe';
import { ActionState } from '@/types/actions';
import { requireRole } from '@/lib/auth';

export async function createClientWithPetAction(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  // Garde d'autorisation (A2) : la création de dossier client (dépôt) revient au
  // rôle `secretary` (dev/owner couverts). `staff` modifie la fiche animal ensuite.
  await requireRole('secretary');

  // 1. Parsing du payload complexe (les vaccins sont transmis en JSON stringifié)
  let rawVaccines = [];
  try {
    const vaccinesJson = formData.get('pet.vaccines') as string;
    if (vaccinesJson) rawVaccines = JSON.parse(vaccinesJson);
  } catch {
    rawVaccines = [];
  }

  const rawData = {
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    address: formData.get('address'),
    emergencyContactName: formData.get('emergencyContactName'),
    emergencyContactPhone: formData.get('emergencyContactPhone'),
    pet: {
      name: formData.get('pet.name'),
      species: formData.get('pet.species'),
      breed: formData.get('pet.breed'),
      sex: formData.get('pet.sex'),
      isSterilized: formData.get('pet.isSterilized') === 'on' || formData.get('pet.isSterilized') === 'true',
      birthDate: formData.get('pet.birthDate') || undefined,
      identificationNumber: formData.get('pet.identificationNumber'),
      passportNumber: formData.get('pet.passportNumber'),
      veterinarianName: formData.get('pet.veterinarianName'),
      veterinarianPhone: formData.get('pet.veterinarianPhone'),
      vaccinesUpToDate: formData.get('pet.vaccinesUpToDate') !== 'false',
      vaccines: rawVaccines,
    },
  };

  // 2. Validation Zod
  const validated = createClientWithPetSchema.safeParse(rawData);

  if (!validated.success) {
    return {
      success: false,
      message: 'Certains champs sont invalides.',
      errors: validated.error.flatten().fieldErrors,
    };
  }

  const { pet, ...clientData } = validated.data;

  // 3. Exécution atomique en BDD
  try {
    await db.transaction(async (tx) => {
      // Création du client
      const [newClient] = await tx.insert(clients).values(clientData).returning({ id: clients.id });

      // Création de l'animal rattaché au client
      await tx.insert(pets).values({
        clientId: newClient.id,
        name: pet.name,
        species: pet.species,
        breed: pet.breed,
        sex: pet.sex,
        isSterilized: pet.isSterilized,
        birthDate: pet.birthDate,
        identificationNumber: pet.identificationNumber,
        passportNumber: pet.passportNumber,
        veterinarianName: pet.veterinarianName,
        veterinarianPhone: pet.veterinarianPhone,
        vaccinesUpToDate: pet.vaccinesUpToDate,
        vaccines: pet.vaccines,
      });
    });

    revalidatePath('/dashboard/clients');
    return { success: true, message: 'Client et animal enregistrés avec succès !' };
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === '23505'
    ) {
      return { success: false, message: 'Un client avec cet email existe déjà.' };
    }
    return { success: false, message: "Erreur lors de la création du dossier." };
  }
}

/**
 * Ajoute un animal à un client EXISTANT (flux demande web → fiche complète).
 * Champs légaux minimaux : nom, espèce, sexe, n° I-CAD (puce/tatouage).
 */
export async function createPetForClientAction(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole('secretary');

  const clientId = formData.get('clientId');
  const rawData = {
    name: formData.get('name'),
    species: formData.get('species'),
    breed: formData.get('breed') || undefined,
    sex: formData.get('sex'),
    isSterilized: formData.get('isSterilized') === 'on' || formData.get('isSterilized') === 'true',
    birthDate: formData.get('birthDate') || undefined,
    identificationNumber: formData.get('identificationNumber'),
    passportNumber: formData.get('passportNumber') || undefined,
    veterinarianName: formData.get('veterinarianName') || undefined,
    veterinarianPhone: formData.get('veterinarianPhone') || undefined,
    vaccinesUpToDate: formData.get('vaccinesUpToDate') !== 'false',
    vaccines: [],
  };

  const validated = createPetSchema.safeParse(rawData);
  if (!validated.success) {
    return {
      success: false,
      message: 'Certains champs sont invalides.',
      errors: validated.error.flatten().fieldErrors,
    };
  }
  if (typeof clientId !== 'string' || !clientId) {
    return { success: false, message: 'Client introuvable.' };
  }

  try {
    await db.insert(pets).values({ clientId, ...validated.data });
    revalidatePath('/dashboard/clients');
    return { success: true, message: 'Animal ajouté au dossier.' };
  } catch (error) {
    console.error('createPetForClientAction :', error);
    return { success: false, message: "Erreur lors de l'ajout de l'animal." };
  }
}

/**
 * Régénère le lien d'accès espace d'un client (M2) : révoque l'ancien jeton
 * dossier et en émet un nouveau. Le nouveau lien est retourné une seule fois
 * (le jeton n'est jamais stocké en clair) — à transmettre au client par le
 * canal habituel. Rôle secretary/owner.
 */
export async function rotateClientAccessTokenAction(clientId: string): Promise<ActionState> {
  await requireRole('secretary');

  try {
    const newToken = await rotateClientAccessToken(clientId);
    if (!newToken) return { success: false, message: 'Client introuvable.' };
    revalidatePath('/dashboard/clients');
    return {
      success: true,
      message: 'Nouveau lien généré (l’ancien est révoqué) :',
      data: { accessUrl: `${appBaseUrl()}/espace/${newToken}` },
    };
  } catch (error) {
    console.error('rotateClientAccessTokenAction :', error);
    return { success: false, message: 'Erreur lors de la rotation du lien.' };
  }
}
