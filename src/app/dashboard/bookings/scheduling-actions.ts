'use server';

import { db } from '@/db';
import { bookingSegments } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { isHousingUnitAvailable } from '@/lib/scheduling/checker';
import { ActionState } from '@/types/actions';
import { requireRole } from '@/lib/auth';

interface AssignUnitInput {
  bookingId: string;
  segmentId: string;
  unitId: string;
  checkInDate: Date;
  checkOutDate: Date;
}

/**
 * Assigne un box à un segment de réservation après vérification stricte des conflits
 */
export async function assignUnitToBookingSegment(input: AssignUnitInput): Promise<ActionState> {
  // Garde d'autorisation (A2) : l'attribution de box (planning) est réservée au rôle `staff`.
  await requireRole('staff');

  try {
    // 1. Vérifier la disponibilité réelle du box sur la période
    const isAvailable = await isHousingUnitAvailable(
      input.unitId, 
      input.checkInDate, 
      input.checkOutDate, 
      input.bookingId
    );

    if (!isAvailable) {
      return { 
        success: false, 
        message: "Conflit détecté : ce box est déjà occupé ou réservé sur cette période." 
      };
    }

    // 2. Mettre à jour l'affectation du segment dans la base de données
    await db
      .update(bookingSegments)
      .set({ unitId: input.unitId })
      .where(eq(bookingSegments.id, input.segmentId));

    return { success: true, message: "Box assigné avec succès au séjour." };
  } catch (error) {
    console.error("Erreur lors de l'assignation du box :", error);
    return { success: false, message: "Impossible d'attribuer ce box." };
  }
}