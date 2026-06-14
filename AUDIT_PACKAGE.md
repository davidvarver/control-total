# Control Total - paquete tecnico para auditoria externa

Fecha: 2026-05-31

Este documento resume las piezas verificables del repositorio para que otra IA o revisor pueda contrastar el avance real del sistema contra lo prometido. No contiene secretos.

## Producto

Control Total es un SaaS para sellers de Mercado Libre Mexico. El objetivo es controlar inventario, SKU maestro, equivalencias/kits, costos, ventas, recibido real, cargos, Full, gastos operativos, utilidad, alertas y roles por usuario.

## Estado honesto

- MVP F&F avanzado.
- No esta listo para produccion abierta masiva.
- Riesgo tecnico principal: persistencia hibrida PostgreSQL + JSON (`LocalDataStore`/`local-store`).
- Riesgo operativo principal: cron externo/hourly no confirmado; el cron de Vercel actual es diario.

## Stack

- Next.js `16.2.6` App Router.
- React `19.2.4`.
- TypeScript.
- Tailwind CSS 4.
- Prisma `6.19.3`.
- PostgreSQL.
- Vitest.
- Vercel.

## Archivos clave

- `prisma/schema.prisma`: modelo relacional.
- `src/lib/server/local-store.ts`: persistencia hibrida y mutaciones operativas.
- `src/lib/server/reports.ts`: reportes de inventario, ventas, utilidad, detalle por orden y SKU.
- `src/lib/server/dashboard-store.ts`: KPIs, alertas, cargos raros, diferencias Full.
- `src/lib/server/auth-store.ts`: sesiones, usuarios, roles y permisos.
- `src/lib/server/assistant.ts`: respuestas del asistente filtradas por permisos.
- `src/lib/meli/client.ts`: llamadas a API Mercado Libre/Mercado Pago.
- `src/lib/meli/sync.ts`: sync de ventas, billing, auditoria y Full.
- `src/lib/meli/normalize.ts`: normalizacion de ordenes Meli.
- `src/lib/meli/full-billing.ts`: cargos mensuales Full.
- `src/app/api/cron/meli-hourly/route.ts`: sync automatico de ventas.
- `src/app/api/cron/meli-full-billing-monthly/route.ts`: sync mensual cargos Full.
- `src/app/api/integrations/meli/webhook/route.ts`: endpoint webhook.
- `src/app/api/assistant/route.ts`: endpoint del asistente.
- `vercel.json`: cron Vercel.

## Modelo de datos Prisma

Enums:

- `Channel`
- `OrganizationStatus`
- `UserStatus`
- `WarehouseType`
- `InventoryMovementType`
- `SubscriptionStatus`
- `LockMode`
- `SaleChargeType`

Modelos:

- `Organization`
- `LocalDataStore`
- `User`
- `AuthSession`
- `OrganizationUser`
- `Role`
- `Permission`
- `RolePermission`
- `MasterProduct`
- `OnlineSku`
- `SkuComponent`
- `Warehouse`
- `InventoryBalance`
- `InventoryMovement`
- `Supplier`
- `PurchaseOrder`
- `PurchaseItem`
- `ProductCostSnapshot`
- `MarketplaceAccount`
- `SaleOrder`
- `SaleOrderItem`
- `SaleItemComponent`
- `SaleCharge`
- `Plan`
- `Subscription`
- `SubscriptionPayment`
- `AuditLog`
- `OperatingExpense`
- `FullInventoryLayer`
- `StockSyncQueue`

Importante: aunque existen modelos relacionales para ventas, inventario y cuentas, buena parte del flujo operativo actual sigue usando `LocalDataStore` y `src/lib/server/local-store.ts`.

## Permisos actuales

Definidos en `src/lib/server/auth-store.ts`:

- `reports.view`
- `inventory.view`
- `inventory.write`
- `sales.view`
- `sales.write`
- `costs.write`
- `imports.write`
- `integrations.write`
- `users.manage`

Roles base:

- `owner`
- `admin`
- `stock`
- `sales`
- `analyst`
- `read_only`
- `staff`
- `platform_admin`

El asistente hereda permisos del usuario. No debe recibir ni mostrar ventas, utilidad, dinero, inventario, integraciones o usuarios si el usuario no tiene permisos.

## Rutas UI principales

- `/`: landing.
- `/planes`: planes/piloto.
- `/flujo`: flujo publico.
- `/legales`, `/legales/terminos`, `/legales/privacidad`: legales.
- `/login`, `/register`: auth.
- `/dashboard`: resumen negocio.
- `/guia`: guia de uso.
- `/setup`: pendientes que bloquean calculo.
- `/importar`: carga de Excel.
- `/inventario`: inventario.
- `/inventario/[masterSku]`: detalle SKU.
- `/ventas`: ventas.
- `/ventas/[orderId]`: detalle venta.
- `/ventas/nueva`: venta externa/manual.
- `/utilidad`: utilidad, gastos y comparador SKUs.
- `/resurtido`: resurtido.
- `/alertas`: cola diaria, problemas, cargos raros y diferencias Full.
- `/meli`: integracion Mercado Libre.
- `/salud`: estado tecnico.
- `/auditoria`: auditoria tecnica.
- `/reportes`: exportes.
- `/usuarios`: usuarios/roles.
- `/cuenta`: plan/cuenta.
- `/admin`: admin plataforma.

## API principales

Auth:

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/register`

Usuarios/roles:

- `POST /api/users`
- `POST /api/users/update`
- `POST /api/roles`

Importaciones/exportes:

- `POST /api/import/inventory`
- `POST /api/import/inventory-quantities`
- `POST /api/import/product-costs`
- `POST /api/import/sku-mappings`
- `POST /api/import/manual-sales`
- `POST /api/import/full-layers`
- `GET /api/templates/[type]`
- `GET /api/export/[type]`

Inventario/productos/SKUs:

- `GET, POST /api/products`
- `POST /api/products/create`
- `POST /api/products/update`
- `POST /api/products/delete`
- `POST /api/products/cost`
- `GET /api/skus`
- `POST /api/skus/map`
- `POST /api/skus/create-and-map`
- `POST /api/inventory/adjustment`
- `POST /api/inventory/transfer`
- `POST /api/inventory/count-reset`
- `POST /api/inventory/full-layer`

Ventas:

- `POST /api/orders/manual`
- `POST /api/orders/charge`
- `POST /api/orders/received`
- `POST /api/recalculate`

Meli:

- `GET /api/integrations/meli/connect`
- `GET /api/integrations/meli/callback`
- `GET /api/integrations/meli/accounts`
- `GET /api/integrations/meli/orders`
- `POST /api/integrations/meli/sync`
- `GET, POST /api/integrations/meli/sync-ui`
- `GET, POST /api/integrations/meli/sync-full-ui`
- `GET, POST /api/integrations/meli/billing-retry`
- `GET, POST /api/integrations/meli/repair-audit`
- `GET, POST /api/integrations/meli/audit-full`
- `GET, POST /api/integrations/meli/full-billing`
- `GET /api/integrations/meli/summary`
- `POST /api/integrations/meli/webhook`

Cron:

- `GET /api/cron/meli-hourly`: requiere `Authorization: Bearer <CRON_SECRET>`.
- `GET /api/cron/meli-full-billing-monthly`: requiere `Authorization: Bearer <CRON_SECRET>`.
- `GET, POST /api/cron/stock-sync`.

Asistente:

- `POST /api/assistant`.

Alertas:

- `POST /api/alerts/rare-charge/dismiss`
- `POST /api/alerts/full-audit/dismiss`

Admin/suscripcion:

- `POST /api/subscription`
- `POST /api/subscription/payment`
- `GET /api/admin/backup`
- `POST /api/admin/subscription`
- `POST /api/admin/payment`

## Integracion Mercado Libre

Funciones relevantes:

- `exchangeMeliCode`
- `refreshMeliToken`
- `getMeliMe`
- `searchRecentMeliOrders`
- `searchMeliOrders`
- `getMeliOrder`
- `getMeliPayment`
- `getMeliPack`
- `getMeliShipment`
- `getMeliShipmentCosts`
- `getMeliOrderBillingDetails`
- `getMeliFullBillingDetails`
- `getMeliFulfillmentStock`
- `updateMeliItemStock`
- `syncMeliRecentOrders`
- `syncMeliAutomationOrders`
- `syncSingleMeliOrder`
- `retryPendingMeliBilling`
- `repairMeliAuditOrders`
- `syncMeliFullStock`
- `auditMeliFullStock`
- `syncMeliFullBilling`

Nota: `updateMeliItemStock` existe en cliente, pero el producto todavia no tiene modulo terminado para publicar stock central hacia Meli.

## Cron actual

`vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/meli-hourly",
      "schedule": "0 12 * * *"
    },
    {
      "path": "/api/cron/meli-full-billing-monthly",
      "schedule": "0 12 1 * *"
    }
  ]
}
```

Interpretacion:

- El nombre `meli-hourly` no coincide con el schedule de Vercel.
- Vercel esta corriendo diario a las 12:00 UTC, no cada hora.
- Para hourly real se necesita cron externo, Vercel Pro o una cola/worker.
- Logs recientes mostraron `401` en llamadas manuales con un secreto local que no coincide con produccion. Debe revisarse `CRON_SECRET` y la configuracion de cron-job.org.

## Funciones ya construidas

- Auth y roles.
- Multiusuario por organizacion.
- Admin plataforma.
- Importar Excel.
- SKU maestro, equivalencias y kits.
- Inventario por bodega.
- Conteo/reset por SKU.
- Ventas Meli y manuales.
- Detalle de venta con utilidad.
- Costos promedio.
- Gastos operativos.
- Frecuencia mexicana de gastos.
- Utilidad mensual.
- Utilidad por SKU.
- Comparador de SKUs.
- Cargos raros.
- Diferencias Full.
- Cargos Full mensual.
- Alertas y cola unica de ventas con problemas.
- Resurtido inicial.
- Asistente beta seguro por permisos.

## Parcial o pendiente

- Migrar persistencia hibrida a tablas relacionales reales.
- Confirmar cron externo/hourly estable.
- Webhook + cola para ventas casi en tiempo real.
- Publicar stock central hacia Meli.
- Publicador multicanal con IA.
- Demo publica/sandbox sin login.
- Monitoreo y logs visibles de sync.
- RLS real con politicas.
- Backups confirmados.
- Mobile audit completo.

## Recomendaciones pedidas al revisor externo

1. Confirmar si el avance 70-75% para F&F es realista.
2. Priorizar migracion de persistencia: que tablas mover primero y como evitar corrupcion.
3. Revisar arquitectura de sync: cron externo vs webhook + cola.
4. Auditar si permisos cubren todos los endpoints sensibles.
5. Decir que features NO conviene meter antes de F&F.
6. Validar si el modulo de stock central hacia Meli debe ir antes o despues de persistencia/webhook.
7. Revisar UX: que pantallas siguen demasiado densas.
8. Sugerir checklist de salida a F&F.
