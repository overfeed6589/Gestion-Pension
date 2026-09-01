import { pgTable, uuid, varchar, text, timestamp, integer, date, boolean, primaryKey } from 'drizzle-orm/pg-core';
import { defineRelations } from 'drizzle-orm';

// --- TYPES APPLICATIFS (Alternatif au pgEnum pour plus de souplesse) ---
export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

// 1. CLIENTS
export const clients = pgTable('clients', {
  id: uuid('id').defaultRandom().primaryKey(),
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  phone: varchar('phone', { length: 20 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 2. ANIMAUX
export const pets = pgTable('pets', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').references(() => clients.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  species: varchar('species', { length: 50 }).notNull(), // Ex: "Chien", "Chat"
  breed: varchar('breed', { length: 100 }),
  medicalNotes: text('medical_notes'), // Allergies, régimes, traitements
});

// 3. CATÉGORIES DE LOGEMENT (Ce que le client choisit en ligne)
export const housingCategories = pgTable('housing_categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 50 }).notNull(), // Ex: "Box Chat Standard", "Chenil VIP"
  basePrice: integer('base_price').notNull(), // Prix de référence par nuit en centimes
});

// 4. UNITÉS PHYSIQUES (Les vrais box/chenils gérés sur site par le gérant)
export const housingUnits = pgTable('housing_units', {
  id: uuid('id').defaultRandom().primaryKey(),
  categoryId: uuid('category_id').references(() => housingCategories.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 50 }).notNull(), // Ex: "Box A", "Chenil 1"
  isActive: boolean('is_active').default(true).notNull(), // False = détruit / fermé définitivement
});

// 5. BLOCAGES / TRAVAUX (Appliqués aux unités physiques)
export const housingBlocks = pgTable('housing_blocks', {
  id: uuid('id').defaultRandom().primaryKey(),
  unitId: uuid('unit_id').references(() => housingUnits.id, { onDelete: 'cascade' }).notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  reason: varchar('reason', { length: 255 }), // Ex: "Peinture", "Quarantaine"
});

// 6. DOSSIER DE RÉSERVATION GLOBAL (Le panier client)
export const bookings = pgTable('bookings', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').references(() => clients.id).notNull(),
  status: varchar('status', { length: 20 })
    .$type<BookingStatus>()
    .default('PENDING')
    .notNull(),
  totalPrice: integer('total_price').notNull(), // Prix global calculé (en centimes)
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 7. SEGMENTS DE RÉSERVATION (Gère le Split-Booking et les blocs de séjour)
export const bookingSegments = pgTable('booking_segments', {
  id: uuid('id').defaultRandom().primaryKey(),
  bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'cascade' }).notNull(),
  
  categoryId: uuid('category_id').references(() => housingCategories.id).notNull(), // Réservé par le client
  unitId: uuid('unit_id').references(() => housingUnits.id), // Assigné plus tard par le gérant (nullable)
  
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  
  segmentPrice: integer('segment_price').notNull(), // Prix fixe calculé pour ce segment (gère le multi-animaux)
});

// 8. TABLE DE LIAISON : Occupants d'un segment (Plusieurs animaux dans le même box)
export const segmentPets = pgTable('segment_pets', {
  segmentId: uuid('segment_id').references(() => bookingSegments.id, { onDelete: 'cascade' }).notNull(),
  petId: uuid('pet_id').references(() => pets.id, { onDelete: 'cascade' }).notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.segmentId, t.petId] }),
}));

// 9. SUIVI DE SANTÉ / JOURNAL QUOTIDIEN
export const healthLogs = pgTable('health_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  petId: uuid('pet_id').references(() => pets.id, { onDelete: 'cascade' }).notNull(),
  date: timestamp('date').defaultNow().notNull(),
  taskType: varchar('task_type', { length: 50 }).notNull(), // Ex: "Repas", "Médicament", "Promenade"
  notes: text('notes'),
  completedBy: varchar('completed_by', { length: 100 }), // Nom de l'agent
});

// --- RELATIONS Drizzle ORM (Pour requêtes imbriquées performantes) ---

export const relations = defineRelations(
  { 
    clients, 
    pets, 
    housingCategories, 
    housingUnits, 
    housingBlocks, 
    bookings, 
    bookingSegments, 
    segmentPets, 
    healthLogs 
  }, 
  (r) => ({
    // 1. CLIENTS
    clients: {
      pets: r.many.pets(),
      bookings: r.many.bookings(),
    },

    // 2. ANIMAUX (PETS)
    pets: {
      owner: r.one.clients({
        from: r.pets.clientId,
        to: r.clients.id,
      }),
      segmentLinks: r.many.segmentPets(),
      healthLogs: r.many.healthLogs(),
    },

    // 3. CATÉGORIES DE LOGEMENT
    housingCategories: {
      units: r.many.housingUnits(),
      bookingSegments: r.many.bookingSegments(),
    },

    // 4. UNITÉS PHYSIQUES
    housingUnits: {
      category: r.one.housingCategories({
        from: r.housingUnits.categoryId,
        to: r.housingCategories.id,
      }),
      blocks: r.many.housingBlocks(),
      bookingSegments: r.many.bookingSegments(),
    },

    // 5. BLOCAGES / TRAVAUX
    housingBlocks: {
      unit: r.one.housingUnits({
        from: r.housingBlocks.unitId,
        to: r.housingUnits.id,
      }),
    },

    // 6. DOSSIERS DE RÉSERVATION (BOOKINGS)
    bookings: {
      client: r.one.clients({
        from: r.bookings.clientId,
        to: r.clients.id,
      }),
      segments: r.many.bookingSegments(),
    },

    // 7. SEGMENTS DE RÉSERVATION
    bookingSegments: {
      booking: r.one.bookings({
        from: r.bookingSegments.bookingId,
        to: r.bookings.id,
      }),
      category: r.one.housingCategories({
        from: r.bookingSegments.categoryId,
        to: r.housingCategories.id,
      }),
      assignedUnit: r.one.housingUnits({
        from: r.bookingSegments.unitId,
        to: r.housingUnits.id,
      }),
      occupantLinks: r.many.segmentPets(),
    },

    // 8. TABLE DE LIAISON (SEGMENT - PETS)
    segmentPets: {
      segment: r.one.bookingSegments({
        from: r.segmentPets.segmentId,
        to: r.bookingSegments.id,
      }),
      pet: r.one.pets({
        from: r.segmentPets.petId,
        to: r.pets.id,
      }),
    },

    // 9. LOGS DE SANTÉ
    healthLogs: {
      pet: r.one.pets({
        from: r.healthLogs.petId,
        to: r.pets.id,
      }),
    },
  })
);


