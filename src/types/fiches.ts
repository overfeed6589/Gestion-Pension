// ---------------------------------------------------------------------------
// Types des fiches pop-up (Phase H1)
// ---------------------------------------------------------------------------
// Uniquement des données sérialisables (les dates sont des chaînes ISO) car
// elles transitent par des server actions vers des composants clients.
// ---------------------------------------------------------------------------

export const FICHE_KINDS = ['client', 'pet', 'booking'] as const;
export type FicheKind = (typeof FICHE_KINDS)[number];

export function isFicheKind(value: string): value is FicheKind {
  return (FICHE_KINDS as readonly string[]).includes(value);
}

/** Une fiche ouverte dans la pile : kind + id d'entité. */
export type FicheRef = {
  kind: FicheKind;
  id: string;
};

export type FicheClientData = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  isB2b: boolean;
  siret: string | null;
  createdAt: string;
  pets: FichePetSummary[];
  bookings: FicheBookingSummary[];
  invoicesCount: number;
};

export type FichePetSummary = {
  id: string;
  name: string;
  species: string;
  breed: string | null;
};

export type FicheBookingSummary = {
  id: string;
  status: string;
  checkInDate: string;
  checkOutDate: string;
  totalPrice: number;
  paymentStatus: string;
};

export type FicheAnimalData = {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  sex: string;
  isSterilized: boolean;
  birthDate: string | null;
  identificationNumber: string | null;
  passportNumber: string | null;
  veterinarianName: string | null;
  veterinarianPhone: string | null;
  vaccinesUpToDate: boolean;
  vaccines: {
    name: string;
    administeredAt?: string;
    expiresAt?: string;
    isMandatory?: boolean;
  }[];
  medicalNotes: string | null;
  owner: { id: string; firstName: string; lastName: string } | null;
  stays: (FicheBookingSummary & { unitName: string | null; categoryName: string })[];
};

export type FicheReservationData = {
  id: string;
  status: string;
  source: string;
  checkInDate: string;
  checkOutDate: string;
  arrivalTimeSlot: string | null;
  departureTimeSlot: string | null;
  totalPrice: number;
  depositAmount: number;
  paymentStatus: string;
  dietNotes: string | null;
  belongingsNotes: string | null;
  requestNotes: string | null;
  client: { id: string; firstName: string; lastName: string; phone: string } | null;
  pets: FichePetSummary[];
  segments: {
    id: string;
    startDate: string;
    endDate: string;
    segmentPrice: number;
    categoryName: string;
    unitName: string | null;
    petNames: string[];
  }[];
  payments: {
    id: string;
    amount: number;
    method: string;
    status: string;
    paidAt: string;
  }[];
  invoices: {
    id: string;
    invoiceNumber: string;
    type: string;
    status: string;
    totalInCents: number;
  }[];
  extraServices: {
    id: string;
    serviceName: string;
    petName: string | null;
    quantity: number;
    totalPrice: number;
  }[];
};

export type FicheData =
  | { kind: 'client'; data: FicheClientData }
  | { kind: 'pet'; data: FicheAnimalData }
  | { kind: 'booking'; data: FicheReservationData };

/** Réponse des loaders de fiche (appelés depuis un composant client). */
export type FicheResult =
  | { ok: true; fiche: FicheData }
  | { ok: false; message: string };