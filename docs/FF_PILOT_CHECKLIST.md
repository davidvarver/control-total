# Control Total - Checklist F&F

Este piloto es cerrado. El objetivo es validar con cuentas reales antes de vender Control Total como producto publico.

## Que probar

1. Entra a `Dashboard` y revisa si el resumen mensual del negocio tiene sentido.
2. Entra a `Piloto F&F` y revisa el checklist de preparacion.
3. Entra a `Cargar datos` y prueba subir Excel con previsualizacion.
4. Entra a `Por resolver` y corrige SKUs sin mapear, costos faltantes o billing pendiente.
5. Entra a `Mercado Libre` y revisa estado de sync, bitacora, Full y cargos Full.
6. Entra a `Ventas`, abre una venta y revisa recibido, cargos, costo y utilidad.
7. Entra a `Utilidad` y revisa ventas con perdida, utilidad mensual y utilidad por SKU.
8. Entra a `Alertas` y valida si los problemas son accionables.
9. Entra a `Inventario` y prueba conteo por SKU si el stock no cuadra.
10. Entra a `Resurtido` y revisa si las recomendaciones tienen sentido.

## Que esta listo para validar

- Inventario maestro por SKU.
- Equivalencias de marketplace a SKU maestro.
- Kits por multiplicador/componente.
- Carga de inventario, costos, equivalencias y ventas externas por Excel.
- Ventas Mercado Libre importadas por cron.
- Detalle de venta con recibido, cargos, costos y utilidad.
- Gastos operativos mensuales/quincenales/semanales con logica mexicana.
- Utilidad mensual y utilidad por SKU.
- Alertas operativas.
- Roles y permisos.
- Admin para activar o bloquear cuentas.

## Que sigue en beta

- Cargos raros: sirven para detectar posibles reclamos, pero se validan contra Meli/Mercado Pago durante piloto.
- Diferencias Full: sirven para detectar faltantes o no disponibles, pero se validan contra Meli durante piloto.
- Cargos Full mensuales: se sincronizan por periodo, pero se debe confirmar que periodo y monto coincidan.
- Ayuda beta: orienta al usuario y respeta permisos, pero no ejecuta acciones autonomas.

## Que no probar todavia

- TikTok, Amazon u otros marketplaces.
- Publicar productos desde Control Total.
- Generacion de fotos o video con IA.
- Sync de stock hacia Meli para controlar publicaciones.
- Venta publica o pricing final.

## Como reportar un problema

Incluye:

- Pantalla.
- Orden o SKU afectado.
- Que esperabas ver.
- Que viste en Control Total.
- Captura de Control Total.
- Captura de Mercado Libre o Mercado Pago si aplica.
- Hora aproximada.
- Archivo Excel si el problema fue de importacion.

Formato rapido:

```text
Pantalla:
Orden/SKU:
Problema:
Esperaba:
Control Total muestra:
Meli/Mercado Pago muestra:
Capturas:
Hora:
```

## Regla de decision

Control Total puede entrar a F&F cuando:

- El cron de ventas se ve en la bitacora.
- Las ventas abiertas se pueden recalcular desde detalle.
- Los pendientes aparecen en `Por resolver` o `Alertas`.
- La utilidad mensual se puede filtrar por periodo.
- Los testers entienden donde revisar una venta con perdida.
- Los modulos beta estan etiquetados como beta.

