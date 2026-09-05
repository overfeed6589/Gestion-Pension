import { db } from '@/db';
import { bookings, bookingSegments, housingCategories, housingUnits } from '@/db/schema';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { toDateString } from './checker';

// ---------------------------------------------------------------------------
// Occupation dérivée des segments (Phase B3 — correctif review)
// ---------------------------------------------------------------------------
// Raisons :
//  - L'ancienne version filtrait en JS sur les dates du BOOKING et se fiait au
//    booléen mutable `housing_units.is_available` comme source de vérité.
//  - Ici l'occupation est DÉRIVÉE des réservations : une unité est considérée
//    occupée à la date d s'il existe un segment actif (réservation non annulée)
//    tel que `start <= d < effective_end`, avec
//    `effective_end = COALESCE(actual_check_out, segment.end_date)`.
//    => départ réel pris en compte (départ anticipé → unité libre), aucune
//    dépendance au booléen `is_available` (réservé au « hors service » manuel).
//  - Règle identique à celle de la disponibilité (checker.ts / allocation.ts) :
//    taux cohérent avec la possibilité d'allouer.
// ---------------------------------------------------------------------------

export type UnitOccupancy = {
  unitId: string;
  unitName: string;
  categoryName: string;
  occupied: boolean;
};

export type OccupancyStats = {
  totalUnits: number;
  occupiedUnits: number;
  freeUnits: number;
  occupancyRate: number;
  units: UnitOccupancy[];
};

/** Ids des unités occupées à la date donnée (réservations actives). */
async function getOccupiedUnitIdsForDate(dateStr: string): Promise<Set<string>> {
  const rows = await db
    .select({ unitId: bookingSegments.unitId })
    .from(bookingSegments)
    .innerJoin(bookings, eq(bookingSegments.bookingId, bookings.id))
    .where(
      and(
        isNotNull(bookingSegments.unitId),
        // `cancelled` / `expired` ne comptent pas comme occupés.
        sql`${bookings.status} not in ('cancelled', 'expired')`,
        sql`${bookingSegments.startDate} <= ${dateStr}::date`,
        sql`COALESCE(${bookings.actualCheckOut}::date, ${bookingSegments.endDate}) > ${dateStr}::date`
      )
    );

  const ids = new Set<string>();
  for (const row of rows) {
    if (row.unitId) ids.add(row.unitId);
  }
  return ids;
}

/**
 * Statistiques d'occupation du parc pour une date donnée (réservation-based).
 * Nom gardé pour compatibilité avec l'ancienne API (aucun appelant à ce jour).
 */
export async function getOccupancyRateForDate(targetDate: Date | string): Promise<OccupancyStats> {
  const dateStr = toDateString(targetDate);

  const [occupiedIds, units] = await Promise.all([
    getOccupiedUnitIdsForDate(dateStr),
    db
      .select({
        id: housingUnits.id,
        name: housingUnits.name,
        categoryName: housingCategories.name,
      })
      .from(housingUnits)
      .innerJoin(housingCategories, eq(housingUnits.categoryId, housingCategories.id)),
  ]);

  const unitsWithStatus: UnitOccupancy[] = units.map((unit) => ({
    unitId: unit.id,
    unitName: unit.name,
    categoryName: unit.categoryName,
    occupied: occupiedIds.has(unit.id),
  }));

  const totalUnits = unitsWithStatus.length;
  const occupiedUnits = unitsWithStatus.filter((u) => u.occupied).length;
  const freeUnits = totalUnits - occupiedUnits;

  return {
    totalUnits,
    occupiedUnits,
    freeUnits,
    occupancyRate: totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0,
    units: unitsWithStatus,
  };
}

/** Occupation détaillée unité par unité (utile pour les vues planning). */
export async function getUnitOccupancyForDate(
  targetDate: Date | string
): Promise<UnitOccupancy[]> {
  const stats = await getOccupancyRateForDate(targetDate);
  return stats.units;
}
