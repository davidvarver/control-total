# Plan funcional - SaaS de inventario, ventas y utilidad multicanal

## 1. Vision del producto

Crear una plataforma SaaS mensual para sellers de marketplaces en Mexico que permita controlar inventario, ventas, bodegas, costos, gastos ocultos y utilidad real por producto, canal y cuenta.

El sistema debe servir para muchos tipos de productos, no para un giro especifico. La logica debe soportar productos simples, variantes, paquetes, kits, bodegas multiples y varias cuentas conectadas por marketplace.

Propuesta de valor principal:

- Tener control total del inventario por producto, bodega, canal y cuenta.
- Evitar sobreventas mediante stock disponible, stock reservado y reglas de sincronizacion.
- Saber utilidad real por venta, producto, canal y cuenta, incluyendo comisiones, publicidad, envios, promociones, devoluciones y otros cargos ocultos.
- Detectar productos con bajo stock, productos atorados y productos con demasiadas devoluciones.
- Rentar el sistema por mensualidad y bloquear acceso si el cliente no paga.

## 2. Decisiones base

### 2.1 Arquitectura SaaS

Recomendacion inicial: una sola plataforma multiempresa.

Cada cliente sera una organizacion independiente. Todos los datos importantes deben llevar `organization_id` para separar informacion:

- usuarios
- productos
- SKUs
- bodegas
- ventas
- costos
- integraciones
- reportes
- pagos de suscripcion

No se recomienda crear un servidor separado por cliente al inicio porque encarece operacion, mantenimiento, actualizaciones y soporte. Mas adelante se puede vender una instancia dedicada para clientes grandes.

### 2.2 Mercado objetivo inicial

Sellers de:

- Mercado Libre
- Amazon
- TikTok Shop
- ventas manuales por WhatsApp, mostrador, Instagram o canales propios

Mexico sera el mercado inicial.

### 2.3 Metodo de costeo

Arrancar con costo promedio ponderado, guardando historial de compras para poder agregar FIFO despues.

Motivo:

- costo promedio es mas simple para MVP
- permite utilidad suficientemente real para el primer producto vendible
- no bloquea FIFO futuro si se guarda bien cada compra

Cada compra o ingreso debe guardar:

- producto maestro
- cantidad
- costo unitario
- proveedor
- fecha
- bodega destino
- moneda
- notas

### 2.4 Bodegas externas

Bodegas como Mercado Libre Full, Amazon FBA y TikTok fulfillment se trataran como bodegas propias del cliente, pero con disponibilidad restringida.

Ejemplo:

- stock en `Mi Bodega`: disponible para ventas manuales y para enviar a cualquier canal
- stock en `Mercado Libre Full`: sigue siendo del cliente, pero normalmente solo se usa para ventas de Mercado Libre
- stock en `Amazon FBA`: sigue siendo del cliente, pero normalmente solo se usa para Amazon

## 3. Conceptos principales

### 3.1 Organizacion

Representa a cada cliente que renta el sistema.

Cada organizacion tiene:

- nombre comercial
- usuarios
- roles
- permisos
- plan
- fecha de vencimiento
- estado de pago
- marketplaces conectados
- configuracion de bodegas, costos y reportes

### 3.2 Usuario

Persona que entra al sistema.

Un usuario pertenece a una organizacion y puede tener uno o varios roles.

Roles iniciales sugeridos:

- dueno
- admin
- inventario
- ventas
- compras
- finanzas
- solo lectura
- soporte interno
- super admin de la plataforma

### 3.3 Producto maestro

Unidad real de inventario.

Ejemplo:

- `silla.02`
- `guantes.moto.m`
- `antena.negra`

El producto maestro es lo que realmente existe fisicamente y lo que se descuenta del inventario.

Datos sugeridos:

- SKU maestro
- nombre
- descripcion
- categoria
- marca
- foto
- peso unidad
- medidas unidad
- piezas por caja master
- peso caja master
- medidas caja master
- estado activo/inactivo
- stock minimo manual opcional
- dias objetivo de inventario

### 3.4 SKU online

SKU usado en marketplace, tienda o canal de venta.

Un SKU online puede equivaler a uno o varios productos maestros.

Ejemplo simple:

- SKU online: `silla.02-10pzas`
- componente: `silla.02`
- cantidad consumida: 10

Ejemplo kit:

- SKU online: `kit-limpieza-auto`
- componente 1: `microfibra.01`, cantidad 2
- componente 2: `cepillo.01`, cantidad 1
- componente 3: `spray.01`, cantidad 1

Esta tabla reemplaza y mejora la pestana `CATALOGO` del Excel actual.

### 3.5 Cuenta de marketplace

Una organizacion puede tener muchas cuentas por canal.

Ejemplo:

- Mercado Libre cuenta 1
- Mercado Libre cuenta 2
- Mercado Libre cuenta 3
- Amazon Mexico
- TikTok Shop Mexico

Cada cuenta debe guardar:

- plataforma
- alias interno
- identificador externo
- credenciales OAuth/token
- estado de conexion
- fecha de ultima sincronizacion
- reglas de stock
- bodega preferida

### 3.6 Bodega

Ubicacion logica o fisica donde hay inventario.

Tipos sugeridos:

- propia
- Mercado Libre Full
- Amazon FBA
- TikTok fulfillment
- 3PL
- transito
- devoluciones
- danado
- apartado

Cada bodega debe poder marcarse como:

- disponible para ventas manuales
- disponible para sincronizar con marketplaces
- exclusiva de una plataforma
- solo informativa

## 4. Reglas de inventario

### 4.1 Estados de stock

El sistema debe separar:

- stock fisico
- stock reservado
- stock disponible
- stock en fulfillment
- stock en transito
- stock danado
- stock devuelto pendiente de revision

Formula base:

```text
stock disponible = stock fisico - stock reservado - stock bloqueado - buffer
```

### 4.2 Stock publicable

Para sincronizacion con marketplaces:

```text
stock publicable = floor(stock disponible del producto maestro / cantidad consumida por SKU online)
```

Ejemplo:

- producto maestro: `silla.02`
- stock disponible: 100 piezas
- SKU online: `silla.02-10pzas`
- consumo: 10 piezas
- stock publicable: 10 unidades

Si existe buffer de seguridad de 10 piezas:

```text
floor((100 - 10) / 10) = 9 unidades publicables
```

### 4.3 Venta

Cuando entra una venta:

1. Se identifica el SKU online vendido.
2. Se buscan sus componentes.
3. Se multiplica cantidad vendida por cantidad consumida.
4. Se reserva o descuenta stock del producto maestro.
5. Se registra movimiento de inventario.
6. Se crea registro financiero de la venta.

Ejemplo:

```text
Venta: 2 unidades de silla.02-10pzas
Consumo: silla.02 x 10
Descuento total: 20 piezas de silla.02
```

### 4.4 Cancelacion

Si una orden se cancela:

- si solo estaba reservada, se libera la reserva
- si ya habia descontado stock, se genera movimiento de regreso
- se registra auditoria del cambio

### 4.5 Devolucion

Una devolucion no debe regresar automaticamente a stock disponible.

Flujo recomendado:

1. Orden marcada como devuelta.
2. Producto entra a bodega `Devoluciones`.
3. Usuario revisa condicion.
4. Usuario decide:
   - regresar a stock disponible
   - mandar a danado
   - merma
   - reacondicionado

### 4.6 Ajustes manuales

Todo ajuste manual de stock debe pedir:

- producto
- bodega
- cantidad
- motivo
- comentario
- usuario

Debe quedar en auditoria.

## 5. Costos, gastos y utilidad

### 5.1 Objetivo

El diferenciador del sistema sera calcular utilidad real, incluyendo gastos visibles y ocultos.

No basta con:

```text
precio venta - costo producto
```

El sistema debe llegar a:

```text
utilidad neta =
ingreso cobrado
- costo producto
- comision marketplace
- cargo de envio
- cargo fulfillment
- publicidad atribuida
- descuentos y promociones
- costo de empaque
- costo financiero
- devoluciones
- otros cargos
```

### 5.2 Niveles de gasto

Los gastos pueden existir en varios niveles:

- por venta
- por producto
- por SKU online
- por canal
- por cuenta de marketplace
- por campana publicitaria
- general de la organizacion

Ejemplo:

- comision de Mercado Libre por venta
- publicidad de Mercado Libre Ads por producto
- cargo de Full por almacenamiento
- costo de empaque por orden
- gasto mensual general que se prorratea

### 5.3 Costo del producto

MVP:

- costo promedio ponderado por producto maestro

Futuro:

- FIFO por lote de compra
- costo por bodega
- costo por moneda
- costo con importacion, flete y aranceles prorrateados

### 5.4 Reporte de utilidad por venta

Cada venta debe mostrar:

- canal
- cuenta
- orden externa
- fecha
- SKU online
- producto maestro consumido
- cantidad
- ingreso bruto
- descuentos
- ingreso neto recibido
- costo del producto
- comision
- envio
- publicidad
- otros cargos
- utilidad neta
- margen porcentual

### 5.5 Publicidad

Como esto es muy importante, desde el diseno inicial debe existir el modulo de publicidad.

Al inicio puede cargarse manualmente o por CSV:

- plataforma
- cuenta
- campana
- SKU/producto relacionado, si aplica
- fecha
- gasto
- ventas atribuidas, si se conoce

Cuando no se pueda atribuir exacto a una venta, el sistema debe permitir reglas de prorrateo:

- por producto
- por canal
- por ventas del periodo
- manual

## 6. Alertas y analisis de inventario

### 6.1 Bajo stock inteligente

El sistema debe calcular velocidad de venta.

Formula base:

```text
venta promedio diaria = unidades vendidas en periodo / dias del periodo
dias restantes = stock disponible / venta promedio diaria
```

Si los dias restantes son menores al objetivo, generar alerta.

Ejemplo:

- objetivo: 90 dias
- stock disponible: 120 piezas
- venta promedio diaria: 2 piezas
- dias restantes: 60
- alerta: comprar para cubrir 90 dias

Compra sugerida:

```text
compra sugerida = (venta promedio diaria * dias objetivo) - stock disponible
```

### 6.2 Productos atorados

Detectar productos con:

- stock alto
- ventas bajas o nulas
- muchos dias sin venta
- capital inmovilizado alto

### 6.3 Devoluciones anormales

Calcular tasa de devolucion:

```text
tasa devolucion = unidades devueltas / unidades vendidas
```

Alertar cuando un producto supere el promedio normal de la cuenta o categoria.

## 7. Suscripcion y bloqueo por pago

### 7.1 Cobro inicial

Al inicio el cobro sera manual:

- transferencia
- efectivo
- registro manual por el super admin

### 7.2 Estado de suscripcion

Cada organizacion tendra:

- plan
- fecha de inicio
- fecha de vencimiento
- dias de gracia
- estado
- notas de pago

Estados:

- trial
- activo
- en gracia
- suspendido
- cancelado

Regla inicial:

- 10 dias de gracia despues del vencimiento
- si no paga, se bloquea acceso segun configuracion
- no se borra informacion

### 7.3 Tipos de bloqueo

Configurable por el super admin:

- bloqueo total
- solo lectura
- bloquear usuarios no admin
- permitir solo exportacion
- permitir acceso temporal manual

## 8. Permisos

El admin de cada organizacion podra crear roles personalizados.

Permisos base:

- ver dashboard
- ver productos
- crear productos
- editar productos
- eliminar/desactivar productos
- ver costos
- editar costos
- ver utilidad
- ver inventario
- ajustar inventario
- transferir inventario
- ver ventas
- crear ventas manuales
- editar ventas
- ver compras
- crear compras
- editar compras
- ver reportes
- exportar reportes
- conectar marketplace
- administrar usuarios
- administrar permisos
- ver auditoria

Permisos especiales:

- super admin de plataforma puede ver organizaciones, pagos y estado tecnico
- soporte puede entrar a una organizacion solo si esta autorizado o con registro de auditoria

## 9. Pantallas del MVP

### 9.1 Login

- correo
- password
- recuperacion
- bloqueo por suscripcion vencida

### 9.2 Selector de organizacion

Solo si un usuario pertenece a varias organizaciones.

### 9.3 Dashboard principal

KPIs:

- ventas del periodo
- utilidad neta
- margen promedio
- inventario valorizado
- productos con bajo stock
- productos atorados
- devoluciones
- ventas por canal
- utilidad por canal

### 9.4 Productos maestros

Tabla con:

- SKU maestro
- nombre
- categoria
- stock total
- stock disponible
- costo promedio
- valor inventario
- dias restantes
- estado

Acciones:

- crear producto
- editar producto
- ver historial
- exportar

### 9.5 Detalle de producto

Secciones:

- informacion general
- fotos
- SKUs online relacionados
- stock por bodega
- movimientos
- compras
- ventas
- costos
- utilidad
- devoluciones
- alertas

### 9.6 SKUs online y kits

Tabla:

- SKU online
- canal
- cuenta marketplace
- producto maestro o componentes
- multiplicador
- stock publicable
- estado

Acciones:

- crear SKU online
- mapear a producto maestro
- crear kit
- validar SKUs no mapeados

### 9.7 Bodegas

Tabla:

- nombre
- tipo
- plataforma asociada
- disponible para venta
- exclusiva
- estado

### 9.8 Inventario

Vistas:

- stock por producto
- stock por bodega
- movimientos
- ajustes
- transferencias
- devoluciones pendientes

### 9.9 Ventas

Tabla:

- fecha
- canal
- cuenta
- orden
- SKU online
- cantidad
- ingreso
- costo
- gastos
- utilidad
- estado

Filtros:

- fecha
- canal
- cuenta
- producto
- estado
- margen negativo

### 9.10 Compras

Registrar:

- proveedor
- fecha
- productos
- cantidades
- costo unitario
- bodega destino
- notas

### 9.11 Gastos

Gastos por:

- venta
- producto
- canal
- cuenta
- publicidad
- general

### 9.12 Reportes

Reportes iniciales:

- utilidad por venta
- utilidad por producto
- utilidad por canal
- utilidad por cuenta
- inventario valorizado
- stock bajo
- productos atorados
- devoluciones
- ventas por mes
- top productos
- productos con margen negativo

Todos deben poder exportarse a Excel/CSV.

### 9.13 Integraciones

MVP puede iniciar con carga manual/CSV, pero la pantalla debe existir:

- Mercado Libre
- Amazon
- TikTok Shop

Por cada plataforma:

- conectar cuenta
- ver estado
- ultima sincronizacion
- errores
- activar/desactivar importacion de ordenes
- activar/desactivar sincronizacion de stock, cuando exista

### 9.14 Admin de suscripcion

Para super admin:

- organizaciones
- plan
- vencimiento
- estado
- dias de gracia
- registrar pago
- suspender
- reactivar
- ajustar bloqueo

## 10. Integraciones

### 10.1 Orden recomendado

1. Mercado Libre
2. Amazon
3. TikTok Shop

### 10.2 Fase 1 de integraciones

Importar:

- ordenes
- items vendidos
- estado de orden
- cancelaciones
- devoluciones cuando sea posible
- cargos/comisiones cuando la API lo permita

### 10.3 Fase 2 de integraciones

Sincronizar stock:

- stock por SKU online
- buffer de seguridad
- pausa por stock cero
- logs de sincronizacion
- reintentos
- alertas de error

### 10.4 Fase 3 de integraciones

Finanzas avanzadas:

- publicidad
- cargos de fulfillment
- almacenamiento
- promociones
- conciliacion de pagos

### 10.5 No incluir al inicio

No recomiendo incluir publicacion de productos desde el sistema en el MVP. Eso aumenta mucho complejidad por categorias, atributos y reglas de cada marketplace.

## 11. Modelo de datos inicial

### 11.1 SaaS y usuarios

`organizations`

- id
- name
- status
- created_at

`users`

- id
- name
- email
- password_hash
- status
- created_at

`organization_users`

- id
- organization_id
- user_id
- role_id
- status

`roles`

- id
- organization_id
- name
- is_system_role

`permissions`

- id
- code
- description

`role_permissions`

- role_id
- permission_id

`audit_logs`

- id
- organization_id
- user_id
- action
- entity_type
- entity_id
- before_json
- after_json
- created_at

### 11.2 Suscripciones

`plans`

- id
- name
- price_monthly
- limits_json
- status

`subscriptions`

- id
- organization_id
- plan_id
- status
- starts_at
- expires_at
- grace_until
- lock_mode

`subscription_payments`

- id
- organization_id
- amount
- method
- paid_at
- covered_until
- notes
- created_by

### 11.3 Catalogo

`master_products`

- id
- organization_id
- master_sku
- name
- description
- category_id
- brand
- image_url
- unit_weight
- unit_dimensions
- master_box_units
- master_box_weight
- master_box_dimensions
- target_inventory_days
- status

`online_skus`

- id
- organization_id
- online_sku
- title
- marketplace_account_id
- channel
- external_listing_id
- status

`sku_components`

- id
- organization_id
- online_sku_id
- master_product_id
- quantity_required

### 11.4 Bodegas e inventario

`warehouses`

- id
- organization_id
- name
- type
- channel
- is_sellable
- is_exclusive
- status

`inventory_balances`

- id
- organization_id
- master_product_id
- warehouse_id
- physical_quantity
- reserved_quantity
- blocked_quantity
- updated_at

`inventory_movements`

- id
- organization_id
- master_product_id
- warehouse_id
- movement_type
- quantity
- reference_type
- reference_id
- reason
- notes
- created_by
- created_at

`inventory_transfers`

- id
- organization_id
- from_warehouse_id
- to_warehouse_id
- status
- created_by
- created_at

### 11.5 Compras y costos

`suppliers`

- id
- organization_id
- name
- contact_info
- status

`purchase_orders`

- id
- organization_id
- supplier_id
- date
- status
- notes

`purchase_items`

- id
- organization_id
- purchase_order_id
- master_product_id
- warehouse_id
- quantity
- unit_cost
- currency
- landed_cost_allocated

`product_cost_snapshots`

- id
- organization_id
- master_product_id
- average_cost
- calculated_at

### 11.6 Ventas

`sales_orders`

- id
- organization_id
- marketplace_account_id
- channel
- external_order_id
- order_date
- status
- buyer_reference
- gross_amount
- net_received_amount
- currency

`sales_order_items`

- id
- organization_id
- sales_order_id
- online_sku_id
- external_sku
- quantity
- unit_price
- gross_amount

`sales_item_components`

- id
- organization_id
- sales_order_item_id
- master_product_id
- quantity_consumed
- unit_cost_at_sale
- total_cost

### 11.7 Gastos y utilidad

`sale_charges`

- id
- organization_id
- sales_order_id
- sales_order_item_id
- charge_type
- amount
- source
- notes

Tipos de cargo:

- marketplace_commission
- shipping
- fulfillment
- advertising
- promotion
- financing
- packaging
- storage
- return_cost
- other

`ad_spend`

- id
- organization_id
- channel
- marketplace_account_id
- campaign_name
- master_product_id
- online_sku_id
- date
- amount
- attribution_method

`returns`

- id
- organization_id
- sales_order_id
- sales_order_item_id
- status
- quantity
- reason
- warehouse_id
- refund_amount
- created_at

### 11.8 Integraciones

`marketplace_accounts`

- id
- organization_id
- channel
- alias
- external_account_id
- auth_status
- token_encrypted
- refresh_token_encrypted
- last_sync_at
- settings_json
- status

`sync_jobs`

- id
- organization_id
- marketplace_account_id
- job_type
- status
- started_at
- finished_at
- error_message

`sync_logs`

- id
- organization_id
- sync_job_id
- level
- message
- payload_json
- created_at

## 12. Roadmap

### Fase 0 - Documento y prototipo funcional

Objetivo:

- cerrar reglas
- definir pantallas
- definir base de datos
- preparar MVP

Entregables:

- documento funcional
- wireframes simples
- backlog inicial

### Fase 1 - MVP interno

Objetivo:

- usarlo contigo como primer cliente piloto

Incluye:

- login
- multiempresa
- usuarios y permisos basicos
- productos maestros
- SKUs online y multiplicadores
- bodegas
- inventario
- movimientos
- compras
- costo promedio
- ventas manuales/import CSV
- gastos por venta
- utilidad
- alertas de bajo stock
- reportes basicos
- bloqueo manual por suscripcion

### Fase 2 - MVP vendible

Objetivo:

- vender a primeros clientes

Incluye:

- onboarding de empresa
- roles personalizados
- reportes completos
- exportaciones
- panel super admin
- mejoras de auditoria
- plantillas de importacion
- validaciones de datos

### Fase 3 - Mercado Libre

Objetivo:

- conectar multiples cuentas de Mercado Libre por organizacion

Incluye:

- OAuth
- importar ordenes
- importar estados
- mapear SKUs no encontrados
- detectar cancelaciones/devoluciones
- traer cargos disponibles
- sincronizar stock como segunda etapa

### Fase 4 - Amazon

Incluye:

- conexion SP-API
- ordenes
- inventario/FBA donde aplique
- reportes financieros disponibles
- stock

### Fase 5 - TikTok Shop

Incluye:

- conexion TikTok Shop
- ordenes
- inventario
- costos/cargos disponibles
- stock

### Fase 6 - Finanzas avanzadas

Incluye:

- publicidad avanzada
- conciliacion
- costos indirectos prorrateados
- FIFO
- importaciones y landed cost
- proyecciones

## 13. Backlog inicial

Prioridad alta:

- crear organizaciones
- crear usuarios
- crear roles/permisos
- crear productos maestros
- crear SKUs online con multiplicador
- crear bodegas
- registrar ingresos
- registrar ventas manuales
- descontar inventario por componentes
- calcular costo promedio
- registrar gastos por venta
- calcular utilidad neta
- reporte de stock bajo
- reporte de utilidad por producto
- bloqueo por suscripcion

Prioridad media:

- compras con proveedor
- devoluciones
- transferencias entre bodegas
- productos atorados
- tasa de devolucion
- importacion CSV
- exportacion Excel/CSV
- dashboard

Prioridad futura:

- Mercado Libre API
- Amazon SP-API
- TikTok Shop API
- sincronizacion de stock
- publicidad automatica
- facturacion
- marca blanca

## 14. Riesgos y decisiones pendientes

### 14.1 Riesgos

- APIs de marketplaces pueden cambiar y tener limites.
- Sincronizar stock no elimina completamente riesgo de sobreventa.
- Calcular utilidad real depende de que cada plataforma entregue cargos completos o que el usuario cargue CSVs.
- FIFO puede complicar la primera version si se incluye demasiado pronto.
- Reportes demasiado avanzados pueden atrasar el MVP si no se priorizan.

### 14.2 Decisiones pendientes

- Nombre del producto.
- Planes y precios.
- Limites por plan: usuarios, ordenes, SKUs, cuentas conectadas.
- Stack tecnico final.
- Si se usara carga CSV antes de API.
- Nivel exacto de bloqueo al no pagar.
- Si publicidad se atribuira manualmente al inicio o solo por reglas.

## 15. Recomendacion tecnica inicial

Stack recomendado para arrancar:

- Frontend: Next.js
- Backend: Next.js API routes o backend separado Node.js/NestJS si el proyecto crece rapido
- Base de datos: PostgreSQL
- ORM: Prisma
- Hosting inicial: Vercel para frontend/app y base administrada como Neon, Supabase o similar
- Jobs/sincronizacion: cola de trabajos para integraciones
- Archivos/exportaciones: almacenamiento tipo S3 compatible
- Auth: sistema propio con roles, o proveedor externo si se quiere acelerar

Para el MVP, lo mas importante no es escoger lo mas complejo, sino que la base de datos quede bien pensada para:

- multiempresa
- auditoria
- integraciones
- costos
- stock por bodega
- ventas con componentes

## 16. Definicion de MVP cerrado

El MVP se considera listo para piloto cuando el usuario pueda:

1. Crear una empresa.
2. Crear usuarios.
3. Crear productos maestros.
4. Crear SKUs online con multiplicadores o kits.
5. Crear bodegas.
6. Registrar compras/ingresos.
7. Registrar ventas manuales o por importacion.
8. Ver descuento correcto de inventario.
9. Ver stock por bodega.
10. Registrar gastos por venta.
11. Ver utilidad neta por venta y producto.
12. Ver alerta de bajo stock.
13. Exportar reportes.
14. Bloquear una empresa por falta de pago.

