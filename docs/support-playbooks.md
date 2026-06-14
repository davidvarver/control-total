# Control Total Support Playbooks

Last updated: 2026-06-01.

These playbooks are for production support. Do not expose secrets, Mercado Libre tokens, database URLs, or raw backup payloads to customers.

## Sync Stopped

Use when a customer says sales are not updating or the Meli page shows an old sync.

1. Open `/meli` and review `Bitacora de sincronizacion`.
2. Confirm the latest `meli-hourly` run has `success`.
3. If the latest success is older than 2 hours, open `/salud`; the `Sync automatico Meli` check should fail.
4. Check whether the account status is connected.
5. If `SyncRun.status` is `failed`, inspect `errorMessage`:
   - token/auth error: reconnect Mercado Libre.
   - timeout/time budget: wait for the next cron or reduce the batch window.
   - database error: check DigitalOcean Postgres availability.
   - Meli API/rate limit: retry later and avoid manual repeated syncs.
6. Run one authenticated cron check only if needed:
   - `GET /api/cron/meli-hourly`
   - Header: `Authorization: Bearer <CRON_SECRET>`
7. Do not paste `CRON_SECRET` into chat, screenshots, tickets, or docs.

Expected healthy signal:

- `/api/cron/meli-hourly` returns `ok: true`.
- `SyncRun` stores a new row with `status: success`.
- `/meli` shows the new run in the bitacora.

## Meli Money Mismatch

Use when a sale shows wrong received amount, duplicated shipping, missing tax, or false `Pendiente Meli`.

1. Open the sale detail at `/ventas/[orderId]`.
2. Click `Recalcular esta venta`.
3. Compare:
   - sale gross amount,
   - net received,
   - Mercado Libre charges,
   - shipping paid by buyer vs charged to seller,
   - taxes,
   - extra Mercado Pago details.
4. If Meli already shows final money but Control Total still says pending, keep the sale visible as a bug candidate and capture:
   - order ID,
   - payment/operation ID if visible,
   - Meli side panel amounts,
   - Control Total amounts,
   - timestamp after recalculation.
5. Do not manually overwrite received amount unless the seller explicitly needs a temporary correction.
6. If the amount is corrected manually, note it in the support ticket because it can hide a parser/API issue.

Expected healthy signal:

- `Dinero Meli` in calculation status is not pending.
- Charges do not duplicate buyer-paid shipping.
- Utility is calculated only after received amount and costs are known.

## SKU Unmapped

Use when sales import but items cannot consume inventory.

1. Open `/meli` or `/setup`.
2. Click `Ir a resolver` on `SKUs sin mapear`.
3. If the master SKU already exists, map the Meli SKU to it and save.
4. If the master SKU does not exist, use `Crear SKU maestro y mapear`.
5. For kits, confirm the component quantity is the physical quantity consumed per sale.
6. After mapping, open the affected sale and confirm:
   - `Items sin mapear` is 0.
   - cost appears if the product has average cost.
   - inventory consumption is correct.

Expected healthy signal:

- New sales for the same Meli SKU map automatically.
- Dashboard pending count decreases.

## Full Stock Mismatch

Use when Mercado Libre Full stock differs from Control Total.

1. Open `/meli` and check `Stock Full` and latest Full sync timestamp.
2. Open `/alertas#diferencias-full`.
3. Review differences:
   - Control Total Full quantity.
   - Meli Full quantity.
   - unmapped Full SKUs.
4. Resolve unmapped SKUs first. Meli Full stock cannot be trusted inside Control Total until the SKU is mapped.
5. If a product was sent to Full, confirm the internal transfer exists:
   - own warehouse decreases.
   - Full warehouse increases.
6. If Meli shows fewer units than expected and there are no matching sales, mark it as a possible Full claim.

Expected healthy signal:

- Full warehouse stock matches Meli Full after mapping.
- Differences remain visible until dismissed or fixed.

## Negative Stock

Use when a product shows negative stock.

1. Open `/inventario` and filter negative stock.
2. Open the product detail.
3. Check recent movements:
   - sales,
   - transfers,
   - manual adjustments,
   - count reset,
   - Full movements.
4. If physical inventory was just counted, use count mode for that SKU instead of a broad adjustment.
5. If stock is negative because sales arrived before initial inventory, import or adjust the initial quantity.
6. If it comes from an unmapped kit/component, fix the mapping before adjusting stock.

Expected healthy signal:

- Physical estimated stock matches the counted quantity plus valid pending commitments.
- Future sales consume the correct component quantities.

## Backup And Recovery

Use before risky migrations, broad data fixes, or customer-impacting support.

1. Export admin backup from `/api/admin/backup` as platform admin.
2. Confirm the export redacts sensitive token/password fields.
3. Confirm DigitalOcean automated backups are enabled for the production database.
4. Before destructive changes, record:
   - deployment URL,
   - database provider,
   - organization ID,
   - timestamp,
   - affected module.
5. Do not restore over production without explicit approval.

Expected healthy signal:

- Backup export completes.
- Sync runs are included.
- Sensitive fields remain redacted.
