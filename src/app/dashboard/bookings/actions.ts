'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { bookings, bookingSegments, housingUnits } from '@/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { ActionState } from '@/types/actions';
import { requireUser } from '@/lib/auth';

interface Vaccine {
  name: string;
  expiresAt: string; // Date au format YYYY-MM-DD
}

/**
 * Valide l'arrivée effective de l'animal (Check-in)
 */
export async function checkInBookingAction(bookingId: string): Promise<ActionState> {
  // Garde d'authentification (Phase A1) : toute action serveur doit être liée à une session.
  await requireUser();

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

      // 2. Récupérer les segments pour libérer/occuper les unités de logement associées si besoin
      const segments = await tx.query.bookingSegments.findMany({
        where: { RAW: (t) => eq(bookingSegments.bookingId, bookingId),},
      });

      // Optionnel : Si une unité physique est assignée, on peut marquer l'unité comme occupée / indisponible
      for (const segment of segments) {
        if (segment.unitId) {
          await tx
            .update(housingUnits)
            .set({ isAvailable: false })
            .where(eq(housingUnits.id, segment.unitId));
        }
      }

      
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
  await requireUser();

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

      // 2. Récupérer les segments pour libérer les unités de logement
      const segments = await tx.query.bookingSegments.findMany({
        where: { RAW: (t) => eq(bookingSegments.bookingId, bookingId),},
      });
//where: { RAW: (t) => eq(bookings.id, bookingId),},
      // 3. Libérer les box correspondants
      for (const segment of segments) {
        if (segment.unitId) {
          await tx
            .update(housingUnits)
            .set({ isAvailable: true })
            .where(eq(housingUnits.id, segment.unitId));
        }
      }
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
export async function getLegalRegisterEntries(dateStr?: string) {
  // Lecture de données personnelles : nécessite une session (Phase A1).
  await requireUser();

  const targetDate = dateStr ? new Date(dateStr) : new Date();

  // On récupère les réservations qui couvrent cette période ou ont eu lieu
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