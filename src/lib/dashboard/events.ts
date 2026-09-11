import { db } from '@/db';
import { bookings, bookingSegments, dailyReports, pets } from '@/db/schema';
import { and, sql } from 'drizzle-orm';
import { getPensionSettings } from '@/lib/settings';

// ---------------------------------------------------------------------------
// Événements du jour (Phase H2) — alimente le nouveau tableau de bord
// ---------------------------------------------------------------------------
// Génération déterministe (aucune IA) : arrivées, départs, tâches staff
// (repas/soins, cochage persisté dans daily_reports), relances de créneaux
// non renseignés (J-15/7/1 selon settings) et paiements attendus.
// ---------------------------------------------------------------------------

export type DayStayEvent = {
  bookingId: string;
  clientId: string;
  clientName: string;
  pets: { id: string; name: string }[];
  timeSlot: string | null;
  unitNames: string | null;
  paymentStatus: string;
  totalPrice: number;
  paidAmount: number;
};

export type TaskEvent = {
  petId: string;
  petName: string;
  species: string;
  unitName: string;
  segmentId: string;
  bookingId: string;
  clientId: string;
  clientName: string;
  dietNotes: string | null;
  medicalNotes: string | null;
  importantNotes: string | null;
  done: boolean;
};

export type ReminderEvent = {
  bookingId: string;
  clientId: string;
  clientName: string;
  daysLeft: number;
  timeSlot: string | null;
};

export type PaymentDueEvent = {
  bookingId: string;
  clientId: string;
  clientName: string;
  remainingCents: number;
  paymentStatus: string;
};

export type DashboardDay = {
  date: string;
  arrivals: DayStayEvent[];
  departures: DayStayEvent[];
  tasks: TaskEvent[];
  reminders: ReminderEvent[];
  paymentsDue: PaymentDueEvent[];
};

export function addDaysIso(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function fetchStayEvents(dateStr: string): Promise<{
  arrivals: DayStayEvent[];
  departures: DayStayEvent[];
}> {
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
      totalPrice: bookings.totalPrice,
      pets: sql<{ id: string; name: string }[] | null>`(
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
      paidAmount: sql<number>`coalesce((
        SELECT sum(pa.amount) FROM payments pa
        WHERE pa.booking_id = ${bookings.id} AND pa.status = 'succeeded'
      ), 0)::int`,
    })
    .from(bookings)
    .innerJoin(sql`clients cl`, sql`cl.id = ${bookings.clientId}`)
    .where(
      sql`(
          ${bookings.status} = 'confirmed'
          and ${bookings.checkInDate}::date = ${dateStr}::date
        ) or (
          ${bookings.status} = 'checked_in'
          and ${bookings.checkOutDate}::date = ${dateStr}::date
        )`
    );

  const toEvent = (row: (typeof rows)[number]): DayStayEvent => ({
    bookingId: row.id,
    clientId: row.clientId,
    clientName: row.clientName,
    pets: row.pets ?? [],
    timeSlot: row.arrivalTimeSlot ?? row.departureTimeSlot ?? null,
    unitNames: row.unitNames,
    paymentStatus: row.paymentStatus,
    totalPrice: row.totalPrice,
    paidAmount: row.paidAmount,
  });

  const arrivals = rows
    .filter((r) => r.status === 'confirmed' && r.checkInDate.toISOString().slice(0, 10) === dateStr)
    .map(toEvent)
    .sort((a, b) => (a.timeSlot ?? '').localeCompare(b.timeSlot ?? ''));

  const departures = rows
    .filter((r) => r.status === 'checked_in' && r.checkOutDate.toISOString().slice(0, 10) === dateStr)
    .map(toEvent)
    .sort((a, b) => (a.timeSlot ?? '').localeCompare(b.timeSlot ?? ''));

  return { arrivals, departures };
}

/**
 * Tâches staff pour une date : animaux réellement présents (segment couvrant
 * la date, départ réel pris en compte), avec alimentation/soins/vigilance.
 * `donePetIds` = cochages du jour (daily_reports), lus par l'appelant.
 */
export async function getTasksForDate(
  dateStr: string,
  donePetIds: Set<string> = new Set()
): Promise<TaskEvent[]> {
  const rows = await db
    .select({
      petId: pets.id,
      petName: pets.name,
      species: pets.species,
      medicalNotes: pets.medicalNotes,
      unitId: bookingSegments.unitId,
      segmentId: bookingSegments.id,
      unitName: sql<string>`u.name`,
      bookingId: bookings.id,
      clientId: sql<string>`cl.id`,
      clientName: sql<string>`cl.first_name || ' ' || cl.last_name`,
      dietNotes: bookings.dietNotes,
      importantNotes: sql<string | null>`(
        SELECT string_agg(n.content, ' | ')
        FROM internal_notes n
        WHERE n.pet_id = pets.id AND n.is_important = true
      )`,
    })
    .from(bookingSegments)
    .innerJoin(bookings, sql`${bookingSegments.bookingId} = ${bookings.id}`)
    .innerJoin(pets, sql`EXISTS (
        SELECT 1 FROM segment_pets sp WHERE sp.segment_id = ${bookingSegments.id} AND sp.pet_id = pets.id
      )`)
    .innerJoin(sql`housing_units u`, sql`u.id = ${bookingSegments.unitId}`)
    .innerJoin(sql`clients cl`, sql`cl.id = ${bookings.clientId}`)
    .where(
      and(
        sql`${bookings.status} in ('confirmed', 'checked_in')`,
        sql`${bookingSegments.startDate} <= ${dateStr}::date`,
        sql`COALESCE(${bookings.actualCheckOut}::date, ${bookingSegments.endDate}) > ${dateStr}::date`,
        sql`${bookingSegments.unitId} is not null`
      )
    )
    .orderBy(sql`u.name`);

  // Un animal peut couvrir plusieurs segments le même jour (changement de box) :
  // on garde un seul item par animal.
  const byPet = new Map<string, TaskEvent>();
  for (const row of rows) {
    if (byPet.has(row.petId)) continue;
    byPet.set(row.petId, {
      petId: row.petId,
      petName: row.petName,
      species: row.species,
      unitName: row.unitName,
      segmentId: row.segmentId,
      bookingId: row.bookingId,
      clientId: row.clientId,
      clientName: row.clientName,
      dietNotes: row.dietNotes,
      medicalNotes: row.medicalNotes,
      importantNotes: row.importantNotes,
      done: donePetIds.has(row.petId),
    });
  }
  return [...byPet.values()];
}

async function fetchTasksWithDone(dateStr: string): Promise<TaskEvent[]> {
  const doneRows = await db
    .select({ petId: dailyReports.petId })
    .from(dailyReports)
    .where(sql`${dailyReports.reportDate} = ${dateStr}::date`);
  const donePetIds = new Set(doneRows.map((r) => r.petId));
  return getTasksForDate(dateStr, donePetIds);
}

async function fetchReminders(dateStr: string, reminderDays: number[]): Promise<ReminderEvent[]> {
  const reminderSet = new Set(reminderDays);
  const rows = await db
    .select({
      id: bookings.id,
      clientId: bookings.clientId,
      clientName: sql<string>`cl.first_name || ' ' || cl.last_name`,
      checkInDate: bookings.checkInDate,
      arrivalTimeSlot: bookings.arrivalTimeSlot,
    })
    .from(bookings)
    .innerJoin(sql`clients cl`, sql`cl.id = ${bookings.clientId}`)
    .where(
      and(
        sql`${bookings.status} = 'confirmed'`,
        sql`${bookings.arrivalTimeSlot} is null`,
        sql`${bookings.checkInDate}::date between (${dateStr}::date + interval '1 day') and (${dateStr}::date + interval '31 days')`
      )
    );

  return rows
    .map((r) => {
      const daysLeft = Math.round(
        (new Date(`${r.checkInDate.toISOString().slice(0, 10)}T00:00:00Z`).getTime() -
          new Date(`${dateStr}T00:00:00Z`).getTime()) /
          (1000 * 3600 * 24)
      );
      return { bookingId: r.id, clientId: r.clientId, clientName: r.clientName, daysLeft, timeSlot: r.arrivalTimeSlot };
    })
    .filter((r) => reminderSet.has(r.daysLeft))
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

async function fetchPaymentsDue(dateStr: string): Promise<PaymentDueEvent[]> {
  const rows = await db
    .select({
      id: bookings.id,
      clientId: bookings.clientId,
      clientName: sql<string>`cl.first_name || ' ' || cl.last_name`,
      paymentStatus: bookings.paymentStatus,
      totalPrice: bookings.totalPrice,
      paidAmount: sql<number>`coalesce((
        SELECT sum(pa.amount) FROM payments pa
        WHERE pa.booking_id = ${bookings.id} AND pa.status = 'succeeded'
      ), 0)::int`,
    })
    .from(bookings)
    .innerJoin(sql`clients cl`, sql`cl.id = ${bookings.clientId}`)
    .where(
      and(
        sql`${bookings.status} in ('confirmed', 'checked_in')`,
        sql`${bookings.paymentStatus} not in ('fully_paid', 'refunded')`,
        sql`${bookings.checkInDate}::date <= (${dateStr}::date + interval '2 days')`
      )
    );

  return rows
    .map((r) => ({
      bookingId: r.id,
      clientId: r.clientId,
      clientName: r.clientName,
      remainingCents: r.totalPrice - r.paidAmount,
      paymentStatus: r.paymentStatus,
    }))
    .filter((r) => r.remainingCents > 0)
    .sort((a, b) => b.remainingCents - a.remainingCents);
}

export async function getDashboardDay(dateStr: string): Promise<DashboardDay> {
  const settings = await getPensionSettings();
  const [stays, tasks, reminders, paymentsDue] = await Promise.all([
    fetchStayEvents(dateStr),
    fetchTasksWithDone(dateStr),
    fetchReminders(dateStr, settings.reminderDays),
    fetchPaymentsDue(dateStr),
  ]);

  return { date: dateStr, arrivals: stays.arrivals, departures: stays.departures, tasks, reminders, paymentsDue };
}