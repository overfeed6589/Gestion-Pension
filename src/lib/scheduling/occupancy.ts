import { db } from '@/db';

export async function getOccupancyRateForDate(targetDate: Date) {
  const targetStr = targetDate.toISOString().split('T')[0];

  // Récupération des catégories avec leurs unités et la relation correcte 'housingSegments'
  const categories = await db.query.housingCategories.findMany({
    with: {
      units: {
        with: {
          bookingSegments: {
            with: {
              booking: true,
            },
          },
        },
      },
    },
  });

  let totalUnits = 0;
  let occupiedUnits = 0;

  for (const category of categories) {
    for (const unit of category.units) {
      totalUnits++;
      
      // On vérifie l'occupation via housingSegments
      const isOccupiedOnDate = unit.bookingSegments.some((segment) => {
        const b = segment.booking;
        if (!b || b.status === 'cancelled' || b.status === 'checked_out') return false;

        const checkIn = new Date(b.checkInDate).toISOString().split('T')[0];
        const checkOut = new Date(b.checkOutDate).toISOString().split('T')[0];

        return targetStr >= checkIn && targetStr < checkOut;
      });

      if (isOccupiedOnDate || !unit.isAvailable) {
        occupiedUnits++;
      }
    }
  }

  return {
    totalUnits,
    occupiedUnits,
    occupancyRate: totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0,
  };
}