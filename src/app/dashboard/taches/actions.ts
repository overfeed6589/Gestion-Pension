'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { dailyReports } from '@/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { ActionState } from '@/types/actions';
import { requireRole } from '@/lib/auth';

/**
 * Persiste le cochage « fait » des tâches du jour (G5) : la présence d'une
 * ligne `daily_reports` (animal, date) marque la tâche effectuée ; la
 * suppression la remet à faire. Rôle staff (dev/owner couverts).
 */
export async function toggleDailyTaskDoneAction(
  petId: string,
  segmentId: string,
  date: string,
  done: boolean
): Promise<ActionState> {
  await requireRole('staff');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { success: false, message: 'Date invalide.' };
  }

  try {
    if (done) {
      // Upsert idempotent via l'index unique (pet, date) : la tâche peut être
      // cochée depuis plusieurs segments théoriques, une seule ligne est gardée.
      await db
        .insert(dailyReports)
        .values({ petId, segmentId, reportDate: date })
        .onConflictDoNothing();
    } else {
      await db
        .delete(dailyReports)
        .where(
          and(
            eq(dailyReports.petId, petId),
            sql`${dailyReports.reportDate} = ${date}::date`
          )
        );
    }
    revalidatePath('/dashboard/taches');
    return { success: true, message: done ? 'Tâche effectuée.' : 'Tâche réouverte.' };
  } catch (error) {
    console.error('toggleDailyTaskDoneAction :', error);
    return { success: false, message: 'Erreur lors de la mise à jour de la tâche.' };
  }
}
