<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Gestion-Pension (pension de animaux — boarding management)

## Repo basics
- Language: repo is French. UI strings, comments, DB comments, and commit messages are in French — keep new ones French. Commit style: one-line summaries like `MaJ schema supabase ...`.
- `README.md` is stale: it contains unresolved git merge-conflict markers plus create-next-app boilerplate. Do not trust it.
- `CLAUDE.md` just references `@AGENTS.md`.
- A multi-GB untracked core dump (`core.*`) sits at repo root — never `git add -A` it; safe to delete.

## Stack (package.json)
- Next.js 16.3.3 (App Router) + React 19. Tailwind CSS v4 (CSS-first, `@import "tailwindcss"` in `src/app/globals.css`, no tailwind.config).
- Drizzle ORM `drizzle-orm@^1.0.0-rc` (+ `drizzle-kit`) against Supabase-hosted Postgres; Supabase (`@supabase/ssr`) used for **auth only** (no Supabase data access). zod v4 for validation.

## Commands
- `npm run dev` / `npm run build` / `npm run lint` (= `eslint`, flat config). **No test suite, no CI** — typecheck via `npm run typecheck` (= `npx tsc --noEmit`).
- DB admin scripts (run as `postgres` via `DIRECT_URL`, port 5432 — NOT the pooler):
  `npm run db:grants` (`scripts/apply-grants.ts`, creates least-privilege role `app_user`),
  `npm run seed:profiles` (`scripts/seed-profiles.ts`, maps Supabase auth emails → `profiles` rows).
- Env comes from `.env.local` (gitignored). `drizzle.config.ts` loads it via `dotenv.config({ path: '.env.local' })` and uses `DIRECT_URL || DATABASE_URL`.
- Runtime server env is validated once through `serverEnv` in `src/lib/env.ts` (zod, fails fast) — import it instead of reading `process.env` ad hoc; never import it from a client component.
- Connection split (least privilege, PLAN.md A4): `DATABASE_URL` = pooler transaction 6543 with `app_user`; `DIRECT_URL` (5432, `postgres`) only for DDL/migrations/seeds/grants.
- DB schema is `src/db/schema.ts`; no `drizzle/` migration snapshots are committed — schema edits are pushed straight to the live Supabase Postgres (recent commits are all schema updates).

## Architecture & conventions
- Path alias `@/*` → `src/*`. Import db as `db` from `@/db`; Supabase SSR client from `@/utils/supabase/server`.
- `src/middleware.ts` redirects unauthenticated `/dashboard/*` traffic to `/login`.
- Domain layout: pages are async server components under `src/app/dashboard/<module>/` (housing, bookings, clients, invoices, purchase-orders, register). Mutations are `'use server'` actions in colocated `actions.ts` files (e.g. `src/app/dashboard/clients/actions.ts`): they parse `FormData`, validate with zod schemas in `src/lib/validations/`, run `db.transaction`, call `revalidatePath`, and return `ActionState` from `src/types/actions.ts`. Domain/scheduling logic lives in `src/lib/` (`scheduling/`, `invoicing/`, `integrations/pennylane.ts`).
- **Every `'use server'` mutation starts with an access guard** from `src/lib/auth.ts` (`requireUser()`, or `requireRole('secretary'|'staff'|'owner')` per the role matrix in `PLAN.md`). Roles live in the `profiles` table (`id` = `auth.users.id`, no public FK). `dev`/`owner` are "boss" roles covering all permissions; `secretary` and `staff` are disjoint.

## Drizzle — API is newer than most training data
- `drizzle-orm@1.0.0-rc`: relations use `defineRelations(...)` imported from `drizzle-orm` (`src/db/schema.ts:431`), **not** the legacy `relations()` helper.
- Relational `.query.*.findMany({ with: ... })` works because `@/db/index.ts` passes `{ relations }` into `drizzle()`. Relation keys (e.g. `bookings.segments`, `segments.occupantLinks`, `segments.assignedUnit`, `segments.category`) are custom-named inside the `defineRelations` config — check it before writing `.with:`.
- Statuses/enums are exported `as const` arrays (`BOOKING_STATUSES`, `PAYMENT_STATUSES`, `INVOICE_STATUSES`, …) and columns are declared `text('col', { enum: ARRAY })` → plain TEXT in Postgres. Adding a value requires editing the const array too.

## Data gotchas
- Money is stored in **integer cents** (`basePricePerNight`, `totalPrice`, `defaultPrice`, `segmentPrice`, `amount`…); divide by 100 for display.
- Some date columns are `timestamp` (`bookings.checkInDate`) while `booking_segments.startDate/endDate` are `date`; existing code inserts them via `.toISOString()`.
- UI uses shadcn-style token classes (`bg-card`, `text-muted-foreground`, `border-border`, …) but `globals.css` only imports Tailwind — those tokens are **not defined** yet, so those elements render unstyled.
