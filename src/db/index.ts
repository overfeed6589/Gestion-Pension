import { drizzle } from 'drizzle-orm/postgres-js';
import { relations } from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL est manquante dans les variables d\'environnement');
}

export const db = drizzle(process.env.DATABASE_URL, { relations });