# Durcissement Supabase — checklist manuelle (Phase A3)

La partie **codable** (durcissement cookies de session) est déjà en place :
`src/proxy.ts` et `src/utils/supabase/server.ts` imposent
`httpOnly + sameSite=lax + secure (prod)` sur les cookies de session.

Ce qui suit se fait dans le **dashboard Supabase** et dans les variables
d'environnement (Vercel + `.env.local`). Rien d'ici n'est automatisable via le repo.

> **Limites du plan Gratuit (constatées en console)** : certains garde-fous
> (CAPTCHA hCaptcha/Cloudflare Turnstile, MFA par SMS, Auth Hooks type
> « Send Email ») ne sont **pas disponibles** sur le plan Gratuit. On applique
> donc les alternatives gratuites ci-dessous et on notera ce qui devra être
> activé lors d'un passage sur un plan payant.

---

## 1. Bloquer l'auto-inscription (critique)

Un compte créé par n'importe qui passerait les gardes `requireUser` (une session
suffit). Or il n'y a **aucune** page d'inscription : tout utilisateur doit être créé
manuellement par l'équipe.

- Supabase → **Authentication → Providers → Email** :
  - désactiver **« Allow new users to sign up »** ;
  - activer **« Confirm email »** (obligatoire pour tout nouveau compte).

Personnalisation des emails : sur plan Gratuit, les **Auth Hooks (Send Email)
ne sont pas disponibles** ; on reste sur les **templates intégrés** (Authentication →
Emails) + éventuellement un **Custom SMTP** (gratuit) pour l'envoi depuis ton domaine.

## 2. Politique de mot de passe

- Supabase → **Authentication → Security** (ou selon version : `Security > Advanced`) :
  - longueur minimale ≥ 12 ;
  - désactiver la réutilisation de mot de passe si proposé.

## 3. Brute-force sur /login

- Le **CAPTCHA** (hCaptcha/Cloudflare Turnstile) n'est **pas disponible en plan
  Gratuit**. → Compenser par : mots de passe forts (≥ 12), comptes créés
  manuellement uniquement, et **MFA TOTP** ci-dessous.
  ⚠️ Si un CAPTCHA est activé plus tard (plan payant), il faudra passer un
  `captchaToken` dans `signInWithPassword` (`src/app/login/action.ts`) — TODO code.

## 4. MFA / 2FA (recommandé pour `dev`/`owner`)

- **MFA par SMS/phone** : payant → non activé en Gratuit.
- **MFA TOTP** : disponible en Gratuit, mais l'enrôlement exige une **UI
  applicative** (Supabase n'a pas d'administration d'enrôlement). Aujourd'hui :
  1. différer (TODO : écran d'enrôlement TOTP côté app), ou
  2. se reposer sur mots de passe forts + comptes à accès restreint + 2FA sur le
     **compte admin Supabase lui-même** (obligatoire, gratuit).

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
