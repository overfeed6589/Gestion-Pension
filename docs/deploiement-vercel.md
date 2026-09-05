# Déploiement Vercel + Stripe — guide de mise en production (itération 1)

Objectif : mettre le pilote en ligne pour un **test de fonctionnement** complet
(demande web → offre → acompte Stripe → facture d'acompte). Prérequis : code sur
GitHub (`main` poussé), comptes Supabase / Vercel / Stripe / Resend créés.

---

## 1. Base de données (Supabase)

1. Créer le projet Supabase (plan Gratuit) et noter :
   - `Project Settings → Database → Connection string` :
     - **Transaction/Pooler** (port 6543) → servira à `DATABASE_URL` ;
     - **Session/direct** (port 5432, rôle `postgres`) → servira à `DIRECT_URL`.
   - `Project Settings → API` : `Project URL` et clé `anon public`.
2. Exécuter les scripts une fois (depuis le poste dev, avec `.env.local` complet) :
   ```
   npm run db:constraints   # contrainte anti double-réservation
   npm run db:grants        # rôle app_user (moindre privilège)
   npm run seed:profiles    # après création des comptes Auth (étape 3)
   ```
3. Passer la checklist `docs/securite-supabase.md` (auto-inscription off,
   confirm email, politique mot de passe, suppression clés inutilisées).

## 2. Comptes utilisateurs (Supabase Auth)

- Supabase → **Authentication → Users → Add user** (email + mot de passe fort)
  pour chaque personne (owner, secretary, staff).
- Puis `npm run seed:profiles` pour créer les lignes `profiles` (rôles).
  Le fichier `scripts/seed-profiles.ts` doit mapper les emails → rôles :
  modifie-le si besoin avant d'exécuter.

## 3. Vercel

1. **Import du projet** : Vercel → *Add New → Project* → choisir le repo GitHub
   `overfeed6589/Gestion-Pension`. Framework Next.js auto-détecté, build par défaut.
2. **Environment Variables** (Settings → Environment Variables, cocher Production) :
   | Variable | Valeur |
   |---|---|
   | `DATABASE_URL` | URL pooler 6543 (user `app_user`) |
   | `DIRECT_URL` | URL direct 5432 (user `postgres`) |
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL Supabase |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clé `anon` |
   | `STRIPE_SECRET_KEY` | `sk_test_…` (test) puis `sk_live_…` (prod) |
   | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_test_…` / `pk_live_…` |
   | `STRIPE_WEBHOOK_SECRET` | `whsec_…` (voir §4) |
   | `RESEND_API_KEY` | clé Resend |
   | `EMAIL_FROM` | `Pension <votre-domaine@resend.dev>` ou domaine vérifié |
   | `CRON_SECRET` | secret long généré (ex: `openssl rand -hex 32`) |
   | `NEXT_PUBLIC_SITE_URL` | URL publique après déploiement (voir plus bas) |
3. **Déployer** → obtenir l'URL `https://<projet>.vercel.app`, puis mettre à jour
   `NEXT_PUBLIC_SITE_URL` avec cette URL et **redéployer**.
4. **Domaine personnalisé** (optionnel, recommandé) : Vercel → *Domains* →
   `chat-s-amuse.com` (et/ou `reserve.…`) puis régler les DNS.

## 4. Stripe (mode TEST d'abord)

1. Dashboard Stripe → **Developers → API keys** → copier `sk_test_…` /
   `pk_test_…` dans Vercel (faire de même en `live` plus tard).
2. **Webhook** : Developers → Webhooks → *Add endpoint* :
   - URL : `https://<projet>.vercel.app/api/stripe/webhook`
   - Événements : `checkout.session.completed`
   - *Add endpoint* puis **Reveal signing secret** → copier `whsec_…` →
     `STRIPE_WEBHOOK_SECRET` sur Vercel → redéployer.
3. Vérifier l'envoi : onglet Webhooks → *Send test event*
   (`checkout.session.completed`) → l'API doit répondre 200 (logs Vercel).
   ⚠️ Un webhook « test » ne reçoit que des événements de mode test : utiliser
   des endpoints/secret séparés en live.

## 5. Resend (emails)

- Resend → **Domains** → ajouter ton domaine (chat-s-amuse.com) → suivre les
  enregistrements DNS (SPF/DKIM) → vérifier.
- `EMAIL_FROM` = `Pension <reservation@chat-s-amuse.com>` (ou, pour tester sans
  DNS : `Pension <onboarding@resend.dev>`).
- Les emails sont **best effort** : une clé absente ou un échec n'interrompt pas
  le flux (offres/confirmations/relances).

## 6. Cron quotidien (relances & expiration des offres)

- Le fichier `vercel.json` déclare déjà `/api/cron/daily` à 05:00.
- L'endpoint exige l'en-tête `Authorization: Bearer <CRON_SECRET>` si la
  variable est définie (Vercel l'envoie automatiquement aux crons).
- Vérif : Vercel → *Settings → Cron Jobs* doit montrer la tâche.

## 7. Test de fonctionnement (smoke test)

1. `/dashboard` avec un compte `owner` → **Logements** : créer un espace
   (capacité, prix, supplément) puis ajouter des **box**.
2. **Paramètres** : nom de la pension, acompte %, domaine, coordonnées légales.
3. **Clients** : créer un dossier (client + 1er animal).
4. Site public `/` : envoyer une **demande web** (tes coordonnées).
5. `/dashboard/offres` : la demande apparaît → **Créer l’offre** → choisir
   l'animal + espace + dates → valider.
6. Cliquer **Lien d’acompte** → page Stripe test → payer avec la carte de test
   `4242 4242 4242 4242` (date future, CVC quelconque).
7. Retour sur `/dashboard/offres` : le séjour passe **Confirmée** ; une
   **facture d'acompte** est émise (colonne invoices) ; email de confirmation
   reçu si Resend configuré.
8. Vérifier `/dashboard` (occupation, encaissé) et `/dashboard/taches` (animal
   présent à la date du séjour).

## 8. Passage en LIVE

1. Bascule des clés Stripe `sk_test` → `sk_live` (+ `pk_live`).
2. Webhook Stripe **live** : créer/pointer un endpoint vers la même URL avec les
   événements voulus → mettre à jour `STRIPE_WEBHOOK_SECRET` (secret live).
3. Vérifier le domaine Resend + passer `EMAIL_FROM` sur le domaine réel.
4. Refuser un vrai paiement de test (⚠️ encaisse réel) — faire un mini paiement
   réel remboursé si besoin.
5. Mettre à jour `NEXT_PUBLIC_SITE_URL` si domaine personnalisé.

---

## Dépannage rapide

- **Paiement confirmé côté Stripe mais réservation toujours `offered`** → le
  webhook n'est pas arrivé : vérifier URL + événement + secret, et les logs
  Vercel (`/api/stripe/webhook`).
- **Erreur 500 sur la création d'offre** → box manquant dans la catégorie, ou
  `db:constraints`/`grants` non exécutés.
- **Email non reçu** → domaine Resend non vérifié ou `EMAIL_FROM` non conforme ;
  les envois échouent sans bloquer le reste.
- **`NEXT_PUBLIC_*` inchangées après modif** → redéployer (les variables
  publiques sont compilées au build).
