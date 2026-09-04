'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { assignUnitToSegment } from '@/lib/scheduling/allocation';
import { ActionState } from '@/types/actions';

interface AssignUnitInput {
  bookingId: string;
  segmentId: string;
  unitId: string;
  checkInDate: Date;
  checkOutDate: Date;
}

/**
 * Assigne un box à un segment de réservation après vérification stricte des conflits.
 * La logique (transaction + verrou + re-vérification) vit dans
 * src/lib/scheduling/allocation.ts — ce fichier ne fait que la garde d'accès et
 * la traduction du résultat en ActionState.
 */
export async function assignUnitToBookingSegment(input: AssignUnitInput): Promise<ActionState> {
  // Garde d'autorisation (A2) : l'attribution de box (planning) est réservée au rôle `staff`.
  await requireRole('staff');

  const result = await assignUnitToSegment({
    bookingId: input.bookingId,
    segmentId: input.segmentId,
    unitId: input.unitId,
    startDate: input.checkInDate,
    endDate: input.checkOutDate,
  });

  if (!result.ok) {
    return { success: false, message: result.message };
  }

  revalidatePath('/dashboard/bookings');
  revalidatePath('/dashboard/register');

  return { success: true, message: result.message };
}
