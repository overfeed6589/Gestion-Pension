import { 
  pgTable, 
  uuid, 
  text, 
  boolean, 
  date, 
  timestamp,
  integer,
  jsonb,
  index,
  varchar 
} from 'drizzle-orm/pg-core';
import { defineRelations } from 'drizzle-orm';

// ==========================================
// 1. DÉFINITION DES VALEURS STRICTES (TYPES & ZOD)
// ==========================================

export const BOOKING_STATUSES = [
  'requested',   // Demande reçue (web/téléphone) — pas encore d'offre (aucun segment)
  'proposed',    // Demande publique choisie — segments BLOQUANTS, en attente de validation staff (G9)
  'offered',     // Offre émise — segments créés et BLOQUANTS, acompte en attente
  'expired',     // Offre non honorée dans le délai (expiration) — segments libérés
  'confirmed',   // Validée (acompte reçu)
  'checked_in',  // Animal arrivé (en garde)
  'checked_out', // Séjour terminé
  'cancelled',   // Annulée
] as const;

// Origine d'une réservation (Phase G : canal public web).
export const BOOKING_SOURCES = [
  'web',      // Formulaire de demande public
  'phone',    // Téléphone / WhatsApp
  'walk_in',  // Sur place
  'email',
  'other',
] as const;

export const PAYMENT_STATUSES = [
  'unpaid',           // Non payé
  'deposit_paid',     // Acompte payé
  'fully_paid',       // Solde totalement réglé
  'partially_refunded',// Partiellement remboursé
  'refunded',         // Totalement remboursé
] as const;

export const PAYMENT_METHODS = [
  'stripe',
  'cash',
  'card_reader',
  'check',
  'bank_transfer',
  'other',
] as const;

export const PAYMENT_TRANSACTION_STATUSES = [
  'succeeded',
  'processing',
  'failed',
  'refunded',
] as const;

export const BILLING_TYPES = [
  'per_unit', // À l'unité (ex: 1 toilettage)
  'per_day',  // Par jour (ex: chauffage 3€/jour)
  'per_stay', // Par séjour
] as const;

export const CHANNEL_TYPES = [
  'email', 
  'sms', 
  'whatsapp', 
  'web_chat'
] as const;
export type ChannelTypes = typeof CHANNEL_TYPES[number];

export const CONVERSATION_STATUSES = [
  'active', 
  'closed', 
  'needs_human_review'
] as const;
export type conversationStatuses = typeof CONVERSATION_STATUSES[number];

export const INVOICE_TYPES = [
  'deposit', 
  'final', 
  'credit_note'
] as const;
export type InvoiceType = (typeof INVOICE_TYPES)[number];

export const INVOICE_STATUSES = [
  'draft', 
  'issued', 
  'paid', 
  'cancelled', 
  'refunded'
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const E_INVOICE_STATUSES = [
  'pending', 
  'transmitted', 
  'accepted', 
  'rejected'
] as const;
export type EInvoiceStatus = (typeof E_INVOICE_STATUSES)[number];

export const PURCHASE_ORDER_STATUSES = [
  'draft', 
  'sent', 
  'received', 
  'cancelled'
] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

// Types exportés pour autocomplétion TypeScript
export type BookingStatus = typeof BOOKING_STATUSES[number];
export type BookingSource = typeof BOOKING_SOURCES[number];
export type PaymentStatus = typeof PAYMENT_STATUSES[number];
export type PaymentMethod = typeof PAYMENT_METHODS[number];
export type PaymentTransactionStatus = typeof PAYMENT_TRANSACTION_STATUSES[number];
export type BillingType = typeof BILLING_TYPES[number];

// ==========================================
// 1bis. RÔLES & PROFILS (contrôle d'accès — Phase A2)
// ==========================================
// Hiérarchie (matrice PLAN.md) :
//   dev/owner = accès complet ; secretary et staff sont disjoints mais couverts par dev/owner.
//   Ces valeurs sont aussi utilisées par src/lib/auth.ts (requireRole) et le masquage UI.
export const PROFILE_ROLES = ['dev', 'owner', 'secretary', 'staff'] as const;
export type ProfileRole = (typeof PROFILE_ROLES)[number];

// Table des profils : 1 ligne par utilisateur Supabase Auth (auth.users).
// Raisons :
//  - auth.users vit dans le schéma `auth`, hors de `public` : on ne peut pas y mettre
//    de colonnes métier ni la référencer par une FK publique propre.
//  - profiles.id = auth.users.id : lien 1:1 établi à l'application (voir scripts/seed-profiles.ts).
export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(), // = auth.users.id (Supabase), sans FK vers le schéma auth
  role: text('role', { enum: PROFILE_ROLES }).notNull(),
  fullName: text('full_name'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Type structurel pour les vaccins (Option B JSONB)
export type VaccineRecord = {
  name: string;             // Ex: "Toux de chenil", "CHPL", "Rage"
  administeredAt?: string; // Date d'injection YYYY-MM-DD
  expiresAt?: string;      // Date de rappel YYYY-MM-DD
  isMandatory?: boolean;   // Obligatoire pour la pension
};

// ==========================================
// 1ter. PARAMÈTRES PENSION (Phase G — settings)
// ==========================================
// Ligne unique (id = 'singleton') : identité/branding légal de la pension et
// règles commerciales (acompte, annulation, validité d'une offre). Les pages
// publiques lisent cette table : c'est le point d'extension futur multi-tenant
// (1 ligne par org), sans isolation implémentée pour l'instant.
export const pensionSettings = pgTable('pension_settings', {
  id: text('id').primaryKey(), // Valeur fixe 'singleton'
  pensionName: text('pension_name').notNull(),
  legalAddress: text('legal_address'),
  siret: varchar('siret', { length: 14 }),
  contactEmail: text('contact_email'), // Mail secrétaire, sinon owner
  phone: text('phone'),
  depositPercent: integer('deposit_percent').default(30).notNull(),
  cancellationRefundDays: integer('cancellation_refund_days').default(7).notNull(),
  offerValidityHours: integer('offer_validity_hours').default(72).notNull(),
  publicDomain: text('public_domain'),
  logoUrl: text('logo_url'),

  // Créneaux horaires proposés au client (G9) — listes de libellés (ex: "9h-11h").
  arrivalSlots: jsonb('arrival_slots').$type<string[]>(),
  departureSlots: jsonb('departure_slots').$type<string[]>(),
  // Jours de relance pour les créneaux non renseignés avant l'arrivée (défaut 15/7/1).
  reminderDays: jsonb('reminder_days').$type<number[]>(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ==========================================
// 2. CLIENTS
// ==========================================
export const clients = pgTable('clients', {
  id: uuid('id').defaultRandom().primaryKey(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: text('email').notNull().unique(),
  phone: text('phone').notNull(),
  address: text('address'),
  emergencyContactName: text('emergency_contact_name'),
  emergencyContactPhone: text('emergency_contact_phone'),
  
  // Intégration Stripe Client
  stripeCustomerId: text('stripe_customer_id'),

  // Si c'est une entreprise qui est facturé
  siret: varchar('siret', { length: 14 }),
  vatNumber: varchar('vat_number', { length: 32 }),
  isB2b: boolean('is_b2b').default(false).notNull(),

  // Jeton dossier (G9) : généré à la première demande, envoyé par email → ouvre
  // /espace/<token> (toutes les réservations du client). Unique.
  accessToken: text('access_token').unique(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ==========================================
// 3. ANIMAUX (PETS) - CONFORMITÉ I-CAD & VACCINS (OPTION B)
// ==========================================
export const pets = pgTable('pets', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').references(() => clients.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  species: text('species').notNull(), // Chien, Chat, NAC
  breed: text('breed'),
  sex: text('sex').notNull(),
  isSterilized: boolean('is_sterilized').default(false).notNull(),
  birthDate: date('birth_date'),
  
  // Registre réglementaire français
  identificationNumber: text('identification_number'), // N° Puce / Tatouage (nullable : saisi plus tard par le client — G9)
  passportNumber: text('passport_number'),
  veterinarianName: text('veterinarian_name'),
  veterinarianPhone: text('veterinarian_phone'),
  
  // Vaccins flexibles (Option B JSONB)
  vaccinesUpToDate: boolean('vaccines_up_to_date').default(true).notNull(),
  vaccines: jsonb('vaccines').$type<VaccineRecord[]>().default([]).notNull(),
  
  medicalNotes: text('medical_notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ==========================================
// 4. LOGEMENTS & UNITÉS
// ==========================================
export const housingCategories = pgTable('housing_categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(), // Ex: Box Luxe, Chenil Standard
  description: text('description'),
  capacity: integer('capacity').default(1).notNull(),

  // Phase G — tarification & catalogue public
  basePricePerNight: integer('base_price_per_night').notNull(), // En centimes
  // Supplément par animal AU-DELÀ du 1er occupant d'un espace (en centimes/nuit).
  // Ex: capacité 3, base 2000, 2 chats → 2000 + (2-1)*surcharge.
  surchargePerAnimal: integer('surcharge_per_animal').default(0).notNull(),
  // Exposée sur le site public de réservation (catalogue).
  isPublic: boolean('is_public').default(true).notNull(),
  publicName: text('public_name'), // Nom affiché au public si différent
  publicDescription: text('public_description'),
});

export const housingUnits = pgTable('housing_units', {
  id: uuid('id').defaultRandom().primaryKey(),
  categoryId: uuid('category_id').references(() => housingCategories.id).notNull(),
  name: text('name').notNull(), // Ex: "Box A1"
  isAvailable: boolean('is_available').default(true).notNull(),
});

export const housingBlocks = pgTable('housing_blocks', {
  id: uuid('id').defaultRandom().primaryKey(),
  unitId: uuid('unit_id').references(() => housingUnits.id, { onDelete: 'cascade' }).notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  reason: text('reason'),
});

// ==========================================
// 5. SERVICES ANNEXES / CATALOGUE
// ==========================================
export const extraServices = pgTable('extra_services', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(), // Ex: Toilettage, Pâtée, Soins, Promenade
  description: text('description'),
  defaultPrice: integer('default_price').notNull(), // En centimes
  billingType: text('billing_type', { enum: BILLING_TYPES }).default('per_unit').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
});

// ==========================================
// 6. RÉSERVATIONS, REGISTRE & STRIPE
// ==========================================
export const bookings = pgTable('bookings', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').references(() => clients.id).notNull(),
  status: text('status', { enum: BOOKING_STATUSES }).default('requested').notNull(),
  source: text('source', { enum: BOOKING_SOURCES }).default('phone').notNull(),

  // Tarification & Acomptes (en centimes)
  totalPrice: integer('total_price').notNull(),
  depositAmount: integer('deposit_amount').default(0).notNull(),
  paymentStatus: text('payment_status', { enum: PAYMENT_STATUSES }).default('unpaid').notNull(),
  
  // Clés API Stripe
  stripeCheckoutSessionId: text('stripe_checkout_session_id'),
  stripePaymentIntentId: text('stripe_payment_intent_id'),

  // Dates du séjour enregistré 
  checkInDate: timestamp('check_in_date').notNull(),
  checkOutDate: timestamp('check_out_date').notNull(),

  // Registre légal Entrée/Sortie réelles
  actualCheckIn: timestamp('actual_check_in'),
  actualCheckOut: timestamp('actual_check_out'),

  // Cycle offre (Phase G) : validité de l'offre émise, avant conversion ou
  // expiration automatique par le cron.
  offeredExpiresAt: timestamp('offered_expires_at'),

  // Traçabilité annulation / remboursement (Phase G)
  cancelledAt: timestamp('cancelled_at'),
  cancelledReason: text('cancelled_reason'),
  refundedAt: timestamp('refunded_at'),

  // Demande publique (Phase G — Lot 2) : consentement RGPD horodaté + message.
  rgpdConsentAt: timestamp('rgpd_consent_at'),
  requestNotes: text('request_notes'),

  // Créneaux d'arrivée/départ choisis par le client (G9) — valeurs des listes
  // configurables dans pension_settings.arrivalSlots / departureSlots.
  arrivalTimeSlot: text('arrival_time_slot'),
  departureTimeSlot: text('departure_time_slot'),

  // Option A : Notes simples pour le check-in
  dietNotes: text('diet_notes'),
  belongingsNotes: text('belongings_notes'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const bookingExtraServices = pgTable('booking_extra_services', {
  id: uuid('id').defaultRandom().primaryKey(),
  bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'cascade' }).notNull(),
  serviceId: uuid('service_id').references(() => extraServices.id).notNull(),
  petId: uuid('pet_id').references(() => pets.id, { onDelete: 'cascade' }),
  quantity: integer('quantity').default(1).notNull(),
  unitPrice: integer('unit_price').notNull(),
  totalPrice: integer('total_price').notNull(),
  notes: text('notes'),
});

// ==========================================
// 7. HISTORIQUE DES TRANSACTIONS / PAYMENTS
// ==========================================
export const payments = pgTable('payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'cascade' }).notNull(),
  amount: integer('amount').notNull(), // En centimes
  currency: text('currency').default('EUR').notNull(),
  method: text('method', { enum: PAYMENT_METHODS }).notNull(),
  
  // Clés Stripe de la transaction
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  stripeChargeId: text('stripe_charge_id'),
  
  status: text('status', { enum: PAYMENT_TRANSACTION_STATUSES }).notNull(),
  metadata: jsonb('metadata'), // Copie du payload Webhook si besoin
  paidAt: timestamp('paid_at').defaultNow().notNull(),
});

// ==========================================
// 8. SEGMENTS DE SÉJOUR & OCCUPATION
// ==========================================
export const bookingSegments = pgTable('booking_segments', {
  id: uuid('id').defaultRandom().primaryKey(),
  bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'cascade' }).notNull(),
  categoryId: uuid('category_id').references(() => housingCategories.id).notNull(),
  unitId: uuid('unit_id').references(() => housingUnits.id),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  segmentPrice: integer('segment_price').notNull(),
});

export const segmentPets = pgTable('segment_pets', {
  id: uuid('id').defaultRandom().primaryKey(),
  segmentId: uuid('segment_id').references(() => bookingSegments.id, { onDelete: 'cascade' }).notNull(),
  petId: uuid('pet_id').references(() => pets.id, { onDelete: 'cascade' }).notNull(),
});

// ==========================================
// 9. COMPTES RENDUS QUOTIDIENS
// ==========================================
export const dailyReports = pgTable('daily_reports', {
  id: uuid('id').defaultRandom().primaryKey(),
  petId: uuid('pet_id').references(() => pets.id, { onDelete: 'cascade' }).notNull(),
  segmentId: uuid('segment_id').references(() => bookingSegments.id, { onDelete: 'set null' }),
  reportDate: date('report_date').notNull(),
  
  appetite: text('appetite'),
  stoolCondition: text('stool_condition'),
  behavior: text('behavior'),
  medicationGiven: boolean('medication_given').default(false).notNull(),
  medicationNotes: text('medication_notes'),
  notes: text('notes'),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ==========================================
// 10. COMMUNICATIONS & AGENT IA
// ==========================================
export const conversations = pgTable('conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').references(() => clients.id, { onDelete: 'cascade' }).notNull(),
  channel: text('channel', { enum: CHANNEL_TYPES }).default('web_chat').notNull(),
  status: text('status', { enum: CONVERSATION_STATUSES }).default('active').notNull(),
  summary: text('summary'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const messages = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }).notNull(),
  senderType: text('sender_type').notNull(), // 'client', 'staff', 'ai_agent'
  content: text('content').notNull(),
  isApprovedByHuman: boolean('is_approved_by_human').default(true).notNull(),
  aiMetadata: jsonb('ai_metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const pensionRules = pgTable('pension_rules', {
  id: uuid('id').defaultRandom().primaryKey(),
  category: text('category').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  isPublic: boolean('is_public').default(true).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const internalNotes = pgTable('internal_notes', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').references(() => clients.id, { onDelete: 'cascade' }),
  petId: uuid('pet_id').references(() => pets.id, { onDelete: 'cascade' }),
  bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'cascade' }),
  authorType: text('author_type').default('staff').notNull(),
  content: text('content').notNull(),
  isImportant: boolean('is_important').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ==========================================
// 10bis. JOURNAL D'AUDIT (Phase C — traçabilité)
// ==========================================
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  action: text('action').notNull(), // ex: 'booking.confirmed', 'booking.cancelled'
  entityType: text('entity_type').notNull(), // ex: 'booking', 'invoice', 'payment'
  entityId: text('entity_id'),
  actorId: uuid('actor_id').references(() => profiles.id, { onDelete: 'set null' }),
  metadata: jsonb('metadata'), // Contexte (raison, montants…)
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  entityIdx: index('audit_logs_entity_idx').on(table.entityType, table.entityId),
}));

// ==========================================
// 10ter. EMAILS SORTANTS & LIENS DE REPRISE CLIENT (G9)
// ==========================================
// outbound_emails : journal des envois (dédup des emails transactionnels).
export const outboundEmails = pgTable('outbound_emails', {
  id: uuid('id').defaultRandom().primaryKey(),
  bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'cascade' }).notNull(),
  kind: text('kind').notNull(), // ex: 'confirmation_demande', 'liens_paiement', 'heures_relance_15'…
  sentAt: timestamp('sent_at').defaultNow().notNull(),
  metadata: jsonb('metadata'),
}, (table) => ({
  bookingKindIdx: index('outbound_emails_booking_kind_idx').on(table.bookingId, table.kind),
}));

// client_resume_links : « lien unique » envoyé par email à un client connu pour
// reprendre/continuer (préremplissage) — usage unique + expiration.
export const clientResumeLinks = pgTable('client_resume_links', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').references(() => clients.id, { onDelete: 'cascade' }).notNull(),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ==========================================
// 11. FACTURATION CLIENT (VENTES)
// ==========================================
export const invoices = pgTable('invoices', {
  id: uuid('id').defaultRandom().primaryKey(),
  invoiceNumber: varchar('invoice_number', { length: 50 }).notNull().unique(),
  type: varchar('type', { length: 20 }).$type<InvoiceType>().default('final').notNull(),
  status: varchar('status', { length: 20 }).$type<InvoiceStatus>().default('draft').notNull(),
  
  // Facturation Électronique / PDP / Pennylane
  eInvoiceStatus: varchar('e_invoice_status', { length: 20 }).$type<EInvoiceStatus>().default('pending').notNull(),
  pennylaneId: varchar('pennylane_id', { length: 255 }),
  transmittedAt: timestamp('transmitted_at'),

  clientId: uuid('client_id').references(() => clients.id).notNull(),
  bookingId: uuid('booking_id').references(() => bookings.id),
  
  subtotalInCents: integer('subtotal_in_cents').notNull(),
  taxInCents: integer('tax_in_cents').notNull().default(0),
  totalInCents: integer('total_in_cents').notNull(),
  vatRate: integer('vat_rate').default(2000).notNull(), // 2000 = 20.00%
  
  pdfUrl: text('pdf_url'),
  dueDate: timestamp('due_date'),
  paidAt: timestamp('paid_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  clientIdIdx: index('invoices_client_id_idx').on(table.clientId),
  bookingIdIdx: index('invoices_booking_id_idx').on(table.bookingId),
}));

export const invoiceItems = pgTable('invoice_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  invoiceId: uuid('invoice_id').references(() => invoices.id, { onDelete: 'cascade' }).notNull(),
  description: varchar('description', { length: 255 }).notNull(),
  quantity: integer('quantity').notNull().default(1),
  unitPriceInCents: integer('unit_price_in_cents').notNull(),
  totalInCents: integer('total_in_cents').notNull(),
});

// ==========================================
// 12. FOURNISSEURS & ACHATS (EXPENSES)
// ==========================================
export const suppliers = pgTable('suppliers', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  contactEmail: varchar('contact_email', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const purchaseOrders = pgTable('purchase_orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderNumber: varchar('order_number', { length: 50 }).notNull().unique(),
  supplierId: uuid('supplier_id').references(() => suppliers.id).notNull(),
  status: varchar('status', { length: 20 }).$type<PurchaseOrderStatus>().default('draft').notNull(),
  totalCostInCents: integer('total_cost_in_cents').notNull().default(0),
  notes: text('notes'),
  
  sentAt: timestamp('sent_at'),
  expectedDeliveryDate: timestamp('expected_delivery_date'),
  receivedAt: timestamp('received_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  supplierIdIdx: index('purchase_orders_supplier_id_idx').on(table.supplierId),
}));

export const purchaseOrderItems = pgTable('purchase_order_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id, { onDelete: 'cascade' }).notNull(),
  description: varchar('description', { length: 255 }).notNull(),
  quantity: integer('quantity').notNull().default(1),
  unitCostInCents: integer('unit_cost_in_cents').notNull(),
  totalCostInCents: integer('total_cost_in_cents').notNull(),
});

// ==========================================
// RELATIONS UNIFIÉES (defineRelations)
// ==========================================
export const relations = defineRelations(
  { 
    clients, 
    pets, 
    housingCategories, 
    housingUnits, 
    housingBlocks, 
    extraServices,
    bookings, 
    bookingExtraServices,
    payments,
    bookingSegments, 
    segmentPets, 
    dailyReports,
    conversations,
    messages,
    pensionRules,
    internalNotes,
    // --- NOUVELLES TABLES ---
    invoices,
    invoiceItems,
    suppliers,
    purchaseOrders,
    purchaseOrderItems,
  }, 
  (r) => ({
    clients: {
      pets: r.many.pets(),
      bookings: r.many.bookings(),
      conversations: r.many.conversations(),
      internalNotes: r.many.internalNotes(),
      invoices: r.many.invoices(), // <-- Ajouté
    },
    pets: {
      owner: r.one.clients({ from: r.pets.clientId, to: r.clients.id }),
      segmentLinks: r.many.segmentPets(),
      dailyReports: r.many.dailyReports(),
      internalNotes: r.many.internalNotes(),
      bookingServices: r.many.bookingExtraServices(),
    },
    housingCategories: {
      units: r.many.housingUnits(),
      bookingSegments: r.many.bookingSegments(),
    },
    housingUnits: {
      category: r.one.housingCategories({ from: r.housingUnits.categoryId, to: r.housingCategories.id }),
      blocks: r.many.housingBlocks(),
      bookingSegments: r.many.bookingSegments(),
    },
    housingBlocks: {
      unit: r.one.housingUnits({ from: r.housingBlocks.unitId, to: r.housingUnits.id }),
    },
    extraServices: {
      bookingServices: r.many.bookingExtraServices(),
    },
    bookings: {
      client: r.one.clients({ from: r.bookings.clientId, to: r.clients.id }),
      segments: r.many.bookingSegments(),
      extraServices: r.many.bookingExtraServices(),
      payments: r.many.payments(),
      internalNotes: r.many.internalNotes(),
      invoices: r.many.invoices(), // <-- Ajouté
    },
    bookingExtraServices: {
      booking: r.one.bookings({ from: r.bookingExtraServices.bookingId, to: r.bookings.id }),
      service: r.one.extraServices({ from: r.bookingExtraServices.serviceId, to: r.extraServices.id }),
      pet: r.one.pets({ from: r.bookingExtraServices.petId, to: r.pets.id }),
    },
    payments: {
      booking: r.one.bookings({ from: r.payments.bookingId, to: r.bookings.id }),
    },
    bookingSegments: {
      booking: r.one.bookings({ from: r.bookingSegments.bookingId, to: r.bookings.id }),
      category: r.one.housingCategories({ from: r.bookingSegments.categoryId, to: r.housingCategories.id }),
      assignedUnit: r.one.housingUnits({ from: r.bookingSegments.unitId, to: r.housingUnits.id }),
      occupantLinks: r.many.segmentPets(),
      dailyReports: r.many.dailyReports(),
    },
    segmentPets: {
      segment: r.one.bookingSegments({ from: r.segmentPets.segmentId, to: r.bookingSegments.id }),
      pet: r.one.pets({ from: r.segmentPets.petId, to: r.pets.id }),
    },
    dailyReports: {
      pet: r.one.pets({ from: r.dailyReports.petId, to: r.pets.id }),
      segment: r.one.bookingSegments({ from: r.dailyReports.segmentId, to: r.bookingSegments.id }),
    },
    conversations: {
      client: r.one.clients({ from: r.conversations.clientId, to: r.clients.id }),
      messages: r.many.messages(),
    },
    messages: {
      conversation: r.one.conversations({ from: r.messages.conversationId, to: r.conversations.id }),
    },
    internalNotes: {
      client: r.one.clients({ from: r.internalNotes.clientId, to: r.clients.id }),
      pet: r.one.pets({ from: r.internalNotes.petId, to: r.pets.id }),
      booking: r.one.bookings({ from: r.internalNotes.bookingId, to: r.bookings.id }),
    },

    // --- NOUVELLES RELATIONS ---
    invoices: {
      client: r.one.clients({ from: r.invoices.clientId, to: r.clients.id, optional: false }),
      booking: r.one.bookings({ from: r.invoices.bookingId, to: r.bookings.id }),
      items: r.many.invoiceItems(),
    },
    invoiceItems: {
      invoice: r.one.invoices({ from: r.invoiceItems.invoiceId, to: r.invoices.id }),
    },
    suppliers: {
      orders: r.many.purchaseOrders(),
    },
    purchaseOrders: {
      supplier: r.one.suppliers({ from: r.purchaseOrders.supplierId, to: r.suppliers.id }),
      items: r.many.purchaseOrderItems(),
    },
    purchaseOrderItems: {
      order: r.one.purchaseOrders({ from: r.purchaseOrderItems.purchaseOrderId, to: r.purchaseOrders.id }),
    },
  })
);