import { 
  pgTable, 
  uuid, 
  text, 
  boolean, 
  date, 
  timestamp, 
  integer 
} from 'drizzle-orm/pg-core';
import { defineRelations } from 'drizzle-orm';

// --- 1. CLIENTS ---
export const clients = pgTable('clients', {
  id: uuid('id').defaultRandom().primaryKey(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: text('email').notNull().unique(),
  phone: text('phone').notNull(),
  address: text('address'),
  emergencyContactName: text('emergency_contact_name'),
  emergencyContactPhone: text('emergency_contact_phone'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --- 2. ANIMAUX (PETS) avec mentions légales ---
export const pets = pgTable('pets', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').references(() => clients.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  species: text('species').notNull(), // Chien, Chat, NAC, etc.
  breed: text('breed'), // Race
  sex: text('sex').notNull(), // Mâle / Femelle
  isSterilized: boolean('is_sterilized').default(false).notNull(),
  birthDate: date('birth_date'),
  
  // --- ÉLÉMENTS LÉGAUX ET VÉTÉRINAIRES ---
  identificationNumber: text('identification_number').notNull(), // N° I-CAD / Puce / Tatouage (Obligation légale)
  passportNumber: text('passport_number'), // N° de passeport européen
  veterinarianName: text('veterinarian_name'), // Vétérinaire traitant
  veterinarianPhone: text('veterinarian_phone'), // Téléphone du vétérinaire
  
  // Vaccins & santé
  vaccinesUpToDate: boolean('vaccines_up_to_date').default(true).notNull(),
  lastVaccineDate: date('last_vaccine_date'),
  nextVaccineDueDate: date('next_vaccine_due_date'), // Date de rappel
  medicalNotes: text('medical_notes'), // Allergies, pathologies, régimes spéciaux

  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --- 3. CATÉGORIES DE LOGEMENT (Box / Chenil) ---
export const housingCategories = pgTable('housing_categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(), // Ex: Box Luxe, Chenil Standard, Chatellerie
  description: text('description'),
  capacity: integer('capacity').default(1).notNull(), // Nombre d'animaux max
  basePricePerNight: integer('base_price_per_night').notNull(), // Prix en centimes
});

// --- 4. UNITÉS PHYSIQUES ---
export const housingUnits = pgTable('housing_units', {
  id: uuid('id').defaultRandom().primaryKey(),
  categoryId: uuid('category_id').references(() => housingCategories.id).notNull(),
  name: text('name').notNull(), // Ex: "Box A1", "Chambre 12"
  isAvailable: boolean('is_available').default(true).notNull(),
});

// --- 5. BLOCAGES / TRAVAUX ---
export const housingBlocks = pgTable('housing_blocks', {
  id: uuid('id').defaultRandom().primaryKey(),
  unitId: uuid('unit_id').references(() => housingUnits.id, { onDelete: 'cascade' }).notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  reason: text('reason'), // Travaux, Désinfection, etc.
});

// --- 6. RÉSERVATIONS (DOSSIER CLIENT) ---
export const bookings = pgTable('bookings', {
  id: uuid('id').defaultRandom().primaryKey(),
  clientId: uuid('client_id').references(() => clients.id).notNull(),
  status: text('status').default('pending').notNull(), // pending, confirmed, cancelled, completed
  totalPrice: integer('total_price').notNull(), // Prix total recalculé
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --- 7. SEGMENTS DE SÉJOUR ---
export const bookingSegments = pgTable('booking_segments', {
  id: uuid('id').defaultRandom().primaryKey(),
  bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'cascade' }).notNull(),
  categoryId: uuid('category_id').references(() => housingCategories.id).notNull(),
  unitId: uuid('unit_id').references(() => housingUnits.id), // Assignation manuelle (nullable)
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  segmentPrice: integer('segment_price').notNull(),
});

// --- 8. TABLE DE LIAISON SEGMENT <-> ANIMAUX ---
export const segmentPets = pgTable('segment_pets', {
  id: uuid('id').defaultRandom().primaryKey(),
  segmentId: uuid('segment_id').references(() => bookingSegments.id, { onDelete: 'cascade' }).notNull(),
  petId: uuid('pet_id').references(() => pets.id, { onDelete: 'cascade' }).notNull(),
});

// --- 9. COMPTES RENDUS QUOTIDIENS (DAILY REPORTS) ---
export const dailyReports = pgTable('daily_reports', {
  id: uuid('id').defaultRandom().primaryKey(),
  petId: uuid('pet_id').references(() => pets.id, { onDelete: 'cascade' }).notNull(),
  segmentId: uuid('segment_id').references(() => bookingSegments.id, { onDelete: 'set null' }), // Optionnel : lié au séjour en cours
  reportDate: date('report_date').notNull(), // Date du compte rendu
  
  appetite: text('appetite'), // Ex: Tout mangé, Moitié, Refus
  stoolCondition: text('stool_condition'), // Ex: Normal, Molle, Diarrhée
  behavior: text('behavior'), // Ex: Calme, Anxieux, Joueur, Agressif
  medicationGiven: boolean('medication_given').default(false).notNull(),
  medicationNotes: text('medication_notes'), // Détails des soins donnés
  notes: text('notes'), // Remarques générales du soigneur
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
});


// ==========================================
// RELATIONS UNIFIÉES (defineRelations - V2)
// ==========================================
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
    dailyReports 
  }, 
  (r) => ({
    clients: {
      pets: r.many.pets(),
      bookings: r.many.bookings(),
    },
    pets: {
      owner: r.one.clients({
        from: r.pets.clientId,
        to: r.clients.id,
      }),
      segmentLinks: r.many.segmentPets(),
      dailyReports: r.many.dailyReports(),
    },
    housingCategories: {
      units: r.many.housingUnits(),
      bookingSegments: r.many.bookingSegments(),
    },
    housingUnits: {
      category: r.one.housingCategories({
        from: r.housingUnits.categoryId,
        to: r.housingCategories.id,
      }),
      blocks: r.many.housingBlocks(),
      bookingSegments: r.many.bookingSegments(),
    },
    housingBlocks: {
      unit: r.one.housingUnits({
        from: r.housingBlocks.unitId,
        to: r.housingUnits.id,
      }),
    },
    bookings: {
      client: r.one.clients({
        from: r.bookings.clientId,
        to: r.clients.id,
      }),
      segments: r.many.bookingSegments(),
    },
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
      dailyReports: r.many.dailyReports(),
    },
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
    dailyReports: {
      pet: r.one.pets({
        from: r.dailyReports.petId,
        to: r.pets.id,
      }),
      segment: r.one.bookingSegments({
        from: r.dailyReports.segmentId,
        to: r.bookingSegments.id,
      }),
    },
  })
);