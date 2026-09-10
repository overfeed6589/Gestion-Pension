-- RLS deny-by-default (C1) sur toutes les tables du schéma public.
--
-- Contexte : Supabase expose une Data API (PostgREST) sur /rest/v1 avec la clé
-- anon publique. Tant que RLS est désactivé, cette API permet de lire ET
-- d'écrire toutes les tables. L'application n'utilise PAS la Data API (accès
-- Drizzle direct via app_user) : on active donc RLS partout :
--   - `anon` / `authenticated` (Data API) : aucune policy → deny total ;
--   - `app_user` : policy full-access explicite (l'app est la seule voie).
-- Le propriétaire des tables (postgres / migrations) contourne RLS par défaut,
-- les migrations et scripts DDL continuent de fonctionner.
--
-- Idempotent : policies créées seulement si absentes.

DO $$
DECLARE
  t text;
BEGIN
  -- Le rôle app_user doit exister avant de créer les policies (créé par
  -- scripts/apply-grants.ts ; créé NOLOGIN ici en secours si absent).
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN;
  END IF;

  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t AND policyname = 'app_user_full_access'
    ) THEN
      EXECUTE format(
        'CREATE POLICY app_user_full_access ON public.%I FOR ALL TO app_user USING (true) WITH CHECK (true)',
        t
      );
    END IF;
  END LOOP;
END $$;
