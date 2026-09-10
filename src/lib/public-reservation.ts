import { db } from '@/db';
import { clients, pets, bookings, housingCategories, segmentPets } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { buildOfferPlan, type OfferSegmentInput } from '@/lib/offer-plan';
import { buildSegmentsForGroup } from '@/lib/split-plan';
import { createBookingSegmentTx } from '@/lib/scheduling/allocation';
import { computeDepositAmount } from '@/lib/pricing';
import { getPensionSettings } from '@/lib/settings';
import { espaceLinkForClient } from '@/lib/client-access';
import { sendBookingEmailOnce } from '@/lib/outbound-emails';
import { layoutHtml } from '@/lib/integrations/email';
import { appBaseUrl } from '@/lib/integrations/stripe';
import { toDateString } from '@/lib/scheduling/checker';

// ---------------------------------------------------------------------------
// Demande publique → réservation `proposed` (G9)
// ---------------------------------------------------------------------------
// Client : infos de contact + animaux de base (I-CAD optionnel). Option choisie
// = une catégorie complète OU un split suggéré. En une transaction : client
// (créé/réutilisé), animaux créés, jeton dossier garanti, booking `proposed`
// avec segments bloquants. Email E1 de confirmation ensuite (best effort).
// ---------------------------------------------------------------------------

export type PublicPetInput = {
  name: string;
  species: string;
  breed?: string | null;
  sex: string;
  isSterilized: boolean;
  birthDate?: string | null;
  identificationNumber?: string | null;
};

export type ClientOptionInput = {
  /** Couverture complète : une catégorie sur toute la durée. */
  kind: 'category';
  categoryId: string;
  requiredSpaces: number;
} | {
  /** Couverture d'un split : portions séquentielles (sortie de buildSplitPlan). */
  kind: 'split';
  portions: { categoryId: string; startDate: string; endDate: string }[];
};

export type CreatePublicProposalInput = {
  contact: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    address?: string | null;
  };
  checkInDate: string;
  checkOutDate: string;
  petCount: number;
  pets: PublicPetInput[]; // longueur = petCount (ordre = liste des animaux du groupe)
  option: ClientOptionInput;
  consent: true;
  requestNotes?: string | null;
  /** Honeypot anti-spam : invisible côté humain, doit rester vide. */
  website?: string;
};

export type CreatePublicProposalResult =
  | { ok: true; bookingId: string }
  | { ok: false; message: string };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function loadCategoriesFor(ids: string[]) {
  if (ids.length === 0) return new Map<string, (typeof housingCategories.$inferSelect)>();
  const cats = await db
    .select()
    .from(housingCategories)
    .where(inArray(housingCategories.id, [...new Set(ids)]));
  return new Map(cats.map((c) => [c.id, c]));
}

async function insertBookingWithSegments(
  tx: Tx,
  args: {
    clientId: string;
    segments: OfferSegmentInput[];
    checkInDate: string;
    checkOutDate: string;
    requestNotes?: string | null;
  }
): Promise<string> {
  const categoryIds = [...new Set(args.segments.map((s) => s.categoryId))];
  const cats = await tx
    .select()
    .from(housingCategories)
    .where(inArray(housingCategories.id, categoryIds));
  const plan = buildOfferPlan({
    checkInDate: args.checkInDate,
    checkOutDate: args.checkOutDate,
    segments: args.segments,
    categories: cats,
  });
  if (!plan.ok) throw new Error(plan.message);

  const settings = await getPensionSettings();
  const depositAmount = computeDepositAmount(plan.totalPrice, settings.depositPercent);
  const offeredExpiresAt = new Date(Date.now() + settings.offerValidityHours * 3600 * 1000);
  const startStr = toDateString(args.checkInDate);
  const endStr = toDateString(args.checkOutDate);

  const [newBooking] = await tx
    .insert(bookings)
    .values({
      clientId: args.clientId,
      status: 'proposed',
      source: 'web',
      totalPrice: plan.totalPrice,
      depositAmount,
      paymentStatus: 'unpaid',
      checkInDate: new Date(`${startStr}T00:00:00Z`),
      checkOutDate: new Date(`${endStr}T00:00:00Z`),
      offeredExpiresAt,
      rgpdConsentAt: new Date(),
      requestNotes: args.requestNotes ?? null,
    })
    .returning({ id: bookings.id });

  for (const seg of plan.segments) {
    const created = await createBookingSegmentTx(tx, {
      bookingId: newBooking.id,
      categoryId: seg.categoryId,
      checkInDate: seg.startDate,
      checkOutDate: seg.endDate,
      segmentPrice: seg.price,
      autoAssign: true,
    });
    if (!created.ok) {
      throw new Error(created.message);
    }
    if (created.unitId == null) {
      throw new Error('Attribution de box impossible pour un segment.');
    }
    await tx.insert(segmentPets).values(
      seg.petIds.map((petId) => ({ segmentId: created.segmentId, petId }))
    );
  }

  return newBooking.id;
}

export async function createPublicProposal(
  input: CreatePublicProposalInput
): Promise<CreatePublicProposalResult> {
  const email = input.contact.email.trim().toLowerCase();

  try {
    const { bookingId, espaceUrl } = await db.transaction(async (tx) => {
      // 1. Client (existant par email ou créé).
      const [existing] = await tx
        .select({ id: clients.id })
        .from(clients)
        .where(eq(clients.email, email))
        .limit(1);
      let clientId = existing?.id;
      if (!clientId) {
        const [created] = await tx
          .insert(clients)
          .values({
            firstName: input.contact.firstName.trim(),
            lastName: input.contact.lastName.trim(),
            email,
            phone: input.contact.phone.trim(),
            address: input.contact.address?.trim() || null,
          })
          .returning({ id: clients.id });
        clientId = created.id;
      }

      // 2. Lien d'accès espace garanti (jeton dossier neuf ou lien de reprise).
      const { url: espaceUrl } = await espaceLinkForClient(tx, clientId, appBaseUrl());

      // 3. Création des animaux (base, I-CAD optionnel).
      const petIds: string[] = [];
      for (const pet of input.pets) {
        const [created] = await tx
          .insert(pets)
          .values({
            clientId,
            name: pet.name.trim(),
            species: pet.species.trim(),
            breed: pet.breed?.trim() || null,
            sex: pet.sex.trim(),
            isSterilized: pet.isSterilized,
            birthDate: pet.birthDate || null,
            identificationNumber: pet.identificationNumber?.trim() || null,
            vaccinesUpToDate: false,
            vaccines: [],
          })
          .returning({ id: pets.id });
        petIds.push(created.id);
      }
      if (petIds.length !== input.petCount) {
        throw new Error('Le nombre d’animaux renseignés ne correspond pas.');
      }

      // 4. Portions (option choisie) → segments réels.
      const portions =
        input.option.kind === 'category'
          ? [
              {
                categoryId: input.option.categoryId,
                startDate: input.checkInDate,
                endDate: input.checkOutDate,
              },
            ]
          : input.option.portions;

      const catMap = await loadCategoriesFor(portions.map((p) => p.categoryId));
      const portionCats = portions.map((p) => {
        const cat = catMap.get(p.categoryId);
        if (!cat) throw new Error('Catégorie introuvable.');
        return { ...p, capacity: cat.capacity };
      });
      const segments = buildSegmentsForGroup({ petIds, portions: portionCats });

      // 5. Booking `proposed` + segments bloquants.
      const bookingId = await insertBookingWithSegments(tx, {
        clientId,
        segments,
        checkInDate: input.checkInDate,
        checkOutDate: input.checkOutDate,
        requestNotes: input.requestNotes,
      });

      return { bookingId, espaceUrl };
    });

    // 6. Email E1 (best effort, dédupliqué).
    const settings = await getPensionSettings();
    const link = espaceUrl;
    try {
      await sendBookingEmailOnce({
        bookingId,
        kind: 'confirmation_demande',
        to: email,
        subject: 'Demande de réservation bien reçue',
        html: layoutHtml(
          `<h2>Bonjour ${input.contact.firstName},</h2>
           <p>Votre demande de séjour du ${input.checkInDate} au ${input.checkOutDate} est bien reçue.</p>
           <p>Nous la traitons sous 24/48 h : vous recevrez ensuite un lien pour finaliser.</p>
           <p><a href="${link}">Voir mon dossier</a></p>`,
          settings.pensionName
        ),
      });
    } catch (error) {
      console.error('createPublicProposal — email E1 :', error);
    }

    return { ok: true, bookingId };
  } catch (error) {
    console.error('createPublicProposal :', error);
    return {
      ok: false,
      message:
        error instanceof Error && error.message.length < 200
          ? error.message
          : 'Erreur lors de l’envoi de la demande.',
    };
  }
}
