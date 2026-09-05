'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { pensionSettings } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { ActionState } from '@/types/actions';
import { requireRole } from '@/lib/auth';

/**
 * Met à jour (ou insère) la ligne unique `pension_settings` (id = 'singleton').
 * Réservé à `owner`/`dev`.
 */
export async function savePensionSettingsAction(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole('owner');

  const values = {
    pensionName: (formData.get('pensionName') as string)?.trim(),
    legalAddress: (formData.get('legalAddress') as string)?.trim() || null,
    siret: (formData.get('siret') as string)?.trim() || null,
    contactEmail: (formData.get('contactEmail') as string)?.trim() || null,
    phone: (formData.get('phone') as string)?.trim() || null,
    depositPercent: Number(formData.get('depositPercent')),
    cancellationRefundDays: Number(formData.get('cancellationRefundDays')),
    offerValidityHours: Number(formData.get('offerValidityHours')),
    publicDomain: (formData.get('publicDomain') as string)?.trim() || null,
    logoUrl: (formData.get('logoUrl') as string)?.trim() || null,
  };

  if (!values.pensionName) return { success: false, message: 'Le nom de la pension est requis.' };
  if (
    !Number.isFinite(values.depositPercent) ||
    values.depositPercent < 0 ||
    values.depositPercent > 100
  ) {
    return { success: false, message: 'Acompte en % invalide (0-100).' };
  }
  if (
    !Number.isFinite(values.cancellationRefundDays) ||
    values.cancellationRefundDays < 0 ||
    !Number.isFinite(values.offerValidityHours) ||
    values.offerValidityHours < 1
  ) {
    return { success: false, message: 'Valeurs numériques invalides.' };
  }

  try {
    const existing = await db
      .select({ id: pensionSettings.id })
      .from(pensionSettings)
      .where(eq(pensionSettings.id, 'singleton'))
      .limit(1);

    const payload = { ...values, updatedAt: new Date() };
    if (existing[0]) {
      await db.update(pensionSettings).set(payload).where(eq(pensionSettings.id, 'singleton'));
    } else {
      await db.insert(pensionSettings).values({ id: 'singleton', ...payload });
    }

    revalidatePath('/dashboard/parametres');
    return { success: true, message: 'Paramètres enregistrés.' };
  } catch (error) {
    console.error('savePensionSettingsAction :', error);
    return { success: false, message: 'Erreur lors de l’enregistrement.' };
  }
}
