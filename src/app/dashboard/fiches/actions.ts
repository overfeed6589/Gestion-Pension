'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { pensionRules } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { ActionState } from '@/types/actions';
import { requireRole } from '@/lib/auth';

const TECH_CATEGORY = 'technique';

export async function saveFicheAction(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole('owner');

  const id = formData.get('id');
  const title = (formData.get('title') as string)?.trim();
  const content = (formData.get('content') as string)?.trim();

  if (!title) return { success: false, message: 'Titre requis.' };
  if (!content) return { success: false, message: 'Contenu requis.' };

  try {
    if (typeof id === 'string' && id) {
      await db
        .update(pensionRules)
        .set({ title, content, updatedAt: new Date() })
        .where(eq(pensionRules.id, id));
    } else {
      await db.insert(pensionRules).values({
        category: TECH_CATEGORY,
        title,
        content,
        isPublic: false,
      });
    }
    revalidatePath('/dashboard/fiches');
    return { success: true, message: 'Fiche enregistrée.' };
  } catch (error) {
    console.error('saveFicheAction :', error);
    return { success: false, message: 'Erreur lors de l’enregistrement.' };
  }
}

export async function deleteFicheAction(id: string): Promise<ActionState> {
  await requireRole('owner');

  try {
    await db.delete(pensionRules).where(eq(pensionRules.id, id));
    revalidatePath('/dashboard/fiches');
    return { success: true, message: 'Fiche supprimée.' };
  } catch (error) {
    console.error('deleteFicheAction :', error);
    return { success: false, message: 'Erreur lors de la suppression.' };
  }
}
