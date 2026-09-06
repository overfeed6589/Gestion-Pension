# Gestion-Pension

Application de gestion de pension pour animaux (séjours, réservation, facturation).
Première application réelle : pension pour chats (France). Cible produit : outil
diffusé par abonnement à d'autres pensions.

## Stack

- **Next.js 16** (App Router) + React 19 + Tailwind CSS v4
- **Drizzle ORM** (+ drizzle-kit) sur PostgreSQL **Supabase** (auth uniquement)
- **Supabase Auth** (cookies de session durcis, proxy `src/proxy.ts`)
- Paiement : **Stripe** (acomptes, Checkout + webhook)
- Emails : **Resend** ; tâches planifiées : Vercel Cron
- Tests : **Vitest**

## Documentation

| Sujet | Fichier |
|---|---|
| Architecture & conventions | `AGENTS.md` (à lire avant de coder) |
| Plan technique (sécurité, itération 1) | `PLAN.md` |
| Roadmap produit | `docs/ROADMAP.md` |
| Déploiement Vercel/Stripe + smoke test | `docs/deploiement-vercel.md` |
| Test live de toutes les fonctionnalités | `docs/test-live-fonctionnalites.md` |
| Parcours client & emails (matrice) | `docs/parcours-client-emails.md` |
| Durcissement Supabase (checklist) | `docs/securite-supabase.md` |

## Démarrage local

```bash
npm install
cp .env.local.example .env.local   # (si présent) ou configurez les variables
npm run dev
```

Variables attendues : voir `src/lib/env.ts` (échec tôt si une clé requise manque).

## Commandes utiles

```bash
npm run dev          # dev
npm run build        # build
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
npm test             # vitest
npm run db:generate  # drizzle-kit generate (migration versionnée)
npm run db:migrate   # drizzle-kit migrate (DIRECT_URL / 5432)
npm run db:grants    # rôle app_user (moindre privilège)
npm run db:constraints # contrainte anti double-réservation
npm run seed:profiles  # emails Supabase → rôles (profiles)
```

## Parcours principal (itération 1)

1. Client dépose une **demande** depuis le site public (`/`).
2. La secrétaire la transforme en **offre** (`/dashboard/offres`) : espaces
   bloqués (segments), tarif par espace + supplément/animal, acompte (défaut 30 %).
3. Le client paie l'acompte (Stripe) → réservation **confirmée**, **facture
   d'acompte** émise.
4. Le personnel suit les **tâches du jour** et le **registre** (check-in/out) ;
   le propriétaire consulte occupation, CA prévisionnel et encaissés.
