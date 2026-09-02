'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { housingCategories } from '@/db/schema';
import { createCategorySchema } from '@/lib/validations/housing';
import { ActionState } from '@/types/actions';

export async function createHousingCategoryAction(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  // 1. Extraire les données du FormData
  const rawData = {
    name: formData.get('name'),
    description: formData.get('description'),
    capacity: formData.get('capacity'),
    basePricePerNight: formData.get('basePricePerNight'),
  };

  // 2. Valider avec Zod
  const validated = createCategorySchema.safeParse(rawData);

  if (!validated.success) {
    // Formate les erreurs par champ : { name: ["Message..."], capacity: ["Message..."] }
    return {
      success: false,
      message: 'Formulaire invalide',
      errors: validated.error.flatten().fieldErrors,
    };
  }

  try {
    // 3. Conversion & Insertion en BDD (ex: Euros -> Centimes)
    const priceInCents = Math.round(validated.data.basePricePerNight * 100);

    await db.insert(housingCategories).values({
      name: validated.data.name,
      description: validated.data.description,
      capacity: validated.data.capacity,
      basePricePerNight: priceInCents,
    });

    revalidatePath('/dashboard/housing');

    return {
      success: true,
      message: 'Catégorie créée avec succès',
    };
  } catch (error) {
    return {
      success: false,
      message: 'Erreur lors de la création en base de données',
    };
  }
}