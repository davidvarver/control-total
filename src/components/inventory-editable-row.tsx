"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Archive, Edit2, Eye, Trash2, X } from "lucide-react";
import { ProductThumbnail } from "@/components/product-thumbnail";

const number = new Intl.NumberFormat("es-MX");
const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});

type EditableInventoryRowProps = {
  row: {
    masterSku: string;
    name: string;
    imageUrl?: string | null;
    estimatedPhysicalQuantity: number;
    committedQuantity: number;
    sellableQuantity: number;
    onlineSkuCount: number;
    hasHistoricalReferences: boolean;
    averageUnitCost: number;
    inventoryValue: number;
    balances: Array<{
      warehouseId: string;
      warehouseName: string;
      estimatedPhysicalQuantity: number;
    }>;
    linkedOnlineSkus: Array<{
      id: string;
      onlineSku: string;
      title: string;
      channel: string;
      marketplaceAccount: string;
      accountAlias: string;
      quantityRequired: number;
    }>;
  };
  warehouses: Array<{
    id: string;
    name: string;
  }>;
  defaultWarehouseId: string;
};

export function InventoryEditableRow({
  row,
  warehouses,
  defaultWarehouseId,
}: EditableInventoryRowProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [draftSku, setDraftSku] = useState(row.masterSku);
  const [draftName, setDraftName] = useState(row.name);
  const [draftCost, setDraftCost] = useState(String(row.averageUnitCost || ""));
  const [draftWarehouseId, setDraftWarehouseId] = useState(defaultWarehouseId);
  const [draftStock, setDraftStock] = useState(
    String(
      row.balances.find((balance) => balance.warehouseId === defaultWarehouseId)
        ?.estimatedPhysicalQuantity ?? row.estimatedPhysicalQuantity,
    ),
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const hasHistoricalReferences = row.hasHistoricalReferences;

  function resetDrafts() {
    setDraftSku(row.masterSku);
    setDraftName(row.name);
    setDraftCost(String(row.averageUnitCost || ""));
    setDraftWarehouseId(defaultWarehouseId);
    setDraftStock(
      String(
        row.balances.find((balance) => balance.warehouseId === defaultWarehouseId)
          ?.estimatedPhysicalQuantity ?? row.estimatedPhysicalQuantity,
      ),
    );
    setMessage("");
    setError("");
  }

  function save() {
    startTransition(async () => {
      setMessage("");
      setError("");

      const nextStock = parseDecimalInput(draftStock);
      const nextCost = parseDecimalInput(draftCost);
      if (!draftSku.trim()) {
        setError("SKU requerido");
        return;
      }
      if (!Number.isFinite(nextStock) || nextStock < 0) {
        setError("Stock invalido");
        return;
      }
      if (!Number.isFinite(nextCost) || nextCost < 0) {
        setError("Costo invalido");
        return;
      }

      const productFormData = new FormData();
      productFormData.set("currentMasterSku", row.masterSku);
      productFormData.set("masterSku", draftSku);
      productFormData.set("name", draftName);
      productFormData.set("averageUnitCost", String(nextCost));

      const productResponse = await fetch("/api/products/update", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "X-Requested-With": "fetch",
        },
        body: productFormData,
      });

      if (!productResponse.ok) {
        const payload = await productResponse.json().catch(() => null);
        setError(payload?.error ?? "No se pudo actualizar producto");
        return;
      }

      const currentSelectedStock =
        row.balances.find((balance) => balance.warehouseId === draftWarehouseId)
          ?.estimatedPhysicalQuantity ?? 0;
      if (Math.abs(nextStock - currentSelectedStock) > 0.0001) {
        const stockFormData = new FormData();
        stockFormData.set("masterSku", draftSku);
        stockFormData.set("warehouseId", draftWarehouseId);
        stockFormData.set("countedPhysicalQuantity", String(nextStock));
        stockFormData.set("note", `Stock editado desde Inventario: ${draftSku}`);

        const stockResponse = await fetch("/api/inventory/count-reset", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "X-Requested-With": "fetch",
          },
          body: stockFormData,
        });

        if (!stockResponse.ok) {
          const payload = await stockResponse.json().catch(() => null);
          setError(payload?.error ?? "No se pudo actualizar stock");
          return;
        }
      }

      setIsEditing(false);
      setMessage("Actualizado");
      router.refresh();
      window.setTimeout(() => setMessage(""), 1800);
    });
  }

  function archiveOrDelete() {
    const confirmed = window.confirm(
      hasHistoricalReferences
        ? `Quieres archivar el SKU ${row.masterSku}? Tiene ventas, relaciones o historial que se conserva para mantener numeros anteriores.`
        : `Quieres eliminar el SKU ${row.masterSku}? No tiene ventas, relaciones ni historial que conservar, asi que saldra de la tabla de maestros.`,
    );

    if (!confirmed) return;

    startTransition(async () => {
      setMessage("");
      setError("");
      const formData = new FormData();
      formData.set("masterSku", row.masterSku);

      const response = await fetch("/api/products/delete", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "X-Requested-With": "fetch",
        },
        body: formData,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(payload?.error ?? "No se pudo archivar");
        return;
      }

      router.refresh();
    });
  }

  return (
    <tr className={isEditing ? "align-top bg-blue-50/35" : "align-top"}>
      <td className="px-4 py-3 font-mono text-xs font-semibold">
        <Link
          href={`/inventario/${encodeURIComponent(row.masterSku)}`}
          className="underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-950"
        >
          {row.masterSku}
        </Link>
      </td>
      <td className="px-4 py-3">
        {isEditing ? (
          <div className="flex min-w-[280px] items-start gap-3">
            <ProductThumbnail imageUrl={row.imageUrl} label={row.name || row.masterSku} />
            <div className="grid min-w-[220px] gap-2">
              <label className="grid gap-1 text-[11px] font-black uppercase text-zinc-500">
                SKU maestro
                <input
                  value={draftSku}
                  onChange={(event) => setDraftSku(event.target.value)}
                  className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-xs font-semibold outline-none focus:border-zinc-950"
                />
              </label>
              <label className="grid gap-1 text-[11px] font-black uppercase text-zinc-500">
                Producto
                <input
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-xs font-semibold outline-none focus:border-zinc-950"
                />
              </label>
            </div>
          </div>
        ) : (
          <div className="flex min-w-[220px] items-center gap-3">
            <ProductThumbnail imageUrl={row.imageUrl} label={row.name || row.masterSku} />
            <div className="min-w-0">
              <p className="line-clamp-2 font-semibold text-slate-950">{row.name}</p>
              {row.linkedOnlineSkus[0]?.title &&
              row.linkedOnlineSkus[0].title !== row.name ? (
                <p className="mt-1 line-clamp-1 text-xs font-medium text-slate-500">
                  {row.linkedOnlineSkus[0].title}
                </p>
              ) : null}
            </div>
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        {isEditing ? (
          <div className="grid min-w-[150px] gap-1">
            <input
              value={draftStock}
              onChange={(event) => setDraftStock(event.target.value)}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.0001"
              className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm font-semibold outline-none focus:border-zinc-950"
            />
            <p className="text-[11px] font-medium text-blue-900">reemplaza fisico</p>
          </div>
        ) : (
          <>
            <p className="font-semibold">{number.format(row.estimatedPhysicalQuantity)}</p>
            <p className="text-xs font-medium text-zinc-500">fisico estimado</p>
          </>
        )}
      </td>
      <td className="px-4 py-3">
        <p className={row.committedQuantity > 0 ? "font-semibold text-amber-700" : "font-semibold text-zinc-400"}>
          {number.format(row.committedQuantity)}
        </p>
        <p className="text-xs font-medium text-zinc-500">ventas sin guia</p>
      </td>
      <td className="px-4 py-3">
        <p className={row.sellableQuantity < 0 ? "font-semibold text-red-700" : "font-semibold text-zinc-950"}>
          {number.format(row.sellableQuantity)}
        </p>
        <p className="text-xs font-medium text-zinc-500">para vender</p>
      </td>
      <td className="px-4 py-3">
        {isEditing ? (
          <select
            value={draftWarehouseId}
            onChange={(event) => {
              const warehouseId = event.target.value;
              setDraftWarehouseId(warehouseId);
              setDraftStock(
                String(
                  row.balances.find((balance) => balance.warehouseId === warehouseId)
                    ?.estimatedPhysicalQuantity ?? 0,
                ),
              );
            }}
            className="h-9 min-w-[160px] rounded-md border border-zinc-300 bg-white px-2 text-xs font-semibold outline-none focus:border-zinc-950"
          >
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name}
              </option>
            ))}
          </select>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {row.balances.map((balance) => (
              <span
                key={`${row.masterSku}-${balance.warehouseId}`}
                className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700"
              >
                <span>{balance.warehouseName}</span>
                <span className="font-semibold text-zinc-950">
                  {number.format(balance.estimatedPhysicalQuantity)}
                </span>
              </span>
            ))}
            {row.balances.length === 0 ? <span className="text-zinc-400">Sin bodega</span> : null}
          </div>
        )}
      </td>
      <td className="px-4 py-3">{number.format(row.onlineSkuCount)}</td>
      <td className="px-4 py-3">
        {isEditing ? (
          <input
            value={draftCost}
            onChange={(event) => setDraftCost(event.target.value)}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.0001"
            className="h-9 w-28 rounded-md border border-zinc-300 bg-white px-2 text-sm font-semibold outline-none focus:border-zinc-950"
          />
        ) : (
          <p className={row.averageUnitCost > 0 ? "font-semibold text-zinc-950" : "font-semibold text-amber-700"}>
            {row.averageUnitCost > 0 ? number.format(row.averageUnitCost) : "Sin costo"}
          </p>
        )}
      </td>
      <td className="px-4 py-3 font-semibold">
        {money.format(row.inventoryValue)}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/inventario/${encodeURIComponent(row.masterSku)}`}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-zinc-300 px-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            <Eye size={14} />
            Detalle
          </Link>
          <Link
            href={`/ventas?q=${encodeURIComponent(row.masterSku)}`}
            className="inline-flex h-8 items-center rounded-md border border-zinc-300 px-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Ventas
          </Link>
          <Link
            href={`/utilidad?q=${encodeURIComponent(row.masterSku)}`}
            className="inline-flex h-8 items-center rounded-md border border-zinc-300 px-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Utilidad
          </Link>
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={save}
                disabled={isPending}
                className="inline-flex h-8 items-center rounded-md bg-zinc-950 px-3 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
              >
                {isPending ? "Guardando" : "Guardar"}
              </button>
              <button
                type="button"
                onClick={() => {
                  resetDrafts();
                  setIsEditing(false);
                }}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-zinc-300 px-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                <X size={13} />
                Cancelar
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  resetDrafts();
                  setIsEditing(true);
                }}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-zinc-300 px-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                <Edit2 size={14} />
                Editar
              </button>
              <button
                type="button"
                onClick={archiveOrDelete}
                disabled={isPending}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-amber-200 px-2 text-xs font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-60"
              >
                {hasHistoricalReferences ? <Archive size={14} /> : <Trash2 size={14} />}
                {hasHistoricalReferences ? "Archivar" : "Eliminar"}
              </button>
            </>
          )}
        </div>
        {message ? <p className="mt-1 text-xs font-semibold text-emerald-700">{message}</p> : null}
        {error ? <p className="mt-1 text-xs font-semibold text-red-600">{error}</p> : null}
      </td>
    </tr>
  );
}

function parseDecimalInput(value: string) {
  return Number(value.trim().replace(",", ".") || 0);
}
