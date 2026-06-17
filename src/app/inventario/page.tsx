export const dynamic = "force-dynamic";

import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { Archive, CheckCircle2, Link2Off, WalletCards } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AsyncForm } from "@/components/async-form";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { FullShipmentForm } from "@/components/full-shipment-form";
import { InventoryClientSection } from "@/components/inventory-client-section";
import { InventoryStockIngress } from "@/components/inventory-stock-ingress";
import { ModalForm } from "@/components/modal-form";
import { SkuConnectionsManager } from "@/components/sku-connections-manager";
import { formatDateTimeMx } from "@/lib/format";
import { requirePermission } from "@/lib/server/auth-store";
import { hasDatabaseUrl } from "@/lib/server/database-url";
import { prisma } from "@/lib/server/prisma";
import { buildInventoryReport } from "@/lib/server/reports";

const number = new Intl.NumberFormat("es-MX");
const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});

type InventoryPageProps = {
  searchParams: Promise<{
    cost_updated?: string;
    costs_imported?: string;
    costs_ignored?: string;
    costs_ignored_examples?: string;
    error?: string;
    q?: string;
    warehouse?: string;
    stock?: string;
    sort?: string;
    dir?: string;
    product_created?: string;
    movement?: string;
    full_layers_imported?: string;
  }>;
};

type SortKey = "sku" | "product" | "stock" | "online" | "cost" | "value";
type SortDir = "asc" | "desc";

export default async function InventoryPage({ searchParams }: InventoryPageProps) {
  const user = await requirePermission("inventory.view");
  return (
    <AppShell
      active="inventario"
      title="Inventario"
      subtitle="Stock por SKU maestro, separado por bodega y con costo promedio."
      organization={user.organizationName}
      userEmail={user.email}
      actions={
        <Suspense fallback={<InventoryActionLinks />}>
          <InventoryActions organizationId={user.organizationId} />
        </Suspense>
      }
    >
      <Suspense fallback={<InventoryPageSkeleton />}>
        <InventoryContent searchParams={searchParams} />
      </Suspense>
    </AppShell>
  );
}

async function InventoryContent({ searchParams }: InventoryPageProps) {
  const params = await searchParams;
  const report = await buildInventoryReport();
  const firstWarehouseId = report.warehouses[0]?.id ?? "wh_main";
  const selectedWarehouseId = params.warehouse ?? "";
  const today = new Date().toISOString().slice(0, 10);
  const sortKey = isSortKey(params.sort) ? params.sort : "sku";
  const sortDir: SortDir = params.dir === "desc" ? "desc" : "asc";
  const pendingEquivalenceCount = report.masterSkusWithoutEquivalences.length;
  const pendingCostCount = report.rows.filter((row) => row.averageUnitCost <= 0).length;
  const archivedSkuCount =
    report.archivedProducts.length + report.archivedUnmappedSkus.length;
  const showingArchivedSkus = params.stock === "archived";

  return (
    <div className="ct-ops-page">

        {params.cost_updated ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            Costo actualizado. Las utilidades se recalculan con este costo.
          </div>
        ) : null}
        {params.product_created ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            SKU {params.product_created} creado y agregado al inventario.
          </div>
        ) : null}
        {params.costs_imported ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            Se importaron {params.costs_imported} costos de producto.
          </div>
        ) : null}
        {params.costs_ignored ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            Quedaron {params.costs_ignored} costos sin ligar porque no existen
            exactos en tu inventario maestro
            {params.costs_ignored_examples
              ? `: ${params.costs_ignored_examples}`
              : "."}
          </div>
        ) : null}
        {params.error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {params.error}
          </div>
        ) : null}
        {params.movement ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            {params.movement === "count_reset"
              ? "Conteo aplicado: el disponible se recalculo restando ventas apartadas."
              : "Movimiento guardado y stock actualizado."}
          </div>
        ) : null}
        {params.full_layers_imported ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            Se importaron {params.full_layers_imported} capas Full FIFO.
          </div>
        ) : null}

        <section className="ct-ops-filterbar">
          <div className="min-w-0">
            <p className="ct-ops-kicker">Acciones rápidas</p>
            <p className="ct-ops-copy">
              Ingreso suma stock. Conteo reemplaza el fisico contado para un SKU.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <InventoryStockIngress
              products={report.rows.map((row) => ({
                masterSku: row.masterSku,
                name: row.name,
                averageUnitCost: row.averageUnitCost,
              }))}
              warehouses={report.warehouses.map((warehouse) => ({
                id: warehouse.id,
                name: warehouse.name,
              }))}
              firstWarehouseId={firstWarehouseId}
            />
            <Link
              href="/importar#inventario"
              prefetch={false}
              className="ct-button ct-button-secondary"
            >
              Cargar Excel
            </Link>
          </div>
        </section>

        <section className="ct-ops-kpi-grid">
          <PendingFilterCard
            href="/inventario?stock=missing_equivalence#inventario-completo"
            label="Pendiente de equivalencia"
            value={pendingEquivalenceCount}
            active={params.stock === "missing_equivalence"}
            icon={<Link2Off size={18} />}
          />
          <PendingFilterCard
            href="/inventario?stock=no_cost#inventario-completo"
            label="Pendiente de costo"
            value={pendingCostCount}
            active={params.stock === "no_cost"}
            icon={<WalletCards size={18} />}
          />
          <PendingFilterCard
            href="/inventario?stock=archived#skus-archivados"
            label="SKUs archivados"
            value={archivedSkuCount}
            active={showingArchivedSkus}
            icon={<Archive size={18} />}
          />
        </section>

        <section className="ct-ops-hero">
          <div className="grid gap-4 xl:grid-cols-[minmax(320px,1fr)_minmax(0,640px)] xl:items-center">
            <div>
              <p className="ct-ops-kicker">Operacion segura</p>
              <h2 className="ct-ops-title mt-1">Conteo por SKU</h2>
              <p className="ct-ops-copy max-w-3xl">
                Captura lo que ves fisicamente en un SKU. Control Total resta ventas
                Meli apartadas sin guia y resetea solo ese producto.
              </p>
            </div>
            <div className="grid min-w-0 gap-2 text-xs font-bold leading-tight text-blue-100 sm:grid-cols-3">
              <span className="ct-ops-inline-card min-w-0 text-center">Fisico estimado = disponible + apartado</span>
              <span className="ct-ops-inline-card min-w-0 text-center">Apartado = venta pagada sin guia</span>
              <span className="ct-ops-inline-card min-w-0 text-center">Conteo solo cambia ese SKU</span>
            </div>
          </div>
        </section>

        <details id="full-fifo" className="ct-action-panel group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
            <div>
              <h2 className="font-semibold">Operaciones de stock</h2>
              <p className="text-sm text-zinc-500">
                Ajustes manuales y traspasos. Se mantienen plegados para no saturar la vista diaria.
              </p>
            </div>
            <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600 group-open:hidden">
              Abrir
            </span>
            <span className="hidden rounded-full bg-zinc-950 px-2 py-1 text-xs font-semibold text-white group-open:inline">
              Cerrar
            </span>
          </summary>
          <div className="grid gap-5 border-t border-zinc-100 p-4 xl:grid-cols-2">
          <details className="ct-action-panel group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
              <div>
                <h2 className="font-semibold">Ajuste manual</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Suma o resta stock en una bodega. Usa negativo para mermas, errores o bajas.
                </p>
              </div>
              <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600 group-open:hidden">
                Abrir
              </span>
              <span className="hidden rounded-full bg-zinc-950 px-2 py-1 text-xs font-semibold text-white group-open:inline">
                Cerrar
              </span>
            </summary>
            <AsyncForm
              action="/api/inventory/adjustment"
              className="grid gap-2 border-t border-zinc-100 p-4 md:grid-cols-[1fr_160px_120px] xl:grid-cols-[1fr_160px_120px]"
              resetOnSuccess
              successMessage="Ajuste guardado"
            >
              <input
                name="masterSku"
                list="master-skus"
                placeholder="SKU maestro"
                required
                className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
              />
              <select
                name="warehouseId"
                defaultValue={firstWarehouseId}
                className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
              >
                {report.warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
              <input
                name="quantity"
                type="number"
                step="0.0001"
                placeholder="+/- cant."
                required
                className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
              />
              <input
                name="note"
                placeholder="Nota"
                className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950 md:col-span-2"
              />
              <button className="h-10 rounded-md bg-zinc-950 px-3 text-sm font-semibold text-white hover:bg-zinc-800">
                Guardar ajuste
              </button>
            </AsyncForm>
          </details>

          <details className="ct-action-panel group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
              <div>
                <h2 className="font-semibold">Traspaso entre bodegas</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Mueve stock de una bodega a otra sin cambiar el total global.
                </p>
              </div>
              <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600 group-open:hidden">
                Abrir
              </span>
              <span className="hidden rounded-full bg-zinc-950 px-2 py-1 text-xs font-semibold text-white group-open:inline">
                Cerrar
              </span>
            </summary>
            <AsyncForm
              action="/api/inventory/transfer"
              className="grid gap-2 border-t border-zinc-100 p-4 md:grid-cols-[1fr_150px_150px_110px]"
              resetOnSuccess
              successMessage="Traspaso guardado"
            >
              <input
                name="masterSku"
                list="master-skus"
                placeholder="SKU maestro"
                required
                className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
              />
              <select
                name="fromWarehouseId"
                defaultValue={firstWarehouseId}
                className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
              >
                {report.warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
              <select
                name="toWarehouseId"
                defaultValue={report.warehouses[1]?.id ?? firstWarehouseId}
                className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
              >
                {report.warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
              <input
                name="quantity"
                type="number"
                min="0.0001"
                step="0.0001"
                placeholder="Cant."
                required
                className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
              />
              <input
                name="note"
                placeholder="Nota"
                className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950 md:col-span-3"
              />
              <button className="h-10 rounded-md bg-zinc-950 px-3 text-sm font-semibold text-white hover:bg-zinc-800">
                Traspasar
              </button>
            </AsyncForm>
          </details>
          <datalist id="master-skus">
            {report.rows.map((row) => (
              <option key={row.masterSku} value={row.masterSku}>
                {row.name}
              </option>
            ))}
          </datalist>
          </div>
        </details>

        <details className="ct-action-panel group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
            <div>
              <h2 className="font-semibold">Full FIFO y costos de almacenaje</h2>
              <p className="text-sm text-zinc-500">
                Capas Full, envio a Full y almacenaje diario. Abre solo cuando vayas a capturar o corregir.
              </p>
            </div>
            <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600 group-open:hidden">
              Abrir
            </span>
            <span className="hidden rounded-full bg-zinc-950 px-2 py-1 text-xs font-semibold text-white group-open:inline">
              Cerrar
            </span>
          </summary>
        <section className="grid gap-5 border-t border-zinc-100 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
          <details className="ct-action-panel group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
              <div>
                <h2 className="font-semibold">Nuevo envio a Full</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Captura todo el envio junto y reparte el costo por volumen.
                </p>
              </div>
              <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600 group-open:hidden">
                Abrir
              </span>
              <span className="hidden rounded-full bg-zinc-950 px-2 py-1 text-xs font-semibold text-white group-open:inline">
                Cerrar
              </span>
            </summary>
            <div className="border-t border-zinc-100 p-4">
              <FullShipmentForm today={today} />
            <details className="ct-action-panel mt-4">
              <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-zinc-700">
                Entrada rapida de un solo SKU
              </summary>
              <AsyncForm
                action="/api/inventory/full-layer"
                className="grid gap-2 border-t border-zinc-200 p-3 md:grid-cols-[1fr_110px_150px_100px]"
                resetOnSuccess
                successMessage="Capa Full creada"
              >
                <input
                  name="masterSku"
                  list="master-skus"
                  placeholder="SKU maestro"
                  required
                  className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
                />
                <input
                  name="quantity"
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  placeholder="Piezas"
                  required
                  className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
                />
                <input
                  name="totalVolume"
                  type="number"
                  min="0"
                  step="0.0001"
                  placeholder="Volumen total"
                  className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
                />
                <select
                  name="volumeUnit"
                  defaultValue="cm3"
                  className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
                >
                  <option value="cm3">cm3</option>
                  <option value="m3">m3</option>
                </select>
                <input
                  name="inboundFreightCostTotal"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Costo envio asignado"
                  required
                  className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
                />
                <input
                  name="storageCostPerUnitPerDay"
                  type="number"
                  min="0"
                  step="0.0001"
                  placeholder="Almacenaje diario/pza"
                  className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
                />
                <input
                  name="dateReceived"
                  type="date"
                  defaultValue={today}
                  className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
                />
                <input
                  name="note"
                  placeholder="Nota o folio Full"
                  className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
                />
                <button className="h-10 rounded-md bg-zinc-950 px-3 text-sm font-semibold text-white hover:bg-zinc-800 md:col-span-4">
                  Crear capa individual
                </button>
              </AsyncForm>
            </details>
            </div>
          </details>

          <div className="ct-ops-panel">
            <div className="ct-ops-panel-header">
              <div>
              <h2 className="ct-ops-title">Capas Full activas</h2>
              <p className="ct-ops-copy">
                Puedes corregir fecha, piezas y costos asignados. Al guardar se recalculan las ventas Full.
              </p>
              </div>
              <Link
                href="/importar#full"
                prefetch={false}
                className="mt-3 inline-flex h-9 items-center rounded-md border border-zinc-300 bg-white px-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Importar envio Full con preview
              </Link>
            </div>
            <div className="max-h-[560px] divide-y divide-zinc-100 overflow-auto">
              {report.fullInventoryLayers.slice(0, 12).map((layer) => (
                <div key={layer.id} className="px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-mono text-xs font-semibold">
                      {layer.masterSku}
                    </p>
                    <p className="font-semibold">
                      {number.format(layer.remainingQuantity)} /{" "}
                      {number.format(layer.initialQuantity)}
                    </p>
                  </div>
                  <p className="mt-1 text-zinc-500">
                    {formatDateTimeMx(layer.dateReceived)} | envio{" "}
                    {money.format(layer.inboundFreightCostPerUnit)}/pza | almacenaje{" "}
                    {money.format(layer.storageCostPerUnitPerDay)}/pza/dia
                  </p>
                  <details className="ct-action-panel group mt-3">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs font-semibold text-zinc-700">
                      <span>Editar capa</span>
                      <span className="rounded-full bg-white px-2 py-1 text-xs text-zinc-500 group-open:hidden">
                        Abrir
                      </span>
                      <span className="hidden rounded-full bg-zinc-950 px-2 py-1 text-xs text-white group-open:inline">
                        Cerrar
                      </span>
                    </summary>
                    <AsyncForm
                      action="/api/inventory/full-layer"
                      className="grid gap-2 border-t border-zinc-200 p-3 md:grid-cols-2"
                      successMessage="Capa actualizada"
                    >
                      <input type="hidden" name="action" value="update" />
                      <input type="hidden" name="layerId" value={layer.id} />
                      <input
                        name="quantity"
                        type="number"
                        min="0.0001"
                        step="0.0001"
                        defaultValue={layer.initialQuantity}
                        className="h-9 rounded-md border border-zinc-300 px-2 text-xs outline-none focus:border-zinc-950"
                      />
                      <input
                        name="totalVolume"
                        type="number"
                        min="0"
                        step="0.0001"
                        defaultValue={layer.unitVolumeM3 * layer.initialQuantity * 1_000_000}
                        className="h-9 rounded-md border border-zinc-300 px-2 text-xs outline-none focus:border-zinc-950"
                      />
                      <select
                        name="volumeUnit"
                        defaultValue="cm3"
                        className="h-9 rounded-md border border-zinc-300 px-2 text-xs outline-none focus:border-zinc-950"
                      >
                        <option value="cm3">cm3 total</option>
                        <option value="m3">m3 total</option>
                      </select>
                      <input
                        name="inboundFreightCostTotal"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={layer.inboundFreightCostTotal}
                        aria-label="Costo envio asignado"
                        className="h-9 rounded-md border border-zinc-300 px-2 text-xs outline-none focus:border-zinc-950"
                      />
                      <input
                        name="storageCostPerUnitPerDay"
                        type="number"
                        min="0"
                        step="0.0001"
                        defaultValue={layer.storageCostPerUnitPerDay}
                        aria-label="Almacenaje diario por pieza"
                        className="h-9 rounded-md border border-zinc-300 px-2 text-xs outline-none focus:border-zinc-950"
                      />
                      <input
                        name="dateReceived"
                        type="date"
                        defaultValue={toDateInput(layer.dateReceived)}
                        className="h-9 rounded-md border border-zinc-300 px-2 text-xs outline-none focus:border-zinc-950"
                      />
                      <input
                        name="note"
                        defaultValue={layer.note ?? ""}
                        placeholder="Nota"
                        className="h-9 rounded-md border border-zinc-300 px-2 text-xs outline-none focus:border-zinc-950"
                      />
                      <button className="h-9 rounded-md border border-zinc-300 px-2 text-xs font-semibold hover:bg-zinc-50">
                        Guardar capa
                      </button>
                      <ConfirmSubmitButton
                        name="action"
                        value="delete"
                        className="h-9 rounded-md border border-red-200 px-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                        confirmTitle="Eliminar capa Full"
                        confirmMessage="Eliminar esta capa cambia el FIFO, costos Full y utilidad relacionada."
                        confirmText="ELIMINAR"
                      >
                        Eliminar
                      </ConfirmSubmitButton>
                    </AsyncForm>
                  </details>
                </div>
              ))}
              {report.fullInventoryLayers.length === 0 ? (
                <p className="px-4 py-5 text-sm text-zinc-500">
                  Todavia no hay capas Full para costear FIFO.
                </p>
              ) : null}
            </div>
          </div>
        </section>
        </details>

        <SkuConnectionsManager
          rows={report.rows}
          masterSkusWithoutEquivalences={report.masterSkusWithoutEquivalences}
          onlineSkuCatalog={report.onlineSkuCatalog}
          onlineSkusWithoutMaster={report.onlineSkusWithoutMaster}
        />

        <InventoryClientSection
            rows={report.rows}
            warehouses={report.warehouses}
            firstWarehouseId={firstWarehouseId}
            archivedProducts={report.archivedProducts}
            archivedUnmappedSkus={report.archivedUnmappedSkus}
            initialQuery={params.q ?? ""}
          initialWarehouseId={selectedWarehouseId}
          initialStock={params.stock ?? ""}
          initialSort={sortKey}
          initialDir={sortDir}
        />

        <section className="ct-ops-panel">
          <div className="ct-ops-panel-header">
            <div>
            <p className="ct-ops-kicker">Auditoria</p>
            <h2 className="ct-ops-title mt-1">Movimientos recientes</h2>
            <p className="ct-ops-copy">
              Salidas detectadas desde ventas importadas e historial del Excel.
            </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Referencia</th>
                  <th className="px-4 py-3">SKU maestro</th>
                  <th className="px-4 py-3">SKU online</th>
                  <th className="px-4 py-3">Bodega</th>
                  <th className="px-4 py-3">Cantidad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {report.recentMovements.map((movement) => (
                  <tr key={movement.id}>
                    <td className="px-4 py-3">
                      {formatDateTimeMx(movement.date)}
                    </td>
                    <td className="px-4 py-3">{movement.type}</td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {movement.reference}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-semibold">
                      {movement.masterSku}
                    </td>
                    <td className="px-4 py-3">{movement.externalSku}</td>
                    <td className="px-4 py-3">{movement.warehouseName}</td>
                    <td className="px-4 py-3 font-semibold">
                      {number.format(movement.quantity)}
                    </td>
                  </tr>
                ))}
                {report.recentMovements.length === 0 ? (
                  <tr>
                    <td className="ct-ops-empty" colSpan={7}>
                      Todavia no hay movimientos detectados.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
    </div>
  );
}

function InventoryActionLinks() {
  return (
    <>
      <Link
        href="/importar#costos"
        prefetch={false}
        className="inline-flex h-10 items-center rounded-md bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-slate-800"
      >
        Importar costos
      </Link>
      <Link
        href="/api/templates/costos"
        prefetch={false}
        className="inline-flex h-10 items-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
      >
        Plantilla costos
      </Link>
      <Link
        href="/api/templates/full"
        prefetch={false}
        className="inline-flex h-10 items-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
      >
        Plantilla Full
      </Link>
      <Link
        href="/ventas"
        prefetch={false}
        className="inline-flex h-10 items-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
      >
        Ver ventas
      </Link>
      <Link
        href="/api/export/inventario"
        prefetch={false}
        className="inline-flex h-10 items-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
      >
        Exportar CSV
      </Link>
      <Link
        href="/utilidad"
        prefetch={false}
        className="inline-flex h-10 items-center rounded-md bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-slate-800"
      >
        Ver utilidad
      </Link>
    </>
  );
}

async function InventoryActions({ organizationId }: { organizationId: string }) {
  const warehouses = await readInventoryActionWarehouses(organizationId);
  const firstWarehouseId = warehouses[0]?.id ?? "wh_main";

  return (
    <>
      <InventoryActionLinks />
      <ModalForm
        buttonLabel="Nuevo SKU"
        title="Nuevo SKU maestro"
        description="Crea un producto base con stock inicial, bodega y costo promedio."
      >
        <AsyncForm
          action="/api/products/create"
          resetOnSuccess
          successMessage="SKU creado"
          className="grid gap-3 md:grid-cols-2"
        >
          <Field name="masterSku" label="SKU maestro" required />
          <Field name="name" label="Nombre del producto" required />
          <Field
            name="initialStock"
            label="Stock inicial"
            type="number"
            min="0"
            step="0.0001"
            defaultValue="0"
          />
          <label className="block text-sm font-semibold text-slate-700">
            Bodega
            <select
              name="warehouseId"
              defaultValue={firstWarehouseId}
              className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-950"
            >
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </select>
          </label>
          <Field
            name="averageUnitCost"
            label="Costo promedio"
            type="number"
            min="0"
            step="0.0001"
            defaultValue="0"
          />
          <button className="h-10 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 md:mt-6">
            Crear SKU
          </button>
        </AsyncForm>
      </ModalForm>
    </>
  );
}

async function readInventoryActionWarehouses(organizationId: string) {
  if (hasDatabaseUrl()) {
    try {
      const warehouses = await prisma.warehouse.findMany({
        where: { organizationId, isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });

      if (warehouses.length > 0) {
        return warehouses;
      }
    } catch (error) {
      console.error("No se pudieron leer bodegas para acciones de inventario", error);
    }
  }

  const report = await buildInventoryReport();
  return report.warehouses.map((warehouse) => ({
    id: warehouse.id,
    name: warehouse.name,
  }));
}

function InventoryPageSkeleton() {
  return (
    <>
      <section className="grid gap-3 md:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className="h-28 animate-pulse rounded-[24px] border border-white/10 bg-white/[0.06]"
          />
        ))}
      </section>
      <section className="rounded-[24px] border border-white/10 bg-white/[0.06] p-4">
        <div className="h-20 animate-pulse rounded-2xl bg-white/[0.08]" />
      </section>
      <section className="ct-page-card">
        <div className="ct-page-card-header">
          <div className="h-7 w-56 animate-pulse rounded-2xl bg-white/[0.08]" />
          <div className="mt-2 h-10 animate-pulse rounded-2xl bg-white/[0.08]" />
        </div>
        <div className="space-y-3 p-4">
          {[0, 1, 2, 3, 4].map((item) => (
            <div key={item} className="h-12 animate-pulse rounded-2xl bg-white/[0.08]" />
          ))}
        </div>
      </section>
    </>
  );
}

function toDateInput(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

function Field({
  label,
  name,
  type = "text",
  required,
  min,
  step,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  min?: string;
  step?: string;
  defaultValue?: string;
}) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      {label}
      <input
        name={name}
        type={type}
        required={required}
        min={min}
        step={step}
        defaultValue={defaultValue}
        className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-950"
      />
    </label>
  );
}

function PendingFilterCard({
  href,
  label,
  value,
  active,
  icon,
}: {
  href: string;
  label: string;
  value: number;
  active: boolean;
  icon: ReactNode;
}) {
  const resolved = value === 0;
  return (
    <Link
      href={href}
      prefetch={false}
      className={`ct-ops-kpi group ${
        resolved
          ? "is-ok"
          : active
            ? "is-active"
            : "is-warn"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="ct-ops-icon"
          >
            {resolved ? <CheckCircle2 size={18} /> : icon}
          </span>
          <p className="ct-ops-kpi-label">{label}</p>
        </div>
        <span className={`ct-ops-kpi-value mt-0 ${resolved ? "is-ok" : active ? "" : "is-warn"}`}>{number.format(value)}</span>
      </div>
      <p className="ct-ops-kpi-detail">
        {resolved ? "Todo bien por ahora" : "Toca para filtrar abajo"}
      </p>
    </Link>
  );
}

function isSortKey(value: string | undefined): value is SortKey {
  return (
    value === "sku" ||
    value === "product" ||
    value === "stock" ||
    value === "online" ||
    value === "cost" ||
    value === "value"
  );
}
