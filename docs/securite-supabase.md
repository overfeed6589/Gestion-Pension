# Durcissement Supabase — checklist manuelle (Phase A3)

La partie **codable** (durcissement cookies de session) est déjà en place :
`src/middleware.ts` et `src/utils/supabase/server.ts` imposent
`httpOnly + sameSite=lax + secure (prod)` sur les cookies de session.

Ce qui suit se fait dans le **dashboard Supabase** et dans les variables
d'environnement (Vercel + `.env.local`). Rien d'ici n'est automatisable via le repo.

---

## 1. Bloquer l'auto-inscription (critique)

Un compte créé par n'importe qui passerait les gardes `requireUser` (une session
suffit). Or il n'y a **aucune** page d'inscription : tout utilisateur doit être créé
manuellement par l'équipe.

- Supabase → **Authentication → Providers → Email** :
  - désactiver **« Allow new users to sign up »** ;
  - activer **« Confirm email »** (obligatoire pour tout nouveau compte).

## 2. Politique de mot de passe

- Supabase → **Authentication → Security** (ou selon version : `Security > Advanced`) :
  - longueur minimale ≥ 12 ;
  - désactiver la réutilisation de mot de passe si proposé.

## 3. Brute-force sur /login

- Activer un **CAPTCHA** (Supabase → `Auth Hooks`/`Security` → hCaptcha) si souhaité.
  ⚠️ Cela impose de passer un `captchaToken` dans `signInWithPassword`
  (`src/app/login/action.ts`) — TODO code si activé.
- Alternative acceptable pour 5 comptes : mots de passe forts + MFA (ci-dessous).

## 4. MFA / 2FA (recommandé pour `dev`/`owner`)

- Supabase → **Authentication → Advanced / Security** : activer **MFA (TOTP)**.
- ⚠️ Supabase ne propose pas d'administration de l'enrôlement : chaque utilisateur
  s'enrôle via une UI applicative. Sans écran MFA dans l'app, on ne peut pas le
  **rendre obligatoire** aujourd'hui. Deux options :
  1. différer (TODO : écran d'enrôlement TOTP côté app), ou
  2. se reposer sur mots de passe forts + session courte.

## 5. Session & cookies

- Vérifier après déploiement (HTTPS) que les cookies `sb-*` partent avec
  `HttpOnly`, `SameSite=Lax`, `Secure` (fait en code A3).

## 6. Clés & variables d'environnement

Ne garder que ce qui est utilisé. Références vérifiées dans le code :
`DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `PENNYLANE_API_KEY`, `APP_DB_USER`,
`APP_DB_PASSWORD` (scripts).

À **supprimer** de `.env.local` ET de Vercel :
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (inutilisée)
- `SUPABASE_URL` (doublon de `NEXT_PUBLIC_SUPABASE_URL`)
- `SUPABASE_PUBLISHABLE_KEY` (inutilisée)
- `SUPABASE_SECRET_KEY` (service role : inutilisée dans le repo — sa présence est un
  risque si l'env fuit ; la supprimer tant qu'aucun code admin Supabase n'en a besoin)
- `SUPABASE_JWKS_URL` (inutilisée)

À **conserver** : `RESEND_API_KEY` (fonctionnalité emails prévue).

Règles :
- aucune clé secrète dans une variable `NEXT_PUBLIC_` ;
- `.env.local` est gitignoré : ne jamais le committer ;
- activer **2FA sur le compte admin Supabase** lui-même.

## 7. Vérification finale

- Se déconnecter puis se reconnecter (les cookies `secure` ne passent qu'en HTTPS).
- Tenter `POST` sur une action non autorisée → redirection `/dashboard`.
- Tenter de créer un compte via l'API Supabase REST → rejeté (sign-up off).
