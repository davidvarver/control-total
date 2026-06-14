# Control Total - guia completa del sistema

Ultima revision: 2026-06-14.

Este documento describe lo que hace Control Total hoy, como funciona, que datos guarda, como se conecta a Mercado Libre, que informacion toma, que informacion no toma y que limites no debemos prometer todavia.

## 1. Que es Control Total

Control Total es un SaaS para vendedores de marketplaces, por ahora enfocado en Mercado Libre Mexico. Su objetivo es dar visibilidad operativa y financiera real:

- Inventario por SKU maestro y por bodega.
- Equivalencias entre SKU online y SKU maestro.
- Kits o publicaciones que consumen mas de una unidad o componente.
- Ventas importadas desde Mercado Libre.
- Cargos, comisiones, impuestos, envios y dinero recibido de Meli/Mercado Pago cuando estan disponibles.
- Costos de producto, gastos operativos y utilidad.
- Stock Full separado.
- Cargos Full mensuales por almacenaje u otros conceptos de Full.
- Pendientes que bloquean una utilidad confiable.
- Roles, permisos, suscripcion y bloqueo por cuenta.

La regla del sistema es: primero inventario y equivalencias, despues ventas, despues utilidad. Si faltan costos, equivalencias o dinero final de Meli, la utilidad se marca como incompleta o pendiente.

## 2. Stack y despliegue

- Frontend/backend: Next.js App Router.
- UI: React, Tailwind y componentes propios.
- Base de datos: PostgreSQL con Prisma.
- Hosting actual: Vercel.
- Base productiva actual: PostgreSQL administrado en DigitalOcean.
- Hay compatibilidad historica con `LocalDataStore`/JSON, pero el sistema ya usa muchas tablas relacionales para ventas, inventario, resumenes, gastos y sincronizaciones.

No se deben publicar secretos ni tokens. Las variables sensibles viven en variables de entorno.

## 3. Donde se guarda la informacion

La base relacional tiene, entre otros, estos grupos de datos:

- Organizacion, usuarios, sesiones, roles y permisos.
- Productos maestros.
- SKUs online.
- Componentes de equivalencias.
- Bodegas.
- Balances y movimientos de inventario.
- Cuentas conectadas de marketplace.
- Ordenes de venta.
- Items de venta.
- Componentes descontados por item.
- Cargos de venta.
- Resumenes mensuales de ventas.
- Resumenes mensuales por producto.
- Suscripciones y pagos.
- Auditoria.
- Gastos operativos.
- Capas/logistica Full.
- Cola de sync de stock.
- Corridas de sincronizacion.

Tambien existe `LocalDataStore`, que conserva payload compatible del sistema anterior y sirve como puente/fallback. No se debe asumir que todo esta solo en JSON ni que todo esta solo en tablas: el sistema es hibrido.

## 4. Retencion e historial

La politica actual por defecto es:

- Payload crudo pesado de Meli: 6 meses.
- Detalle de ventas: 24 meses.
- Resumenes mensuales: 10 anos.

El job de retencion compacta el `raw` viejo de Meli para no guardar payloads enormes por siempre. El historial financiero de largo plazo debe vivir en resumenes mensuales, no en payload crudo completo de cada venta.

Variables relacionadas:

- `MELI_RAW_PAYLOAD_RETENTION_MONTHS`
- `SALES_DETAIL_RETENTION_MONTHS`
- `REPORT_SUMMARY_RETENTION_YEARS`
- `DATA_RETENTION_BATCH_SIZE`
- `MONTHLY_SNAPSHOT_REBUILD_MONTHS`
- `MONTHLY_SNAPSHOT_CREATE_BATCH_SIZE`

## 5. Modulos principales del sistema

### Inicio / dashboard

Muestra resumen operativo de la cuenta:

- Venta Meli.
- Recibido de hoy.
- Utilidad.
- Valor de inventario.
- Pendientes reales.
- Riesgos del negocio.
- Productos que mas se vendieron.
- Accesos a pendientes, inventario, ventas y reportes.

El dashboard no debe ser una pantalla de captura pesada; es para diagnosticar rapido.

### Pendientes

Centraliza lo que impide confiar en inventario/utilidad:

- Ventas con dinero Meli pendiente.
- SKUs sin mapear.
- Equivalencias incompletas.
- Productos sin costo.
- Costos importados que no se pudieron ligar.
- Stock Full pendiente.
- Suscripcion o permisos que bloquean escritura.

Incluye acciones para recalcular, mapear SKUs, ligar costos y revisar billing.

### Inventario

Maneja el inventario operativo:

- Lista de SKU maestro.
- Producto/nombre.
- Stock total.
- Apartado por ventas pagadas sin guia.
- Disponible para vender.
- Stock por bodega.
- Publicaciones/SKUs online ligados.
- Costo promedio.
- Valor de inventario.
- Detalle del producto.
- Ventas recientes.
- Movimientos.
- Edicion de costo y datos del SKU.
- Conteo fisico que reemplaza el stock fisico de una bodega, no suma/resta.
- Ajuste manual que suma o resta.
- Traspaso entre bodegas.
- Filtros de pendientes: equivalencia, costo y archivados.
- Restaurar/mostrar archivados cuando aplica.
- Capas/logistica Full manuales para calcular costos logisticos.

Concepto clave: SKU maestro es el producto real de bodega. SKU online es la publicacion/SKU que viene de Mercado Libre u otro canal y que consume uno o varios SKU maestro.

### Administracion de SKUs maestros y equivalencias

El sistema permite:

- Crear SKU maestro.
- Editar datos del SKU maestro.
- Archivar/restaurar cuando conviene conservar historial.
- Eliminar solo cuando no tiene relaciones historicas que obliguen conservar trazabilidad.
- Ver que SKUs online consumen cada SKU maestro.
- Crear, editar y eliminar relaciones.
- Ver SKUs maestros sin SKU online.
- Ver SKUs online sin SKU maestro.

Si una publicacion de Mercado Libre no esta ligada, la venta entra como pendiente y no descuenta inventario ni calcula costo completo.

### Ventas

Lista y detalle de ventas:

- Busqueda por orden, SKU, producto o venta agrupada.
- Filtro por fecha.
- Filtro por estado.
- Filtro por bodega.
- Filtro por pendientes: sin mapear, sin cargos, billing pendiente, canceladas a revisar.
- KPIs del filtro: ordenes, venta bruta, cargos Meli, costo producto, utilidad confirmada.
- Paginacion.
- Detalle de venta.
- Items vendidos.
- SKU Meli.
- Producto maestro asociado.
- Bodega.
- Cantidad vendida.
- Cantidad consumida.
- Costo.
- Cargos de la venta.
- Recalculo contra Meli.
- Edicion manual de recibido si se necesita corregir.
- Cargo extra manual: publicidad, almacenamiento, devolucion u otros cobros que falten.

Ventas usa ventas reales agrupadas cuando Meli parte una misma venta en varias ordenes internas.

### Utilidad

Muestra resultado financiero por periodo:

- Fecha desde/hasta.
- Ventas cerradas.
- Utilidad final.
- Margen final.
- Ventas con perdida.
- Venta bruta.
- Recibido Meli.
- Cargos Meli.
- Costo producto.
- Costos adicionales.
- Gastos operativos.
- Historial mensual desde snapshots.
- Comparacion por SKU.
- Productos con perdida o utilidad.
- Ventas esperando billing Meli.

La utilidad confiable depende de tres cosas: SKU mapeado, costo de producto cargado y dinero/cargos de Meli confirmados o capturados.

### Reportes

Agrupa vistas y exportaciones:

- Utilidad.
- Ventas.
- Resurtido.
- Alertas.
- Historial mensual.
- Inventario.
- Auditoria.
- Pendientes.

La idea es reducir ruido en el menu principal y dejar reportes como centro de consulta financiera/ejecutiva.

### Resurtido

Calcula sugerencias de compra usando ventas historicas e inventario:

- SKUs con stock bajo.
- Unidades sugeridas.
- Valor sugerido.
- Uso de ventas de 90 dias cuando aplica.

### Alertas

Muestra problemas que no necesariamente son captura diaria:

- Riesgos de inventario.
- Cargos raros.
- Problemas Full.
- Ventas/inconsistencias que requieren revision.

### Mercado Libre

Pantalla de integracion:

- Conectar cuenta Meli.
- Ver cuentas conectadas.
- Ver estado de token/sync.
- Sincronizar ventas recientes manualmente.
- Sincronizar stock Full manualmente.
- Auditar Full sin guardar como stock definitivo.
- Traer cargos Full de un periodo.
- Reintentar billing pendiente.
- Ver corridas recientes de sync.
- Ver SKUs no mapeados detectados desde ventas.
- Mapear SKUs no mapeados en bloque.

### Importar

Permite cargar datos por archivo:

- Inventario.
- Cantidades de inventario.
- Costos de producto.
- Equivalencias SKU.
- Capas Full.
- Ventas manuales/externas.
- Preview de importacion.

### Usuarios, roles y cuenta

Permite:

- Invitar/crear usuarios.
- Asignar roles.
- Crear roles personalizados.
- Activar/desactivar permisos.
- Ver estado de suscripcion.
- Bloquear escritura si la suscripcion no permite operar.

Permisos base:

- `reports.view`: ver dashboard, reportes y utilidad.
- `inventory.view`: ver inventario.
- `inventory.write`: editar inventario.
- `sales.view`: ver ventas.
- `sales.write`: editar ventas/cargos.
- `costs.write`: editar costos/gastos.
- `imports.write`: importar archivos.
- `integrations.write`: conectar Meli y sincronizar.
- `users.manage`: administrar usuarios y roles.

### Salud / diagnostico

Pagina interna para revisar si el sistema esta listo:

- Inventario inicial.
- Equivalencias.
- Costos.
- Meli conectado.
- Sync automatico Meli.
- Auditoria de ventas.
- Stock negativo.
- Proteccion de ventas viejas contra inventario actual.
- Suscripcion.
- Seguridad.
- Billing viejo.
- Stock Full.
- Cargos Full.
- Costos logisticos Full.
- Retencion.
- Snapshots mensuales.
- Escala/costos para piloto.

## 6. Conexion con Mercado Libre

### Variables necesarias

- `MELI_CLIENT_ID`
- `MELI_CLIENT_SECRET`
- `MELI_REDIRECT_URI`
- `APP_URL`
- `MELI_WEBHOOK_SECRET`
- `CRON_SECRET`

Tambien hay variables de limite de sincronizacion:

- `MELI_HOURLY_BACKFILL_LIMIT`
- `MELI_HOURLY_RECENT_LIMIT`
- `MELI_HOURLY_ACCOUNT_RUNTIME_MS`
- `MELI_HOURLY_PENDING_BILLING_LIMIT`
- `MELI_HOURLY_FULL_STOCK_MAX_ITEMS`
- `MELI_INITIAL_BACKFILL_LIMIT`
- `MELI_INITIAL_BACKFILL_MONTHS`
- `MELI_INITIAL_RECENT_LIMIT`
- `MELI_INITIAL_SYNC_RUNTIME_MS`
- `MELI_ADMIN_BACKFILL_DEFAULT`
- `MELI_ADMIN_BACKFILL_MAX`
- `MELI_ADMIN_PENDING_BILLING_LIMIT`
- `MELI_ADMIN_FULL_STOCK_MAX_ITEMS`

Defaults importantes:

- Sync inicial de cuenta nueva: 2 meses de backfill.
- Primer jalon inicial: hasta 500 ordenes.
- Sync horario: 150 ordenes por hora por defecto.
- Runtime maximo por cuenta en cron horario: 90 segundos.

### OAuth

El flujo es:

1. Usuario presiona conectar Meli.
2. El sistema crea un `state` temporal en cookie `meli_oauth_state`.
3. Redirige a `https://auth.mercadolibre.com.mx/authorization`.
4. Meli regresa a `/api/integrations/meli/callback`.
5. El sistema valida el `state`.
6. Intercambia `code` por `access_token` y `refresh_token`.
7. Llama `/users/me` para obtener usuario Meli.
8. Guarda la cuenta como `meli_{user.id}`.
9. Para una cuenta nueva crea estado de backfill inicial.
10. Lanza una primera sincronizacion limitada.

### Refresh de token

Antes de llamar Meli, el sistema revisa si el token necesita refresh. Si hace falta:

- Usa `refresh_token`.
- Obtiene nuevo `access_token`.
- Actualiza `refreshToken`, expiracion y estado conectado.

### Endpoints de Meli usados

El sistema llama estos recursos:

- `POST /oauth/token`: intercambio y refresh de token.
- `GET /users/me`: datos de la cuenta conectada.
- `GET /orders/search/recent`: ventas recientes.
- `GET /orders/search`: backfill, busqueda por fecha y busqueda por identificador.
- `GET /orders/{id}`: detalle de una orden.
- `GET /packs/{packId}`: relacion de paquetes.
- `GET /marketplace/orders/pack/{packId}`: fallback de paquetes.
- `GET /shipments/{shipmentId}`: detalle del envio.
- `GET /shipments/{shipmentId}/costs`: costos del envio.
- `GET /billing/integration/group/ML/order/details?order_ids=...`: cargos/billing por orden.
- `GET https://api.mercadopago.com/v1/payments/{id}`: detalle de pago.
- `GET /users/{sellerId}/items/search`: publicaciones activas del vendedor.
- `GET /items?ids=...`: detalle de publicaciones, thumbnails, inventory id, variaciones, seller SKU.
- `GET /inventories/{inventoryId}/stock/fulfillment`: stock Full por inventario.
- `GET /billing/integration/periods/key/{period}/group/ML/full/details`: cargos Full mensuales.
- `PUT /items/{itemId}`: existe la funcion para actualizar stock de publicacion, pero no se debe prometer push automatico de stock hasta activar y monitorear el flujo.

## 7. Que informacion agarra de Meli

### Cuenta

- ID de vendedor.
- Nickname.
- Site ID.
- Tokens de acceso/refresh.
- Expiracion del token.
- Estado de conexion.
- Estado de backfill/sync.

### Ordenes y ventas

- ID interno de orden Meli.
- ID de pack.
- ID de envio.
- ID de venta real cuando existe `order_request`.
- Estado de la venta.
- Fecha de cierre/creacion.
- Moneda.
- Monto bruto.
- Monto pagado.
- Items.
- SKU Meli o seller SKU.
- Seller custom field.
- Titulo.
- Cantidad.
- Precio unitario.
- Imagen/thumbnail cuando viene.
- Listing ID.
- Variation ID.
- Logistic type.
- Si es Full o no.

### Paquetes divididos

Cuando Meli divide una venta en varias ordenes internas, Control Total intenta reconstruir la venta real usando:

- `pack_id`.
- `pack.id`.
- `family_pack_id`.
- `order_request.id`.
- `shipment.id`.
- Pack endpoints.
- Busquedas por identificadores numericos.
- Ventas cercanas en fecha.
- Heuristicas de siblings por SKU/precio/cantidad/envio.

Luego agrupa esas ordenes para mostrar una venta real con desglose de ordenes internas. En esos casos tambien reparte el costo de envio del paquete entre las ordenes segun unidades.

### Billing, pagos y cargos

El sistema intenta obtener:

- Comision Mercado Libre.
- Costos de envio.
- Cargos/bonificaciones detectadas en billing.
- Impuestos retenidos.
- Financiamiento/promocion/otros cargos si aparecen en los datos.
- Pago de Mercado Pago.
- Neto recibido.
- Estado de billing: confirmado, pendiente o error.

Si Meli todavia no publica billing final, la venta puede quedar como pendiente y no debe entrar como utilidad confirmada completa.

### Stock Full

Para Full:

- Lista publicaciones activas.
- Lee detalle de item.
- Detecta `inventory_id`.
- Consulta stock fulfillment por `inventory_id`.
- Guarda stock disponible Full.
- Guarda no disponible y detalle de no disponible cuando Meli lo entrega.
- Liga stock Full a SKU maestro si encuentra equivalencia por SKU o listing.
- Guarda items Full no mapeados.
- Guarda imagenes de publicaciones.

Importante: esto trae foto de stock Full. No significa que el sistema cree automaticamente transferencias de envio a Full desde Meli.

### Cargos Full mensuales

El sistema trae cargos Full por periodo:

- Periodo.
- Producto/titulo.
- SKU externo si viene.
- ID de producto/inventory/listing si viene.
- Tamano/volumen si viene.
- Tipo de cargo.
- Unidades.
- Monto.
- Moneda.
- Buckets de antiguedad: hasta 2 meses, 2 a 4, 4 a 6, 6 a 12, mas de 12, otros.
- Raw del cargo.

## 8. Que informacion no agarra o no esta lista para prometer

No debemos vender como listo lo siguiente:

- Amazon, TikTok Shop, Shopify u otros marketplaces: no estan integrados como Meli.
- Webhook en tiempo real como fuente principal garantizada: existe endpoint y procesa `orders_v2` con secreto valido, pero el flujo principal sigue siendo cron/manual.
- Push automatico de stock a Meli: hay funcion tecnica, pero no esta programado/monitoreado como funcionalidad activa segura.
- Transferencias automaticas de envios a Full: el sistema maneja stock/capas Full y stock fulfillment, pero no debe prometer crear transferencias Full automaticamente desde Meli.
- Publicidad/ads completa si Meli no la entrega en billing de orden o si no se captura como cargo/gasto.
- Devoluciones y reclamos como flujo completo de postventa.
- Facturacion fiscal/SAT.
- Conciliacion bancaria real.
- Cobranza automatica de suscripciones con Stripe u otro proveedor.
- Politicas RLS completas en PostgreSQL: existe script para habilitar RLS, pero habilitarlo sin policies puede bloquear la app.
- Seguridad perfecta: hay controles, pero faltan validaciones operativas y configuraciones de produccion.

## 9. Automatizaciones y cron jobs

En Vercel estan configurados:

- `0 * * * *` -> `/api/cron/meli-hourly`
  - Sincroniza ventas Meli por cuenta.
  - Respeta presupuesto de tiempo.
  - Procesa backfill por lotes.
  - Reintenta billing pendiente cuando el backlog esta limpio.
  - Puede sincronizar Full si hay presupuesto y el ultimo sync Full ya tiene mas de un dia.

- `30 11 * * *` -> `/api/cron/meli-full-stock-daily`
  - Sincroniza stock Full diario.
  - Recorre cuentas conectadas.
  - Limite default: 5000 publicaciones, configurable por query/env.

- `0 12 1 * *` -> `/api/cron/meli-full-billing-monthly`
  - Trae cargos Full del mes anterior.

- `30 12 * * *` -> `/api/cron/meli-full-billing-retry`
  - Reintenta cargos Full del mes anterior durante los primeros 15 dias del mes.

- `30 13 * * 0` -> `/api/cron/data-retention`
  - Compacta payload raw viejo.

- `0 14 * * 0` -> `/api/cron/monthly-snapshots`
  - Reconstruye resumenes mensuales.

Todos los cron protegidos requieren `CRON_SECRET`.

## 10. Flujo de una venta Meli

1. Llega por sync manual, cron o webhook.
2. Se obtiene la orden base.
3. Se expande si pertenece a pack o venta partida.
4. Se busca billing por orden.
5. Se buscan pagos de Mercado Pago.
6. Se busca shipment y shipment costs.
7. Se normaliza la orden.
8. Se detecta si es Full o bodega normal.
9. Se intenta mapear cada item a SKU online.
10. El SKU online resuelve que SKU maestro consume y cuantas unidades.
11. Si esta mapeado, calcula costo producto.
12. Si no esta mapeado, queda pendiente.
13. Se guardan orden, items, cargos y componentes.
14. Se recalculan reportes/inventario cuando corresponde.
15. En reportes, las ordenes internas se agrupan como venta real cuando aplica.

## 11. Inventario y descuento de stock

El sistema descuenta inventario cuando una venta tiene items mapeados a SKU maestro. Si una venta esta sin mapear:

- No sabe que producto descontar.
- No puede calcular costo producto.
- Queda como pendiente.

El conteo fisico reemplaza el stock fisico de la bodega elegida. No suma ni resta. La formula operativa es:

- Fisico estimado = disponible + apartado.
- Apartado = ventas pagadas sin guia.
- Disponible = fisico menos apartado/bloqueado.

Hay proteccion para ventas viejas contra inventario actual: la pagina de salud revisa que exista fecha base de inventario para que sincronizar historial no descuente stock que el usuario ya conto como stock actual.

## 12. Costos y utilidad

La utilidad se calcula con:

- Venta bruta.
- Neto recibido o estimado.
- Cargos Meli.
- Impuestos/cobros detectados.
- Costo promedio del producto.
- Costos adicionales capturados.
- Full billing/costos Full cuando se tienen datos.
- Gastos operativos mensuales.

Si falta costo de producto, equivalencia o billing, la utilidad puede quedar incompleta o pendiente.

## 13. Seguridad actual

Controles existentes:

- Sesion con cookie `ct_session`.
- Password con hash/salt.
- Roles y permisos.
- Bloqueo por suscripcion.
- Rutas privadas redirigen a login.
- API privada devuelve 401 si no hay sesion.
- Rate limit basico por IP+ruta API.
- Limite de body: 15 MB.
- Bloqueo de origen no confiable en metodos mutantes.
- Proteccion contra `x-middleware-subrequest`.
- CSP y headers de seguridad.
- Cron protegido por `CRON_SECRET`.
- Webhook Meli protegido por `MELI_WEBHOOK_SECRET`.
- Admin plataforma por `PLATFORM_ADMIN_EMAILS` o `SUPER_ADMIN_EMAILS`.
- Auditoria de acciones importantes.

Checks criticos de seguridad que deben estar bien en produccion:

- `TOKEN_ENCRYPTION_KEY` configurado y largo.
- `CRON_SECRET` configurado y largo.
- `MELI_WEBHOOK_SECRET` configurado y largo.
- `PLATFORM_ADMIN_EMAILS` sin placeholder.
- `APP_URL` en HTTPS.

## 14. Costos y escala

El sistema tiene pagina de salud/costos que estima:

- Costo mensual de DB.
- Ventas ultimos 30 dias.
- Costo por venta reciente.
- Payload promedio por orden.
- Proyeccion de storage a 12 meses.
- Payload retenido con politica de 6 meses.
- Capacidad del cron horario.
- Headroom contra meta de 30,000 ventas/mes por defecto.

Variables relevantes:

- `DATABASE_MONTHLY_COST_USD`
- `DATABASE_INCLUDED_STORAGE_GB`
- `DATABASE_EXTRA_STORAGE_USD_PER_GB_MONTH`
- `SCALE_TARGET_MONTHLY_ORDERS`

Con defaults actuales, la meta de escala se evalua contra 30,000 ordenes/mes, que equivale aproximadamente a 1,000 al dia.

## 15. Proceso recomendado para meter un cliente nuevo

1. Crear organizacion y usuario owner/admin.
2. Confirmar que produccion usa la DB correcta.
3. Confirmar backups de la DB.
4. Confirmar variables de seguridad.
5. Conectar cuenta(s) de Mercado Libre.
6. Dejar que corra sync inicial: mes actual + mes pasado por defecto actual de 2 meses.
7. Cargar inventario inicial con stock actual.
8. Cargar costos.
9. Mapear SKUs online a SKU maestro.
10. Revisar SKUs sin mapear en Pendientes.
11. Sincronizar/auditar Full.
12. Traer cargos Full del periodo disponible.
13. Revisar ventas con billing pendiente.
14. Abrir Salud y resolver checks criticos.
15. Revisar una muestra de ventas contra Seller Center.
16. Revisar utilidad por periodo.
17. Activar al cliente con monitoreo diario los primeros dias.

## 16. Lista rapida de lo que si hace

- Login y sesiones.
- Multi-organizacion.
- Roles y permisos.
- Suscripcion/bloqueo.
- Dashboard operativo.
- Pendientes accionables.
- Inventario por SKU maestro.
- Stock por bodega.
- Ajustes, conteos y traspasos.
- SKU maestro + SKU online + componentes.
- Kits simples por componentes.
- Archivado/restauracion cuando aplica.
- Importaciones.
- Exportaciones.
- Conexion OAuth con Meli.
- Sync manual de ventas recientes.
- Sync automatico horario por lotes.
- Agrupacion de paquetes/ordenes internas Meli.
- Billing Meli por orden.
- Mercado Pago payment detail.
- Shipment detail y shipment costs.
- Reintento de billing pendiente.
- Stock Full.
- Auditoria Full.
- Cargos Full mensuales.
- Reporte de ventas.
- Detalle de venta.
- Utilidad por periodo.
- Gastos operativos.
- Resurtido.
- Alertas.
- Auditoria de ventas.
- Retencion de payload.
- Snapshots mensuales.
- Checks de costo, escala y seguridad.

## 17. Lista rapida de lo que no debemos prometer aun

- Integraciones completas con otros marketplaces.
- Webhooks como unico sync en tiempo real.
- Push automatico de stock a Meli funcionando en produccion.
- Transferencias automaticas a Full.
- Ads/publicidad completa si no se captura manual o no viene en datos.
- Devoluciones/reclamos completos.
- Conciliacion bancaria.
- Facturacion fiscal.
- Cobranza automatica del SaaS.
- Migracion final fuera de DigitalOcean.
- RLS completo listo para activar sin policies.

## 18. Archivos clave para desarrollo

- `src/app/dashboard/page.tsx`: inicio.
- `src/app/setup/page.tsx`: pendientes.
- `src/app/inventario/page.tsx`: inventario.
- `src/app/inventario/[masterSku]/page.tsx`: detalle producto.
- `src/app/ventas/page.tsx`: ventas.
- `src/app/ventas/[orderId]/page.tsx`: detalle venta.
- `src/app/utilidad/page.tsx`: utilidad.
- `src/app/reportes/page.tsx`: reportes.
- `src/app/meli/page.tsx`: integracion Meli.
- `src/app/salud/page.tsx`: diagnostico.
- `src/lib/meli/client.ts`: cliente API Meli.
- `src/lib/meli/sync.ts`: sync ventas, billing, paquetes y Full stock.
- `src/lib/meli/normalize.ts`: normalizacion de ordenes.
- `src/lib/meli/full-billing.ts`: cargos Full mensuales.
- `src/lib/server/reports.ts`: reportes.
- `src/lib/server/local-store.ts`: capa de persistencia hibrida.
- `src/lib/server/data-retention.ts`: retencion.
- `src/lib/server/monthly-snapshots.ts`: snapshots.
- `src/lib/server/auth-store.ts`: usuarios, sesiones, roles, permisos y suscripcion.
- `src/proxy.ts`: proteccion de rutas.
- `next.config.ts`: headers de seguridad.
- `vercel.json`: crons.

