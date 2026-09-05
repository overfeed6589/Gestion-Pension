'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { generateBookingInvoice } from '@/lib/invoicing/generate';
import { syncInvoiceToPennylane } from '@/lib/integrations/pennylane';
import { ActionState } from '@/types/actions';
import { requireRole } from '@/lib/auth';

/**
 * Génère la facture FINALE d'un séjour (montant = total − acompte déjà réglé).
 * La logique de calcul/lignes vit dans `lib/invoicing/generate.ts` (partagée
 * avec la facture d'acompte émise à la confirmation). Accès `secretary`.
 */
export async function generateFinalInvoiceAction(bookingId: string): Promise<ActionState> {
  await requireRole('secretary');

  try {
    const result = await db.transaction(async (tx) =>
      generateBookingInvoice(tx, bookingId, 'final')
    );

    if (!result.ok) {
      return { success: false, message: result.message };
    }

    // Synchronisation vers Pennylane (best effort : ne fait pas échouer l'action).
    try {
      await syncInvoiceToPennylane(result.invoiceId);
    } catch (pennylaneError) {
      console.error('Erreur lors de la synchro Pennylane :', pennylaneError);
    }

    revalidatePath(`/dashboard/bookings/${bookingId}`);
    revalidatePath('/dashboard/invoices');

    return {
      success: true,
      message: result.created
        ? 'Facture générée et transmise à Pennylane !'
        : 'Une facture finale existe déjà pour cette réservation.',
      data: { invoiceId: result.invoiceId },
    };
  } catch (error) {
    console.error('Erreur de génération de facture :', error);
    return { success: false, message: 'Erreur lors de la création de la facture.' };
  }
}
