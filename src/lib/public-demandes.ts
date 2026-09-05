import { db } from '@/db';
import { clients, bookings } from '@/db/schema';
import { eq } from 'drizzle-orm';
import type { PublicDemandeInput } from '@/lib/validations/public';

// ---------------------------------------------------------------------------
// Demande publique (Phase G — Lot 2)
// ---------------------------------------------------------------------------
// Sans authentification. Crée (ou réutilise) un dossier client par email, puis
// enregistre une réservation `requested` (source web, aucun segment) : aucun
// espace n'est réservé tant que le personnel n'a pas bâti l'offre.
// ---------------------------------------------------------------------------

export type PublicDemandeResult =
  | { ok: true; bookingId: string; createdClient: boolean }
  | { ok: false; message: string };

export async function createPublicDemande(
  input: PublicDemandeInput
): Promise<PublicDemandeResult> {
  const startStr = input.checkInDate;
  const endStr = input.checkOutDate;
  if (startStr >= endStr) {
    return { ok: false, message: 'La date de départ doit être postérieure à la date d’arrivée.' };
  }

  const email = input.email.trim().toLowerCase();

  try {
    return await db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: clients.id })
        .from(clients)
        .where(eq(clients.email, email))
        .limit(1);

      let clientId: string;
      let createdClient = false;
      if (existing[0]) {
        clientId = existing[0].id;
      } else {
        const [newClient] = await tx
          .insert(clients)
          .values({
            firstName: input.firstName.trim(),
            lastName: input.lastName.trim(),
            email,
            phone: input.phone.trim(),
            address: null,
          })
          .returning({ id: clients.id });
        clientId = newClient.id;
        createdClient = true;
      }

      const notes = [
        `Demande web — ${input.petCount} animal/animaux.`,
        input.message?.trim() ? `Message : ${input.message.trim()}` : '',
      ]
        .filter(Boolean)
        .join(' ');

      const [newBooking] = await tx
        .insert(bookings)
        .values({
          clientId,
          status: 'requested',
          source: 'web',
          totalPrice: 0,
          depositAmount: 0,
          paymentStatus: 'unpaid',
          checkInDate: new Date(`${startStr}T00:00:00Z`),
          checkOutDate: new Date(`${endStr}T00:00:00Z`),
          rgpdConsentAt: new Date(),
          requestNotes: notes,
        })
        .returning({ id: bookings.id });

      return { ok: true as const, bookingId: newBooking.id, createdClient };
    });
  } catch (error) {
    console.error('createPublicDemande :', error);
    return { ok: false, message: 'Erreur lors de l’envoi de la demande.' };
  }
}
