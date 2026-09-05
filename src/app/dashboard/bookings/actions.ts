'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { bookings } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { ActionState } from '@/types/actions';
import { requireRole } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

/**
 * Valide l'arrivée effective de l'animal (Check-in)
 */
export async function checkInBookingAction(bookingId: string): Promise<ActionState> {
  // Garde d'autorisation (A2) : le registre/check-in est réservé au rôle `staff`
  // (dev/owner couverts). L'utilisateur doit aussi être authentifié (A1).
  const actor = await requireRole('staff');

  try {
    await db.transaction(async (tx) => {
      // 1. Mettre à jour la réservation : statut et date réelle d'entrée
      const [updatedBooking] = await tx
        .update(bookings)
        .set({
          status: 'checked_in',
          actualCheckIn: new Date(),
        })
        .where(eq(bookings.id, bookingId))
        .returning();

      if (!updatedBooking) {
        throw new Error("Réservation introuvable.");
      }

      // B3 : l'occupation est DÉRIVÉE des segments (checker/allocation/occupancy).
      // On ne touche plus à `housing_units.is_available` (réservé au « hors
      // service » manuel). Un check-in ne modifie donc que le booking.

      // Phase C : traçabilité du mouvement.
      await logAudit(tx, {
        action: 'booking.check_in',
        entityType: 'booking',
        entityId: bookingId,
        actorId: actor.id,
        metadata: { checkedInAt: new Date().toISOString() },
      });
    });

    revalidatePath(`/dashboard/bookings/${bookingId}`);
    revalidatePath('/dashboard/bookings');
    revalidatePath('/dashboard/register'); // Page du registre légal

    return { success: true, message: "Check-in enregistré avec succès." };
  } catch (error) {
    console.error("Erreur lors du check-in :", error);
    return { success: false, message: "Impossible d'effectuer le check-in." };
  }
}

/**
 * Valide le départ effectif de l'animal (Check-out) et libère le box
 */
export async function checkOutBookingAction(bookingId: string): Promise<ActionState> {
  const actor = await requireRole('staff');

  try {
    await db.transaction(async (tx) => {
      // 1. Mettre à jour la réservation : statut et date réelle de sortie
      const [updatedBooking] = await tx
        .update(bookings)
        .set({
          status: 'checked_out',
          actualCheckOut: new Date(),
        })
        .where(eq(bookings.id, bookingId))
        .returning();

      if (!updatedBooking) {
        throw new Error("Réservation introuvable.");
      }
      // B3 : l'occupation est DÉRIVÉE des segments. Un départ réel (anticipé ou
      // non) libère l'unité via `COALESCE(actual_check_out, end_date)` dans
      // checker/allocation/occupancy. On ne mute pas `is_available`.

      // Phase C : traçabilité du mouvement.
      await logAudit(tx, {
        action: 'booking.check_out',
        entityType: 'booking',
        entityId: bookingId,
        actorId: actor.id,
        metadata: { checkedOutAt: new Date().toISOString() },
      });
    });

    revalidatePath(`/dashboard/bookings/${bookingId}`);
    revalidatePath('/dashboard/bookings');
    revalidatePath('/dashboard/register');

    return { success: true, message: "Check-out enregistré, box libéré." };
  } catch (error) {
    console.error("Erreur lors du check-out :", error);
    return { success: false, message: "Impossible d'effectuer le check-out." };
  }
}

//Registre des Entrées/Sorties
export async function getLegalRegisterEntries() {
  // Lecture du registre (données personnelles) : accès `staff` (A2).
  await requireRole('staff');

  // On récupère les réservations pertinentes pour le registre légal
  const activeBookings = await db.query.bookings.findMany({
    with: {
      client: true,
      segments: {
        with: {
          occupantLinks: {
            with: {
              pet: true, // Récupération des infos I-CAD (identificationNumber, race, etc.)
            },
          },
          assignedUnit: {
            with: {
              category: true,
            },
          },
        },
      },
    },
  });

  return activeBookings;
}