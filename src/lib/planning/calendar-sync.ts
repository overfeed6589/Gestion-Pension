import { db } from '@/db';
import { bookings } from '@/db/schema';
import { appointments } from '@/db/schema';
import { and, sql } from 'drizzle-orm';
import {
  EVENT_ID_PREFIX,
  isCalendarConfigured,
  upsertCalendarEvent,
} from '@/lib/integrations/google-calendar';

// ---------------------------------------------------------------------------
// Réconciliation Google Calendar (Phase H4) — export one-way
// ---------------------------------------------------------------------------
// Appelée par le cron quotidien : pousse dans l'agenda de la pension les
// arrivées/départs de la semaine à venir + les rdv. Idempotent (ids
// déterministes). Non-bloquant : sans configuration ou en cas d'erreur, on
// journalise et on rend la main — le cron ne doit jamais échouer à cause du
// calendrier.
// ---------------------------------------------------------------------------

function petLabel(names: string | null): string {
  return names ?? 'Animaux';
}

async function syncStayEvents(daysAhead: number): Promise<string[]> {
  const report: string[] = [];
  const rows = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      clientName: sql<string>`cl.first_name || ' ' || cl.last_name`,
      checkInDate: bookings.checkInDate,
      checkOutDate: bookings.checkOutDate,
      arrivalTimeSlot: bookings.arrivalTimeSlot,
      departureTimeSlot: bookings.departureTimeSlot,
      petNames: sql<string | null>`(
        SELECT string_agg(p.name, ', ')
        FROM booking_segments bs
        JOIN segment_pets sp ON sp.segment_id = bs.id
        JOIN pets p ON p.id = sp.pet_id
        WHERE bs.booking_id = ${bookings.id}
      )`,
    })
    .from(bookings)
    .innerJoin(sql`clients cl`, sql`cl.id = ${bookings.clientId}`)
    .where(
      and(
        sql`${bookings.status} in ('confirmed', 'checked_in')`,
        sql`${bookings.checkInDate}::date <= (now() + interval '${sql.raw(String(daysAhead))} days')`,
        sql`coalesce(${bookings.actualCheckOut}, ${bookings.checkOutDate})::date >= now()::date`
      )
    );

  for (const r of rows) {
    const label = petLabel(r.petNames);
    const arrival = await upsertCalendarEvent({
      eventId: `${EVENT_ID_PREFIX}arr-${r.id}`,
      title: `Arrivée — ${label} (${r.clientName})${r.arrivalTimeSlot ? ` ${r.arrivalTimeSlot}` : ''}`,
      description: `Arrivée du séjour de ${label} — propriétaire ${r.clientName}.`,
      start: r.checkInDate,
      durationMinutes: 30,
    });
    report.push(`cal-arr:${arrival.ok ? 'ok' : (arrival.reason ?? 'ko')}`);

    const departure = await upsertCalendarEvent({
      eventId: `${EVENT_ID_PREFIX}dep-${r.id}`,
      title: `Départ — ${label} (${r.clientName})${r.departureTimeSlot ? ` ${r.departureTimeSlot}` : ''}`,
      description: `Départ du séjour de ${label} — propriétaire ${r.clientName}.`,
      start: r.checkOutDate,
      durationMinutes: 30,
    });
    report.push(`cal-dep:${departure.ok ? 'ok' : (departure.reason ?? 'ko')}`);
  }
  return report;
}

async function syncAppointments(daysAhead: number): Promise<string[]> {
  const rows = await db
    .select()
    .from(appointments)
    .where(
      sql`${appointments.startsAt}::date between now()::date and (now() + interval '${sql.raw(String(daysAhead))} days')`
    );

  const report: string[] = [];
  for (const a of rows) {
    const res = await upsertCalendarEvent({
      eventId: `${EVENT_ID_PREFIX}rdv-${a.id}`,
      title: `${a.type === 'visit' ? 'Visite' : 'RDV'} — ${a.title}`,
      description: a.notes ?? undefined,
      start: a.startsAt,
      durationMinutes: a.durationMinutes,
    });
    report.push(`cal-rdv:${res.ok ? 'ok' : (res.reason ?? 'ko')}`);
  }
  return report;
}

/**
 * Réconciliation de la semaine à venir. Renvoie un rapport texte court pour le
 * cron. Jamais d'exception : tout est capturé.
 */
export async function reconcileCalendar(daysAhead = 7): Promise<string[]> {
  if (!isCalendarConfigured()) {
    return ['google-calendar: non configuré — export ignoré'];
  }
  const report: string[] = [];
  try {
    const stays = await syncStayEvents(daysAhead);
    report.push(...stays);
    const rdv = await syncAppointments(daysAhead);
    report.push(...rdv);
  } catch (error) {
    console.error('reconcileCalendar :', error);
    report.push('cal:erreur (voir logs)');
  }
  return report;
}