# Control Total - Especificacion funcional para Stitch

Ultima actualizacion: 2026-06-12

## Para que sirve este documento

Este documento es para que Stitch entienda que debe disenar, que pantallas existen, que informacion lleva cada pantalla y que hace cada boton o accion.

Este documento NO define el estilo visual. Stitch debe decidir el diseno visual.

No incluir aqui:

- Colores.
- Sombras.
- Gradientes.
- Tipografia visual.
- Radios.
- Blur.
- Espaciados exactos.
- Direccion estetica.

Si Stitch necesita datos de ejemplo para disenar, puede usarlos solo como placeholders, pero la estructura debe representar datos reales del sistema.

## Producto

Nombre del producto: `Control Total`.

Tipo de producto: SaaS operativo para vendedores de Mercado Libre.

Objetivo del producto:

- Controlar inventario real.
- Conectar ventas de Mercado Libre.
- Mapear SKUs online contra SKUs maestros.
- Calcular utilidad real despues de costos, cargos, envio, Full y gastos.
- Detectar pendientes que hacen que inventario o utilidad no sean confiables.
- Preparar la cuenta para operar con varios usuarios y alto volumen.

## Usuarios principales

### Dueno / administrador

Necesita:

- Ver si el negocio esta bien hoy.
- Saber cuanto vendio, cuanto recibio y cuanto gano.
- Resolver pendientes.
- Subir o corregir inventario/costos.
- Revisar cuentas Mercado Libre.
- Dar acceso a usuarios.

### Operador

Necesita:

- Revisar ventas.
- Mapear SKUs.
- Ajustar stock.
- Contar inventario.
- Revisar pendientes diarios.

### Finanzas

Necesita:

- Ver utilidad.
- Revisar gastos.
- Revisar cargos de Mercado Libre.
- Exportar reportes.

## Estructura global de la app

Todas las pantallas internas tienen:

- Navegacion principal.
- Buscador global.
- Menu de acciones.
- Indicador de cuenta/usuario.
- Acceso a ayuda.
- Contenido principal.

### Navegacion principal

Grupos y entradas:

Inicio:

- `Inicio` -> abre `/dashboard`.
- `Guia de uso` -> abre `/guia`.
- `Por resolver` -> abre `/setup`.

Trabajo diario:

- `Inventario` -> abre `/inventario`.
- `Ventas` -> abre `/ventas`.
- `Utilidad` -> abre `/utilidad`.
- `Resurtido` -> abre `/resurtido`.
- `Alertas` -> abre `/alertas`.

Configuracion:

- `Cargar datos` -> abre `/importar`.
- `Mercado Libre` -> abre `/meli`.
- `Usuarios` -> abre `/usuarios`.
- `Cuenta` -> abre `/cuenta`.
- `Admin` -> abre `/admin`, solo visible para administradores de plataforma.

Avanzado:

- `Diagnostico` -> abre `/salud`.
- `Auditoria tecnica` -> abre `/auditoria`.
- `Reportes` -> abre `/reportes`.

### Buscador global

Campo: `Buscar SKU, orden o producto`.

Debe permitir buscar:

- SKU maestro.
- SKU online.
- Numero de venta.
- Numero de orden interna/API de Mercado Libre.
- Nombre de producto.

Accion:

- Al enviar, lleva a `/buscar?q=...`.

### Menu Acciones global

Cuando una pagina no define acciones propias, muestra:

- `Por resolver` -> abre `/setup`.
- `Inventario` -> abre `/inventario`.
- `Ventas` -> abre `/ventas`.

Cada pantalla puede reemplazar estas acciones por acciones propias.

### Cuenta / usuario

Muestra:

- Email del usuario actual.
- Estado visual de sesion activa.

No es un boton principal, solo contexto.

### Ayuda

Entrada fija a ayuda/assistant.

Funcion:

- Abrir panel de ayuda contextual.
- No debe tapar formularios importantes en movil.

### Salir

Boton `Salir`.

Funcion:

- Cierra sesion con `POST /api/auth/logout`.
- Regresa al flujo de login.

## Estados comunes que Stitch debe contemplar

### Sin datos

Hay pantallas que pueden no tener informacion todavia.

Casos:

- No hay inventario.
- No hay ventas.
- No hay cuenta Mercado Libre conectada.
- No hay costos cargados.
- No hay SKUs por mapear.
- No hay gastos.
- No hay usuarios adicionales.

Cada estado vacio debe explicar:

- Que falta.
- Por que importa.
- Que accion sigue.

### Cargando

Pantallas con datos pesados deben tener estado de carga:

- Dashboard.
- Inventario.
- Ventas.
- Utilidad.
- Mercado Libre.
- Salud.
- Detalle de venta.

### Exito

Mensajes despues de:

- Crear SKU.
- Guardar costo.
- Guardar stock/conteo.
- Mapear SKU.
- Importar archivo.
- Recalcular venta.
- Sincronizar Mercado Libre.
- Actualizar usuario.

### Error

Mensajes cuando:

- No se pudo guardar.
- No se pudo importar.
- Mercado Libre fallo.
- Faltan permisos.
- El archivo tiene errores.
- Hay conflicto de SKU duplicado.

El mensaje nunca debe mostrar errores tecnicos crudos.

### Confirmacion destructiva

Acciones que requieren confirmacion:

- Eliminar SKU maestro.
- Archivar SKU maestro.
- Eliminar capa Full.
- Desconectar cuenta Mercado Libre.
- Recalculo masivo.
- Importacion que reemplaza datos.

## Pantallas internas

## 1. Inicio / Dashboard

Ruta: `/dashboard`

Objetivo:

- Ver resumen operativo del dia.
- Detectar pendientes y riesgos.
- Entrar rapido a las areas importantes.

Acciones superiores:

- `Ver estado` -> abre `/salud`.
- `Alertas` -> abre `/alertas`.
- `Ver pendientes` -> abre `/setup`.

Contenido:

### KPIs principales

1. `Venta hoy`
   - Muestra venta bruta del dia.
   - Muestra numero de ordenes.
   - Al tocar, abre `/ventas`.

2. `Recibido hoy`
   - Muestra dinero confirmado por Mercado Libre.
   - Al tocar, abre `/ventas`.

3. `Utilidad hoy`
   - Muestra utilidad neta del dia.
   - Muestra ROI.
   - Al tocar, abre `/utilidad`.

4. `Pendientes`
   - Muestra total de pendientes.
   - Muestra cuantos SKUs estan sin mapear.
   - Al tocar, abre `/setup`.

### Panel de SKUs sin mapear / pendientes

Si hay SKUs sin mapear:

- Titulo: `Detalle de SKUs sin mapear`.
- Tabla con:
  - Producto.
  - SKU externo.
  - Marketplace.
  - Impacto.
  - Accion.

Botones:

- `Filtrar` -> abre `/setup`.
- `Mapear` -> abre `/setup#mapear`.
- `Ver todos los pendientes` -> abre `/setup`.
- En cada fila: `Mapear` -> abre `/setup#mapear`.

Si no hay SKUs sin mapear:

- Muestra detalle general de pendientes.
- Cada pendiente tiene boton `Abrir` que lleva a su modulo.

### Panel Riesgos del negocio

Filas:

- `Ventas con perdida hoy` -> abre `/utilidad?...#ventas-con-perdida`.
- `Stock negativo` -> abre `/inventario?stock=negative`.
- `Stock bajo` -> abre `/resurtido`.
- `Cargos raros / Full` -> abre `/alertas`.

### Productos que mas vendieron hoy

Lista de productos con:

- Ranking.
- Nombre.
- SKU maestro.
- Piezas vendidas.
- Venta bruta.

Acciones:

- `Ver utilidad` -> abre `/utilidad`.
- Tocar producto -> abre `/inventario/[masterSku]`.

### Salud operativa de inventario

Muestra:

- Valor inventario.
- Stock fisico.
- SKUs online.
- Stock Full detectado.

Boton:

- `Abrir inventario` -> abre `/inventario`.

## 2. Guia de uso

Ruta: `/guia`

Objetivo:

- Explicar el orden correcto para usar el sistema.
- Guiar al usuario hacia la siguiente accion.

Acciones superiores:

- `Cargar datos` -> abre `/importar`.
- `Pendientes` -> abre `/setup`.

Contenido:

### Bloque principal

Muestra:

- Progreso de configuracion.
- Siguiente paso recomendado.
- Explicacion corta de por que seguir ese orden.

Botones:

- `Paso a paso` -> baja a seccion `#paso-a-paso`.
- `Rutinas` -> baja a seccion `#rutinas`.

### Caminos de inicio

Tarjetas:

- `Cargar datos` -> `/importar`.
- `Conectar Mercado Libre` -> `/meli`.
- `Resolver pendientes` -> `/setup`.
- `Ver utilidad` -> `/utilidad`.

### Estados importantes

Tarjetas o accesos:

- SKUs sin mapear -> `/setup#mapear`.
- Productos sin costo -> `/inventario?stock=no_cost`.
- Dinero Meli pendiente -> `/ventas?pending=billing`.
- Pendientes criticos -> `/setup`.

### Paso a paso

Debe listar pasos operativos:

1. Conectar Mercado Libre.
2. Cargar inventario o crear SKUs maestros.
3. Mapear SKUs online a SKUs maestros.
4. Completar costos.
5. Revisar ventas.
6. Revisar utilidad.
7. Revisar resurtido/alertas.

Cada paso tiene boton que abre la pantalla correspondiente.

## 3. Por resolver / Pendientes

Ruta: `/setup`

Objetivo:

- Mostrar todo lo que impide que inventario, ventas o utilidad sean confiables.

Acciones superiores:

- `Recalcular todo`
  - Hace `POST /api/recalculate`.
  - Requiere confirmacion.
  - Recalcula ventas, inventario y FIFO Full.

- `Ver utilidad` -> abre `/utilidad`.

Contenido:

### Resumen de pendientes

Muestra tarjetas o filas para:

- `Dinero Meli +48h`.
- `Problemas de equivalencias`.
- `Productos sin costo`.
- `Costos sin ligar`.

Cada tarjeta abre su seccion o pantalla.

### Acciones rapidas

Botones:

- `Crear desde Meli` -> abre `/meli#skus-sin-mapear`.
- `Ver arranque` -> abre `/importar#sin-excel`.
- `Plantilla equivalencias` -> descarga `/api/templates/equivalencias`.
- `Plantilla inventario` -> descarga `/api/templates/inventario`.
- `Plantilla costos` -> descarga `/api/templates/costos`.
- `Plantilla Full FIFO` -> descarga `/api/templates/full`.
- `Conectar Meli` -> abre `/api/integrations/meli/connect`.

### Dinero esperando a Meli

Lista ventas con:

- Numero de venta.
- Estado.
- Fecha.
- Si lleva mas de 48h.
- Monto.

Accion:

- Tocar venta -> abre `/ventas/[orderId]`.

### SKUs sin equivalencia

Lista de SKU online detectado sin SKU maestro.

Cada item muestra:

- SKU online.
- Titulo.
- Origen.
- Ventas relacionadas.
- Cantidad vendida pendiente.
- Full pendiente.

Formulario por item:

- Campo `SKU maestro`.
- Campo `Consume` / multiplicador.
- Boton `Guardar`.

Funcion:

- Crea o actualiza relacion SKU online -> SKU maestro.
- Recalcula ventas afectadas.

### Catalogo de equivalencias

Tabla:

- SKU online.
- Cuanto descuenta.
- SKU maestro.
- Titulo.
- Editar equivalencia.

Botones:

- `Subir Excel` -> `/importar#equivalencias`.
- `Descargar plantilla` -> `/api/templates/equivalencias`.
- En cada fila: editar SKU maestro y multiplicador.

### Costos sin ligar

Muestra costos importados que no encontraron SKU maestro exacto.

Cada item debe permitir:

- Elegir SKU maestro.
- Ligar costo.
- Descartar costo.

Botones:

- `Guardar` / `Ligar`.
- `Descartar`.

## 4. Inventario

Ruta: `/inventario`

Objetivo:

- Ver y editar inventario por SKU maestro.
- Controlar stock por bodega.
- Resolver costos y equivalencias.
- Manejar Full FIFO.

Acciones superiores:

- `Importar costos` -> `/importar#costos`.
- `Plantilla costos` -> `/api/templates/costos`.
- `Plantilla Full` -> `/api/templates/full`.
- `Ver ventas` -> `/ventas`.
- `Exportar CSV` -> `/api/export/inventario`.
- `Ver utilidad` -> `/utilidad`.
- `Nuevo SKU`
  - Abre modal/formulario.
  - Campos: SKU maestro, nombre producto, stock inicial, bodega, costo promedio.
  - Boton `Crear SKU`.
  - Guarda con `/api/products/create`.

Contenido:

### Tarjetas filtro de pendientes

- `Pendiente de equivalencia` -> `/inventario?stock=missing_equivalence#inventario-completo`.
- `Pendiente de costo` -> `/inventario?stock=no_cost#inventario-completo`.
- `SKUs archivados` -> `/inventario?stock=archived#skus-archivados`.

Cada tarjeta filtra la tabla/lista.

### Conteo por SKU

Explica que el conteo reemplaza el stock fisico contado de un SKU y no suma/resta.

Debe permitir:

- Elegir SKU maestro.
- Elegir bodega.
- Capturar stock fisico contado.
- Guardar conteo.

Funcion:

- Recalcula disponible restando ventas apartadas sin guia.
- Solo afecta ese SKU/bodega.

### Operaciones de stock

Accordion o seccion plegable.

#### Ajuste manual

Campos:

- SKU maestro.
- Bodega.
- Cantidad positiva o negativa.
- Nota.

Boton:

- `Guardar ajuste`.

Funcion:

- Suma/resta stock de una bodega.

#### Traspaso entre bodegas

Campos:

- SKU maestro.
- Bodega origen.
- Bodega destino.
- Cantidad.
- Nota.

Boton:

- `Traspasar`.

Funcion:

- Mueve stock entre bodegas sin cambiar total global.

### Full FIFO y costos de almacenaje

Accordion o seccion plegable.

#### Nuevo envio a Full

Campos esperados:

- SKU(s).
- Piezas.
- Volumen.
- Costo total de envio a Full.
- Fecha recibida.
- Nota/folio.

Funcion:

- Crea capas Full FIFO.
- Reparte costos por volumen/pieza.

#### Entrada rapida de un solo SKU

Campos:

- SKU maestro.
- Piezas.
- Volumen total.
- Unidad de volumen.
- Costo envio asignado.
- Almacenaje diario por pieza.
- Fecha recibida.
- Nota.

Boton:

- `Crear capa individual`.

### Capas Full activas

Lista capas con:

- SKU maestro.
- Piezas iniciales/restantes.
- Fecha recibida.
- Costo envio por pieza.
- Almacenaje por pieza por dia.

Botones:

- `Importar envio Full con preview` -> `/importar#full`.
- `Editar capa` -> abre formulario.
- `Guardar capa` -> actualiza capa.
- `Eliminar` -> requiere confirmacion.

### Gestor de relaciones SKU maestro / SKU online

Debe mostrar:

- Todos los SKUs maestros.
- Que SKUs online consumen cada SKU maestro.
- Multiplicador/consume de cada SKU online.
- SKUs maestros sin ningun SKU online ligado.
- SKUs online sin SKU maestro.

Acciones:

- Agregar relacion.
- Editar relacion.
- Eliminar relacion.
- Cambiar multiplicador.
- Mapear SKU online a SKU maestro.

### Tabla/lista de inventario completo

Debe mostrar por SKU maestro:

- Foto/thumbnail o fallback.
- SKU maestro.
- Producto.
- Stock total.
- Apartado.
- Disponible.
- Stock por bodega.
- SKUs online ligados.
- Costo promedio.
- Valor inventario.
- Acciones.

Acciones por fila:

- `Detalle` -> abre `/inventario/[masterSku]`.
- `Ventas` -> abre ventas filtradas por SKU.
- `Utilidad` -> abre utilidad filtrada por SKU.
- `Editar` -> permite editar en contexto:
  - SKU maestro/nombre.
  - Costo.
  - Stock contado de bodega seleccionada.
- `Guardar`.
- `Cancelar`.
- `Conteo`.
- `Archivar`.
- `Desarchivar` cuando esta archivado.
- `Eliminar` solo si no tiene ventas/movimientos/relaciones que deban conservar historial.

### Movimientos recientes

Tabla:

- Fecha.
- Tipo.
- Referencia.
- SKU maestro.
- SKU online.
- Bodega.
- Cantidad.

## 5. Detalle de SKU maestro

Ruta: `/inventario/[masterSku]`

Objetivo:

- Ver todo sobre un producto maestro.
- Editar stock/costo/relaciones.

Acciones superiores:

- `Volver a inventario` -> `/inventario`.
- `Ver utilidad` -> `/utilidad?q=[masterSku]`.

Contenido:

- Resumen de producto.
- Foto/thumbnail o fallback.
- KPIs de stock, disponible, apartado, costo, valor.
- Conteo rapido de este SKU.
- Stock por bodega.
- SKUs online que consumen este producto.
- Agregar SKU online.
- Ventas recientes.
- Movimientos.
- Capas Full.

Botones/acciones:

- `Reset de conteo` -> aplica conteo fisico del SKU.
- `Guardar` en conteo.
- `Agregar SKU online` -> liga SKU online al maestro.
- `Eliminar`/quitar relacion online si aplica.
- Tocar venta reciente -> abre `/ventas/[orderId]`.

## 6. Ventas

Ruta: `/ventas`

Objetivo:

- Revisar ventas importadas.
- Filtrar ventas.
- Ver cobros, dinero recibido, utilidad y pendientes.

Acciones superiores:

- `Venta externa` -> `/ventas/nueva`.
- `Auditar ventas` -> `/auditoria`.
- `Ver inventario` -> `/inventario`.
- `Exportar CSV` -> `/api/export/ventas`.
- `Ver utilidad` -> `/utilidad`.

Contenido:

### KPIs

- Ordenes importadas.
- Venta bruta.
- Cargos Meli detectados.
- Costo producto.
- Utilidad confirmada.

### Filtros

Campos:

- Buscar orden, SKU o producto.
- Desde.
- Hasta.
- Estado.
- Bodega.
- Pendiente.

Opciones de pendiente:

- Todo.
- Con SKU sin mapear.
- Sin cargos detectados.
- Esperando dinero Meli.
- Canceladas por verificar.

Botones:

- `Filtrar`.
- `Limpiar`.

### Lista/tabla de ventas

Debe mostrar:

- Numero de venta Meli real.
- Orden interna/API cuando es distinta.
- Fecha.
- Cuenta.
- Estado.
- Venta bruta.
- Recibido.
- Cargos.
- Venta - producto.
- Items/productos.
- Foto/thumbnail.
- Si tiene SKU sin mapear.
- Si esta esperando Meli.
- Si esta cancelada.

Acciones:

- Tocar numero de venta -> abre `/ventas/[orderId]`.
- `Ver detalle` -> despliega cargos e items sin salir.
- Paginacion `Anterior` / `Siguiente`.

## 7. Nueva venta externa

Ruta: `/ventas/nueva`

Objetivo:

- Capturar ventas manuales o externas fuera de Mercado Libre.

Acciones superiores:

- `Volver a ventas` -> `/ventas`.

Contenido esperado:

- Formulario de venta.
- Descarga de plantilla de ventas externas.
- Campos de fecha, canal, orden, productos, cantidades, precio, costo/sku.

Botones:

- `Guardar`.
- `Descargar plantilla` -> `/api/templates/ventas_externas`.

## 8. Detalle de venta

Ruta: `/ventas/[orderId]`

Objetivo:

- Auditar una venta individual.
- Ver cargos, recibido, items, paquetes Meli y utilidad.
- Corregir mapeos desde la venta.

Acciones superiores:

- `Recalcular esta venta`
  - Hace refresh con Mercado Libre/Mercado Pago.
  - Corrige cargos, recibido e impuestos.

- `Venta externa` -> `/ventas/nueva`.
- `Ver utilidad` -> `/utilidad`.

Contenido:

### Encabezado

Muestra:

- Numero de venta.
- Cuenta.
- Estado.
- Fecha.
- Piezas activas/canceladas.
- Numero de ordenes internas Meli agrupadas.

### KPIs

- Venta bruta.
- Recibido Meli.
- Cargos Meli.
- Venta - producto.
- Utilidad.

### Items

Tabla/lista:

- SKU Meli / SKU online.
- Producto.
- Bodega.
- Venta.
- Consume.
- Costo.

Acciones por item:

- Editar SKU maestro ligado.
- Editar multiplicador consume.
- `Guardar`.

Funcion:

- Desde detalle de venta se puede mapear/corregir SKU online contra SKU maestro para futuras ventas.

### Desglose de paquetes Meli

Debe mostrar:

- Orden API interna.
- SKU Meli.
- Estado.
- Bodega.
- Cantidad.
- Venta.
- Si esta activa o anulada.

Importante:

- Si Meli divide paquetes, la UI debe mostrar todo junto bajo la venta real.
- Las piezas anuladas no descuentan inventario.

### Cargos de la venta

Lista:

- Comision Mercado Libre.
- Envio base Meli.
- Impuestos retenidos.
- Full.
- Publicidad/promocion/financiamiento/devolucion/otros cuando existan.

### Editar recibido manual

Accordion o panel:

- Campo monto recibido.
- Nota/motivo.
- Boton `Guardar`.

Uso:

- Solo cuando se necesita capturar manualmente un monto distinto.

### Agregar cargo extra

Accordion o panel:

- Tipo de cargo.
- Monto.
- Nota.
- Boton `Guardar`.

Uso:

- Publicidad, almacenamiento, devolucion u otro cobro que falte.

### Estado del calculo

Muestra:

- Items sin mapear.
- Items sin costo.
- Dinero Meli confirmado/pendiente.
- Margen.

## 9. Utilidad

Ruta: `/utilidad`

Objetivo:

- Ver utilidad real por periodo, SKU y venta.

Acciones superiores:

- `Inventario` -> `/inventario`.
- `Exportar CSV` -> `/api/export/utilidad`.
- `Ventas` -> `/ventas`.

Contenido:

### Selector de periodo

Campos:

- Desde.
- Hasta.

Botones:

- `Aplicar`.
- `Mes actual`.

### Resumen financiero

KPIs:

- Ventas cerradas.
- Utilidad final.
- Margen final.
- Ventas con perdida.
- Dinero por confirmar.

Accion:

- Ver desglose del periodo.

### Comparar SKUs

Campos:

- SKU A.
- SKU B.
- SKU C o filtros equivalentes.

Boton:

- `Comparar`.

Resultado:

- Ventas.
- Utilidad.
- Margen.
- Costos.

### Gastos capturados

Accordion:

- Lista gastos operativos.
- Formulario para agregar gasto.
- Editar/eliminar gasto.

Campos:

- Concepto.
- Monto.
- Fecha.
- Frecuencia.
- Nota.

Botones:

- `Guardar gasto`.
- `Eliminar`.

### Ventas esperando billing Meli

Muestra ventas que descuentan inventario pero aun no entran a utilidad final porque Meli no confirma dinero final.

Accion:

- Tocar venta -> `/ventas/[orderId]`.

### Ventas con perdida

Tabla/lista:

- Venta.
- Fecha.
- Producto.
- Venta.
- Costo/cargos.
- Utilidad negativa.

Accion:

- Abrir venta.

### Utilidad por SKU

Filtros:

- Buscar SKU/producto.
- Resultado: todos / perdida / incompleto.

Botones:

- `Todos`.
- `Con perdida`.
- `Incompletos`.

Tabla/lista:

- SKU maestro.
- Producto.
- Ventas.
- Piezas.
- Ingreso.
- Costo.
- Cargos.
- Utilidad.
- Margen.

Accion:

- Tocar SKU -> `/inventario/[masterSku]`.

### Historial mensual

Muestra resumen por mes desde snapshots:

- Mes.
- Ventas.
- Recibido.
- Cargos.
- Costo producto.
- Gastos.
- Full.
- Utilidad.
- Margen.

## 10. Mercado Libre

Ruta: `/meli`

Objetivo:

- Conectar cuentas Mercado Libre.
- Ver estado de sync.
- Revisar Full, billing y SKUs sin mapear desde Meli.

Acciones superiores:

- `Conectar Meli` -> `/api/integrations/meli/connect`.

Contenido:

### Cuentas conectadas

Por cuenta:

- Email/alias.
- Estado.
- Ultima sincronizacion.
- Ordenes importadas.
- Errores si existen.

Botones:

- `Sincronizar` o accion de sync manual si esta disponible.
- `Auditar Full/fotos` o accion equivalente.
- `Desconectar` -> requiere confirmacion.
- `Conectar otra cuenta`.

### Historial de sync

Lista:

- Fecha.
- Tipo de sync.
- Estado.
- Revisadas.
- Guardadas.
- Pendientes.
- Errores.
- Duracion.

### KPIs Mercado Libre

- Cuentas conectadas.
- Ordenes importadas.
- Venta bruta.
- SKUs sin mapear.
- Full mapeado.
- Full billing.
- Dinero pendiente.
- Proxima actualizacion automatica.

### Full billing

Accordion/lista:

- Periodo.
- Concepto.
- SKU si aplica.
- Monto.
- Fecha de sync.

### SKUs sin mapear desde Meli

Lista:

- SKU online.
- Titulo.
- Marketplace/cuenta.
- Cantidad detectada.

Acciones:

- Mapear a SKU maestro.
- Crear SKU maestro y mapear.
- Archivar/desestimar si aplica.

### Ordenes recientes

Lista con links a detalle:

- Numero venta.
- Estado.
- Fecha.
- Items.
- Monto.

Accion:

- Tocar -> `/ventas/[orderId]`.

## 11. Salud / Diagnostico

Ruta: `/salud`

Objetivo:

- Saber si el sistema esta listo para clientes reales.
- Ver riesgos tecnicos, costos, backups y escala.

Acciones superiores:

- `Auditoria` -> `/auditoria`.
- `Pendientes` -> `/setup`.

Contenido:

### Primer cliente

Checklist:

- Backups confirmados.
- Env vars criticas.
- Cron protegido.
- Meli conectado.
- Inventario base.
- Sync reciente.
- Roles/usuarios.

Botones:

- Abrir pendiente especifico.
- Ir a usuarios si falta equipo/permisos.

### Escala 30k ventas/mes

Muestra:

- Veredicto.
- Limites de sync.
- Capacidad estimada.
- Costo por venta reciente.
- Proyeccion 12 meses.

### Retencion

Muestra:

- Detalle operativo guardado.
- Retencion raw Meli.
- Resumen mensual.
- Estado de snapshots.

### Seguridad

Muestra:

- HTTPS/APP_URL.
- Secretos de cron/webhook.
- Admin emails.
- Token encryption.
- Backups.

Cada check tiene:

- Estado.
- Detalle.
- Link/accion para resolver cuando exista.

## 12. Resurtido

Ruta: `/resurtido`

Objetivo:

- Mostrar que productos requieren compra o envio a bodega/Full.

Contenido:

- KPIs de stock bajo.
- Tabla de productos a resurtir.
- Dias de inventario o prioridad.
- Stock actual.
- Ventas recientes.
- Sugerencia de compra/envio.

Acciones:

- Abrir SKU en inventario.
- Ver ventas relacionadas.

## 13. Alertas

Ruta: `/alertas`

Objetivo:

- Mostrar problemas que requieren atencion.

Tipos:

- Ventas con problemas.
- Stock negativo.
- Stock bajo.
- Cargos raros.
- Full audit alerts.
- Pendientes criticos.

Acciones:

- Abrir venta.
- Abrir SKU.
- Descartar alerta si aplica.
- Ir a pantalla donde se corrige.

## 14. Cargar datos / Importar

Ruta: `/importar`

Objetivo:

- Subir archivos para inventario, costos, equivalencias, Full y ventas externas.

Secciones esperadas:

- Inventario.
- Equivalencias.
- Costos.
- Conteos/cantidades.
- Full FIFO.
- Ventas externas/manuales.

Acciones:

- Descargar plantilla.
- Seleccionar archivo.
- Preview.
- Confirmar importacion.
- Ver errores por fila.
- Cancelar.

## 15. Usuarios

Ruta: `/usuarios`

Objetivo:

- Administrar usuarios y permisos.

Contenido:

- Lista de usuarios.
- Email.
- Rol.
- Estado.
- Ultimo acceso si existe.

Acciones:

- Invitar usuario.
- Cambiar rol.
- Activar/desactivar.
- Eliminar/revocar acceso si aplica.

## 16. Cuenta

Ruta: `/cuenta`

Objetivo:

- Ver estado de suscripcion y negocio.

Contenido:

- Plan.
- Estado de acceso.
- Trial/activo/gracia/suspendido.
- Bloqueo lectura/escritura.
- Datos de negocio.

Acciones:

- Registrar pago.
- Ver estado.
- Actualizar cuenta si aplica.

## 17. Reportes

Ruta: `/reportes`

Objetivo:

- Exportar informacion.

Reportes esperados:

- Inventario.
- Ventas.
- Utilidad.
- Movimientos.
- Auditoria.

Acciones:

- Exportar CSV/Excel.
- Filtrar periodo.
- Descargar.

## 18. Auditoria tecnica

Ruta: `/auditoria`

Objetivo:

- Ver historial interno de acciones/sync/cambios.

Contenido:

- Fecha.
- Usuario/sistema.
- Tipo de evento.
- Entidad afectada.
- Resultado.
- Detalle seguro.

Acciones:

- Filtrar.
- Abrir entidad relacionada si aplica.

## 19. Admin plataforma

Ruta: `/admin`

Solo admin de plataforma.

Objetivo:

- Gestionar organizaciones/clientes.
- Activar o bloquear cuentas.
- Revisar uso/costos.

Contenido:

- Lista organizaciones.
- Estado suscripcion.
- Usuarios.
- Uso estimado.
- Ultima actividad.

Acciones:

- Activar/suspender.
- Registrar pago.
- Ver backup/uso.
- Entrar a detalle si aplica.

## Pantallas publicas y auth

## Login

Ruta: `/login`

Campos:

- Email.
- Password.

Botones:

- `Entrar`.
- Link a registro si aplica.

## Registro

Ruta: `/register`

Campos:

- Nombre/organizacion.
- Email.
- Password.

Botones:

- `Crear cuenta`.
- Link a login.

## Planes / Piloto / Legales

Rutas:

- `/planes`
- `/piloto`
- `/legales`
- `/legales/privacidad`
- `/legales/terminos`

Funcion:

- Informacion comercial/legal.
- No forman parte del flujo operativo diario.

## Reglas finales para Stitch

Stitch debe producir disenos que contemplen todas estas pantallas, componentes y estados.

Stitch no debe decidir que funciones quitar.

Si una pantalla tiene demasiadas acciones, Stitch puede proponer mejor organizacion visual, pero debe mantener acceso a todas.

Si algo parece repetido, Stitch puede agruparlo, pero debe conservar la accion.

Si hay tablas largas, Stitch debe contemplar vista desktop y movil.

Si hay formularios, Stitch debe contemplar estado normal, cargando, exito y error.

Si hay acciones destructivas, Stitch debe contemplar confirmacion.

Si hay datos vacios, Stitch debe contemplar estado vacio.

## Checklist de entrega esperada de Stitch

Stitch debe entregar diseno para:

- App shell.
- Dashboard.
- Guia.
- Pendientes.
- Inventario.
- Detalle SKU maestro.
- Ventas.
- Nueva venta externa.
- Detalle venta.
- Utilidad.
- Mercado Libre.
- Salud.
- Resurtido.
- Alertas.
- Importar.
- Usuarios.
- Cuenta.
- Reportes.
- Auditoria.
- Admin.
- Login/registro.
- Estados vacios.
- Estados cargando.
- Toasts/mensajes.
- Modales/drawers/confirmaciones.
