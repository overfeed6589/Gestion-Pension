/**
 * Seed des profils d'équipe (Phase A2).
 *
 * Rôles : 'dev' | 'owner' | 'secretary' | 'staff' (voir src/db/schema.ts PROFILE_ROLES).
 *
 * Raison : auth.users (Supabase) vit dans le schéma `auth` hors de `public`.
 * La table `profiles` référence auth.users.id SANS FK publique ; on établit donc
 * le lien ici : email -> auth.users.id -> ligne `profiles`.
 *
 * Utilisation :
 *   1. Renseigner ci-dessous la liste EMAILS_TO_ROLES (email des comptes Supabase
 *      déjà créés manuellement dans le dashboard).
 *   2. npx tsx scripts/seed-profiles.ts
 * Le script est idempotent (upsert) : on peut le relancer à chaque ajout d'utilisateur.
 */
import * as dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config({ path: '.env.local' });

// Connexion en DIRECT (5432, rôle postgres) : le seed lit auth.users (schéma `auth`)
// que le rôle applicatif app_user (Phase A4) ne doit PAS pouvoir lire.
function getDbUrl(): string {
  const url = process.env.DIRECT_URL;
  if (!url) {
    throw new Error('DIRECT_URL absente de .env.local (le seed doit passer par le rôle postgres)');
  }
  return url;
}

// TODO: remplacer par les vrais comptes Supabase Auth de l'équipe.
// `dev` ne doit PAS être provisionné en production (accès complet réservé au code).
const EMAILS_TO_ROLES: Array<{ email: string; role: 'dev' | 'owner' | 'secretary' | 'staff'; fullName: string }> = [
  { email: 'direction@chat-s-amuse.com', role: 'owner', fullName: 'Gérant' },
  { email: 'pension@chat-s-amuse.com', role: 'secretary', fullName: 'Secrétaire' },
  { email: 'staff1@chat-s-amuse.com', role: 'staff', fullName: 'Employé 1' },
  
  // { email: 'staff2@pension.fr', role: 'staff', fullName: 'Employé 2' },
];

async function main() {
  if (EMAILS_TO_ROLES.length === 0) {
    console.warn('Aucun email configuré dans scripts/seed-profiles.ts — rien à faire.');
    return;
  }

  const sql = postgres(getDbUrl(), { max: 1 });

  try {
    const emails = EMAILS_TO_ROLES.map((e) => e.email.toLowerCase());

    // Récupère les ids auth.users correspondants (schéma `auth`, hors `public`).
    const rows = await sql<Array<{ id: string; email: string }>>`
      SELECT id, email FROM auth.users WHERE lower(email) = ANY(${emails})
    `;

    const byEmail = new Map(rows.map((r) => [r.email.toLowerCase(), r.id]));

    for (const cfg of EMAILS_TO_ROLES) {
      const id = byEmail.get(cfg.email.toLowerCase());
      if (!id) {
        console.warn(`Aucun compte auth.users pour ${cfg.email} — ignore (crée-le d'abord dans Supabase).`);
        continue;
      }

      await sql`
        INSERT INTO public.profiles (id, role, full_name, is_active, created_at, updated_at)
        VALUES (${id}, ${cfg.role}, ${cfg.fullName}, true, now(), now())
        ON CONFLICT (id) DO UPDATE
          SET role = EXCLUDED.role,
              full_name = EXCLUDED.full_name,
              updated_at = now()
      `;
      console.log(`Profil ${cfg.role.padEnd(9)} -> ${cfg.email}`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
