import { db } from '@/db';
import { pensionSettings } from '@/db/schema';

// ---------------------------------------------------------------------------
// Paramètres de la pension (Phase G — G2 / G9)
// ---------------------------------------------------------------------------
// Ligne unique (id = 'singleton'). En attendant une UI de réglage, on renvoie
// des valeurs par défaut si la ligne n'existe pas encore (aucune exception).
// ---------------------------------------------------------------------------

export type PensionSettings = {
  pensionName: string;
  legalAddress: string | null;
  siret: string | null;
  contactEmail: string | null;
  phone: string | null;
  depositPercent: number;
  cancellationRefundDays: number;
  offerValidityHours: number;
  publicDomain: string | null;
  logoUrl: string | null;
  /** Créneaux d'arrivée proposés au client (libellés). */
  arrivalSlots: string[];
  /** Créneaux de départ proposés au client (libellés). */
  departureSlots: string[];
  /** Jours avant l'arrivée pour relancer les créneaux manquants. */
  reminderDays: number[];
};

const DEFAULTS: PensionSettings = {
  pensionName: 'Pension',
  legalAddress: null,
  siret: null,
  contactEmail: null,
  phone: null,
  depositPercent: 30,
  cancellationRefundDays: 7,
  offerValidityHours: 72,
  publicDomain: null,
  logoUrl: null,
  arrivalSlots: ['9h-11h', '11h-14h', '14h-17h', '17h-19h'],
  departureSlots: ['9h-11h', '11h-14h', '14h-17h', '17h-19h'],
  reminderDays: [15, 7, 1],
};

export async function getPensionSettings(): Promise<PensionSettings> {
  const [row] = await db.select().from(pensionSettings).limit(1);
  if (!row) return DEFAULTS;

  return {
    pensionName: row.pensionName,
    legalAddress: row.legalAddress,
    siret: row.siret,
    contactEmail: row.contactEmail,
    phone: row.phone,
    depositPercent: row.depositPercent,
    cancellationRefundDays: row.cancellationRefundDays,
    offerValidityHours: row.offerValidityHours,
    publicDomain: row.publicDomain,
    logoUrl: row.logoUrl,
    arrivalSlots: Array.isArray(row.arrivalSlots) ? row.arrivalSlots : DEFAULTS.arrivalSlots,
    departureSlots: Array.isArray(row.departureSlots) ? row.departureSlots : DEFAULTS.departureSlots,
    reminderDays: Array.isArray(row.reminderDays) ? row.reminderDays : DEFAULTS.reminderDays,
  };
}
