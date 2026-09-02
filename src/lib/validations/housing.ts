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
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;