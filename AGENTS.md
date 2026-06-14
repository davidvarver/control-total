<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes - APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Codex Instructions - Control Total / inventario-saas

## Project Name And Purpose

Project/package name: `inventario-saas`.

Product name used in the UI: `Control Total`.

Purpose: SaaS for marketplace sellers in Mexico to control inventory, Mercado Libre sales, SKU equivalences/kits, costs, expenses, restock needs, subscription access, and real profit by product/channel/account.

Main business goal: sell a monthly SaaS that gives sellers reliable operational and financial visibility: stock by warehouse, stock for marketplace publication, sales imports, hidden costs, low-stock alerts, and account blocking when the subscription is unpaid.

## Tech Stack

- Next.js `16.2.6` App Router with React `19.2.4`.
- TypeScript `^5`.
- Tailwind CSS `^4` via `@tailwindcss/postcss`.
- Prisma `6.19.3` and `@prisma/client` with PostgreSQL.
- Vitest `4.1.7`.
- Excel import/export with `exceljs` and `jszip`.
- Icons with `lucide-react`.
- Deployment target appears to be Vercel. `vercel.json` defines:
  - `/api/cron/meli-hourly` at `0 * * * *` for hourly Mercado Libre sales sync.
  - `/api/cron/meli-full-billing-monthly` at `0 12 1 * *` for previous-month Full billing charges.

## Important Folders And Files

- `src/app/`: Next.js App Router pages and API routes.
- `src/app/page.tsx`: main dashboard.
- `src/app/login/page.tsx`, `src/app/register/page.tsx`: auth pages.
- `src/app/inventario/page.tsx`, `src/app/inventario/[masterSku]/page.tsx`: inventory list and product detail.
- `src/app/ventas/page.tsx`, `src/app/ventas/[orderId]/page.tsx`: Mercado Libre/order sales views.
- `src/app/meli/page.tsx`: Mercado Libre integration UI.
- `src/app/importar/page.tsx`: import workflow.
- `src/app/setup/page.tsx`: setup/readiness work queue.
- `src/app/salud/page.tsx`: operational health/readiness page.
- `src/app/admin/page.tsx`: platform admin, gated by configured admin email.
- `src/app/api/`: API routes for auth, imports, products, SKUs, inventory, expenses, Meli, subscriptions, admin, exports, cron jobs.
- `src/components/`: shared UI components such as `app-shell.tsx`, `global-search.tsx`, forms, product actions, and inventory cost cells.
- `src/lib/domain/`: pure domain calculations and tests: inventory, finance, expenses, subscription, SKU matching.
- `src/lib/server/`: server-side data access, auth, reports, local store, audit, import parsing, stock sync, MVP status.
- `src/lib/meli/`: Mercado Libre client, OAuth/config, order normalization, grouping, sync, Full stock sync.
- `src/generated/prisma/`: generated Prisma output present in workspace. Do not hand-edit.
- `prisma/schema.prisma`: PostgreSQL schema and Prisma models.
- `prisma/enable-rls.sql`: script that enables RLS on all public tables; policies are not defined here.
- `data/local-store.json`: bundled fallback/demo store. Runtime JSON stores may also be created under `data/organizations/`.
- `data/auth-store.json`: local auth-related data file present in repo; current auth code uses Prisma sessions/users.
- `docs/plan-funcional-saas-inventarios.md`: original functional/business plan.
- `docs/mercado-libre-integracion.md`: Mercado Libre integration notes.
- `scripts/import-inventory.mjs`: inventory import script.
- `scripts/inspect-store.ts`: store inspection helper.
- `next.config.ts`: CSP/security headers and Turbopack root.
- `src/proxy.ts`: Next proxy/middleware for auth, rate limit, body limit, origin checks.

## Install And Run

Install dependencies:

```bash
npm install
```

Generate Prisma client:

```bash
npm run db:generate
```

Run locally:

```bash
npm run dev
```

Open `http://localhost:3000`.

Database setup:

```bash
npm run db:push
```

Enable RLS only after understanding the effect:

```bash
npm run db:enable-rls
```

Warning: `prisma/enable-rls.sql` enables RLS on all public tables but does not create policies. This can block application access if used without policies.

## Test, Lint, Build, Deploy

Tests:

```bash
npm test
```

Current observed result on 2026-06-01: passes, `9` files and `57` tests.

Lint:

```bash
npm run lint
```

Current observed result on 2026-06-01: passes.

Build:

```bash
npm run build
```

Current observed result on 2026-05-27: succeeds. Build runs `prisma generate && next build`.

Deploy: likely Vercel. Needs environment variables configured in Vercel. Do not assume production is healthy without checking Vercel logs/status.

## Environment Variables

Documented in `.env.example`:

- `DATABASE_URL`
- `APP_URL`
- `MELI_CLIENT_ID`
- `MELI_CLIENT_SECRET`
- `MELI_REDIRECT_URI`
- `MELI_WEBHOOK_SECRET`

Used by code but missing from `.env.example`:

- `CRON_SECRET`: required by `/api/cron/meli-hourly`; optionally used by `/api/cron/stock-sync`.
- `PLATFORM_ADMIN_EMAILS` or `SUPER_ADMIN_EMAILS`: comma-separated admin emails. Defaults to `david@gmail.com` if unset.

Local/Vercel env files contain additional provider-generated variables such as `DATABASE_URL_UNPOOLED`, `POSTGRES_*`, `PG*`, `NEON_*`, `VERCEL_*`, `TURBO_*`, and `VITE_NEON_AUTH_URL`. Do not print secret values.

## Coding Conventions

- Keep TypeScript strict and prefer explicit domain types over `any`.
- Use App Router server components by default where existing pages do.
- Use `requirePermission`, `requireWritablePermission`, `requirePlatformAdmin`, or API equivalents from `src/lib/server/auth-store.ts` before protected data access.
- Use `readLocalStore`/`writeLocalStore` and existing helpers in `src/lib/server/local-store.ts` unless a change intentionally migrates logic to relational Prisma tables.
- Keep pure calculations in `src/lib/domain/` and cover them with Vitest when behavior changes.
- Use `lucide-react` icons consistently with the existing UI.
- Keep UI styling aligned with `src/app/globals.css` classes such as `ct-card`, `ct-button`, `ct-button-primary`, `ct-button-secondary`, `ct-input`, and table wrappers.
- Do not hand-edit generated Prisma files under `src/generated/prisma/` or `node_modules/@prisma/client`.
- Do not expose tokens from local stores or environment files.

## Rules Before Making Changes

1. Read the relevant Next.js 16 documentation from `node_modules/next/dist/docs/` before changing Next.js APIs, routing, proxy/middleware behavior, config, or build conventions.
2. Check `PROJECT_CONTEXT.md`, `NEXT_STEPS.md`, and `CHANGELOG_CONTEXT.md` first.
3. Inspect the exact files to be changed and nearby tests.
4. Run `git status --short` and protect user changes. The current repo may have many untracked files.
5. Do not refactor broad areas while fixing one bug.
6. Do not change persistence strategy, auth/session logic, subscription locks, or Mercado Libre sync behavior without understanding side effects.
7. If data migrations or destructive DB operations are needed, ask first.
8. Never commit secrets, local tokens, or raw Mercado Libre credentials.

## Areas Not To Change Without Asking

- `.env.local`, `.env.vercel.local`, and any secret values.
- `data/local-store.json`, `data/auth-store.json`, and `data/organizations/*` if they contain real client/account data.
- `prisma/schema.prisma` and `prisma/enable-rls.sql`.
- `src/lib/server/auth-store.ts` subscription, session, role, and permission logic.
- `src/lib/server/local-store.ts` persistence and inventory mutation logic.
- `src/lib/meli/*` order import, billing, OAuth, Full stock, and stock update logic.
- `src/proxy.ts` security/auth/rate-limit behavior.
- `next.config.ts` security headers.
- Generated folders: `.next/`, `node_modules/`, `src/generated/prisma/`.

## Known Constraints And Warnings

- Persistence is hybrid: Prisma/PostgreSQL is used when `DATABASE_URL` exists, but the app also stores a JSON payload in `LocalDataStore` and falls back to local JSON files.
- `OperatingExpense` and `FullInventoryLayer` are persisted relationally while most operational store data remains JSON payload based.
- `src/lib/server/local-store.ts` auto-queues stock sync when product stock changes.
- Mercado Libre sync stores account tokens in local store objects. Treat store files/backups as sensitive.
- Mercado Libre hourly sync processes closed-hour sales in bounded batches and stores progress in each account's `salesBackfill`/`salesAutomation` state. Do not describe the UI as "unlimited sync"; large accounts may need multiple cron runs to catch up.
- `/api/integrations/meli/webhook` exists but is not the current primary sync path. Do not claim real-time webhooks are active until the Mercado Libre callback/security mechanism is validated in production.
- `/api/cron/stock-sync` exists for marketplace stock sync plumbing, but it is not scheduled in `vercel.json`. Do not claim Control Total pushes stock to Meli automatically until it is activated and monitored.
- RLS enablement currently has no policies in the SQL file.
- `src/proxy.ts` includes body-size limit, origin checks, API rate limiting, public route allowlist, and session enforcement.
- Some UI text appears with mojibake/encoding artifacts in inspected files. Confirm in browser before editing copy.
- `npm run lint` is currently not clean.

## Verification Before Saying Done

For documentation-only changes:

- Check generated docs for real file names, routes, env vars, and no invented claims.
- Run `npm test` if no code was changed only when useful; record result.

For code changes:

- Run targeted tests first.
- Run `npm test`.
- Run `npm run build`.
- Run `npm run lint` or document existing lint failures if unrelated.
- For UI changes, run the app and inspect the affected pages in browser.
- For Mercado Libre/inventory/subscription changes, verify affected API route behavior and data mutations using safe test data.
