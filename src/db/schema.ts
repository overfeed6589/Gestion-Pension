import { 
  pgTable, 
  uuid, 
  text, 
  boolean, 
  date, 
  timestamp, 
  integer, 
  jsonb 
} from 'drizzle-orm/pg-core';
import { defineRelations } from 'drizzle-orm';

// ==========================================
// 1. DÉFINITION DES VALEURS STRICTES (TYPES & ZOD)
// ==========================================

export const BOOKING_STATUSES = [
  'pending',     // En attente de validation / acompte
  'confirmed',   // Validée
  'checked_in',  // Animal arrivé (en garde)
  'checked_out', // Séjour terminé
  'cancelled',   // Annulée
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

export const CHANNEL_TYPES = ['email', 'sms', 'whatsapp', 'web_chat'] as const;
export const CONVERSATION_STATUSES = ['active', 'closed', 'needs_human_review'] as const;

// Types exportés pour autocomplétion TypeScript
export type BookingStatus = typeof BOOKING_STATUSES[number];
export type PaymentStatus = typeof PAYMENT_STATUSES[number];
export type PaymentMethod = typeof PAYMENT_METHODS[number];
export type PaymentTransactionStatus = typeof PAYMENT_TRANSACTION_STATUSES[number];
export type BillingType = typeof BILLING_TYPES[number];

// Type structurel pour les vaccins (Option B JSONB)
export type VaccineRecord = {
  name: string;             // Ex: "Toux de chenil", "CHPL", "Rage"
  administeredAt?: string; // Date d'injection YYYY-MM-DD
  expiresAt?: string;      // Date de rappel YYYY-MM-DD
  isMandatory?: boolean;   // Obligatoire pour la pension
};

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
  identificationNumber: text('identification_number').notNull(), // N° Puce / Tatouage
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
  basePricePerNight: integer('base_price_per_night').notNull(), // En centimes
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
  status: text('status', { enum: BOOKING_STATUSES }).default('pending').notNull(),
  
  // Tarification & Acomptes (en centimes)
  totalPrice: integer('total_price').notNull(),
  depositAmount: integer('deposit_amount').default(0).notNull(),
  paymentStatus: text('payment_status', { enum: PAYMENT_STATUSES }).default('unpaid').notNull(),
  
  // Clés API Stripe
  stripeCheckoutSessionId: text('stripe_checkout_session_id'),
  stripePaymentIntentId: text('stripe_payment_intent_id'),

  // Registre légal Entrée/Sortie réelles
  actualCheckIn: timestamp('actual_check_in'),
  actualCheckOut: timestamp('actual_check_out'),

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
// 11. RELATIONS UNIFIÉES (defineRelations)
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
    internalNotes
  }, 
  (r) => ({
    clients: {
      pets: r.many.pets(),
      bookings: r.many.bookings(),
      conversations: r.many.conversations(),
      internalNotes: r.many.internalNotes(),
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
  })
);