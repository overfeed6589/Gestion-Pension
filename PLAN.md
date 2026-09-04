# Plan de sécurisation & structuration pour la production

Statut : validé (matrice de rôles figée). Implémentation **étape par étape** :
chaque étape est commentée, validée puis commitée.

Contexte : app interne de gestion de pension (~5 utilisateurs, centaines de clients),
déploiement **Vercel**, **Supabase plan Gratuit**, Drizzle `1.0.0-rc` en accès direct
(Supabase n'est utilisé que pour l'auth).

---

## Matrice de rôles (A2 — figée)

Rôles : `dev` · `owner` · `secretary` · `staff`.
- `dev` = tout (même périmètre que `owner`, non provisionné en prod par défaut).
- `owner` = tout (staff, paramètres, tarifs, achats, finances, suppressions).
- `secretary` = clients, réservations, factures, encaissements.
- `staff` = arrivées/départs (registre), planning/attribution de box, fiche animaux/suivi.

| Module / action | dev | owner | secretary | staff |
|---|:--:|:--:|:--:|:--:|
| Gestion comptes/staff (`profiles`) | ✅ | ✅ | – | – |
| Paramètres, tarifs, catégories logement | ✅ | ✅ | – | – |
| Clients : création (dossier + 1er animal) | ✅ | ✅ | ✅ | – |
| Clients : édition infos contact | ✅ | ✅ | ✅ | lecture |
| Pets : fiche (vaccins, I-CAD, suivi, comptes rendus) | ✅ | ✅ | – | ✅ |
| Bookings : création/modif/annulation (période, catégorie, segment, tarif) | ✅ | ✅ | ✅ | lecture |
| Planning / attribution d'unité | ✅ | ✅ | – | ✅ |
| Registre check-in / check-out | ✅ | ✅ | – | ✅ |
| Factures : génération, Pennylane, statut | ✅ | ✅ | ✅ | lecture |
| Paiements / encaissements | ✅ | ✅ | ✅ | encaissement à l'arrivée |
| Fournisseurs & commandes | ✅ | ✅ | – | – |

Règles :
- Création dossier client = `secretary` (le client renseigne ses infos, voie future
  self-service) ; la fiche animal créée au dépôt peut ensuite être modifiée par `staff`.
- Attribution de box au quotidien = `staff` ; la réservation de `secretary` porte la
  période/catégorie (unité optionnelle).
- `requireRole(rôle)` autorise les rôles supérieurs de la hiérarchie
  (`dev`/`owner` ⊇ tout, `secretary` ⊇ staff non appliqué — secretary et staff sont
  disjoints). `requireRoleStrict([...])` pour les modules réservés.
- Application : en tête de chaque server action + layout de module + masquage du menu.

---

## Phase A — Sécurité

- **A1 (fait)** Helper `src/lib/auth.ts` : `requireUser()` ; garde d'authentification
  ajoutée sur toutes les server actions (certaines n'en avaient aucune).
- **A2 (code fait — en attente push DB + seed)** Table `profiles` (`id → auth.users.id`,
  `role`, `full_name`, `is_active`, `created_at`) + `requireRole`/`requireRoleStrict`
  dans `src/lib/auth.ts` (`canAccess`, boss dev/owner) ; gardes par module appliquées
  sur toutes les actions selon la matrice ; masquage UI des boutons check-in/check-out
  sur `/dashboard/register` ; seed : `scripts/seed-profiles.ts`.
- **A3 (code fait — actions console à faire)** Durcissement cookies de session
  (`httpOnly`/`sameSite=lax`/`secure` prod) dans `middleware.ts` + `server.ts` ;
  clés Supabase inutilisées retirées de `.env.local` (idem à faire côté Vercel).
  Checklist console Supabase : `docs/securite-supabase.md` (désactiver l'auto-inscription,
  confirmation email, politique mot de passe, captcha/MFA, vérif finale).
- **A4 (code fait — à exécuter)** Moindre privilège DB : `scripts/apply-grants.ts`
  (`npm run db:grants`, en DIRECT/5432) crée le rôle `app_user` + droits CRUD sur
  `public` (tables, séquences, défauts pour les futures migrations) et retire le
  CREATE public. Ensuite : `DATABASE_URL` = pooler 6543 avec `app_user`,
  `DIRECT_URL` (postgres) réservé aux scripts DDL/seed. `seed-profiles.ts` passe par
  DIRECT_URL.
- **A5 (fait)** Loader env validé zod `src/lib/env.ts` (échec tôt, message listant
  les clés manquantes) câblé sur `@/db`, `utils/supabase/server.ts` et Pennylane ;
  secrets à mettre dans Vercel Env (rien en `NEXT_PUBLIC_` sauf URL projet + clé anon).

## Phase B — Intégrité des données & concurrence (anti double-réservation)

- **B1 (fait)** Réécriture `lib/scheduling/` : `checker.ts` = disponibilité en SQL
  (chevauchement [start,end) + statut ≠ cancelled + exclusion du segment courant,
  maintenance `housing_blocks` incluse) ; `allocation.ts` = opérations atomiques
  (verrou `FOR UPDATE` sur l'unité + re-vérification en transaction) pour
  `assignUnitToSegment` et `createBookingSegment` ; `scheduling-actions.ts` réduite
  à une couche action (garde `staff` + traduction en `ActionState`).
- **B2 (script prêt — à exécuter)** `npm run db:constraints`
  (`scripts/apply-constraints.ts`, en DIRECT/5432, idempotent) : extension
  `btree_gist` + contrainte `booking_segments_no_overlap`
  (`EXCLUDE USING gist` sur unit_id + `daterange`), garantie DB en cas d'accès
  concurrent ou d'écriture hors code applicatif. Préflight des doublons existants.
- **B3** Occupation des unités dérivée des segments + `housing_blocks` (le booléen
  `is_available` n'est plus la source de vérité).
- **B4** Mutations check-in/check-out dans une transaction unique, avec auteur.
- **B5** Numérotation factures/commandes robuste (séquence/verrou, plus `SELECT MAX`).

## Phase C — Traçabilité & audit

- Colonnes `createdBy`/`updatedBy` + table `audit_logs` écrite en transaction sur les
  actions sensibles ; affichage du responsable dans le registre légal.

## Phase D — Évolutions sûres du schéma + hygiène

- Migrations drizzle versionnées (fini le push ad hoc), CI GitHub Actions
  (lint → `tsc --noEmit` → build), tests Vitest (scheduling, facturation, numérotation),
  nettoyage repo (`core.*`, README), MAJ `AGENTS.md`.

## Phase E — Performance

- Index manquants (FK + dates), pagination + filtres sur register/dashboard,
  requêtes SQL ciblées, pooler transaction.

## Phase F — Runtime & ops

- Observabilité (logger structuré + capture d'erreurs), sauvegardes `pg_dump`
  hebdo (pas de PITR en Gratuit), headers de sécurité Vercel/CSP, action logout,
  gestion RGPD (minimisation, effacement).

---

## Ordre d'implémentation

A1 → A2 → A4/A5 → B1/B2 → A3 (console) → C → D → E → F.
Chaque étape : implémentation commentée → vérification (`npx tsc --noEmit`, `npm run lint`)
→ proposition de commit → validation manuelle.
