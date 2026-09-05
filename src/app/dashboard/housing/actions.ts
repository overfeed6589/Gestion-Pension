'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { housingCategories, housingUnits } from '@/db/schema';
import { createCategorySchema, createUnitSchema } from '@/lib/validations/housing';
import { ActionState } from '@/types/actions';
import { requireRole } from '@/lib/auth';

export async function createHousingCategoryAction(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  // Garde d'autorisation (A2) : les catégories/tarifs de logement sont réservés à
  // `owner`/`dev` (les autres rôles restent en lecture seule sur le parc).
  await requireRole('owner');

  const rawData = {
    name: formData.get('name'),
    description: formData.get('description') || undefined,
    capacity: formData.get('capacity'),
    basePricePerNight: formData.get('basePricePerNight'),
    surchargePerAnimal: formData.get('surchargePerAnimal'),
    isPublic: formData.get('isPublic'),
    publicName: formData.get('publicName') || undefined,
  };

  const validated = createCategorySchema.safeParse(rawData);

  if (!validated.success) {
    return {
      success: false,
      message: 'Formulaire invalide',
      errors: validated.error.flatten().fieldErrors,
    };
  }

  try {
    const priceInCents = Math.round(validated.data.basePricePerNight * 100);
    const surchargeInCents = Math.round((validated.data.surchargePerAnimal ?? 0) * 100);

    await db.insert(housingCategories).values({
      name: validated.data.name,
      description: validated.data.description,
      capacity: validated.data.capacity,
      basePricePerNight: priceInCents,
      surchargePerAnimal: surchargeInCents,
      isPublic: validated.data.isPublic,
      publicName: validated.data.publicName,
    });

    revalidatePath('/dashboard/housing');

    return {
      success: true,
      message: 'Catégorie créée avec succès',
    };
  } catch {
    return {
      success: false,
      message: 'Erreur lors de la création en base de données',
    };
  }
}

export async function createHousingUnitAction(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole('owner');

  const validated = createUnitSchema.safeParse({
    categoryId: formData.get('categoryId'),
    name: formData.get('name'),
  });

  if (!validated.success) {
    return {
      success: false,
      message: 'Formulaire invalide',
      errors: validated.error.flatten().fieldErrors,
    };
  }

  try {
    await db.insert(housingUnits).values({
      categoryId: validated.data.categoryId,
      name: validated.data.name,
      isAvailable: true,
    });

    revalidatePath('/dashboard/housing');

    return { success: true, message: `Box « ${validated.data.name} » ajouté.` };
  } catch {
    return { success: false, message: 'Erreur lors de l’ajout du box.' };
  }
}
