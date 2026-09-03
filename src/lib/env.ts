import { z } from 'zod';

// ---------------------------------------------------------------------------
// Loader d'environnement validé (Phase A5)
// ---------------------------------------------------------------------------
// Raisons :
//  - Avant, chaque module lisait process.env directement avec des messages
//    d'erreur hétérogènes, et une clé manquante n'était découverte qu'au moment
//    de l'usage (parfois en plein runtime, ex. API Pennylane).
//  - On centralise + valide au chargement : échec TÔT et message explicite si
//    une variable serveur requise manque.
//  - Sécurité : ce module ne doit JAMAIS être importé par un composant client
//    (il lit des secrets). Seuls les modules serveur l'importent. Les variables
//    NEXT_PUBLIC_* sont lisibles côté client mais les clés secrètes ne le sont pas.
// ---------------------------------------------------------------------------

const serverEnvSchema = z.object({
  // Postgres (Drizzle) — voir PLAN.md Phase A4 : en production DATABASE_URL doit
  // pointer vers le pooler transaction (port 6543) avec le rôle applicatif
  // `app_user` (moindre privilège) ; DIRECT_URL (port 5432, rôle postgres) n'est
  // utilisé QUE par les scripts DDL/migrations/seed.
  DATABASE_URL: z.string().min(1, 'DATABASE_URL manquante dans les variables serveur'),
  DIRECT_URL: z.string().min(1, 'DIRECT_URL manquante dans les variables serveur'),

  // Supabase Auth (URL projet + clé anon publique).
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url('NEXT_PUBLIC_SUPABASE_URL invalide (doit être une URL)'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, 'NEXT_PUBLIC_SUPABASE_ANON_KEY manquante'),

  // Intégration facturation (Pennylane) — requise uniquement si on synchronise.
  PENNYLANE_API_KEY: z.string().min(1, 'PENNYLANE_API_KEY manquante').optional(),
});

function loadServerEnv() {
  const parsed = serverEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const champs = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Variables d'environnement serveur manquantes/invalides : ${champs}`);
  }

  return parsed.data;
}

/** Env serveur validé. À importer uniquement côté serveur. */
export const serverEnv = loadServerEnv();
