# Marketplace Readiness

Control Total is prepared to add TikTok, Amazon, or other channels only after the Mercado Libre core is stable.

## Current Contract To Preserve

- Internal sales already support non-Meli channels through manual/external sales.
- Master inventory is keyed by `masterSku`.
- Online marketplace SKUs must map to master SKUs through equivalences/components.
- Profit reports should read a normalized sale shape: order id, channel, account, ordered date, status, gross amount, received amount, charges, items, warehouse, and component consumption.
- Stock control should stay marketplace-neutral: source systems report sales/stock, Control Total decides master inventory.

## Before Adding A New Marketplace

- Create a connector module instead of mixing provider logic into pages.
- Normalize provider orders into the existing sale/order model.
- Keep provider-specific charges as typed charges, not free text when the API gives structured fields.
- Store sync state per account/channel.
- Add preview/dry-run behavior for bulk imports or backfills.
- Add health status per connected account: last sync, failures, backlog, rate limit notes.
- Do not push stock back to a marketplace until read-only sync is stable and audited.

## Provider Modules To Add Later

- `src/lib/tiktok/*`
- `src/lib/amazon/*`
- API routes under `src/app/api/integrations/{provider}/...`
- UI account cards under the same integration pattern used by Mercado Libre.

## Do Not Do Yet

- Do not build AI publishing/photo generation into the core MVP.
- Do not add real-time stock push before sync/audit and inventory math are fully trusted.
- Do not duplicate SKU, inventory, or profit logic per marketplace.
