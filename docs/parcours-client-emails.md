# Parcours client & emails automatisés (itération 1 — réservation v2)

Décisions issues du grill produit (dates/heures d'arrivée : rendez-vous client).
Implémentation détaillée dans `PLAN.md` (Phase G, bloc « Parcours client v2 »).

---

## Machine à états d'une réservation

```
requested (hérité, sans segments — peut disparaître)
   │  (nouveau parcours public)
proposed ── hold bloquant : segments créés dès le choix client,
   │        espaces occupés, expiration (validité du hold, ex 48 h)
   │        état : en attente de validation staff
   ├─ (staff valide + envoie lien)        → offered  (liens de paiement)
   ├─ (staff valide sans acompte)         → confirmed (lien solde maintenu)
   └─ (staff refuse / délai)              → expired / cancelled
offered ── acompte payé  ────────────────→ confirmed (deposit_paid)
offered ── total payé   ────────────────→ confirmed (fully_paid) + facture finale immédiate
confirmed ── check-in  ─→ checked_in ── check-out ─→ checked_out
(cancelled / expired atteignables à tout moment selon règles)
```

Statuts : `requested` · `proposed` · `offered` · `confirmed` · `checked_in` ·
`checked_out` · `cancelled` · `expired`.

---

## Parcours public

1. **Dates** : arrivée / départ.
2. **Email** : reconnaissance du client (email normalisé, insensible à la casse).
   - **Connu** : affichage minimal « client reconnu ✓ (prénom) » SANS données →
     bouton « Recevoir mes informations par email » → **lien de reprise unique**
     (signé/courte durée, à usage unique) envoyé à l'adresse. Le préremplissage
     (coordonnées + animaux) ne s'affiche qu'après clic sur ce lien.
   - **Inconnu** : saisie libre immédiate (coordonnées + nombre d'animaux), sans
     vérification bloquante.
3. **Animaux de ce séjour** :
   - connu : cocher parmi ses animaux enregistrés et/ou **ajouter un nouvel animal**
     sur place ; la disponibilité se calcule sur le nombre retenu ;
   - inconnu : saisie de base par animal (nom, espèce, sexe, stérilisé, naissance ;
     **I-CAD optionnel** à ce stade).
4. **Propositions de disponibilité** pour ce nombre d'animaux : chaque catégorie
   publique entièrement libre sur la durée **+ suggestions de découpage mixte**
   (ex : 11 j suite + 2 j box) ; description « meilleure situation » de chaque type ;
   nombre d'espaces = ⌈animaux / capacité⌉.
5. **Choix → validation** : création/mise à jour client, animaux nouveaux, booking
   **`proposed`** avec segments bloquants (auto-assign) → **email de confirmation**
   avec lien dossier.

Continuité : pas de compte/mot de passe. Le **jeton dossier** (par client, généré à
la première demande) est envoyé par email ; il ouvre `/espace/<jeton>`.

---

## Espace client `/espace/<jeton>`

- Liste des réservations du client (statuts, prochaines actions).
- **Complétion des animaux** (I-CAD, vaccins, vétérinaire, notes) pour les fiches
  incomplètes — mail dédié si manquant.
- Choix des **créneaux d'arrivée/départ** (configurables dans Paramètres).
- **Paiement** : bouton → page de choix **acompte (30 %) ou séjour complet** →
  session Stripe au montant choisi (montant périmé/déjà couvert → refusé).

Paiement : un seul montant valide à la fois, recalculé côté serveur.
- acompte payé → confirmée, le « complet » devient **solde** ;
- total payé → plus de lien (clos), facture **finale immédiate** ;
- validation « sans paiement » (décision staff) → confirmée, **lien solde maintenu**.

---

## Emails automatisés (Resend) — matrice

| # | Email | Déclencheur | Destinataire | Lien(s) inclus |
|---|---|---|---|---|
| E1 | Confirmation demande reçue | création booking `proposed` | client | `/espace/<jeton>` |
| E2 | Client connu — lien d'accès | bouton wizard « Déjà client ? Recevoir un lien d’accès » (`/reserver`) | client | lien de reprise unique (30 min) |
| E3 | Réservation validée — paiement | action staff « valider & envoyer » (`offered`) | client | `/espace/<jeton>` (paiement) |
| E4 | Validation sans acompte | action staff « valider sans paiement » | client | `/espace/<jeton>` (solde) |
| E5 | Compléter les infos animal | s'il manque I-CAD/vaccins | client | `/espace/<jeton>` |
| E6 | Préciser heures arrivée/départ | acompte reçu (ou validation) et créneaux absents | client | `/espace/<jeton>` |
| E7 | Relance créneaux (si absents) | cron à J-15 / J-7 / J-1 | client | `/espace/<jeton>` |
| E8 | Confirmation acompte reçu | webhook Stripe acompte | client | — |
| E9 | Confirmation paiement complet | webhook Stripe total | client | facture (ou doc) |
| E10 | Rappel acompte impayé | cron (offre émise > 24 h) | client | lien paiement |
| E11 | Rappel solde avant séjour | cron à J-7 (déjà existant) | client | — |

Dédup : table `outbound_emails` (bookingId, kind, sentAt) — chaque (booking, kind)
n'est envoyé qu'une fois (sauf E7 : un enregistrement par jalon, kind =
`heures_relance_15` / `_7` / `_1`).

Seuils & contenus paramétrables dans Paramètres :
`acompte %`, `validité hold`, `créneaux arrivée/départ`, `jours de relance créneaux
[15,7,1]`.

## Relances (cron quotidien existant, enrichi)

- expiration des `proposed`/`offered` non traités (validité hold) ;
- E10 : relance acompte des `offered` > 24 h ;
- E7 : relance créneaux manquants à J-15/7/1 avant arrivée (dédupliqué) ;
- E11 : rappel solde des confirmés à J-7.
