# Plan para meter el primer cliente grande

Fecha: 2026-06-10.

## Veredicto corto

Si el cliente trae alrededor de 30,000 ventas al mes, si podemos empezar como piloto controlado, pero no como "ya jala 12 meses completos en un dia y sin revisar nada".

Estado verificado en produccion el 2026-06-10:

- `/salud#escala-30k` marca `Listo para piloto controlado de 30k/mes`.
- Capacidad actual: 150 ordenes/hora, 108,000 ordenes/mes teoricas.
- Objetivo 30k: aprox. 1,000 ordenes/dia y 41.7 ordenes/hora promedio.
- Catch-up de 2 meses: aprox. 60,000 ordenes, 16.7 dias si solo corre por cron horario.
- Proyeccion DB 12 meses: aprox. 830.6 MB de tablas de ventas con el tamano observado actual.
- `/salud#primer-cliente` sigue `Casi listo` porque falta confirmar backup/restore de DigitalOcean.
- El checklist exacto para desbloquear backup esta en `docs/backup-restore-checklist.md`.

La forma segura es:

1. Conectar la cuenta con backfill inicial chico.
2. Dejar que el cron horario se ponga al corriente por lotes.
3. Validar ventas, cargos, stock y utilidad durante la primera semana.
4. Medir consumo real por cliente desde Admin.
5. Solo despues subir limites o traer mas historial.

## Stack actual

- Frontend/backend: Next.js en Vercel.
- Base de datos productiva: DigitalOcean Managed PostgreSQL.
- Sync Meli: Vercel Cron una vez por hora.
- Full billing: cron mensual.
- Full stock: sync diario/acotado desde la automatizacion Meli.

No borrar DigitalOcean todavia. Ahi vive la base buena de produccion.

## Costos esperados

Con el plan actual de DigitalOcean PostgreSQL, el nodo 2 GiB / 1 vCPU ronda USD 30.45 al mes y el storage extra se cobra por GiB/mes. Vercel Pro tiene cuota base de USD 20/mes con creditos de uso; el costo variable depende de compute, invocaciones y transferencia.

Para 30,000 ventas/mes, el riesgo principal no es "numero de ventas" por si solo. El costo se dispara si:

- guardamos payloads crudos enormes por venta;
- recalculamos reportes recorriendo todo el historial cada vez;
- hacemos backfills gigantes en horario normal;
- enriquecemos billing/envio/impuestos inline en cada corrida;
- no archivamos o resumimos meses viejos.

Por eso `/salud#escala-30k` proyecta storage usando el tamano real de las ventas guardadas y compara el cron actual contra 30,000 ventas/mes.

Politica de retencion activa:

- Detalle completo operativo: 24 meses.
- Raw/payload Meli pesado: se compacta despues de 6 meses.
- Resumen mensual para reportes historicos: 10 anos.
- El cron `/api/cron/data-retention` corre semanalmente y compacta por lotes. No borra ventas ni cargos; reduce el raw viejo duplicado.
- El cron `/api/cron/monthly-snapshots` corre semanalmente y materializa resumen mensual por cuenta/canal y por SKU. Tambien se puede correr manualmente con `npm run snapshots:monthly`.

## Capacidad inicial

Con limite horario de 150 ordenes:

- 30,000 ventas/mes son aprox. 1,000 por dia.
- Promedio por hora: 41.7 ventas.
- Capacidad teorica del cron: 150 por hora, 108,000 por mes.
- Headroom teorico: 3.6x sobre el promedio.

Eso alcanza para ventas nuevas si las corridas no se atrasan por billing, API lenta o timeouts.

El historial es diferente:

- 2 meses a 30,000/mes son aprox. 60,000 ordenes.
- A 150/hora tardaria aprox. 16.7 dias si solo dependemos del cron.
- Para acelerar, usar batches admin de 500-1,000 fuera de horas pico y revisar errores despues de cada bloque.

## Proceso de onboarding

1. Confirmar backups de DigitalOcean y dejar `PRODUCTION_BACKUPS_CONFIRMED_AT` en Vercel.
2. Crear cuenta/organizacion del cliente.
3. Importar inventario actual y confirmar fecha base para que ventas viejas no descuenten stock actual.
4. Importar costos y equivalencias SKU.
5. Conectar Meli con limite inicial conservador.
6. Revisar `/salud#primer-cliente` y `/salud#escala-30k`.
7. Validar minimo 50 ventas reales:
   - total bruto;
   - recibido Meli;
   - cargos Meli;
   - envio;
   - impuestos;
   - costo producto;
   - utilidad;
   - descuento de inventario.
8. Monitorear Admin cada dia:
   - ordenes 30 dias;
   - DB usada;
   - payload ventas;
   - minutos de sync;
   - costo estimado por cliente.

## Que falta para venderlo sin miedo

- Paginacion/filtros 100% SQL en ventas/utilidad.
- Alertas si Meli no sincroniza en mas de 2 horas.
- Separar ingestion barata de ordenes y enrichment caro de billing/envios/impuestos.
- Indices de performance en tablas de ventas antes de hacer migracion grande.
- Verificar Full stock y cargos Full con una cuenta real.
- Confirmar flujo completo de stock publishing antes de prometer que empuja stock a Meli.

## Decision comercial

Para el primer cliente grande, no venderlo como plan barato ilimitado. Aunque le demos precio de piloto, debe cubrir:

- la parte fija de Vercel/DB;
- soporte diario la primera semana;
- riesgo de backfill;
- tiempo de validacion de ventas raras.

Recomendacion: piloto controlado con alcance escrito, no "todo el historial ilimitado" desde el dia 1.

## Fuentes de precio revisadas

- DigitalOcean Managed Databases: https://www.digitalocean.com/pricing/managed-databases
- Vercel Pricing: https://vercel.com/pricing
- Vercel Pro Plan: https://vercel.com/docs/plans/pro-plan
- Vercel Functions Pricing: https://vercel.com/docs/functions/usage-and-pricing
- Neon Pricing: https://neon.com/pricing
