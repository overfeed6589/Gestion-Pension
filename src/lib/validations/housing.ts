import { z } from 'zod';

export const createCategorySchema = z.object({
  name: z
    .string()
    .min(2, 'Le nom doit contenir au moins 2 caractères')
    .max(50, 'Le nom est trop long'),
  description: z.string().optional(),
  capacity: z.coerce
    .number({ message: 'La capacité doit être un nombre' })
    .int('La capacité doit être un nombre entier')
    .min(1, 'La capacité minimale est de 1 animal'),
  basePricePerNight: z.coerce
    .number({ message: 'Le prix doit être un nombre' })
    .positive('Le prix doit être supérieur à 0'),
  // Supplément par animal au-delà du 1er occupant (en €/nuit).
  surchargePerAnimal: z.coerce
    .number({ message: 'Le supplément doit être un nombre' })
    .min(0, 'Le supplément ne peut pas être négatif')
    .default(0),
  // Exposée sur le site public de réservation (catalogue).
  isPublic: z.coerce.boolean().default(true),
  publicName: z.string().optional(),
});

export const createUnitSchema = z.object({
  categoryId: z.string().min(1, 'Catégorie requise'),
  name: z.string().min(1, 'Le nom du box est requis').max(50, 'Nom trop long'),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type CreateUnitInput = z.infer<typeof createUnitSchema>;
