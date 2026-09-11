'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { appointments } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import type { ActionState } from '@/types/actions';
import {
  EVENT_ID_PREFIX,
  deleteCalendarEvent,
  isCalendarConfigured,
  upsertCalendarEvent,
} from '@/lib/integrations/google-calendar';

// ---------------------------------------------------------------------------
// Actions des rdv du planning (Phase H4)
// ---------------------------------------------------------------------------
// L'export Google Calendar est NON-BLOQUANT : il se fait après l'écriture en
// base, dans un try/catch silencieux — un échec (ou une non-configuration)
// n'affecte jamais la réservation du rdv lui-même.
// ---------------------------------------------------------------------------

const appointmentSchema = z.object({
  title: z.string().trim().min(2, 'Titre trop court').max(120),
  type: z.enum(['visit', 'other']),
  startsAtDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide'),
  startsAtTime: z.string().regex(/^\d{2}:\d{2}$/, 'Heure invalide'),
  durationMinutes: z.coerce.number().int().min(5).max(24 * 60),
  clientId: z.string().uuid().optional().or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
});

/**
 * Convertit une date + heure saisies (heure de la pension, Europe/Paris) en
 * instant UTC correct : le serveur est en UTC, une saisie « 14:00 » doit être
 * 14 h à Paris (12 h UTC en été, 13 h en hiver).
 */
function parisLocalToUtc(dateStr: string, timeStr: string): Date {
  const probe = new Date(`${dateStr}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris',
    timeZoneName: 'shortOffset',
  }).formatToParts(probe);
  const tzName = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+1';
  const match = tzName.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  const sign = match?.[1] === '-' ? -1 : 1;
  const offsetMinutes =
    ((match ? Number(match[2]) : 1) * 60 + (match?.[3] ? Number(match[3]) : 0)) * sign;
  // Heure locale = UTC + offset → UTC = heure locale − offset.
  const utcMs = Date.parse(`${dateStr}T${timeStr}:00Z`) - offsetMinutes * 60_000;
  return new Date(utcMs);
}

function toCalendarEvent(row: {
  id: string;
  type: string;
  title: string;
  startsAt: Date;
  durationMinutes: number;
  notes: string | null;
}) {
  return {
    eventId: `${EVENT_ID_PREFIX}rdv-${row.id}`,
    title: `RDV — ${row.title}`,
    description: row.notes ?? undefined,
    start: row.startsAt,
    durationMinutes: row.durationMinutes,
  };
}

export async function createAppointmentAction(formData: FormData): Promise<ActionState> {
  const user = await requireRole('staff');

  const raw = {
    title: formData.get('title'),
    type: formData.get('type') ?? 'visit',
    startsAtDate: formData.get('startsAtDate'),
    startsAtTime: formData.get('startsAtTime'),
    durationMinutes: formData.get('durationMinutes') ?? 30,
    clientId: formData.get('clientId') ?? '',
    notes: formData.get('notes') ?? '',
  };
  const parsed = appointmentSchema.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path.join('.') || 'form';
      (errors[field] ??= []).push(issue.message);
    }
    return { success: false, message: 'Formulaire invalide.', errors };
  }

  const startsAt = parisLocalToUtc(parsed.data.startsAtDate, parsed.data.startsAtTime);
  if (Number.isNaN(startsAt.getTime())) {
    return { success: false, message: 'Date/heure invalide.' };
  }

  try {
    const [row] = await db
      .insert(appointments)
      .values({
        type: parsed.data.type,
        title: parsed.data.title,
        startsAt,
        durationMinutes: parsed.data.durationMinutes,
        clientId: parsed.data.clientId ? parsed.data.clientId : null,
        notes: parsed.data.notes || null,
      })
      .returning();

    // Export non-bloquant vers Google Calendar.
    if (isCalendarConfigured()) {
      try {
        await upsertCalendarEvent(toCalendarEvent(row));
      } catch (error) {
        console.error('createAppointmentAction — export Google Calendar :', error);
      }
    }

    await db.transaction(async (tx) => {
      await logAudit(tx, {
        action: 'appointment.created',
        entityType: 'appointment',
        entityId: row.id,
        actorId: user.id,
        metadata: { title: row.title, type: row.type, startsAt: row.startsAt.toISOString() },
      });
    });

    revalidatePath('/dashboard/planning/rdv');
    return { success: true, message: 'Rendez-vous créé.' };
  } catch (error) {
    console.error('createAppointmentAction :', error);
    return { success: false, message: 'Erreur lors de la création du rdv.' };
  }
}

export async function deleteAppointmentAction(id: string): Promise<ActionState> {
  const user = await requireRole('staff');

  try {
    const [row] = await db.delete(appointments).where(eq(appointments.id, id)).returning();
    if (!row) return { success: false, message: 'Rendez-vous introuvable.' };

    // Suppression de l'événement distant — non-bloquante.
    if (isCalendarConfigured()) {
      try {
        await deleteCalendarEvent(`${EVENT_ID_PREFIX}rdv-${row.id}`);
      } catch (error) {
        console.error('deleteAppointmentAction — suppression Google Calendar :', error);
      }
    }

    await db.transaction(async (tx) => {
      await logAudit(tx, {
        action: 'appointment.deleted',
        entityType: 'appointment',
        entityId: id,
        actorId: user.id,
        metadata: { title: row.title },
      });
    });

    revalidatePath('/dashboard/planning/rdv');
    return { success: true, message: 'Rendez-vous supprimé.' };
  } catch (error) {
    console.error('deleteAppointmentAction :', error);
    return { success: false, message: 'Erreur lors de la suppression.' };
  }
}
/**
 * Adaptateur pour `<form action>` : la signature exigée est `Promise<void>`,
 * l'ActionState détaillé est journalisé côté action (les erreurs de validation
 * sont visibles par l'utilisateur via le re-render des champs invalides).
 */
export async function submitAppointmentFormAction(formData: FormData): Promise<void> {
  const result = await createAppointmentAction(formData);
  if (!result.success) {
    console.warn('submitAppointmentFormAction refusé :', result.message, result.errors);
  }
}
