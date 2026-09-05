'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { clients, pets } from '@/db/schema';
import { createClientWithPetSchema } from '@/lib/validations/client-pet';
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