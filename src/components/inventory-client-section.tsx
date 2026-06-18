"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { InventoryEditableRow } from "@/components/inventory-editable-row";
import { ProductThumbnail } from "@/components/product-thumbnail";
import { RestoreArchivedProductButton } from "@/components/restore-archived-product-button";
import { RestoreArchivedSkuButton } from "@/components/restore-archived-sku-button";
import { formatDateTimeMx } from "@/lib/format";

const number = new Intl.NumberFormat("es-MX");
const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});
const INITIAL_VISIBLE_ROWS = 25;
const LOAD_MORE_ROWS = 25;

type SortKey = "sku" | "product" | "stock" | "online" | "cost" | "value";
type SortDir = "asc" | "desc";
type StockFilter = "" | "low" | "negative" | "no_cost" | "missing_equivalence" | "archived";

type InventoryClientRow = {
  masterSku: string;
  name: string;
  imageUrl?: string | null;
  physicalQuantity: number;
  committedQuantity: number;
  estimatedPhysicalQuantity: number;
  sellableQuantity: number;
  averageUnitCost: number;
  inventoryValue: number;
  onlineSkuCount: number;
  hasHistoricalReferences: boolean;
  linkedOnlineSkus: Array<{
    id: string;
    onlineSku: string;
    title: string;
    channel: string;
    marketplaceAccount: string;
    accountAlias: string;
    quantityRequired: number;
  }>;
  balances: Array<{
    warehouseId: string;
    warehouseName: string;
    warehouseType: string;
    isSellable: boolean;
    physicalQuantity: number;
    reservedQuantity: number;
    blockedQuantity: number;
    committedQuantity: number;
    estimatedPhysicalQuantity: number;
    availableQuantity: number;
  }>;
};

type InventoryClientSectionProps = {
  rows: InventoryClientRow[];
  warehouses: Array<{ id: string; name: string }>;
  firstWarehouseId: string;
  archivedProducts: InventoryClientRow[];
  archivedUnmappedSkus: Array<{
    id: string;
    channel: string;
    marketplaceAccountId: string;
    onlineSku: string;
    title: string;
    archivedAt: string;
  }>;
  initialQuery: string;
  initialWarehouseId: string;
  initialStock: string;
  initialSort: SortKey;
  initialDir: SortDir;
};

export function InventoryClientSection({
  rows,
  warehouses,
  firstWarehouseId,
  archivedProducts,
  archivedUnmappedSkus,
  initialQuery,
  initialWarehouseId,
  initialStock,
  initialSort,
  initialDir,
}: InventoryClientSectionProps) {
  const [query, setQuery] = useState(initialQuery);
  const [warehouseId, setWarehouseId] = useState(initialWarehouseId);
  const [stock, setStock] = useState<StockFilter>(
    isStockFilter(initialStock) ? initialStock : "",
  );
  const [sortKey, setSortKey] = useState<SortKey>(initialSort);
  const [sortDir, setSortDir] = useState<SortDir>(initialDir);
  const [visibleLimit, setVisibleLimit] = useState(INITIAL_VISIBLE_ROWS);

  const showingArchivedSkus = stock === "archived";
  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return rows
      .map((row) => {
        const balances = warehouseId
          ? row.balances.filter((balance) => balance.warehouseId === warehouseId)
          : row.balances;
        const physicalQuantity = balances.reduce(
          (sum, balance) => sum + balance.physicalQuantity,
          0,
        );
        const committedQuantity = balances.reduce(
          (sum, balance) => sum + balance.committedQuantity,
          0,
        );
        const estimatedPhysicalQuantity = physicalQuantity + committedQuantity;
        const sellableQuantity = balances
          .filter((balance) => balance.isSellable)
          .reduce((sum, balance) => sum + balance.availableQuantity, 0);

        return {
          ...row,
          balances,
          physicalQuantity,
          committedQuantity,
          estimatedPhysicalQuantity,
          sellableQuantity,
          inventoryValue: physicalQuantity * row.averageUnitCost,
        };
      })
      .filter((row) => {
        const matchesQuery =
          !normalizedQuery ||
          row.masterSku.toLowerCase().includes(normalizedQuery) ||
          row.name.toLowerCase().includes(normalizedQuery);
        const matchesWarehouse = !warehouseId || row.balances.length > 0;
        const matchesStock =
          !stock ||
          (stock === "negative" && row.sellableQuantity < 0) ||
          (stock === "low" && row.sellableQuantity >= 0 && row.sellableQuantity <= 10) ||
          (stock === "no_cost" && row.averageUnitCost <= 0) ||
          (stock === "missing_equivalence" && row.onlineSkuCount === 0);

        return !showingArchivedSkus && matchesQuery && matchesWarehouse && matchesStock;
      })
      .sort((left, right) => compareInventoryRows(left, right, sortKey, sortDir));
  }, [query, rows, showingArchivedSkus, sortDir, sortKey, stock, warehouseId]);
  const filteredArchivedProducts = useMemo(() => {
    if (!showingArchivedSkus) {
      return [];
    }

    const normalizedQuery = query.trim().toLowerCase();

    return archivedProducts
      .map((row) => {
        const balances = warehouseId
          ? row.balances.filter((balance) => balance.warehouseId === warehouseId)
          : row.balances;
        const physicalQuantity = balances.reduce(
          (sum, balance) => sum + balance.physicalQuantity,
          0,
        );
        const committedQuantity = balances.reduce(
          (sum, balance) => sum + balance.committedQuantity,
          0,
        );
        const sellableQuantity = balances
          .filter((balance) => balance.isSellable)
          .reduce((sum, balance) => sum + balance.availableQuantity, 0);

        return {
          ...row,
          balances,
          physicalQuantity,
          committedQuantity,
          estimatedPhysicalQuantity: physicalQuantity + committedQuantity,
          sellableQuantity,
          inventoryValue: physicalQuantity * row.averageUnitCost,
        };
      })
      .filter((row) => {
        const matchesQuery =
          !normalizedQuery ||
          row.masterSku.toLowerCase().includes(normalizedQuery) ||
          row.name.toLowerCase().includes(normalizedQuery);
        const matchesWarehouse = !warehouseId || row.balances.length > 0;

        return matchesQuery && matchesWarehouse;
      })
      .sort((left, right) => compareInventoryRows(left, right, sortKey, sortDir));
  }, [archivedProducts, query, showingArchivedSkus, sortDir, sortKey, warehouseId]);
  const visibleRows = filteredRows.slice(0, visibleLimit);
  const hiddenRows = Math.max(0, filteredRows.length - visibleRows.length);
  const visibleArchivedProducts = filteredArchivedProducts.slice(0, visibleLimit);
  const hiddenArchivedProducts = Math.max(
    0,
    filteredArchivedProducts.length - visibleArchivedProducts.length,
  );

  function resetVisibleLimit() {
    setVisibleLimit(INITIAL_VISIBLE_ROWS);
  }

  function setSort(nextSort: SortKey) {
    resetVisibleLimit();
    if (nextSort === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
      return;
    }

    setSortKey(nextSort);
    setSortDir(nextSort === "sku" || nextSort === "product" ? "asc" : "desc");
  }

  return (
    <>
      <section id="inventario-completo" className="ct-page-card scroll-mt-24">
        <div className="ct-page-card-header">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="ct-page-card-title">Inventario completo</h2>
              <p className="ct-page-card-description">
                Mostrando primero los SKUs operables. Busca, filtra o carga mas sin saturar la pantalla.
              </p>
            </div>
            <div className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-black text-slate-300">
              {number.format(filteredRows.length)} SKUs encontrados
            </div>
          </div>
          <form
            className="mt-3 grid gap-2 md:grid-cols-[minmax(220px,1fr)_160px_160px_110px]"
            onSubmit={(event) => event.preventDefault()}
          >
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                resetVisibleLimit();
              }}
              placeholder="Buscar SKU o producto"
              className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
            />
            <select
              value={warehouseId}
              onChange={(event) => {
                setWarehouseId(event.target.value);
                resetVisibleLimit();
              }}
              className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
            >
              <option value="">Todas las bodegas</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </select>
            <select
              value={stock}
              onChange={(event) => {
                setStock(event.target.value as StockFilter);
                resetVisibleLimit();
              }}
              className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
            >
              <option value="">Todo stock</option>
              <option value="low">Stock 0 a 10</option>
              <option value="negative">Stock negativo</option>
              <option value="no_cost">Sin costo</option>
              <option value="missing_equivalence">Sin equivalencia</option>
              <option value="archived">SKUs archivados</option>
            </select>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setWarehouseId("");
                setStock("");
                resetVisibleLimit();
              }}
              className="h-10 rounded-md bg-zinc-950 px-3 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              Limpiar
            </button>
          </form>
        </div>
        <div className="divide-y divide-zinc-100 md:hidden">
          {visibleRows.map((row) => (
            <div key={row.masterSku} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <ProductThumbnail imageUrl={row.imageUrl} label={row.name || row.masterSku} />
                  <div className="min-w-0">
                    <Link
                      href={`/inventario/${encodeURIComponent(row.masterSku)}`}
                      prefetch={false}
                      className="font-mono text-xs font-black underline decoration-zinc-300 underline-offset-2"
                    >
                      {row.masterSku}
                    </Link>
                    <p className="mt-1 line-clamp-2 text-sm font-semibold">
                      {row.name}
                    </p>
                  </div>
                </div>
                <p
                  className={`shrink-0 text-xl font-black ${
                    row.sellableQuantity < 0 ? "text-red-700" : "text-zinc-950"
                  }`}
                >
                  {number.format(row.sellableQuantity)}
                </p>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <InventoryMobileMetric
                  label="Fisico"
                  value={number.format(row.estimatedPhysicalQuantity)}
                />
                <InventoryMobileMetric
                  label="Apartado"
                  value={number.format(row.committedQuantity)}
                  tone={row.committedQuantity > 0 ? "amber" : "neutral"}
                />
                <InventoryMobileCostEditor
                  masterSku={row.masterSku}
                  name={row.name}
                  initialAverageUnitCost={row.averageUnitCost}
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={`/inventario/${encodeURIComponent(row.masterSku)}`}
                  prefetch={false}
                  className="inline-flex h-8 items-center rounded-md border border-zinc-300 px-2 text-xs font-semibold"
                >
                  Detalle
                </Link>
                <Link
                  href={`/ventas?q=${encodeURIComponent(row.masterSku)}`}
                  prefetch={false}
                  className="inline-flex h-8 items-center rounded-md border border-zinc-300 px-2 text-xs font-semibold"
                >
                  Ventas
                </Link>
                <Link
                  href={`/utilidad?skuQ=${encodeURIComponent(row.masterSku)}#utilidad-por-sku`}
                  prefetch={false}
                  className="inline-flex h-8 items-center rounded-md border border-zinc-300 px-2 text-xs font-semibold"
                >
                  Utilidad
                </Link>
              </div>
            </div>
          ))}
          {filteredRows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-zinc-500">
              {showingArchivedSkus
                ? "Los SKUs archivados aparecen abajo."
                : "Todavia no hay inventario ni equivalencias cargadas."}
            </p>
          ) : null}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3">
                  <SortButton label="SKU maestro" sort="sku" activeSort={sortKey} activeDir={sortDir} onSort={setSort} />
                </th>
                <th className="px-4 py-3">
                  <SortButton label="Producto" sort="product" activeSort={sortKey} activeDir={sortDir} onSort={setSort} />
                </th>
                <th className="px-4 py-3">
                  <SortButton label="Stock total" sort="stock" activeSort={sortKey} activeDir={sortDir} onSort={setSort} />
                </th>
                <th className="px-4 py-3">Apartado</th>
                <th className="px-4 py-3">Disponible</th>
                <th className="px-4 py-3">Por bodega</th>
                <th className="px-4 py-3">
                  <SortButton label="SKUs online" sort="online" activeSort={sortKey} activeDir={sortDir} onSort={setSort} />
                </th>
                <th className="px-4 py-3">
                  <SortButton label="Costo promedio" sort="cost" activeSort={sortKey} activeDir={sortDir} onSort={setSort} />
                </th>
                <th className="px-4 py-3">
                  <SortButton label="Valor" sort="value" activeSort={sortKey} activeDir={sortDir} onSort={setSort} />
                </th>
                <th className="px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {visibleRows.map((row) => (
                <InventoryEditableRow
                  key={row.masterSku}
                  row={row}
                  warehouses={warehouses}
                  defaultWarehouseId={
                    warehouseId || row.balances[0]?.warehouseId || firstWarehouseId
                  }
                />
              ))}
              {filteredRows.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-zinc-500" colSpan={10}>
                    {showingArchivedSkus
                      ? "Los SKUs archivados aparecen abajo."
                      : "Todavia no hay inventario ni equivalencias cargadas."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {hiddenRows > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
            <p className="text-sm font-semibold text-zinc-500">
              Mostrando {number.format(visibleRows.length)} de{" "}
              {number.format(filteredRows.length)} SKUs.
            </p>
            <button
              type="button"
              onClick={() => setVisibleLimit((limit) => limit + LOAD_MORE_ROWS)}
              className="ct-button ct-button-secondary"
            >
              Mostrar {number.format(Math.min(LOAD_MORE_ROWS, hiddenRows))} mas
            </button>
          </div>
        ) : null}
      </section>

      {showingArchivedSkus ? (
        <section id="skus-archivados" className="scroll-mt-24 rounded-lg border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-4 py-3">
            <h2 className="font-semibold">SKUs archivados</h2>
            <p className="text-sm text-zinc-500">
              SKUs maestros archivados del inventario y SKUs online ocultos de pendientes.
              Puedes desarchivarlos para volverlos a usar o resolver.
            </p>
          </div>
          <div className="divide-y divide-zinc-100">
            {filteredArchivedProducts.length > 0 ? (
              <div className="bg-zinc-50 px-4 py-2 text-xs font-black uppercase tracking-normal text-zinc-500">
                SKU maestro archivado
              </div>
            ) : null}
            {visibleArchivedProducts.map((item) => (
              <div
                key={item.masterSku}
                className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
              >
                <div className="min-w-0">
                  <p className="font-mono text-xs font-black text-zinc-500">{item.masterSku}</p>
                  <p className="mt-1 font-semibold text-zinc-950">
                    {item.name || item.masterSku}
                  </p>
                  <p className="mt-1 text-xs font-medium text-zinc-500">
                    Stock {number.format(item.physicalQuantity)} | Disponible{" "}
                    {number.format(item.sellableQuantity)} | Costo{" "}
                    {money.format(item.averageUnitCost)} | SKUs online{" "}
                    {number.format(item.onlineSkuCount)}
                  </p>
                </div>
                <RestoreArchivedProductButton masterSku={item.masterSku} />
              </div>
            ))}
            {hiddenArchivedProducts > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <p className="text-sm font-semibold text-zinc-500">
                  Mostrando {number.format(visibleArchivedProducts.length)} de{" "}
                  {number.format(filteredArchivedProducts.length)} archivados.
                </p>
                <button
                  type="button"
                  onClick={() => setVisibleLimit((limit) => limit + LOAD_MORE_ROWS)}
                  className="ct-button ct-button-secondary"
                >
                  Mostrar {number.format(Math.min(LOAD_MORE_ROWS, hiddenArchivedProducts))} mas
                </button>
              </div>
            ) : null}
            {archivedUnmappedSkus.length > 0 ? (
              <div className="bg-zinc-50 px-4 py-2 text-xs font-black uppercase tracking-normal text-zinc-500">
                SKU online archivado de pendientes
              </div>
            ) : null}
            {archivedUnmappedSkus.map((item) => (
              <div
                key={item.id}
                className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
              >
                <div className="min-w-0">
                  <p className="font-mono text-xs font-black text-zinc-500">{item.onlineSku}</p>
                  <p className="mt-1 font-semibold text-zinc-950">
                    {item.title || item.onlineSku}
                  </p>
                  <p className="mt-1 text-xs font-medium text-zinc-500">
                    {formatChannelLabel(item.channel)} / archivado {formatDateTimeMx(item.archivedAt)}
                  </p>
                </div>
                <RestoreArchivedSkuButton item={item} />
              </div>
            ))}
            {filteredArchivedProducts.length === 0 && archivedUnmappedSkus.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="font-semibold text-emerald-800">No hay SKUs archivados.</p>
                <p className="mt-1 text-sm text-zinc-500">
                  Todo lo archivado queda visible aqui cuando exista.
                </p>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
    </>
  );
}

function InventoryMobileMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "amber";
}) {
  return (
    <div className={`rounded-md px-2 py-2 ${tone === "amber" ? "bg-amber-50 text-amber-800" : "bg-zinc-50 text-zinc-700"}`}>
      <p className="text-[10px] font-black uppercase text-zinc-400">{label}</p>
      <p className="mt-1 font-black">{value}</p>
    </div>
  );
}

function InventoryMobileCostEditor({
  masterSku,
  name,
  initialAverageUnitCost,
}: {
  masterSku: string;
  name: string;
  initialAverageUnitCost: number;
}) {
  const router = useRouter();
  const [cost, setCost] = useState(initialAverageUnitCost);
  const [draftCost, setDraftCost] = useState(String(initialAverageUnitCost || ""));
  const [isEditing, setIsEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function saveCost() {
    startTransition(async () => {
      setMessage("");
      setError("");

      const nextCost = parseDecimalInput(draftCost);
      if (!Number.isFinite(nextCost) || nextCost < 0) {
        setError("Costo invalido");
        return;
      }

      const formData = new FormData();
      formData.set("currentMasterSku", masterSku);
      formData.set("masterSku", masterSku);
      formData.set("name", name);
      formData.set("averageUnitCost", String(nextCost));

      const response = await fetch("/api/products/update", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "X-Requested-With": "fetch",
        },
        body: formData,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(payload?.error ?? "No se pudo guardar");
        return;
      }

      setCost(nextCost);
      setDraftCost(String(nextCost || ""));
      setIsEditing(false);
      setMessage("Guardado");
      router.refresh();
      window.setTimeout(() => setMessage(""), 1800);
    });
  }

  if (isEditing) {
    return (
      <div className="col-span-3 rounded-md bg-amber-50 px-2 py-2 text-amber-900">
        <label className="grid gap-1 text-[10px] font-black uppercase text-amber-700">
          Costo
          <input
            value={draftCost}
            onChange={(event) => setDraftCost(event.target.value)}
            inputMode="decimal"
            type="text"
            className="h-9 rounded-md border border-amber-200 bg-white px-2 text-sm font-black text-zinc-950 outline-none focus:border-zinc-950"
          />
        </label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={saveCost}
            disabled={isPending}
            className="h-8 rounded-md bg-zinc-950 px-2 text-xs font-semibold text-white disabled:opacity-60"
          >
            {isPending ? "Guardando" : "Guardar"}
          </button>
          <button
            type="button"
            onClick={() => {
              setDraftCost(String(cost || ""));
              setIsEditing(false);
              setError("");
            }}
            className="h-8 rounded-md border border-amber-200 bg-white px-2 text-xs font-semibold text-amber-900"
          >
            Cancelar
          </button>
        </div>
        {error ? <p className="mt-1 text-xs font-semibold text-red-700">{error}</p> : null}
      </div>
    );
  }

  return (
    <div
      className={`rounded-md px-2 py-2 ${
        cost <= 0 ? "bg-amber-50 text-amber-800" : "bg-zinc-50 text-zinc-700"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase text-zinc-400">Costo</p>
        <button
          type="button"
          onClick={() => {
            setDraftCost(String(cost || ""));
            setIsEditing(true);
            setMessage("");
            setError("");
          }}
          className="text-[10px] font-black uppercase text-zinc-500 underline decoration-zinc-300 underline-offset-2"
        >
          Editar
        </button>
      </div>
      <p className="mt-1 font-black">{money.format(cost)}</p>
      {message ? <p className="mt-1 text-[10px] font-semibold text-emerald-700">{message}</p> : null}
    </div>
  );
}

function SortButton({
  label,
  sort,
  activeSort,
  activeDir,
  onSort,
}: {
  label: string;
  sort: SortKey;
  activeSort: SortKey;
  activeDir: SortDir;
  onSort: (sort: SortKey) => void;
}) {
  const isActive = sort === activeSort;

  return (
    <button
      type="button"
      onClick={() => onSort(sort)}
      className="inline-flex items-center gap-1 font-black uppercase hover:text-zinc-950"
    >
      {label}
      <span className={isActive ? "text-zinc-950" : "text-zinc-300"}>
        {isActive ? (activeDir === "asc" ? "↑" : "↓") : "↕"}
      </span>
    </button>
  );
}

function compareInventoryRows(
  left: InventoryClientRow,
  right: InventoryClientRow,
  sortKey: SortKey,
  sortDir: SortDir,
) {
  const direction = sortDir === "asc" ? 1 : -1;
  const text = (a: string, b: string) => a.localeCompare(b) * direction;
  const numeric = (a: number, b: number) => (a - b) * direction;

  switch (sortKey) {
    case "product":
      return text(left.name, right.name);
    case "stock":
      return numeric(left.sellableQuantity, right.sellableQuantity);
    case "online":
      return numeric(left.onlineSkuCount, right.onlineSkuCount);
    case "cost":
      return numeric(left.averageUnitCost, right.averageUnitCost);
    case "value":
      return numeric(left.inventoryValue, right.inventoryValue);
    case "sku":
    default:
      return text(left.masterSku, right.masterSku);
  }
}

function isStockFilter(value: string): value is StockFilter {
  return ["", "low", "negative", "no_cost", "missing_equivalence", "archived"].includes(value);
}

function parseDecimalInput(value: string) {
  return Number(value.trim().replace(",", ".") || 0);
}

function formatChannelLabel(channel: string) {
  const labels: Record<string, string> = {
    mercado_libre: "Mercado Libre",
    manual: "Mostrador",
    tiktok: "TikTok",
    whatsapp: "WhatsApp",
    external: "Canal externo",
  };

  return labels[channel] ?? channel;
}
