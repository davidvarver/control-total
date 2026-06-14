# Project Context - Control Total / inventario-saas

Last inspected: 2026-06-12.

## What The SaaS Does

Control Total is a SaaS for marketplace sellers, initially focused on Mexico and Mercado Libre. It helps manage master products, online SKUs, SKU-to-product equivalences, bundles/kits, warehouses, inventory movements, Mercado Libre orders, Mercado Libre Full stock/cost layers, product costs, manual charges, operating expenses, profit reporting, low-stock/restock reporting, users/roles, subscription access, and operational readiness.

The core business promise is real inventory and real profit, not just sales totals.

## Current State

The app is a functional Next.js 16 project with many pages and API routes already implemented. It builds successfully, lint passes, and unit tests pass.

Persistence is transitional:

- PostgreSQL/Prisma models exist in `prisma/schema.prisma`.
- Auth, users, roles, subscriptions, sessions, plans, payments, audit logs, `OperatingExpense`, `FullInventoryLayer`, `StockSyncQueue`, and `SyncRun` have relational models.
- Operational app data is now mirrored into relational tables for products, online SKUs, marketplace accounts, sale orders, sale items, sale components, sale charges, and inventory balances.
- `SaleOrder.payload` stores the full sale payload in PostgreSQL.
- `SalesMonthlySummary` and `ProductMonthlySummary` store long-range monthly report snapshots so old history can be reported without recalculating every raw sale. `/utilidad` monthly history now reads those snapshots directly.
- Main report builders now construct their working store from Prisma first for products, warehouses, online SKUs, components, marketplace accounts, inventory balances, inventory movements, and sale payloads. Relational sales reconstruction preserves Meli pack/shipping/payment/order-request metadata from `SaleOrder.payload` so split packages can be grouped as one real sale.
- `LocalDataStore.payload` remains as compatibility/fallback and for some write flows/niche screens, so PostgreSQL is much closer to source of truth but not the only persistence surface for the entire app yet.
- `/salud#escala-30k` estimates 30k ventas/mes readiness from current Meli sync limits, observed sale row sizes, historical catch-up time, and 12-month DB storage projection.
- `/salud#retencion` shows 24-month operational detail, 6-month raw Meli retention, 10-year summary retention, and monthly snapshot coverage.
- `/utilidad#historial-mensual` renders monthly history from snapshots automatically, without the previous load-history rebuild of raw orders.
- If `DATABASE_URL` is unset, runtime data falls back to local files such as `data/local-store.json` or `data/organizations/*.json`.

The package name is `inventario-saas`; the UI brand is `Control Total`.

## Completed Or Working Features Observed In Code

- Next.js App Router layout and UI shell with navigation in `src/components/app-shell.tsx`.
- Auth registration/login/logout using Prisma users and sessions.
- Session cookie `ct_session`.
- Role and permission system in `src/lib/server/auth-store.ts`.
- Subscription access checks with `trial`, `active`, `grace`, `suspended`, `cancelled`, and lock modes `none`, `read_only`, `full_lock`.
- Platform admin gate via `PLATFORM_ADMIN_EMAILS` or `SUPER_ADMIN_EMAILS`.
- Dashboard, inventory, sales, profit, reports, alerts, restock, setup, account, users, audit, health, and Meli pages.
- Product CRUD endpoints and UI actions.
- Inventory adjustment, transfer, and Mercado Libre Full layer/shipment logic.
- Import endpoints for inventory, SKU mappings, inventory quantities, product costs, and Full layers.
- Export endpoints for report/template data.
- Mercado Libre OAuth connect/callback flow.
- Mercado Libre recent order sync and single-order sync support.
- Mercado Libre order normalization and tests.
- Mercado Libre webhook endpoint exists and records received integration events.
- Mercado Libre billing retry and audit repair routes exist.
- Mercado Libre Full stock sync exists.
- Mercado Libre Full stock has a daily cron, and Full billing/storage charge import has monthly plus daily retry cron. Sent-to-Full inbound shipments/layers are supported by manual/import flows, but automatic inbound shipment detection from Meli is not implemented yet.
- Sales UI distinguishes the real Mercado Libre sale number (`order_request.id` or `packId`) from internal API order/package ids. Detail routes and search should accept the real sale number, internal API order ids, and child pack/shipping/payment aliases, while API repair/write flows continue using an internal order id.
- Sale detail keeps split-package sales auditable by showing both consolidated item rows and a separate internal package/API-order breakdown.
- Mercado Libre normalization promotes shipment `family_pack_id`/family pack metadata into `order_request.id` so split Full purchases with many internal packs can group at purchase level.
- Stock sync queue model and processor exist for updating marketplace listing stock.
- Profit, inventory, sales, SKU detail, order detail, restock, and audit report builders.
- Operating expenses with recurring frequency calculations.
- Security headers in `next.config.ts`.
- Proxy/auth/rate-limit/body-limit/origin checks in `src/proxy.ts`.
- Vercel cron route `/api/cron/meli-hourly` wakes once per hour on Vercel Pro. It imports closed-hour windows, so a run at 4:30 imports up to 4:00 and does not pull current live-minute sales. Each run processes bounded batches, currently up to 150 orders per connected account, stores progress, and continues on the next run if the period is not caught up.
- Sync run history is recorded in the `SyncRun` table and shown on `/meli`.
- Admin backup includes recent sync runs and redacts sensitive token/password fields.
- Unit tests pass: 12 test files, 76 tests.
- Current observed unit tests on 2026-06-12 pass: 15 test files, 86 tests.
- Production build succeeds.

## Partially Built Or Unfinished

- Full relational source-of-truth migration is incomplete, but main report/read pages now prefer relational data. Remaining work is mostly write-path cleanup, niche screens, and eventually removing JSON compatibility.
- `prisma/schema.prisma` is broad, but many models are not directly used for all operational flows yet.
- RLS script only enables RLS, no policies are defined.
- Mercado Libre webhook exists, but docs say webhook signing/validation is pending if a real secret is defined.
- Mercado Libre integration docs say PostgreSQL storage for integration data is pending; current code uses local store payload/account objects.
- Applying real inventory movements from all imported Meli orders is present through local-store mutation, but should be verified with real edge cases.
- Marketplace stock sync queue exists, but it depends on DB mode and correct `externalListingId`/account mapping.
- Amazon and TikTok are in schema/roadmap but not implemented as integrations.
- Publicidad/ad spend model is planned in docs but not observed as implemented table/page.
- Returns workflow is planned but not fully observed as implemented.
- CSV/Excel import is implemented for several templates, but exact production readiness needs browser/data verification.
- UI copy may have encoding artifacts in some files when inspected in terminal.

## Planned But Not Started Or Not Confirmed

- Amazon SP-API integration.
- TikTok Shop integration.
- Automated advertising import/attribution.
- FIFO costing for ordinary purchases beyond Mercado Libre Full layer allocation.
- Product publishing to marketplaces.
- Broader sync/admin health dashboards beyond the current `SyncRun` bitacora on `/meli` and health checks on `/salud`.
- Full database RLS policies.
- Automated billing/payment provider. Current subscription/payment appears manual.
- Password reset/recovery. Mentioned in plan but not observed as implemented.
- Multi-organization selector for users in multiple organizations. Current `publicDbUser` takes first active membership.

## Known Bugs, Errors, Broken Flows

Observed verification on 2026-06-01:

- `npm run lint` passes.
- `npm test -- --run` passes: 15 test files, 86 tests.
- `npm run build` passes.
- Production deploy to Vercel succeeds and aliases to `https://control-total-phi.vercel.app`.
- Manual production cron call to `/api/cron/meli-hourly` succeeds with `Authorization: Bearer <CRON_SECRET>`.
- Latest production sync run is recorded in `SyncRun` with status `success`.
- `/ventas` now paginates the operational order table at 100 rows per page to avoid rendering thousands of orders at once.
- Dashboard and the top Alertas metrics use current-month sales/profit/loss counts; Alertas still has a clearly labeled historical problem queue for older unresolved sales.

Possible/needs-confirmation bugs:

- Text encoding artifacts appear in terminal output for some Spanish UI strings, e.g. `AuditorÃ­a`, `suscripciÃ³n`. Verify in browser before changing.
- `prisma/enable-rls.sql` can break DB access if run without policies.
- `src/app/api/cron/stock-sync/route.ts` uses query param `secret`, while `/api/cron/meli-hourly` uses `Authorization: Bearer <CRON_SECRET>`. This inconsistency may be intentional but should be reviewed before broad stock publishing.
- `MELI_WEBHOOK_SECRET` is documented but not observed as used in the webhook route.

## Problems Already Detected And Attempted Fixes

Known from files/docs only:

- `docs/mercado-libre-integracion.md` lists pending fixes: store Meli data in PostgreSQL instead of JSON local, apply real inventory movements when mapped, download shipment detail with `/shipments/{id}`, fetch fuller finance costs, validate signed webhooks if operational secret is defined.
- `src/lib/server/local-store.ts` includes fallback behavior for DB errors and comments/logging around dynamic relational fetch/write for `OperatingExpense` and `FullInventoryLayer`.
- `src/lib/server/local-store.ts` prunes raw Meli order payloads during recalculation to reduce storage footprint.
- `src/lib/server/stock-sync.ts` added automatic queueing and retry behavior for Meli stock sync.

Unknown: prior chat history beyond repository contents.

## Product/Business Decisions Already Made

From `docs/plan-funcional-saas-inventarios.md` and code:

- Multi-tenant SaaS with organizations.
- Initial market: sellers in Mexico.
- Initial marketplace priority: Mercado Libre first, Amazon and TikTok later.
- Product identity in UI: Control Total.
- Inventory should be tracked by master product and warehouse.
- Online SKUs map to one or more master products and quantities, allowing kits/bundles.
- Costing starts with average cost; FIFO remains future/partial. Mercado Libre Full has layer-based cost allocation.
- Subscription payment is manual at first.
- Unpaid/suspended accounts are not deleted; access is locked.
- 10-day grace period after subscription expiration.
- Super admin can manage organizations/subscriptions/payments.

## Technical Decisions Already Made

- Next.js App Router, API routes, and server components.
- Prisma/PostgreSQL as target database.
- Hybrid JSON store remains central for operational data.
- Generated Prisma client uses default `@prisma/client` in current schema; `src/generated/prisma` also exists from a previous/generated state and should not be edited manually.
- Prisma connection URL is modified with configurable `DATABASE_CONNECTION_LIMIT`/`DATABASE_POOL_TIMEOUT`; production defaults to a small pool instead of `connection_limit=1`. Supabase pooler gets `pgbouncer=true`.
- Middleware/proxy security layer enforces session, body-size limit, same-origin mutation checks, API rate limiting, and blocks `x-middleware-subrequest`.
- Mercado Libre API client uses official endpoints and token refresh flow.
- Vercel cron configured for Meli sales sync every hour, daily Full stock, monthly Full billing, weekly data retention, and weekly monthly snapshots. Meli sales sync is intentionally bounded per run for function stability.

## Database Structure

Primary schema file: `prisma/schema.prisma`.

Enums:

- `Channel`: `mercado_libre`, `amazon`, `tiktok`, `manual`
- `OrganizationStatus`: `active`, `suspended`, `cancelled`
- `UserStatus`: `active`, `invited`, `suspended`
- `WarehouseType`: `own`, `mercado_libre_full`, `amazon_fba`, `tiktok_fulfillment`, `third_party`, `returns`, `damaged`, `transit`
- `InventoryMovementType`: `purchase`, `sale`, `return`, `adjustment`, `transfer_in`, `transfer_out`, `reserve`, `release_reserve`, `damage`
- `SubscriptionStatus`: `trial`, `active`, `grace`, `suspended`, `cancelled`
- `LockMode`: `none`, `read_only`, `full_lock`
- `SaleChargeType`: marketplace/finance/cost charge types.

Models:

- SaaS/auth: `Organization`, `LocalDataStore`, `User`, `AuthSession`, `OrganizationUser`, `Role`, `Permission`, `RolePermission`, `AuditLog`.
- Catalog/inventory: `MasterProduct`, `OnlineSku`, `SkuComponent`, `Warehouse`, `InventoryBalance`, `InventoryMovement`.
- Purchases/costs: `Supplier`, `PurchaseOrder`, `PurchaseItem`, `ProductCostSnapshot`.
- Marketplace/sales: `MarketplaceAccount`, `SaleOrder`, `SaleOrderItem`, `SaleItemComponent`, `SaleCharge`, `SalesMonthlySummary`, `ProductMonthlySummary`.
- Subscription: `Plan`, `Subscription`, `SubscriptionPayment`.
- Expenses/Full/sync: `OperatingExpense`, `FullInventoryLayer`, `StockSyncQueue`, `SyncRun`.

Important: having a Prisma model does not mean the whole app flow is fully relational. Check service code before assuming.

## API Routes

Auth:

- `POST /api/auth/register`: register user/org.
- `POST /api/auth/login`: login.
- `POST /api/auth/logout`: logout.

Admin/subscription:

- `POST /api/admin/subscription`: platform admin subscription update.
- `POST /api/admin/payment`: platform admin manual payment.
- `GET /api/admin/backup`: platform admin backup.
- `POST /api/subscription`: account subscription action.
- `POST /api/subscription/payment`: account payment action.

Users/roles:

- `POST /api/users`: create org user.
- `POST /api/users/update`: update org user.
- `POST /api/roles`: create/update role.

Products/SKUs/costs:

- `GET, POST /api/products`: list/create product.
- `POST /api/products/create`: create product.
- `POST /api/products/update`: update product.
- `POST /api/products/delete`: delete/deactivate product.
- `POST /api/products/cost`: update product cost.
- `GET /api/skus`: list online SKUs.
- `POST /api/skus/map`: map SKU.
- `POST /api/costs/map`: map cost SKU to master SKU(s).
- `POST /api/costs/discard`: ignore cost SKU.

Inventory/import/export:

- `POST /api/inventory/adjustment`: inventory adjustment.
- `POST /api/inventory/transfer`: transfer inventory.
- `POST /api/inventory/full-layer`: add/update/delete Full inventory layer.
- `POST /api/import/inventory`: import inventory workbook.
- `POST /api/import/sku-mappings`: import SKU mappings.
- `POST /api/import/inventory-quantities`: import quantities.
- `POST /api/import/product-costs`: import costs.
- `POST /api/import/full-layers`: import Full layers.
- `GET /api/export/[type]`: export reports.
- `GET /api/templates/[type]`: download import templates.
- `POST /api/recalculate`: recalculate marketplace order inventory.

Sales/expenses:

- `POST /api/orders/charge`: add manual charge.
- `POST /api/orders/received`: update net received amount.
- `POST /api/expenses`: add/delete operating expense.

Mercado Libre:

- `GET /api/integrations/meli/connect`: begin OAuth.
- `GET /api/integrations/meli/callback`: OAuth callback.
- `GET /api/integrations/meli/accounts`: list accounts.
- `POST /api/integrations/meli/sync`: sync recent orders.
- `GET /api/integrations/meli/sync-ui`: UI-triggered sync.
- `GET /api/integrations/meli/sync-full-ui`: UI-triggered Full stock sync.
- `GET /api/integrations/meli/orders`: list imported orders.
- `GET /api/integrations/meli/summary`: integration summary.
- `POST /api/integrations/meli/webhook`: receive webhook notifications.
- `GET /api/integrations/meli/billing-retry`: retry billing details.
- `GET /api/integrations/meli/repair-audit`: repair/audit from Meli.

Cron:

- `GET /api/cron/meli-hourly`: sync Meli orders and sometimes Full stock. Requires `Authorization: Bearer <CRON_SECRET>`. Writes `SyncRun` records.
- `GET /api/cron/meli-full-billing-monthly`: sync monthly Full billing charges. Requires `Authorization: Bearer <CRON_SECRET>`. Writes `SyncRun` records.
- `GET, POST /api/cron/stock-sync`: process stock sync queue. Uses `?secret=` if `CRON_SECRET` is configured.

## Authentication And Roles

Auth is custom with Prisma:

- Passwords are hashed using Node `crypto.scrypt` plus salt.
- Sessions are stored in `AuthSession`.
- Cookie name is `ct_session`, `httpOnly`, `sameSite: lax`, secure in production.
- Users belong to organizations via `OrganizationUser`.
- Default roles: `owner`, `admin`, `stock`, `sales`, `analyst`, `read_only`; `staff` exists as a type/fallback.
- Permissions: `reports.view`, `inventory.view`, `inventory.write`, `sales.view`, `sales.write`, `costs.write`, `imports.write`, `integrations.write`, `users.manage`.

## Integrations

Implemented/partial:

- Mercado Libre OAuth.
- Mercado Libre recent order import.
- Mercado Libre order normalization.
- Mercado Libre order billing/payment/shipment related fetch helpers.
- Mercado Libre Full fulfillment stock fetch.
- Mercado Libre listing stock update helper.
- Mercado Libre webhook receiver.

Planned:

- Amazon.
- TikTok Shop.
- Advertising/finance integrations.

## UI/UX Decisions

- App shell with fixed desktop sidebar and mobile horizontal nav.
- Nav groups: Inicio, Operacion, Cuenta.
- Visual style is dense SaaS dashboard with Tailwind utility classes and shared global classes.
- Main CT classes: `ct-card`, `ct-button`, `ct-button-primary`, `ct-button-secondary`, `ct-input`, `ct-table-wrap`.
- Uses lucide icons.
- Spanish UI copy.

## Deployment Status

- `.vercel/` exists.
- `vercel.json` defines `/api/cron/meli-hourly` every hour and `/api/cron/meli-full-billing-monthly` on the first day of each month.
- `npm run build` succeeds locally and on Vercel.
- Production URL: `https://control-total-phi.vercel.app`.
- Production deploy verified on 2026-06-01.
- `CRON_SECRET` is configured well enough for authenticated manual production cron checks.

## Environment/Configuration Status

- `.env.example` includes the required core variables, including `CRON_SECRET` and `PLATFORM_ADMIN_EMAILS`.
- `.env.local` and `.env.vercel.local` exist locally and include many provider-generated variables. Treat them as sensitive.
- `APP_URL`, `DATABASE_URL`, Meli OAuth variables, and cron/admin vars are important.

## Testing Status

Unit tests:

- `src/lib/domain/domain.test.ts`
- `src/lib/domain/expenses.test.ts`
- `src/lib/meli/normalize.test.ts`
- `src/lib/meli/order-group.test.ts`
- `src/lib/meli/sync.test.ts`
- `src/lib/server/sales-audit.test.ts`
- `src/lib/server/stock-sync.test.ts`

Observed result on 2026-06-01: `npm test -- --run` passes with 9 test files and 57 tests.

Missing/needs confirmation:

- Browser/E2E tests.
- API route integration tests.
- Real DB migration tests.
- Mercado Libre sandbox/live integration tests.

## Security Concerns / Things To Review

- Secrets in `.env.local`, `.env.vercel.local`, local store tokens, and backups.
- Meli tokens stored in store data.
- `MELI_WEBHOOK_SECRET` not observed as used.
- RLS script lacks policies.
- CSP uses `'unsafe-inline'` for scripts/styles.
- API in-memory rate limit resets per process and may not protect distributed deployments.
- Body limit is 15 MB in `src/proxy.ts`; large imports may hit it.
- Admin default email fallback is `david@gmail.com`.

## Open Questions

- Is the current production database Neon, Supabase, or another PostgreSQL provider?
- Should operational JSON store be retired completely now, or migrated screen by screen with comparison checks?
- Which local JSON data is real client data versus demo data?
- Should RLS be enabled in production, and what policies should exist?
- Should `MELI_WEBHOOK_SECRET` validation be implemented?

## Next Steps In Priority Order

1. Migrate operational read paths from `LocalDataStore.payload` to Prisma tables, starting with `/ventas` and `/ventas/[orderId]`.
2. Add comparison checks for JSON vs relational counts while the migration is in progress.
3. Verify Full stock and Full billing with real F&F data.
4. Verify central stock publishing to Meli with a safe test listing before enabling broadly.
5. Review sensitive data handling for local store/backups.
6. Add browser/E2E tests for critical flows.
7. Add support playbooks for sync stopped, money mismatch, SKU unmapped, Full mismatch, and negative stock.
