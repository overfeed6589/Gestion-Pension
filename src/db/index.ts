import { drizzle } from 'drizzle-orm/postgres-js';
import { relations } from './schema';
import { serverEnv } from '@/lib/env';

// Accès BDD via le rôle applicatif (moindre privilège, Phase A4) :
// serverEnv.DATABASE_URL doit pointer vers le pooler transaction (6543) avec
// app_user en production. Le fichier échoue tôt si l'env est invalide (A5).
export const db = drizzle(serverEnv.DATABASE_URL, { relations });
