'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { clients, pets } from '@/db/schema';
import { createClientWithPetSchema } from '@/lib/validations/client-pet';
import { ActionState } from '@/types/actions';
import { createClient } from '@/utils/supabase/server';

export async function createClientWithPetAction(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  // 1. Authentification
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, message: 'Non autorisé' };
  }

  // 2. Parsing du payload complexe (les vaccins sont transmis en JSON stringifié)
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

  // 3. Validation Zod
  const validated = createClientWithPetSchema.safeParse(rawData);

  if (!validated.success) {
    return {
      success: false,
      message: 'Certains champs sont invalides.',
      errors: validated.error.flatten().fieldErrors,
    };
  }

  const { pet, ...clientData } = validated.data;

  // 4. Exécution atomique en BDD
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
  } catch (error: any) {
    if (error?.code === '23505') {
      return { success: false, message: 'Un client avec cet email existe déjà.' };
    }
    return { success: false, message: "Erreur lors de la création du dossier." };
  }
}