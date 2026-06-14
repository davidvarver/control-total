# Control Total

SaaS de inventario, ventas Mercado Libre, equivalencias SKU, costos, Full y utilidad real para sellers en Mexico.

## Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- Prisma 6
- PostgreSQL
- Vitest
- Vercel Cron

## Setup local

```bash
npm install
npm run db:generate
npm run dev
```

Abrir `http://localhost:3000`.

Para usar base de datos:

```bash
npm run db:push
```

Crear admin plataforma:

```bash
npm run admin:create
```

## Variables importantes

Ver `.env.example`. Las obligatorias para produccion son:

- `DATABASE_URL`
- `APP_URL`
- `CRON_SECRET`
- `TOKEN_ENCRYPTION_KEY`
- `MELI_CLIENT_ID`
- `MELI_CLIENT_SECRET`
- `MELI_REDIRECT_URI`
- `MELI_WEBHOOK_SECRET`
- `PLATFORM_ADMIN_EMAILS` o `SUPER_ADMIN_EMAILS`

Para liberar el primer cliente grande tambien debe estar:

- `PRODUCTION_BACKUPS_CONFIRMED_AT`

No imprimir ni compartir valores reales de estas variables.

## Scripts

```bash
npm test
npm run lint
npm run build
npm run db:push
npm run snapshots:monthly
npm run db:verify-restore
```

## Produccion

El deploy actual apunta a Vercel. `vercel.json` programa:

- `meli-hourly`: sincroniza ventas Meli cada hora.
- `meli-full-stock-daily`: audita stock Full diario.
- `meli-full-billing-monthly`: jala cargos Full mensuales.
- `data-retention`: compacta payloads viejos.
- `monthly-snapshots`: genera resumen mensual.

La base productiva vigente debe tratarse como DigitalOcean/PostgreSQL hasta completar una migracion verificada. No destruir ni cambiar la DB productiva sin:

1. Backup confirmado.
2. Restore probado.
3. Comparacion de conteos.
4. Login/dashboard/inventario/Meli cron verificados.
5. Monitoreo 7-14 dias.

## Primer cliente

El primer cliente grande debe entrar como piloto monitoreado:

- Mercado Libre solamente.
- Sync inicial: mes actual + mes pasado.
- Revisar diario `/meli`, `/salud`, `/dashboard`, `/ventas` y `/utilidad`.
- Validar 50-100 ventas reales contra Seller Center.
- Confirmar paquetes divididos, cancelaciones, refunds, envio, impuestos, recibido Meli y Full.

No prometer aun:

- Amazon/TikTok.
- Webhook realtime como fuente primaria.
- Stock push automatico sin prueba controlada.
- Historial ilimitado instantaneo.
- Inbound Full automatico completo.

## Seguridad operativa

- `data/*.json`, `data/organizations/` y `data/backups/` se consideran sensibles.
- Los backups admin pueden incluir payloads operativos; no son archivos para cliente.
- `prisma/enable-rls.sql` solo habilita RLS, no crea politicas. No correrlo en produccion sin politicas.
- Rate limits y locks en memoria no sustituyen controles durables para escala.

## Documentos clave

- `PROJECT_CONTEXT.md`
- `NEXT_STEPS.md`
- `MARKETPLACE_READINESS.md`
- `docs/first-client-onboarding.md`
- `docs/first-client-scale-plan.md`
- `docs/backup-restore-checklist.md`
- `docs/autoplan-readiness-2026-06-14.md`
