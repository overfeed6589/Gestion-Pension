'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { housingCategories, housingUnits, bookingSegments, housingBlocks } from '@/db/schema';
import { createCategorySchema, createUnitSchema } from '@/lib/validations/housing';
import { ActionState } from '@/types/actions';
import { requireRole } from '@/lib/auth';
import { eq, sql } from 'drizzle-orm';

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

/**
 * Bascule un box entre « en service » et « hors service » (maintenance).
 * B3 : `is_available` est réservé à ce hors-service manuel — l'occupation,
 * elle, est dérivée des segments.
 */
export async function toggleHousingUnitAvailabilityAction(unitId: string): Promise<ActionState> {
  await requireRole('owner');

  try {
    const [unit] = await db
      .select({ id: housingUnits.id, isAvailable: housingUnits.isAvailable })
      .from(housingUnits)
      .where(eq(housingUnits.id, unitId))
      .limit(1);
    if (!unit) return { success: false, message: 'Box introuvable.' };

    await db
      .update(housingUnits)
      .set({ isAvailable: !unit.isAvailable })
      .where(eq(housingUnits.id, unitId));

    revalidatePath('/dashboard/housing');
    return {
      success: true,
      message: unit.isAvailable ? 'Box marqué hors service.' : 'Box remis en service.',
    };
  } catch (error) {
    console.error('toggleHousingUnitAvailabilityAction :', error);
    return { success: false, message: 'Erreur lors du changement de disponibilité.' };
  }
}

/** Met à jour un espace (catégorie) : nom, capacité, prix, supplément, public. */
export async function updateHousingCategoryAction(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole('owner');

  const categoryId = formData.get('categoryId');
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
    return { success: false, message: 'Formulaire invalide', errors: validated.error.flatten().fieldErrors };
  }
  if (typeof categoryId !== 'string' || !categoryId) {
    return { success: false, message: 'Catégorie introuvable.' };
  }

  try {
    await db
      .update(housingCategories)
      .set({
        name: validated.data.name,
        description: validated.data.description,
        capacity: validated.data.capacity,
        basePricePerNight: Math.round(validated.data.basePricePerNight * 100),
        surchargePerAnimal: Math.round((validated.data.surchargePerAnimal ?? 0) * 100),
        isPublic: validated.data.isPublic,
        publicName: validated.data.publicName,
      })
      .where(eq(housingCategories.id, categoryId));

    revalidatePath('/dashboard/housing');
    return { success: true, message: 'Espace mis à jour.' };
  } catch (error) {
    console.error('updateHousingCategoryAction :', error);
    return { success: false, message: 'Erreur lors de la mise à jour.' };
  }
}

/** Supprime un espace — refusé s'il possède des box ou un historique de séjours. */
export async function deleteHousingCategoryAction(categoryId: string): Promise<ActionState> {
  await requireRole('owner');

  try {
    const [units] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(housingUnits)
      .where(eq(housingUnits.categoryId, categoryId));
    const [used] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(bookingSegments)
      .where(eq(bookingSegments.categoryId, categoryId));
    if ((units?.n ?? 0) > 0) {
      return { success: false, message: 'Supprimez d’abord les box de cet espace.' };
    }
    if ((used?.n ?? 0) > 0) {
      return { success: false, message: 'Impossible : des séjours utilisent cet espace (historique).' };
    }
    await db.delete(housingCategories).where(eq(housingCategories.id, categoryId));
    revalidatePath('/dashboard/housing');
    return { success: true, message: 'Espace supprimé.' };
  } catch (error) {
    console.error('deleteHousingCategoryAction :', error);
    return { success: false, message: 'Erreur lors de la suppression.' };
  }
}

/** Renomme un box. */
export async function updateHousingUnitAction(unitId: string, name: string): Promise<ActionState> {
  await requireRole('owner');
  if (!name.trim()) return { success: false, message: 'Nom requis.' };

  try {
    await db.update(housingUnits).set({ name: name.trim() }).where(eq(housingUnits.id, unitId));
    revalidatePath('/dashboard/housing');
    return { success: true, message: 'Box renommé.' };
  } catch (error) {
    console.error('updateHousingUnitAction :', error);
    return { success: false, message: 'Erreur lors du renommage.' };
  }
}

/** Supprime un box — refusé s'il a un historique de séjours. */
export async function deleteHousingUnitAction(unitId: string): Promise<ActionState> {
  await requireRole('owner');

  try {
    const [used] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(bookingSegments)
      .where(eq(bookingSegments.unitId, unitId));
    if ((used?.n ?? 0) > 0) {
      return { success: false, message: 'Impossible : ce box a un historique de séjours.' };
    }
    await db.delete(housingBlocks).where(eq(housingBlocks.unitId, unitId));
    await db.delete(housingUnits).where(eq(housingUnits.id, unitId));
    revalidatePath('/dashboard/housing');
    return { success: true, message: 'Box supprimé.' };
  } catch (error) {
    console.error('deleteHousingUnitAction :', error);
    return { success: false, message: 'Erreur lors de la suppression.' };
  }
}
