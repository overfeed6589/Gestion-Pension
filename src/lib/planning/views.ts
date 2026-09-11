import { db } from '@/db';
import { bookings, bookingSegments, pets } from '@/db/schema';
import { and, sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Vues planning (Phase H4)
// ---------------------------------------------------------------------------
// 1. Vue semaine RDV : arrivées / départs (réservations) + rdv (appointments)
//    sur 7 jours.
// 2. Vue 2 mois par box : pour chaque unité, les animaux présents jour par
//    jour (dérivé des segments, départ réel pris en compte — cohérent avec
//    la sémantique d'occupation de lib/scheduling).
// ---------------------------------------------------------------------------

export type PlanningEvent = {
  bookingId: string;
  clientId: string;
  clientName: string;
  petNames: { id: string; name: string }[];
  timeSlot: string | null;
  unitNames: string | null;
  paymentStatus: string;
};

export type PlanningAppointment = {
  id: string;
  type: string;
  title: string;
  startsAt: Date;
  durationMinutes: number;
  clientId: string | null;
  clientName: string | null;
  notes: string | null;
};

export type PlanningDay = {
  date: string;
  arrivals: PlanningEvent[];
  departures: PlanningEvent[];
  appointments: PlanningAppointment[];
};

export async function getWeekPlanning(weekStartIso: string): Promise<PlanningDay[]> {
  const rows = await db
    .select({
      id: bookings.id,
      clientId: bookings.clientId,
      status: bookings.status,
      clientName: sql<string>`cl.first_name || ' ' || cl.last_name`,
      checkInDate: bookings.checkInDate,
      checkOutDate: bookings.checkOutDate,
      arrivalTimeSlot: bookings.arrivalTimeSlot,
      departureTimeSlot: bookings.departureTimeSlot,
      paymentStatus: bookings.paymentStatus,
      petNames: sql<{ id: string; name: string }[] | null>`(
        SELECT json_agg(json_build_object('id', p.id, 'name', p.name))
        FROM booking_segments bs
        JOIN segment_pets sp ON sp.segment_id = bs.id
        JOIN pets p ON p.id = sp.pet_id
        WHERE bs.booking_id = ${bookings.id}
      )`,
      unitNames: sql<string | null>`(
        SELECT string_agg(DISTINCT u.name, ', ')
        FROM booking_segments bs
        JOIN housing_units u ON u.id = bs.unit_id
        WHERE bs.booking_id = ${bookings.id}
      )`,
    })
    .from(bookings)
    .innerJoin(sql`clients cl`, sql`cl.id = ${bookings.clientId}`)
    .where(
      sql`(
          ${bookings.status} = 'confirmed'
          and ${bookings.checkInDate}::date between ${weekStartIso}::date and (${weekStartIso}::date + interval '6 days')
        ) or (
          ${bookings.status} = 'checked_in'
          and ${bookings.checkOutDate}::date between ${weekStartIso}::date and (${weekStartIso}::date + interval '6 days')
        )`
    );

  const appointmentRows = await db
    .select({
      id: sql<string>`a.id`,
      type: sql<string>`a.type`,
      title: sql<string>`a.title`,
      startsAt: sql<Date>`a.starts_at`,
      durationMinutes: sql<number>`a.duration_minutes`,
      clientId: sql<string | null>`a.client_id`,
      clientName: sql<string | null>`cl.first_name || ' ' || cl.last_name`,
      notes: sql<string | null>`a.notes`,
    })
    .from(sql`appointments a`)
    .leftJoin(sql`clients cl`, sql`cl.id = a.client_id`)
    .where(
      sql`a.starts_at::date between ${weekStartIso}::date and (${weekStartIso}::date + interval '6 days')`
    )
    .orderBy(sql`a.starts_at`);

  const toEvent = (r: (typeof rows)[number]): PlanningEvent => ({
    bookingId: r.id,
    clientId: r.clientId,
    clientName: r.clientName,
    petNames: r.petNames ?? [],
    timeSlot: r.arrivalTimeSlot ?? r.departureTimeSlot ?? null,
    unitNames: r.unitNames,
    paymentStatus: r.paymentStatus,
  });

  return [...Array(7).keys()].map((offset) => {
    const date = addDaysIso(weekStartIso, offset);
    return {
      date,
      arrivals: rows
        .filter((r) => r.status === 'confirmed' && r.checkInDate.toISOString().slice(0, 10) === date)
        .map(toEvent),
      departures: rows
        .filter((r) => r.status === 'checked_in' && r.checkOutDate.toISOString().slice(0, 10) === date)
        .map(toEvent),
      appointments: appointmentRows
        .filter((a) => (a.startsAt instanceof Date ? a.startsAt : new Date(a.startsAt)).toISOString().slice(0, 10) === date),
    };
  });
}

export type BoxOccupancyStay = {
  petId: string;
  petName: string;
  bookingId: string;
  clientName: string;
  startDate: string;
  endDate: string; // exclusif (départ réel pris en compte)
};

export type BoxOccupancyRow = {
  unitId: string;
  unitName: string;
  categoryName: string;
  isAvailable: boolean;
  stays: BoxOccupancyStay[];
};

/**
 * Occupation par box sur une plage : chaque séjour (segment couvrant une part
 * de la plage) est rattaché à son unité avec ses animaux.
 */
export async function getBoxOccupancy(rangeStartIso: string, rangeEndIso: string): Promise<{
  rows: BoxOccupancyRow[];
  totalUnits: number;
}> {
  const stayRows = await db
    .select({
      unitId: bookingSegments.unitId,
      unitName: sql<string>`u.name`,
      unitOrder: sql<string>`u.name`,
      categoryName: sql<string>`c.name`,
      isAvailable: sql<boolean>`u.is_available`,
      startDate: bookingSegments.startDate,
      endDate: sql<string>`coalesce(${bookings.actualCheckOut}::date, ${bookingSegments.endDate})`,
      petId: pets.id,
      petName: pets.name,
      bookingId: bookings.id,
      clientName: sql<string>`cl.first_name || ' ' || cl.last_name`,
    })
    .from(bookingSegments)
    .innerJoin(bookings, sql`${bookingSegments.bookingId} = ${bookings.id}`)
    .innerJoin(sql`housing_units u`, sql`u.id = ${bookingSegments.unitId}`)
    .innerJoin(sql`housing_categories c`, sql`c.id = u.category_id`)
    .innerJoin(pets, sql`EXISTS (
        SELECT 1 FROM segment_pets sp WHERE sp.segment_id = ${bookingSegments.id} AND sp.pet_id = pets.id
      )`)
    .innerJoin(sql`clients cl`, sql`cl.id = ${bookings.clientId}`)
    .where(
      and(
        sql`${bookings.status} in ('confirmed', 'checked_in')`,
        sql`${bookingSegments.startDate} <= (${rangeEndIso}::date + interval '1 day')`,
        sql`coalesce(${bookings.actualCheckOut}::date, ${bookingSegments.endDate}) >= ${rangeStartIso}::date`
      )
    );

  // Unités de référence : toutes les unités actives, classées par catégorie.
  const unitRows = await db
    .select({
      unitId: sql<string>`u.id`,
      unitName: sql<string>`u.name`,
      categoryName: sql<string>`c.name`,
      categoryOrder: sql<string>`c.name`,
      isAvailable: sql<boolean>`u.is_available`,
    })
    .from(sql`housing_units u`)
    .innerJoin(sql`housing_categories c`, sql`c.id = u.category_id`)
    .orderBy(sql`c.name, u.name`);

  const byUnit = new Map<string, BoxOccupancyRow>();
  for (const u of unitRows) {
    byUnit.set(u.unitId, {
      unitId: u.unitId,
      unitName: u.unitName,
      categoryName: u.categoryName,
      isAvailable: u.isAvailable,
      stays: [],
    });
  }

  // Un même (booking, pet, unité) peut apparaître plusieurs fois si plusieurs
  // segments — on ne garde que la plus longue plage.
  const seen = new Map<string, BoxOccupancyStay>();
  for (const r of stayRows) {
    const unitId = r.unitId;
    if (!unitId) continue;
    const row = byUnit.get(unitId);
    if (!row) continue;
    const key = `${unitId}:${r.petId}:${r.bookingId}`;
    const stay: BoxOccupancyStay = {
      petId: r.petId,
      petName: r.petName,
      bookingId: r.bookingId,
      clientName: r.clientName,
      startDate: r.startDate,
      endDate: r.endDate,
    };
    const existing = seen.get(key);
    if (existing) {
      existing.startDate = existing.startDate < stay.startDate ? existing.startDate : stay.startDate;
      existing.endDate = existing.endDate > stay.endDate ? existing.endDate : stay.endDate;
    } else {
      seen.set(key, stay);
      row.stays.push(stay);
    }
  }
  for (const row of byUnit.values()) {
    row.stays.sort((a, b) => a.startDate.localeCompare(b.startDate));
  }

  return {
    rows: [...byUnit.values()],
    totalUnits: unitRows.length,
  };
}

export function addDaysIso(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}