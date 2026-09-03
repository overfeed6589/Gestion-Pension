import { db } from '@/db';
import { eq, and } from 'drizzle-orm';

/**
 * Vérifie si un box (unitId) est disponible sur une période donnée.
 * Exclut optionnellement une réservation existante (utile lors d'une modification).
 */
export interface HousingUnitAvailabilityResult {
  available: boolean;
  freeUnitId?: string;
}

export async function isHousingUnitAvailable(
  unitId: string,
  checkInDate: Date,
  checkOutDate: Date,
  excludeBookingId?: string
): Promise<HousingUnitAvailabilityResult> {
  const overlappingSegments = await db.query.bookingSegments.findMany({
    where: { 
      RAW: (t) => eq(t.unitId, unitId),
    },
    with: {
      booking: true,
    }
  });

  const conflict = overlappingSegments.some((segment) => {
    const booking = segment.booking;
    
    // Utilisation de l'optional chaining (?.) et vérification de nullité
    if (!booking || booking.status === 'cancelled' || (excludeBookingId && booking.id === excludeBookingId)) {
      return false;
    }

    const existingCheckIn = new Date(booking.checkInDate);
    const existingCheckOut = new Date(booking.checkOutDate);

    // Condition de chevauchement de deux plages de dates
    return checkInDate < existingCheckOut && checkOutDate > existingCheckIn;
  });

  return { available: false };
}