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
  Correctif review : le chevauchement de `assignUnitToSegment` est vérifié sur les
  **dates stockées** du segment (lues sous verrou), plus catch `23P01`/`23505` →
  « box occupé » au lieu d'une erreur 500.
- **B2 (fait — script + migration)** `npm run db:constraints`
  (`scripts/apply-constraints.ts`, en DIRECT/5432, idempotent) : extension
  `btree_gist` + contrainte `booking_segments_no_overlap`
  (`EXCLUDE USING gist` sur unit_id + `daterange`), garantie DB en cas d'accès
  concurrent ou d'écriture hors code applicatif. Préflight des doublons existants.
  Correctif review (B2b) : la contrainte ne peut pas filtrer le statut (porté par
  `bookings`) — `cancelBooking`/`expireOfferedBooking` **suppriment désormais les
  segments** (migration de purge `20260909123305_contrainte_expired`), sinon les
  unités restaient bloquées à vie après annulation/expiration.
- **B3 (fait)** `occupancy.ts` réécrit : occupation **dérivée des segments** en SQL
  (aucune dépendance au booléen `is_available`, réservé au « hors service » manuel).
- **B4 (partiel)** Fin effective d'un séjour = `COALESCE(actual_check_out, end_date)`
  dans checker/allocation/occupancy → un départ réel (anticipé) libère l'unité.
  Reste : auteur sur check-in/out (Phase C) et numérotation robuste (B5).
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

## Phase G — Itération 1 : canal public (demande → offre → acompte), vie quotidienne & dashboards

Document produit : `docs/ROADMAP.md`. Décisions de cadrage :
- Résa publique dès l'itération 1, flux **demande → offre → acompte** (pas
  d'instantané). Acompte 30 % Stripe (carte) ; **le paiement confirme**.
- Tarification **par espace + supplément/animal au-delà du 1er**, configurable
  **par catégorie**. Capacité = 1 espace ≤ N animaux d'une même famille.
- **Facture d'acompte à la confirmation** (trace de remboursement). Acompte
  remboursé si annulation ≥ 7 j avant l'arrivée ; sinon retenu.
- Mono-tenant pilote, mais table `pension_settings` (1 ligne) = seule source de
  branding/config des pages publiques (prépare le futur multi-tenant sans
  isolation à implémenter maintenant).
- Prérequis : **Phase D** (migrations versionnées + CI + premiers tests) posée
  avant d'étendre le schéma. Plus de push ad hoc.
- Mailing it1 = outbound transactionnel uniquement (pas de lecture de boîte).

### G1. Fondations (ordre imposé : D d'abord)
- Drizzle en migrations versionnées (`drizzle-kit generate`/`migrate`) ; CI
  GitHub Actions : `npm run lint` → `npm run typecheck` → `npm run build` ;
  tests Vitest sur `lib/scheduling`, moteur de prix, numérotation.
- `drizzle.config.ts` : brancher sur `DIRECT_URL` (5432, postgres) pour les
  migrations ; runtime inchangé (pooler `app_user`).

### G2. Schéma (migration versionnée unique)
- **`pension_settings`** (1 ligne, clé id fixe) : `pensionName`, `legalAddress`,
  `siret`, `contactEmail` (mail secrétaire, fallback owner), `phone`,
  `depositPercent` (défaut 30), `cancellationRefundDays` (défaut 7),
  `offerValidityHours` (défaut 72), `publicDomain`, `logoUrl`.
- **`housing_categories`** : + `surchargePerAnimal` (integer, centimes, défaut 0),
  + `isPublic` (bool, défaut true), + `publicName`/`publicDescription` optionnels.
- **`bookings`** : statut étendu + traçabilité annulation —
  `BOOKING_STATUSES` devient `requested` (demande web reçue, sans segments),
  `offered` (offre émise → segments créés et **bloquants**), `confirmed`,
  `checked_in`, `checked_out`, `cancelled`, `expired`. Ajouts : `source`
  (`web`/`phone`/`walk_in`/…), `offeredExpiresAt` (timestamp), `cancelledAt`,
  `cancelledReason`, `refundedAt`. (Colonnes TEXT : l'ajout de statut ne touche
  que le tableau `as const` + zod, pas de migration.)
- **`invoices`** : confirmer l'usage de `type` `deposit`/`final`/`credit_note`
  (déjà prévu). Pas de nouvelle colonne nécessaire.
- Sémantique dispo inchangée : le checker (B1) n'exclut que `cancelled` → un
  booking `offered` **bloque** sa ou ses unités (protégé aussi par la contrainte
  `EXCLUDE` de B2). C'est le mécanisme anti-double-offre.

### G3. Flux demande → offre → acompte
- **Routes publiques** dans la même app (route group hors `/dashboard`, sans
  auth — la `middleware.ts` ne protège que `/dashboard/*`), domaine public
  (ex: reserve.chat-s-amuse.com) servi via settings + Vercel.
- **Formulaire public** : coordonnées du maître, dates, nb chats, fiche minimale
  par animal (nom, sexe, stérilisé, né, I-CAD, attestation vaccins/carnet),
  message. Protection anti-spam : rate-limit + honeypot ; consentement RGPD
  stocké (trace).
- **Rattachement prospect** : `email` déjà en base → rattacher à la fiche
  existante (dossier + animaux proposés, à valider par la secretary) ; sinon
  créer client + pets avec `source`. Booking en `requested`.
- **File d'attente secretary** (dashboard) : valider le rattachement, puis
  construire l'**offre** = 1..n segments (découpage manuel assisté de la dispo,
  réutilise `lib/scheduling/` : `findFreeUnitInCategory` etc.) + services.
  À la soumission : booking `requested → offered`, insertion atomique des
  `booking_segments` + `segment_pets`, `offeredExpiresAt = now + 72h`, génération
  du lien Stripe Checkout (montant = acompte 30 %, `client_reference_id` =
  booking), email de l'offre au client.
- **Groupe > capacité** : répartir les animaux sur plusieurs espaces/segments
  parallèles (mêmes dates, sous-ensembles via `segment_pets`) — la capacité et le
  supplément se calculent par segment.
- **Stripe** : `POST /api/stripe/webhook` (endpoint déjà anticipé côté schéma) →
  paiement `succeeded` → booking `offered → confirmed`, `payments` inséré,
  **facture d'acompte émise** (`type=deposit`), email de confirmation. Gérer
  idempotence du webhook, montants inattendus, re-tentatives de lien.
- **Expiration (cron quotidien)** : tout `offered` dont `offeredExpiresAt` est
  dépassé → `expired` (segments libérés), notifier la pension pour relancer le
  client avant expiration si pertinent.

### G4. Moteur de prix & facturation
- Nouveau `lib/pricing/` : prix segment = `nuits × (basePricePerNight +
  (pets_du_segment − 1) × surchargePerAnimal)` ; total booking = Σ segments +
  services (≠ acompte déjà réglé) ; acompte = `total × depositPercent`.
- **Refonte de la génération de facture** (`generateFinalInvoiceAction`) :
  actuellement basée sur `segments[0]` et `basePricePerNight` seul → passer à
  tous les segments + surcharge par animal (via `occupantLinks`), et émettre le
  bon `type` (`deposit` à la confirmation, `final` au check-out avec déduction de
  l'acompte, `credit_note`/statut `refunded` sur remboursement).
- **Numérotation robuste** (ex-B5) : remplacer `SELECT MAX` de
  `lib/invoicing/numbering.ts` par une séquence/verrou atomique en transaction.
- **Annulation (≥ 7 j avant arrivée)** : remboursement Stripe de l'acompte,
  `payments` → `refunded`, facture d'acompte → statut `refunded` ou `credit_note`
  (trace), booking `cancelled` + `cancelledAt`/`cancelledReason`. < 7 j : acompte
  retenu (règle en settings).

### G5. Tâches du jour (tours matin/soir)
- Nouvelle vue proche de `/dashboard/register` (garde `staff`/owner) : sélecteur
  de date ; pour chaque animal couvert par un segment `confirmed`/`checked_in` ce
  jour : espace/unité, alimentation (croquettes/pâtée, `dietNotes`), médicaments
  (heures/notes), comportement (`medicalNotes`, `internalNotes` importantes).
- Génération **déterministe** (SQL, aucune IA). Cocher un item = persister une
  ligne `daily_reports` (champs existants : appétit, selles, comportement,
  médocs donnés, notes).

### G6. Relances automatiques & dashboards owner
- **Cron quotidien** (Vercel Cron, 1 exécution/jour en plan gratuit) : route
  interne gardée qui applique les règles :
  1. offre `offered` impayée depuis X h → rappel acompte (avant expiration) ;
  2. `confirmed` non soldée à **J-7** de l'arrivée → rappel solde ;
  3. expiration des `offered` (G3).
- **Email outbound** : fournisseur à coût quasi nul et scalable (Resend free
  tier ou Gmail API Workspace) ; SPF/DKIM/DMARC posés sur le domaine ; templates
  versionnés ; échec d'envoi = trace + re-tentative.
- **Dashboards owner** : agrégats SQL (pas de calcul lourd) — occupation par
  unité/période (réutilise la logique d'occupation B3), CA prévisionnel
  (segments `confirmed` × prix) vs encaissé (`payments.succeeded`), impayés,
  répartition mensuelle.

### G7. Sécurité & RGPD (canal public)
- Pages publiques **sans guard** mais : rate-limit, honeypot, validation zod
  (schémas dans `lib/validations/`), pas de données sensibles exposées.
- Consentement RGPD stocké avec la demande ; minimisation des données du
  formulaire ; mentions légales (settings) ; effacement via l'existant
  (`onDelete: 'cascade'` côté clients) + rappel docs/securite-supabase.md.
- Gardes `requireRole` inchangées sur **toutes** les écritures internes (nouveau
  flux public = actions sans guard uniquement pour créer la `requested`).

### G8. Tests ciblés (Vitest)
- Dispo : un segment `offered` bloque (chevauchement), `expired`/`cancelled`
  libère.
- Prix : supplément/animal, groupes répartis sur plusieurs segments, acompte.
- Numérotation : séquence atomique (plus de trous/race).
- Règles de relance/remboursement : fenêtre ≥ 7 j vs < 7 j.

### G9. Parcours client v2 (hold `proposed`, dossier par jeton, paiement à montant choisi)

Décisions (grill) et matrice emails : `docs/parcours-client-emails.md`.

**Base de données (migration versionnée unique)**
- `BOOKING_STATUSES` : + `proposed` (demande publique qui **bloque** des espaces,
  en attente de validation staff). `requested` reste pour l'héritage.
- `clients` : + `accessToken` (unique, nullable) — jeton dossier généré à la 1re
  demande, lié dans les emails (`/espace/<token>`).
- `pets` : `identification_number` devient **nullable** (saisie publique sans
  I-CAD ; la complétion se fait ensuite via le dossier).
- `bookings` : + `arrivalTimeSlot`, `departureTimeSlot` (text, créneaux choisis).
- Nouvelle table `outbound_emails` : (bookingId, kind, sentAt) → dédup des emails
  (un kind par booking ; les relances créneaux ont un kind par jalon).
- Nouvelle table `client_resume_links` : lien de reprise pour client connu
  (clientId, token unique, expiresAt, usedAt) — usage unique + expiration.
- `pension_settings` : + `arrivalSlots`, `departureSlots` (jsonb string[]),
  `reminderDays` (jsonb int[], défaut [15,7,1]).

**Flux public (étapes)** : dates → email (connu = lien de reprise qui préremplit ;
inconnu = saisie libre) → choix des animaux (cocher/ajouter) → propositions de
dispo (catégories complètes + splits, nb espaces = ⌈chats/capacité⌉) → saisie
animaux neufs → création `proposed` (segments bloquants) + jeton + email E1.

**Dispo publique** : réutilise `lib/scheduling/` (checker par unité, occupation) ;
propositions = catégorie libre sur toute la durée OU découpage mixte suggéré.

**Staff** : `/dashboard/offres` liste les `proposed` → mini-éditeur (ajuster
dates/catégorie/animaux = recréation des segments + recalcul prix/acompte,
secretary/owner) → « valider & envoyer liens » (`offered`) ou « valider sans
paiement » (`confirmed`, lien solde maintenu).

**Paiement à montant choisi** : depuis `/espace/<token>`, le client choisit
acompte ou total ; une action serveur crée la session Stripe du montant choisi
(statut/montant périmé → refus). Total payé → `fully_paid` + **facture finale
immédiate** (générée puis `paid`) ; acompte → `confirmed` ; lien « solde »
recalculé.

**Emails/cron** : lib `lib/emails/` (templates par kind, écriture
`outbound_emails`), cron enrichi (E7 relances créneaux J-15/7/1, E10 acompte,
E11 solde). Réglages dans Paramètres.

**Sécurité** : pages `/espace` sans auth mais lookup par jeton (jamais loggé) ;
lien de reprise à usage unique et court ; pas d'inscription publique ; les
données d'un client ne sont jamais rendues sur simple saisie d'email.

---

## Phase H — Réorganisation du back-office (itération 2)

Arborescence cible, fiches pop-up sans navigation, nouvelles pages. Cadré par
grill (décisions ci-dessous), déploiement **incrémental** : les routes
nouvelles coexistent avec les anciennes, redirects 301 des anciennes routes en
fin de chantier, CI verte à chaque phase.

**Arborescence cible**
```
/dashboard                         Tableau de bord « événements du jour » (+ lendemain en colonne gauche)
/dashboard/planning
  /planning/rdv                    Vue semaine : arrivées/départs/visites/autres rdv — export Google Calendar
  /planning/animaux                Vue ~2 mois : animaux présents par box (clic → fiche)
/dashboard/informations
  /informations/reservations       Liste unifiée (offres en attente marquées « non traitées »)
  /informations/clients            /informations/animaux    /informations/factures
  /informations/fiche-technique    (réservée, pas cette itération)
/dashboard/infrastructure
  /infrastructure/logements        (ex housing)
  /infrastructure/inventaire       Inventaire (checklist articles) + commandes fournisseurs
/dashboard/rapports                Onglets : occupation, CA & services annexes, clients, annulations
                                   + fiches individuelles animal/client, comparaison N-1, export CSV/PDF
/dashboard/logs                    Audit 1 mois (niveau action), archivage au-delà, owner/dev
/dashboard/contact
  /contact/emails                  Boîte IMAP + file d'envois auto (approbation par type)
  /contact/newsletter              Opt-in clients + envoi SMTP + désinscription
  /contact/whatsapp                Squelette (modèle prêt pour Meta Cloud API, branchement plus tard)
/dashboard/parametres              Infos pension + automatismes (toggles d'envoi par type) + gestion des accès
/dashboard/compte                  Session courante : nom affiché, mot de passe, préférences
```

**Décisions (grill 2026-09-11)**
- Existant : Offres → fusionnées dans Informations/Réservations (non traitées
  marquées). Tâches → remplacées par le dashboard (tâches staff intégrées).
  Fiches techniques → abandonnées pour l'instant. Registre → remplacé par la
  branche Planning.
- Fiches pop-up : pilotées par l'**URL** (query params, un param par couche
  empilée : `?client=…&pet=…&booking=…`), données chargées côté client via
  server actions → refresh/partage OK, pas de navigation de page.
- Fiche réservation « accueil client » : **checklist structurée**
  (`checklist_items` par réservation, catégories affaires/documents/paiement/
  questions), pré-remplie à la confirmation depuis un template éditable dans
  Paramètres ; sert de mémo le jour de l'arrivée.
- Google Calendar : **export one-way** (compte de service, agenda de la
  pension) pour arrivées/départs/rdv + réconciliation quotidienne par cron.
- Logs : niveau **action** (audit_logs existant), fenêtre 1 mois puis
  archivage (`audit_logs_archive`, cron).
- Contact : boîte mail **IMAP/SMTP Google** (identifiants en env via
  `serverEnv`, jamais en base), polling cron → `email_messages` ; les emails
  automatiques passent par une file `email_queue` avec statut
  `pending_approval` quand le toggle du kind est désactivé dans Paramètres ;
  newsletter opt-in (`clients.newsletterOptIn` + `newsletter_campaigns`) ;
  WhatsApp = squelette cette itération (Meta Cloud API plus tard).
- Inventaire : checklist d'articles « censés être à la pension » avec note et
  « dernière commande le … » ; coche = demande de commande (brouillon
  `purchase_orders` + signal pour la personne gérante).
- Nouvelle table `appointments` (visites / autres rdv), créés depuis
  Planning/RDV, exportés one-way vers Google Calendar.

**Ordre des phases H**
1. **H1 (fait)** — Socle fiches pop-up : `FicheModal` générique (URL query params,
   empilement), loaders server action (`loadFiche`), composants partagés
   `FicheClient`/`FicheAnimal`/`FicheReservation`, branchés sur les pages
   existantes (clients, réservations liste + détail).
2. **H2 (fait)** — Tableau de bord « événements du jour » : arrivées, départs,
   paiements attendus, relances créneaux (J-15/7/1), tâches staff
   (`daily_reports`) ; lendemain en colonne gauche ; tout cliquable → pop-up.
   `lib/dashboard/events.ts` agrège les données ; `/dashboard/taches` redirige
   vers `/dashboard`.
3. **H3 (fait)** — Branche Informations : `/dashboard/informations/`
   {`reservations` (liste unifiée avec badge « Non traitée » pour
   requested/proposed + actions itération 1 conservées), `clients` (reprise),
   `animaux` (nouvelle liste avec statut vaccins), `factures` (reprise)}.
   Nav réorganisée avec section « Informations » ; anciennes routes
   (/bookings, /clients, /invoices, /offres) encore accessibles jusqu'à H9.
4. **H4 (fait)** — Planning : table `appointments` (migration
   `20260911144018_massive_havok`), vue semaine RDV
   (`/dashboard/planning/rdv` : arrivées/départs/visites/autres + création/
   suppression de rdv, fuseau Europe/Paris), vue 2 mois par box
   (`/dashboard/planning/animaux`). Export Google Calendar **one-way
   non-bloquant** (`lib/integrations/google-calendar.ts`, compte de service
   JWT RS256 sans `googleapis`, ids d'événements déterministes) : upsert à
   la création/suppression de rdv, suppression à l'annulation d'une
   réservation, réconciliation hebdo dans le cron quotidien. Sans les envs
   `GOOGLE_CALENDAR_ID` + `GOOGLE_SERVICE_ACCOUNT_KEY` l'export est
   silencieusement désactivé (état affiché dans la page). Nav : section
   « Planning » (Registre reste accessible, sans sous-menu).
5. **H5 (fait)** — Infrastructure : `/dashboard/infrastructure/logements`
   (reprise de Housing) + `/dashboard/infrastructure/inventaire` (checklist
   `inventory_items` : note, « dernière commande le … », coche « à commander »
   → signal pour la personne gérante + bouton « commandé ✓ » ; section
   Commandes fournisseurs reprise). Migration `20260911145021_brief_morg`,
   actions auditées (`inventory.*`), section nav « Infrastructure ».
6. **H6 — Logs** : page owner/dev + cron archivage mensuel.
7. **H7 — Contact** : réception IMAP, file d'approbation par type, newsletter
   opt-in, squelette WhatsApp.
8. **H8 — Paramètres élargis + Compte** ; nav réorganisée (sous-menus).
9. **H9 — Redirects** des anciennes routes puis suppression des pages
   remplacées (offres, bookings, clients, invoices, housing, purchase-orders,
   register, taches, fiches).

## Ordre d'implémentation

A1 → A2 → A4/A5 → B1/B2 → A3 (console) → C → D (migrations + CI + tests)
→ **G (itération 1, cible mi-octobre)** → **G9 (parcours client v2)**
→ **H (réorganisation back-office, en cours)** → E → F.
Chaque étape : implémentation commentée → vérification (`npx tsc --noEmit`, `npm run lint`)
→ proposition de commit → validation manuelle.

---

## Review sécurité + fonctionnalités (2026-09-09) — correctifs appliqués

**Sécurité (H = haute, M = moyenne)**
- **C1 — RLS deny-by-default** : migration `20260909123239_rls_deny_by_default`
  active RLS sur les 27 tables `public`, sans policy pour `anon`/`authenticated`
  (Data API PostgREST aveugle) et avec `app_user_full_access` pour `app_user`
  (l'app ne passe que par Drizzle). Doc : `docs/securite-supabase.md` §6.
- **H1 — Mass-assignment `completePetAction`** : allow-list zod
  (`clientPetCompletionSchema`), jamais `clientId`/`species`/`vaccines`.
- **H2 — Cron fail-closed** : `/api/cron/daily` renvoie 500 en production si
  `CRON_SECRET` est absente (avant : garde conditionnelle = endpoint ouvert).
- **H3 — Anti-abus public** : table `rate_limit_hits` + `lib/rate-limit.ts`
  (compteur persistant par IP hashée) sur `/reserver` (recherche + soumission),
  ancienne demande publique (supprimée) et `/login` ; honeypot dans le wizard.
- **M1/M2 — Jetons hashés + rotation** : `lib/tokens.ts` (SHA-256, temps
  constant) ; `clients.access_token_hash` (colonne legacy conservée pour la
  transition, re-hash au premier usage) ; liens de reprise à usage unique dans
  les emails via session cookie signée (`lib/espace-session.ts`) ; bouton
  « Régénérer le lien d’accès » côté dashboard.
- **M4 — Headers HTTP** : `next.config.ts` (HSTS, nosniff, DENY, Referrer-Policy,
  Permissions-Policy, CSP Report-Only).
- **M5 — `/api/health`** : réponse élaguée en production (pas d'envs ni d'erreur
  DB brute).

**Bugs fonctionnels**
- Contrainte EXCLUDE vs `expired` : suppression des segments dans
  `cancelBooking`/`expireOfferedBooking` + purge en migration
  (`20260909123305_contrainte_expired`).
- Cron : expiration des `proposed` ET `offered`.
- Check-in/out : machine à états (`confirmed`→check-in, `checked_in`→check-out),
  verrou `FOR UPDATE`.
- `housing/page.tsx` ouverte au rôle `staff` (lecture), mutations toujours `owner`.

**Complétion it1**
- **E2** : bouton wizard « Déjà client ? Recevoir un lien d’accès »
  (`requestResumeLinkAction`, réponse non énumérable, rate-limit strict).
- **Pages** : `/dashboard/bookings` (+ détail), `/dashboard/invoices` (génération
  facture finale + Pennylane), `/dashboard/purchase-orders` (création + réception)
  ; numérotation commandes séquentielle sous `pg_advisory_xact_lock`.
- **Tâches du jour** : cochage persisté dans `daily_reports` (index unique
  pet/date, migration dédiée).
- Nav dashboard filtrée par rôle ; suppression du code mort
  (`DemandeForm`, `submitPublicDemandeAction`, `confirmDepositPayment`,
  `public-demandes.ts`) ; `bookingFinancialState` sécurisée (try/catch).
- Tests : 47 Vitest verts (ajout : allow-list complétion + jetons).
