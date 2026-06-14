# Autoplan Readiness - 2026-06-14

## Veredicto

Status: `READY_FOR_CONTROLLED_PILOT_WITH_CONCERNS`

Control Total ya tiene producto real para un piloto Meli controlado, pero no esta listo para soltar a un cliente grande sin monitoreo. Para el cliente de 1,000 ventas/dia entre 3 cuentas Meli, el riesgo principal no es que "no cargue nada"; el riesgo es que una parte del dinero, paquetes divididos, Full, costos o stock quede mal y el cliente pierda confianza.

## Premisas usadas

- Primer cliente: Mercado Libre solamente, hasta 3 cuentas.
- Sync inicial: mes actual + mes pasado, no historial ilimitado.
- DigitalOcean/Postgres sigue como fuente de verdad por ahora.
- Prioridad de negocio: confiabilidad de dinero, stock y costos antes que agregar marketplaces.
- UX premium importa, pero no debe esconder datos incompletos.

## Scorecard

| Area | Score | Lectura |
| --- | ---: | --- |
| Producto / CEO | 6.5/10 | Piloto controlado si; self-serve grande todavia no. |
| Diseno / UX | 6.5/10 | Ya se ve mejor, pero se siente parchado y faltan estados consistentes. |
| Ingenieria / escala | 5/10 | 1,000/dia es plausible, pero falta SQL real, jobs durables y pruebas de carga. |
| Seguridad | 6.5/10 | Buenas bases, pero faltan backup probado, roles finos y limits durables. |
| DX / operacion | 5.5/10 | Hay docs internas, pero falta runbook claro para operar y soportar clientes. |

## Bloqueadores P0 antes de darlo al cliente

1. Backup/restore probado en produccion.
   - Gate: `PRODUCTION_BACKUPS_CONFIRMED_AT`.
   - No basta con que DigitalOcean diga "hay backups"; hay que restaurar/verificar.

2. Validar dinero Meli con ventas reales.
   - Paquetes divididos.
   - Cancelaciones y anuladas.
   - Refunds/devoluciones.
   - Envio, impuestos, comisiones y recibido Meli.
   - Comparar contra Seller Center en 50-100 ventas reales.

3. Full aun necesita cierre operativo.
   - Stock Full diario.
   - Cargos Full mensuales.
   - Senal clara si el reporte de Full viene truncado o incompleto.
   - Confirmar si los envios a Full se capturan automaticamente o quedan manuales.

4. Escala de sync.
   - `meli-hourly` procesa cuentas en serie con presupuesto de tiempo.
   - Una cuenta lenta puede dejar atras a otras.
   - Para 3 cuentas grandes hace falta job/cola por cuenta y tipo de trabajo.

5. Reportes todavia cargan demasiado en memoria.
   - `/ventas`, `/utilidad`, exportaciones y busquedas deben ir mas a SQL.
   - Evitar `payload::text ILIKE` como busqueda normal.

## Bloqueadores P1

- Reducir dependencia de `LocalDataStore` para ventas y reportes.
- Corregir kits/componentes para que no use solo el primer componente.
- Agregar indices faltantes en tablas de ventas/items/cargos.
- Hacer retention real: compactar payload no es igual a archivar/eliminar detalle viejo.
- Roles: revisar que `dashboard.view` no muestre utilidad/costos a usuarios que no deben verlo.
- `data/*` debe tratarse como sensible y no subirse accidentalmente.
- Rate limits y locks en memoria no son suficientes en Vercel multi-instancia.
- README/runbook real para operar el SaaS.

## UX pendiente

- Unificar el sistema visual. `globals.css` tiene varias capas de estilos y se nota como parche.
- Skeletons/loading deben ser dark/premium; hoy algunas pantallas arrancan claro/blanco.
- Vacios con CTA: no solo "no hay datos", sino "conecta Meli", "importa inventario", etc.
- Errores con retry y explicacion humana.
- Confirmaciones custom en lugar de `window.confirm` / `window.prompt`.
- Tablas criticas en mobile: SKU mapping, usuarios, Full billing y Meli deben pasar a filas/cards responsivas.
- Menu recomendado: Inicio, Pendientes, Inventario, Ventas, Utilidad, Mas.

## Plan de 7 dias

1. Dia 1: probar restore de DO, documentar RPO/RTO y setear `PRODUCTION_BACKUPS_CONFIRMED_AT`.
2. Dia 2: preparar org cliente, 3 cuentas Meli, inventario base, costos y equivalencias.
3. Dia 3: sync conservador mes actual + mes pasado; monitorear `/meli`, `/salud` y logs.
4. Dia 4: validar 50-100 ventas reales contra Meli/Seller Center.
5. Dia 5: SQL/performance pass en ventas, utilidad, export y busqueda.
6. Dia 6: Full stock/billing + roles + pruebas de permisos.
7. Dia 7: QA desktop/mobile de flujos criticos y go/no-go como piloto monitoreado.

## No prometer aun

- Amazon/TikTok.
- Webhooks realtime como fuente primaria.
- Stock push automatico a Meli sin prueba controlada.
- Historial ilimitado instantaneo.
- Full/inbound automatico completo hasta verificar con datos reales.

## Decision recomendada

Dar el producto al primer cliente solo como piloto acompanado: alcance escrito, Meli-only, historial limitado, revision diaria, y soporte cercano. Si el cliente acepta eso, si conviene avanzar. Si espera self-serve perfecto desde dia uno, todavia no.
