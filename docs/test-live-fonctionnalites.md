# Test live de bout en bout — toutes les fonctionnalités

Objectif : valider chaque fonctionnalité **en production** avant/pendant l'utilisation
réelle. Prérequis : app déployée sur Vercel, variables d'environnement en place,
**Stripe en mode LIVE** (paiements réels de petit montant, remboursés après test),
Resend branché (domaine vérifié), Supabase durci (checklist `docs/securite-supabase.md`).

> ⚠️ Paiement : utilise une **vraie carte** avec un petit montant puis **rembourse** via
> le dashboard Stripe, ou garde le mode TEST tant que tu n'es pas prêt.

---

## 0. Préparation
- Créer les comptes Auth (Supabase → Users) : 1 `owner`, 1 `secretary`, 1 `staff` ;
  exécuter `npm run seed:profiles` (depuis le poste, `.env.local`) avec le bon mapping d'emails.
- Vérifier `https://<domaine>/api/health` → `"status":"ok"`.
- Adresse email de test pour recevoir les emails clients (ex: ton adresse).

## 1. Sessions & sécurité
| Test | Attendu |
|---|---|
| Visiter `/dashboard` déconnecté | redirection `/login` |
| Se connecter (owner/secretary/staff) | arrivée `/dashboard` |
| Re-visiter `/login` connecté | redirection `/dashboard` |
| Tenter une action interdite (ex: staff sur création d'espace) | redirection `/dashboard` |

## 2. Parc & paramètres
1. **Logements** : créer un espace (capacité, prix €, supplément, public), ajouter 2-3 box.
2. **Éditer/supprimer** : modifier prix/description ; supprimer un box vide ; supprimer un
   espace → doit refuser si box/historique.
3. **Hors service** : basculer un box « hors service » → il n'apparaît plus libre.
4. **Occupation** : la page Logements montre Libre/Occupé (dérivé des réservations).
5. **Paramètres** : nom, acompte %, jours annulation, validité offre, créneaux, seuils 15/7/1.

## 3. Clients
- Créer un dossier (client + 1er animal) ; ajouter un 2e animal au dossier ; modifier la fiche
  (I-CAD, vaccins) côté espace client ou staff.

## 4. Réservation publique (parcours v2)
1. Landing → « Réserver en ligne » (`/reserver`) : dates + coordonnées.
2. **Nouvel email** : saisie libre ; **email connu** : bouton « Déjà client ? Recevoir un lien
   d’accès » → email avec lien unique (30 min) qui ouvre l’espace client (dossier + animaux).
3. Propositions : catégories libres en continu + solution en découpage (si pertinent) ;
   vérifier que le prix estimé = nb nuits × tarif/nuit.
4. Saisir les animaux (I-CAD optionnel) → envoyer.
5. Emails reçus : **E1 confirmation demande** + lien dossier.
6. Vérifier côté staff : la demande apparaît en « attente de validation » et **bloque** les espaces
   (une 2e demande sur les mêmes dates/espaces doit être refusée ou proposer autre chose).

## 5. Traitement staff (`/dashboard/offres`)
1. **Ajuster** la réservation (changer une catégorie/date) → recalcul prix/acompte.
2. **Valider & envoyer le paiement** → statut `offered`, email **E3** reçu (lien dossier) ; si un
   I-CAD manque → email **E5** « compléter les infos ».
3. Tester aussi **Valider sans acompte** → `confirmed`, email **E4** ; le client garde un lien solde.

## 6. Espace client `/espace/<jeton>`
- Compléter les infos (I-CAD/vaccins/vétérinaire) → enregistré ✓.
- Choisir les créneaux arrivée/départ.
- **Paiement acompte** → page Stripe → payer (petit montant réel) → retour dossier.
  - Webhook : statut `confirmed`, email de confirmation, **facture d'acompte** payée, email **E6**
    « précisez vos heures ».
- **Paiement du solde/complet** : si déjà acompte → payer le solde ; si rien payé → payer le total
  → statut `fully_paid` + **facture finale** payée (nette de l'acompte si acompte déjà reçu).
- Lien périmé (essayer un paiement déjà soldé) → doit refuser/rembourser, pas de double encaissement.

## 7. Registre, tâches, rapports
1. **Registre** : le jour du séjour, « Arrivées » → check-in ; le dernier jour → check-out ; les
   box se libèrent (occupation/tâches à jour).
2. **Tâches du jour** (`/dashboard/taches`) : l'animal présent apparaît (alimentation/soins/notes).
3. **Rapports** (`/dashboard/rapports`) : occupation, arrivées/départs, CA prévisionnel/encaissé,
   acomptes en attente — jour et semaine.
4. **Dashboard** : cartes + actions rapides à jour après chaque étape.

## 8. Relances & emails automatiques (cron)
Tester la route cron avec le secret :
```
curl -X POST https://<domaine>/api/cron/daily -H "Authorization: Bearer <CRON_SECRET>"
```
Réponse `{ "received": true, "report": [...] }`.
- **E10** (acompte impayé) : créer une offre > 24 h sans paiement → relance, une seule fois.
- **E7** (heures J-15/7/1) : créer une réservation confirmée SANS créneaux dont l'arrivée est à
  J-15/J-7/J-1 (via une demande/une nouvelle réservation planifiée) → relance dédupliquée.
- **Expiration** : laisser une offre dépasser sa validité → statut `expired`, espaces libérés.
- **E11** (solde J-7) : réservation confirmée acompte payé à J-7 → rappel solde.

## 9. Annulations / remboursements
1. Réservation confirmée (acompte payé) annulée **≥ 7 j** avant → acompte **remboursé** (Stripe),
   facture d'acompte → `refunded`, booking `cancelled`.
2. Annulation **< 7 j** → acompte **retenu** (booking `cancelled`, pas de remboursement).

## 10. Facturation & Pennylane
- Numérotation : `FAC-YYYY-NNNN` séquentielle sans doublon après plusieurs factures.
- Si Pennylane configuré : facture transmise (best effort, échec non bloquant).

## 11. Fiches techniques & rôles
- `/dashboard/fiches` : owner ajoute/modifie/supprime une fiche ; staff la lit.
- Matrice de rôles : vérifier masquage/actions (owner ≠ staff ≠ secretary) conformes au PLAN.md.

## 12. RGPD / erreurs
- Lien `/espace` invalide → message clair, pas de donnée exposée.
- Un email inconnu ne révèle rien (pas de « client connu » sans envoi).
- Consentement RGPD stocké à la demande (colonne `rgpd_consent_at`).

---

### Rappel des emails attendus (matrice)
E1 confirmation demande · E2 lien reprise client connu · E3 résa validée/paiement · E4 validée sans
acompte · E5 compléter infos · E6 préciser heures · E7 relances heures J-15/7/1 · E8 confirm acompte ·
E9 confirm paiement total · E10 rappel acompte · E11 rappel solde. Détails : `docs/parcours-client-emails.md`.
