# First Client Onboarding Checklist

Use this before connecting a real customer account.

## Before Connecting

- Confirm DigitalOcean automated backups are enabled.
- Set `PRODUCTION_BACKUPS_CONFIRMED_AT` in production after confirming backup status.
- Use `docs/backup-restore-checklist.md` to verify backup/restore before connecting a high-volume customer.
- Keep `DATABASE_URL` pointed at the verified production database.
- Confirm `/salud#primer-cliente` shows sync limits as ready.
- Confirm `CRON_SECRET`, `TOKEN_ENCRYPTION_KEY`, and platform admin env vars are configured.
- Create the customer organization and owner user.
- Load current inventory baseline first if the customer already discounted old sales manually.
- Import SKU equivalences and product costs before trusting profit.

## Safe Sync Defaults

- Initial Meli connection imports a capped batch first, controlled by:
  - `MELI_INITIAL_BACKFILL_LIMIT`
  - `MELI_INITIAL_BACKFILL_MONTHS` (default `2`: current month plus previous month)
- Hourly cron continues catching up in capped batches, controlled by:
  - `MELI_HOURLY_BACKFILL_LIMIT`
  - `MELI_HOURLY_PENDING_BILLING_LIMIT`
  - `MELI_HOURLY_FULL_STOCK_MAX_ITEMS`
- Admin historical sync defaults to `MELI_ADMIN_BACKFILL_DEFAULT`; raise it only when intentionally backfilling.

## First 24 Hours

- Check `/admin` for the customer's orders, payload MB, sync minutes, and estimated cost.
- Check `/meli` sync runs after the first cron hour.
- Check `/salud` for Meli sync, billing pending, stock negatives, and inventory baseline.
- Review 20 to 50 sales manually:
  - split packages
  - Full orders
  - cancelled orders
  - shipping charges
  - received amount
  - SKU mapping and product cost

## First Week

- Monitor cost per customer daily in `/admin`.
- Keep sync limits conservative unless backlog is blocking validation.
- Do not migrate database hosting during the first customer validation week.
- Do not enable marketplace stock publishing until a safe test listing passes end to end.
