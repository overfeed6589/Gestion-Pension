'use server';

// ---------------------------------------------------------------------------
// Loaders des fiches pop-up (Phase H1) — lecture seule
// ---------------------------------------------------------------------------
// Appelés depuis des composants clients (fenêtres empilées) : PAS de redirect
// (une server action qui redirect déclencherait une navigation complète),
// on renvoie un résultat typé `FicheResult` et le client affiche l'erreur.
// Lecture autorisée aux rôles internes (secretary/staff + boss) — la matrice
// PLAN.md donne la lecture client/animaux/réservations à tous les rôles staff.
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { canAccess, getCurrentProfile } from '@/lib/auth';
import type {
  FicheAnimalData,
  FicheClientData,
  FicheData,
  FicheKind,
  FicheReservationData,
  FicheResult,
} from '@/types/fiches';

const ficheIdSchema = z.uuid();

async function guardFicheRead(): Promise<string | null> {
  const profile = await getCurrentProfile();
  if (!profile) return 'Session expirée — rechargez la page.';
  if (!canAccess(profile.role, ['secretary', 'staff'])) return 'Accès refusé.';
  return null;
}

function guardResult(kind: FicheKind, message: string): FicheResult {
  return { ok: false, message: `Fiche ${kind} : ${message}` };
}

/** Point d'entrée unique : charge les données d'une fiche selon son kind. */
export async function loadFiche(kind: FicheKind, id: string): Promise<FicheResult> {
  const denial = await guardFicheRead();
  if (denial) return guardResult(kind, denial);

  const parsedId = ficheIdSchema.safeParse(id);
  if (!parsedId.success) return guardResult(kind, 'Identifiant invalide.');

  try {
    let fiche: FicheData;
    switch (kind) {
      case 'client': {
        const data = await fetchFicheClient(parsedId.data);
        if (!data) return guardResult(kind, 'Client introuvable.');
        fiche = { kind: 'client', data };
        break;
      }
      case 'pet': {
        const data = await fetchFicheAnimal(parsedId.data);
        if (!data) return guardResult(kind, 'Animal introuvable.');
        fiche = { kind: 'pet', data };
        break;
      }
      case 'booking': {
        const data = await fetchFicheReservation(parsedId.data);
        if (!data) return guardResult(kind, 'Réservation introuvable.');
        fiche = { kind: 'booking', data };
        break;
      }
      default:
        return guardResult(kind, 'Type de fiche inconnu.');
    }
    return { ok: true, fiche };
  } catch (error) {
    console.error(`loadFiche(${kind}, ${id}) a échoué`, error);
    return guardResult(kind, 'Erreur de chargement.');
  }
}

async function fetchFicheClient(id: string): Promise<FicheClientData | null> {
  const row = await db.query.clients.findFirst({
    where: { RAW: (t) => eq(t.id, id) },
    with: {
      pets: true,
      bookings: true,
      invoices: true,
    },
  });
  if (!row) return null;

  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    address: row.address,
    emergencyContactName: row.emergencyContactName,
    emergencyContactPhone: row.emergencyContactPhone,
    isB2b: row.isB2b,
    siret: row.siret,
    createdAt: row.createdAt.toISOString(),
    pets: row.pets.map((p) => ({
      id: p.id,
      name: p.name,
      species: p.species,
      breed: p.breed,
    })),
    bookings: row.bookings
      .map((b) => toBookingSummary(b))
      .sort((a, b) => b.checkInDate.localeCompare(a.checkInDate)),
    invoicesCount: row.invoices.length,
  };
}

async function fetchFicheAnimal(id: string): Promise<FicheAnimalData | null> {
  const row = await db.query.pets.findFirst({
    where: { RAW: (t) => eq(t.id, id) },
    with: {
      owner: true,
      segmentLinks: {
        with: {
          segment: { with: { booking: true, category: true, assignedUnit: true } },
        },
      },
    },
  });
  if (!row) return null;

  const stays = row.segmentLinks
    .flatMap((link) =>
      link.segment && link.segment.booking
        ? [
            {
              ...toBookingSummary(link.segment.booking),
              unitName: link.segment.assignedUnit?.name ?? null,
              categoryName: link.segment.category?.name ?? 'Catégorie inconnue',
            },
          ]
        : []
    )
    .sort((a, b) => b.checkInDate.localeCompare(a.checkInDate));

  return {
    id: row.id,
    name: row.name,
    species: row.species,
    breed: row.breed,
    sex: row.sex,
    isSterilized: row.isSterilized,
    birthDate: row.birthDate,
    identificationNumber: row.identificationNumber,
    passportNumber: row.passportNumber,
    veterinarianName: row.veterinarianName,
    veterinarianPhone: row.veterinarianPhone,
    vaccinesUpToDate: row.vaccinesUpToDate,
    vaccines: row.vaccines,
    medicalNotes: row.medicalNotes,
    owner: row.owner
      ? { id: row.owner.id, firstName: row.owner.firstName, lastName: row.owner.lastName }
      : null,
    stays,
  };
}

async function fetchFicheReservation(id: string): Promise<FicheReservationData | null> {
  const row = await db.query.bookings.findFirst({
    where: { RAW: (t) => eq(t.id, id) },
    with: {
      client: true,
      segments: {
        with: {
          category: true,
          assignedUnit: true,
          occupantLinks: { with: { pet: true } },
        },
      },
      payments: true,
      invoices: true,
      extraServices: { with: { service: true, pet: true } },
    },
  });
  if (!row) return null;

  return {
    id: row.id,
    status: row.status,
    source: row.source,
    checkInDate: row.checkInDate.toISOString(),
    checkOutDate: row.checkOutDate.toISOString(),
    arrivalTimeSlot: row.arrivalTimeSlot,
    departureTimeSlot: row.departureTimeSlot,
    totalPrice: row.totalPrice,
    depositAmount: row.depositAmount,
    paymentStatus: row.paymentStatus,
    dietNotes: row.dietNotes,
    belongingsNotes: row.belongingsNotes,
    requestNotes: row.requestNotes,
    client: row.client
      ? {
          id: row.client.id,
          firstName: row.client.firstName,
          lastName: row.client.lastName,
          phone: row.client.phone,
        }
      : null,
    pets: row.segments
      .flatMap((s) => s.occupantLinks.map((l) => l.pet))
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .filter((p, i, arr) => arr.findIndex((o) => o.id === p.id) === i)
      .map((p) => ({ id: p.id, name: p.name, species: p.species, breed: p.breed })),
    segments: row.segments.map((s) => ({
      id: s.id,
      startDate: s.startDate,
      endDate: s.endDate,
      segmentPrice: s.segmentPrice,
      categoryName: s.category?.name ?? 'Catégorie inconnue',
      unitName: s.assignedUnit?.name ?? null,
      petNames: s.occupantLinks.map((l) => l.pet?.name ?? '—'),
    })),
    payments: row.payments.map((p) => ({
      id: p.id,
      amount: p.amount,
      method: p.method,
      status: p.status,
      paidAt: p.paidAt.toISOString(),
    })),
    invoices: row.invoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      type: inv.type,
      status: inv.status,
      totalInCents: inv.totalInCents,
    })),
    extraServices: row.extraServices.map((s) => ({
      id: s.id,
      serviceName: s.service?.name ?? 'Service supprimé',
      petName: s.pet?.name ?? null,
      quantity: s.quantity,
      totalPrice: s.totalPrice,
    })),
  };
}

function toBookingSummary(b: {
  id: string;
  status: string;
  checkInDate: Date;
  checkOutDate: Date;
  totalPrice: number;
  paymentStatus: string;
}): FicheClientData['bookings'][number] {
  return {
    id: b.id,
    status: b.status,
    checkInDate: b.checkInDate.toISOString(),
    checkOutDate: b.checkOutDate.toISOString(),
    totalPrice: b.totalPrice,
    paymentStatus: b.paymentStatus,
  };
}