# Next Steps - Production Readiness

Last updated: 2026-06-12.

## Current Goal

Move Control Total from F&F-ready MVP to a sellable production SaaS before adding TikTok Shop or Amazon.

## Immediate Priority

Finish the core platform first:

1. Make PostgreSQL tables the source of truth for operational data.
2. Keep sync jobs observable with durable `SyncRun` history.
3. Finish Mercado Libre money/Full/stock flows.
4. Verify security, backup, UX, and support documentation.

## First Client Pilot Gate

Status: guarded in product, manual backup confirmation pending. A 30k ventas/mes scale gate now exists in `/salud#escala-30k`.

Before connecting the first real client:

- Confirm production database backups in DigitalOcean.
- Set `PRODUCTION_BACKUPS_CONFIRMED_AT` in Vercel after confirmation.
- Use `/salud#primer-cliente` as the go/no-go screen.
- Use `/salud#escala-30k` before onboarding high-volume sellers.
- Keep Meli sync limits conservative during the first week.
- Use `docs/first-client-onboarding.md` for the exact onboarding steps.
- Use `docs/first-client-scale-plan.md` for the cost/capacity plan.
- Use `docs/backup-restore-checklist.md` to clear the remaining backup confirmation blocker.

Top pending list before giving this to a large client:

1. Confirm DigitalOcean backup and restore path.
2. Validate Meli money logic with real edge cases: split packages, cancellations, refunds, shipping, taxes, and Seller Center differences.
3. Confirm Full stock, Full monthly charges, and per-SKU Full impact with a real account.
4. Test stock publishing to Meli with one safe listing before promising automatic stock push.
5. Keep moving Ventas/Utilidad filters and pagination to SQL for 30k+ monthly orders.
6. Test roles/security with real users and confirm production secrets/backups.

## Database Hosting Decision Pending

As of 2026-06-05, do not delete the DigitalOcean database. The live production data is still in DigitalOcean Managed PostgreSQL `control-total-prod`, with recent Meli sync activity, products, SKUs, marketplace accounts, and sale orders. Neon exists in the Vercel project but is incomplete and must not be treated as production until migrated and verified.

Current working stance:

- DigitalOcean costs about USD $30-$35/month for the managed PostgreSQL node and storage, but it is stable and already contains the good data.
- Neon may reduce cost and fits the hourly/daily/monthly cron pattern, but it needs a complete migration, schema verification, pooling/cold-start handling, and post-migration monitoring.
- Do not remove the DigitalOcean card, destroy `control-total-prod`, or switch production to Neon until a backup, restore/migration, row-count comparison, login test, dashboard/inventory test, Meli cron test, and 7-14 day monitoring window are complete.
- Compare external advice from Claude/Gemini/Grok before making the final hosting decision.
- Local `.env.production.local`, `.env.vercel.local`, and Vercel production `DATABASE_URL` were corrected on 2026-06-09 to point to DigitalOcean first. Neon `POSTGRES_*` variables may still exist but should not be treated as source of truth.

## What Was Closed Recently

- Final premium shell UX pass deployed:
  - Sidebar/topbar/page headings/cards/tables/forms/chips/photos/assistant now share a single darker liquid-glass visual system closer to the Stitch reference.
  - Search, Acciones, account pill, Ayuda, navigation, filters, and business controls were preserved.
  - Production verification covered `/dashboard`, `/guia`, `/inventario`, `/ventas`, and `/utilidad` on desktop/mobile with no console errors, no horizontal overflow, and the Acciones menu opening without clipping.
- Stitch ZIP-informed UX refinement deployed:
  - The uploaded Stitch exports were reviewed and distilled into a neutral graphite/mint premium skin without the washed-out screens or dominant purple/strong-blue palette.
  - Existing operational controls were preserved; this pass changed global visual treatment only.
  - Production verification covered desktop `/dashboard`, `/inventario`, `/ventas`, `/utilidad`, mobile overflow checks, and the Acciones dropdown.
- App-wide iOS/liquid-glass UX baseline is deployed:
  - Sidebar, topbar, search, account pill, mobile nav, assistant, cards, tables, forms, and inventory pending cards now share the same dark premium visual language.
  - Existing actions/search/help/navigation were preserved.
  - Production verification covered `/dashboard`, `/inventario`, `/ventas`, `/utilidad`, and mobile dashboard/inventory with no horizontal overflow.
- Main operational-page UX has a structural redesign layer:
  - `/inventario`, `/ventas`, and `/utilidad` now use shared operational primitives for KPIs, panels, filters, mobile cards, and tables.
  - The redesign preserved search, Acciones, account pill, Ayuda, filters, pagination, SKU/stock/Full forms, and existing business actions.
  - Production verification covered desktop and mobile `/inventario`, `/ventas`, and `/utilidad` after deploy.
- Vercel Pro cron wakes `/api/cron/meli-hourly` once per hour.
- Meli sales only import closed-hour windows. Example: at 4:30, the automatic job imports up to 4:00, not sales from 4:01-4:30.
- Meli sales sync now enforces its batch limit instead of looping until done. Current production setting is up to 150 orders per connected account per cron run, with progress saved for the next run.
- `/ventas` now shows 100 rows per page instead of rendering every order in one screen.
- Dashboard/Alertas/Utilidad now separate current-month loss counts from the historical problem queue.
- The next architecture step is to split sales import into cheap basic ingestion for all orders in the closed hour and slower financial enrichment for billing, Mercado Pago, shipment costs, taxes, rare charges, and final utility.
- Full stock sync is limited to once per day.
- Full storage/Full billing charges sync monthly on the first day of the month.
- Historical operational data was mirrored into relational tables:
  - 161 products.
  - 186 online SKUs.
  - 1 marketplace account.
  - 1,563 orders.
  - 257 inventory balances.
- New/repaired sales are mirrored into `SaleOrder`, `SaleOrderItem`, `SaleItemComponent`, and `SaleCharge`.
- `SaleOrder.payload` stores the full operational sale payload in PostgreSQL.
- Report builders now construct their working store from Prisma first for products, warehouses, online SKUs, components, marketplace accounts, inventory balances, inventory movements, and sale payloads.
- Relational sales reports now preserve Meli split-package metadata from `SaleOrder.payload`, so `/ventas` and `/ventas/[orderId]` can regroup divided packages into the real sale and avoid treating a sibling package as a separate sale.
- `/ventas` now distinguishes the real Meli sale number from internal API order/package ids. This should be validated with support-provided sale numbers such as `2000013306602593`.
- `/ventas/[orderId]` shows a consolidated product summary and keeps the complete package/API-order breakdown visible for split-package sales.
- Recalculate real Full family examples after deploy so old rows pick up the propagated `family_pack_id`/parent `order_request.id`.
- Meli split-package repair now has an extra fallback: it searches `orders/search` by pack/family/order-request ids to find siblings that Seller Center groups under one sale but the pack endpoint may not return.
- `SaleOrder.payload` now writes compacted raw Meli payloads to reduce PostgreSQL storage growth from heavy API responses.
- `/salud` now calls out missing inventory baseline protection, stale Full stock sync, and missing/latest Full billing month.
- Inventory and sales now show product thumbnails from Mercado Libre item image URLs when available, with initials fallback. Manual image override per master SKU is still pending.
- Existing rows will show real thumbnails after the next production Full/listing audit sync populates `imageUrl` for online SKUs. The code now preserves those image URLs through relational report reads and SKU mapping edits.
- Inventory thumbnail UI now covers the main list, SKU connection manager, and SKU detail page. The `/meli` page has an `Auditar Full/fotos` action to populate listing image URLs, and sales now reuse those SKU/master image maps for older orders. Products not returned by Meli audit/sync still fall back to initials until a listing image URL exists.
- `/ventas`, `/ventas/[orderId]`, `/inventario`, `/inventario/[masterSku]`, `/utilidad`, `/reportes`, `/resurtido`, and alert/report consumers now use relational report data first, with JSON store fallback only as compatibility.
- `SyncRun` table was added for professional sync observability.
- Meli and Full billing cron routes now write sync run status, duration, totals, pending counts, and errors.
- `/meli` shows recent sync run history.
- Admin backup now includes recent sync runs and still redacts sensitive payload data.
- First production performance pass for higher-volume sellers is deployed:
  - Prisma production pool no longer uses `connection_limit=1`.
  - AppShell/dashboard heavy links disable Next prefetch.
  - `/dashboard` uses compact PostgreSQL aggregates instead of building the full profit report on initial load.
  - `/admin` shows per-client estimated usage/cost.
  - Verified `/dashboard` around 2.4s visible with KPIs in production after deploy.
- Data retention guardrails are deployed:
  - Full operational sale detail target: 24 months.
  - Heavy/raw Meli payload retention: 6 months, then compacted by `/api/cron/data-retention`.
  - Historical report summary target: 10 years.
  - The retention cron is scheduled weekly and protected by `CRON_SECRET`.
  - `/salud#retencion` shows the active policy.
- Monthly snapshot tables are deployed:
  - `SalesMonthlySummary` stores month/account/channel totals.
  - `ProductMonthlySummary` stores month/account/channel/SKU totals, including unmapped external SKUs.
  - `/api/cron/monthly-snapshots` is scheduled weekly and protected by `CRON_SECRET`.
  - `npm run snapshots:monthly` can rebuild summaries manually.
  - Production was rebuilt once after deployment: 6 account/channel summaries and 256 SKU summaries.
- `/utilidad` monthly history is now wired to monthly snapshots:
  - The old "Cargar historial" path no longer rebuilds all raw orders.
  - The history table renders automatically from `SalesMonthlySummary`, plus operating expenses and Full monthly charges.
  - Snapshot rows now include Full sale cost (`additionalCostsAmount` / `saleFullCostsAmount`) so monthly contribution profit can match the detailed report model.

## Still Not 100%

### 1. PostgreSQL Source Of Truth

Status: partially complete.

Tables exist and are being populated. The main report/read pages now prefer relational data. The JSON store remains as compatibility and for flows that have not been fully normalized yet.

Next:

- Keep `LocalDataStore` only as temporary compatibility/backup until all write paths and niche screens are migrated.
- Add comparison checks: JSON count vs table count for orders, products, balances, charges.

### 2. Sync Observability

Status: implemented baseline.

Next:

- Add health alerts when a connected account has no successful `meli-hourly` run in more than 2 hours.
- Add admin view for all organizations' sync health.
- Add retry/failure categorization: token, Meli API, DB, timeout, rate limit.
- Add a warning when a connected account needs multiple hourly runs to catch up because backlog is larger than the batch limit.

### 3. Mercado Libre Money Logic

Status: improved, still must be validated with real sellers.

Next:

- Use F&F to validate:
  - received amount
  - Meli billing
  - Mercado Pago details
  - shipping paid by buyer vs charged to seller
  - taxes
  - refunds/cancellations
  - rare charges
- Keep single-sale repair button.
- Keep unexplained differences visible until Meli confirms the source.
- Validate real split-package examples after deploy, especially sales where Meli splits by color/SKU or creates separate shipping ids.

### 4. Full Stock And Full Charges

Status: partially complete.

Next:

- Confirm daily Full stock sync updates Full warehouse correctly.
- Confirm sent-to-Full flow: own warehouse decreases, Full warehouse increases. Current app supports manual/imported Full shipments/layers as transfer-like movements; automatic inbound shipment detection from Meli is still pending.
- Confirm Full storage charges by SKU for monthly utility.
- Show product-level Full charge impact in profitability.
- Add clear action text for Full differences and lost units.
- Do not tell users inbound shipments to Full are automatic yet. Today they are manual/imported layers; Full stock audit and Full monthly billing are automated.

### 5. Central Stock Publishing

Status: queue exists, production confidence pending.

Next:

- Verify `StockSyncQueue` end to end with a safe test listing.
- Show stock sync queue/status in UI.
- Add last pushed stock per online SKU.
- Add channel buffers and publishable stock preview.
- Do not add Amazon/TikTok until this is stable for Meli.

### 6. Performance And Scale

Status: improved, not finished.

Next:

- Move `/ventas` and `/utilidad` filters fully to database-level pagination/aggregates for 30k+ orders/month.
- Keep `/utilidad` selected-period first-load fast; selected day/week/month still uses detailed orders while historical month table uses snapshots.
- Consider daily snapshots only if dashboard/product charts need day-level history.
- Add index/migration review for `SaleOrder`, `SaleOrderItem`, `SaleCharge`, and `SaleItemComponent` before onboarding a 1,000+ orders/day client.
- Split sync into cheap basic ingestion and slower enrichment queue so hourly jobs do not do expensive finance/shipment work inline.
- Add timing logs for slow server routes and query groups, without printing payloads or tokens.

### 7. Pricing/Plans

Status: deferred intentionally.

Next:

- Measure cost per 1,000 orders/sync runs.
- Estimate DB/API/function cost per seller tier after the aggregate/dashboard changes.
- Define plans only after real cost and value are known.

### 8. Backups And Recovery

Status: backup export exists.

Next:

- Confirm DigitalOcean automated backups are enabled.
- Test one restore path before selling.
- Add backup health/status to admin.
- Keep tokens/secrets redacted in exports.

### 9. Security/Roles

Status: implemented but needs audit.

Next:

- Verify role restrictions by real test users:
  - designer cannot see sales/profit/costs.
  - operator cannot access admin/payment/subscription.
  - platform admin cannot casually browse seller operations.
- Confirm all write APIs use permission checks.

### 10. UX

Status: app shell, dashboard, auth pages, Guia, Inventario, Ventas, Utilidad, Pendientes, Meli, sale detail, and SKU detail now use the structural dark/iOS-style operational redesign instead of only global skinning.

Next:

- Continue refining remaining secondary pages such as `/reportes`, `/resurtido`, `/salud`, `/auditoria`, `/usuarios`, and `/cuenta` with the same primitives.
- Use the new `/guia` approach as the bar: fewer generic cards, stronger hierarchy, clearer next action, and compact operational panels.
- If exact 1:1 Stitch matching is required, export or capture the exact target screens from Stitch because the board itself may not expose all pages cleanly through automation.
- Every alert must answer:
  - what happened
  - why it matters
  - what to click next
- Mobile must be checked page by page.
- Keep dashboard as business summary, not a system guide.

### 11. Documentation

Status: current for the production-readiness push.

Next:

- Keep `AGENTS.md`, `PROJECT_CONTEXT.md`, `NEXT_STEPS.md`, and `CHANGELOG_CONTEXT.md` current after production changes.
- Maintain `docs/support-playbooks.md` for:
  - sync stopped
  - Meli money mismatch
  - SKU unmapped
  - Full stock mismatch
  - negative stock
  - backup/recovery

### 12. TikTok/Amazon

Status: intentionally waiting.

Do not build these until the core is stable. Next marketplace work should start with a common marketplace adapter, not copied Meli logic.
