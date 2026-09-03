import { db } from '@/db';
import { bookingSegments } from '@/db/schema';
import { isHousingUnitAvailable } from './checker';

interface CreateSegmentInput {
  bookingId: string;
  categoryId: string;
  checkInDate: Date;
  checkOutDate: Date;
  segmentPrice: number;
  autoAssign?: boolean;
}

export async function createBookingSegment(input: CreateSegmentInput) {
  // 1. Appel de la fonction de vérification
  const availability = await isHousingUnitAvailable(
    input.categoryId,
    input.checkInDate,
    input.checkOutDate
  );

  // TypeScript reconnaît désormais parfaitement 'available'
  if (!availability.available) {
    throw new Error("Aucune unité disponible dans cette catégorie sur cette période.");
  }

  // 2. Extraction sécurisée de l'unité attribuée
  const targetUnitId: string | null = input.autoAssign && availability.freeUnitId 
    ? availability.freeUnitId 
    : null;

  // 3. Insertion typée Drizzle
  const [newSegment] = await db
    .insert(bookingSegments)
    .values({
      bookingId: input.bookingId,
      categoryId: input.categoryId,
      unitId: targetUnitId,
      startDate: input.checkInDate.toISOString(),
      endDate: input.checkOutDate.toISOString(),
      segmentPrice: input.segmentPrice,
    })
    .returning();

  return {
    success: true,
    segment: newSegment,
    assignedManually: !targetUnitId,
  };
}