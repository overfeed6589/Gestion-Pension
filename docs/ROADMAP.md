# Roadmap — Gestion-Pension

Document produit / vision. Le détail technique d'implémentation vit dans
`PLAN.md` (Phase G). Statuts : décisions issues d'une session de cadrage
(« grill ») avec le propriétaire.

---

## Positionnement

- **Itération pilote** : la pension Chat S'Amuse (chats, France) utilise l'outil
  en réel. Déploiement mono-tenant (1 organisation), Vercel + Supabase Gratuit.
- **Cible produit** : diffuser l'outil en SaaS par abonnement à d'autres pensions
  pour animaux. Pour éviter un refactor bloquant plus tard, le code introduit dès
  maintenant une notion de « settings pension » (1 seule ligne pour le pilote) et
  garde les pages publiques dépendantes de cette config — mais **aucune isolation
  multi-tenant n'est implémentée** à ce stade.

## Décisions verrouillées (grill)

| Sujet | Décision |
|---|---|
| Périmètre itération 1 | Interne **+ réservation publique** (demande → offre → acompte). Pas d'instantané. |
| Tenant | Pension pilote seule ; settings/org en place, isolation multi-tenant plus tard. |
| Résa publique (flux) | Le client saisit dates + animaux → la pension émet une **offre** (segments + prix) → acompte Stripe → paiement = confirmation. |
| Paiement | Carte (Stripe Checkout), acompte **30 %**, le paiement de l'acompte confirme la résa. |
| Tarification | Prix **par espace** + **supplément/animal** au-delà du 1er, configurable **par catégorie**. Capacité = 1 espace ≤ N animaux d'une même famille. |
| Algo split / équilibrage | Mode **suggestion validée par un humain** ; auto-optimisation **itération 2**. |
| Facturation | Facture **d'acompte à la confirmation** (trace pour remboursement). France/Pennylane d'abord, moteur générique multi-pays plus tard. |
| Annulation / remboursement | Acompte remboursé si annulation **≥ 7 jours** avant l'arrivée ; sinon retenu. Trace via facture + remboursement Stripe. |
| Mailing (it1) | Uniquement l'**outbound transactionnel** (offre, relances) à coût quasi nul. Lecture de boîte Gmail + brouillons IA = itération 2. |
| Canaux externes | WhatsApp API Business **préparée derrière une interface** (vérif Meta + budget plus tard), numéro partagé répondu depuis le PC. |
| LLM | **Multi-provider derrière une façade**, modèles économiques ; usage limité à ce qui nécessite vraiment un LLM (le reste = automatisation déterministe). |
| Fondations techniques | **Migrations drizzle versionnées + CI + tests posés avant/avec** l'itération 1 (fini le push ad hoc). |
| Deadlines | Itération 1 : **mi-octobre**. Itération 2 : **fin novembre**. |

Répartition déterministe vs LLM (validée) :
- **Déterministe (gratuit)** : tâches du jour, rapports quotidien/hebdomadaire,
  relances acompte/solde, rappels email.
- **LLM uniquement** : brouillons de réponses mail, chat staff sur les
  pensionnaires, résumés. Chatbot client → plus tard.

---

## Itération 1 — cible mi-octobre

> Objectif : la pension reçoit et gère des demandes web avec acompte, fait ses
> tournées quotidiennes, et le owner suit les chiffres sans être sur place.

### Top 3 fonctionnel
1. **Réservation publique** (demande → offre → acompte Stripe 30 %)
   - Catalogue exposé (catégories marquées publiques + suppléments).
   - Rattachement prospect : email connu → dossier existant (validation
     secretary), sinon nouveau client.
   - Offre = segments (découpage manuel assisté de la dispo) + services + prix.
   - **Blocage anti-double-offre** : l'offre émet des `booking_segments` en
     statut `offered` qui bloquent (contrainte `EXCLUDE` existante) ; expiration
     72 h (cron) libère. L'acompte convertit en `confirmed`.
   - Facture d'acompte émise à la confirmation.
2. **Tâches du jour** (tours matin/soir)
   - Générées depuis les segments confirmés/présents : par jour et par espace,
     médocs, alimentation (croquettes/pâtée), notes comportement.
   - Checklist dans l'app ; cocher = trace (s'appuie sur `daily_reports`).
3. **Relances automatiques + dashboards owner**
   - Relances (cron quotidien) : acompte impayé sur offre non expirée, solde dû
     avant arrivée (J-7).
   - Dashboards : taux d'occupation, CA prévisionnel vs encaissé, statuts de
     paiement.

### Fondations (préalables)
- Migrations drizzle versionnées + CI GitHub Actions (lint → typecheck → build).
- Premiers tests Vitest (dispo, tarification, numérotation, relance).
- Table `pension_settings` (1 ligne) : identité, légal, acompte %, domaine
  public, catégories exposées.

### Parcours réservation v2 (dans l'itération 1)
> Voir `docs/parcours-client-emails.md` (machine à états + matrice emails).

- Demande publique en étapes : dates → email (client connu = lien de reprise
  prérempli ; inconnu = saisie libre) → choix des animaux → propositions de
  disponibilité (catégories complètes + splits mixtes) → saisie des nouveaux
  animaux.
- Hold bloquant dès la demande (statut `proposed`), espaces réservés.
- Validation staff (mini-éditeur secretary/owner) avant envoi du paiement ;
  validation « sans paiement » possible.
- Dossier client par jeton (`/espace/<jeton>`, pas de compte) : complétion
  animaux, créneaux arrivée/départ, paiement **acompte ou total** à montant
  choisi (facture finale immédiate si total payé).
- Emails automatisés (confirmation, paiement, complétion, créneaux) + relances
  créneaux J-15/7/1, dédupliquées.

### Hors périmètre itération 1 (non-goals)
- Lecture/triage de la boîte mail partagée + brouillons IA.
- WhatsApp/SMS effectifs (interface seulement, prête pour itération 2).
- Carnets d'adresses, fiches techniques staff.
- Algo split / optimisation automatique.
- Envoi automatique de factures, anniversaires / newsletters.
- Portail client de suivi, chatbot client.
- Multi-tenant réel, facturation hors France.

---

## Itération 2 — cible fin novembre

> Objectif : faire gagner du temps au staff et centraliser la communication.

1. **Mailing central + IA**
   - Lecture de la boîte partagée (Google Workspace / Gmail API, OAuth) :
     pension@chat-s-amuse.com ou le mail secrétaire, sinon le mail owner.
   - Triage des mails entrants, **brouillons de réponse IA** (façade LLM
     multi-provider), envois validés par un humain.
   - Emails transactionnels enrichis avant/après séjour.
2. **WhatsApp Business API** (derrière l'interface posée en itération 1)
   - Numéro partagé, réponses depuis le PC de la pension. Vérification Meta +
     budget engagé.
3. **Algo split & équilibrage (suggestion)**
   - Proposition de découpage intelligent à la création d'offre
     (ex : 13 j demandés → 11 j type 1 + 2 j type 2), respectant
     « ≤ 1 changement d'espace / semaine » et le remplissage.
4. **Carnets d'adresses multiples + fiches techniques staff**
   - Vétérinaire, livreurs, fournisseurs, clients, urgences…
   - Base de fiches pratiques (chat agressif, soins…) accessible au personnel.
5. **Suivi animaux hors séjour + anniversaires**
   - Rappels (vaccins), nouvelles apportées par le propriétaire.

---

## Backlog produit (au-delà de l'itération 2)

- Portail client (suivi des résas, documents, paiement du solde en ligne).
- Chatbot client IA.
- Tableaux de bord & rapports hebdomadaires générés (LLM) pour le owner.
- Industrialisation SaaS : multi-tenant, abonnement, onboarding des pensions.
- Facturation hors France (moteur autonome / autres éditeurs, conformité).
- Réservation publique « instantanée » pour clients connus (optionnel).
- Optimiseur global d'occupation + approbation par le staff.

---

## Risques

- **Périmètre itération 1 trop large** pour une cible mi-octobre → garder le
  top 3 strict ; le reste glisse en itération 2 sans drame.
- **Résa publique + Stripe** : double-offre sur la même unité → atténué par le
  blocage `offered` + contrainte `EXCLUDE` (couche B) et l'expiration 72 h.
- **E-mail sortant** mal configuré (spam) → SPF/DKIM/DMARC sur le domaine,
  fournisseur dédié (Resend ou Gmail API) plutôt que SMTP maison.
- **Données clients/animaux** : ne pas envoyer vers un LLM sans DPA adaptée ;
  la façade LLM (it2) doit le permettre par config.
- **RGPD** du formulaire public (consentement, minimisation, droit à
  l'effacement — cf. docs/securite-supabase.md).
