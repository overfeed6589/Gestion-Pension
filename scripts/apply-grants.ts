/**
 * Moindre privilège BDD — Phase A4.
 *
 * Crée/met à jour le rôle applicatif `app_user` et lui donne UNIQUEMENT les
 * droits CRUD sur le schéma `public` (usage, tables, séquences + défauts pour
 * les futures tables créées par les migrations).
 *
 * Raisons :
 *  - L'app se connectait jusqu'ici avec le rôle `postgres` (superuser Supabase)
 *    via le pooler : toute injection ou fuite d'env = compromission TOTALE
 *    (DROP TABLE, lecture auth.users, etc.). En production l'app ne doit jamais
 *    tourner avec un rôle owner.
 *  - DDL/migrations gardent le rôle `postgres` via DIRECT_URL.
 *
 * Pré-requis :
 *  - .env.local doit contenir DIRECT_URL (rôle postgres) et APP_DB_PASSWORD
 *    (mot de passe du rôle applicatif, à générer, ex. openssl rand -hex 24).
 *  - Se connecte en DIRECT (5432) : les CREATE ROLE/DDL ne passent pas par le pooler.
 *
 * Usage : npx tsx scripts/apply-grants.ts
 */
import * as dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config({ path: '.env.local' });

const APP_DB_USER = process.env.APP_DB_USER || 'app_user';

function requireVar(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} manquante dans .env.local (requise pour ${APP_DB_USER})`);
  return v;
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function main() {
  const directUrl = requireVar('DIRECT_URL');
  const appPassword = requireVar('APP_DB_PASSWORD');

  const sql = postgres(directUrl, { max: 1 });

  try {
    console.log(`→ Préparation du rôle applicatif ${APP_DB_USER}...`);

    // CREATE/ALTER ROLE ne supportent pas les paramètres préparés : on quote le
    // mot de passe manuellement (script local exécuté par un dev de confiance).
    await sql.unsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = ${quoteLiteral(APP_DB_USER)}) THEN
          EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE',
                         ${quoteLiteral(APP_DB_USER)}, ${quoteLiteral(appPassword)});
        ELSE
          EXECUTE format('ALTER ROLE %I LOGIN PASSWORD %L', ${quoteLiteral(APP_DB_USER)}, ${quoteLiteral(appPassword)});
        END IF;
      END
      $$;
    `);

    console.log('→ Application des droits CRUD (tables, séquences, défauts)...');
    await sql.unsafe(`
      BEGIN;
      REVOKE ALL ON SCHEMA public FROM ${APP_DB_USER};
      GRANT USAGE ON SCHEMA public TO ${APP_DB_USER};

      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_DB_USER};
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_DB_USER};

      -- Droits par défaut pour les tables/séquences créées À L'AVENIR par postgres
      -- (drizzle-kit generate/migrate) : les nouvelles tables sont utilisables par app_user sans repasser ici.
      ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP_DB_USER};
      ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
        GRANT USAGE, SELECT ON SEQUENCES TO ${APP_DB_USER};

      -- Durcissement : personne (rôle PUBLIC) ne peut créer des objets dans le schéma
      -- public (réservé au propriétaire postgres / aux migrations).
      REVOKE CREATE ON SCHEMA public FROM PUBLIC;
      COMMIT;
    `);

    console.log('\n✔ Droits appliqués.');
    console.log('\n--- À configurer ensuite (Vercel Env / .env.local) ---');
    console.log(`DATABASE_URL = postgresql://${APP_DB_USER}:<mot-de-passe>@<projet>.pooler.supabase.com:6543/postgres`);
    console.log('  → utilisé par l’app (pooler transaction, port 6543)');
    console.log('DIRECT_URL  = inchangée (rôle postgres, port 5432) → réservée aux scripts DDL/migrations/seed');
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
