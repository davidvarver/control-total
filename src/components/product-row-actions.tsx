"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Archive, Edit2, Trash2, X } from "lucide-react";

type ProductRowActionsProps = {
  masterSku: string;
  name: string;
  averageUnitCost: number;
  defaultWarehouseId: string;
  balances: Array<{
    warehouseId: string;
    warehouseName: string;
    estimatedPhysicalQuantity: number;
  }>;
  warehouses: Array<{
    id: string;
    name: string;
  }>;
  linkedOnlineSkus?: Array<{
    id: string;
    onlineSku: string;
    title: string;
    channel: string;
    marketplaceAccount: string;
    accountAlias: string;
    quantityRequired: number;
  }>;
  hasHistoricalReferences?: boolean;
};

export function ProductRowActions({
  masterSku,
  name,
  averageUnitCost,
  defaultWarehouseId,
  balances,
  warehouses,
  linkedOnlineSkus = [],
  hasHistoricalReferences,
}: ProductRowActionsProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [draftSku, setDraftSku] = useState(masterSku);
  const [draftName, setDraftName] = useState(name);
  const [draftCost, setDraftCost] = useState(String(averageUnitCost || ""));
  const [draftWarehouseId, setDraftWarehouseId] = useState(defaultWarehouseId);
  const selectedBalance = balances.find(
    (balance) => balance.warehouseId === draftWarehouseId,
  );
  const [draftStock, setDraftStock] = useState(
    String(selectedBalance?.estimatedPhysicalQuantity ?? 0),
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const willArchive = hasHistoricalReferences ?? linkedOnlineSkus.length > 0;

  function resetDrafts() {
    setDraftSku(masterSku);
    setDraftName(name);
    setDraftCost(String(averageUnitCost || ""));
    setDraftWarehouseId(defaultWarehouseId);
    setDraftStock(
      String(
        balances.find((balance) => balance.warehouseId === defaultWarehouseId)
          ?.estimatedPhysicalQuantity ?? 0,
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
      if (!Number.isFinite(nextStock) || nextStock < 0) {
        setError("Stock invalido");
        return;
      }
      if (!Number.isFinite(nextCost) || nextCost < 0) {
        setError("Costo invalido");
        return;
      }

      const formData = new FormData();
      formData.set("currentMasterSku", masterSku);
      formData.set("masterSku", draftSku);
      formData.set("name", draftName);
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
        setError(payload?.error ?? "No se pudo actualizar");
        return;
      }

      const currentSelectedStock =
        balances.find((balance) => balance.warehouseId === draftWarehouseId)
          ?.estimatedPhysicalQuantity ?? 0;
      if (Math.abs(nextStock - currentSelectedStock) > 0.0001) {
        const stockFormData = new FormData();
        stockFormData.set("masterSku", draftSku);
        stockFormData.set("warehouseId", draftWarehouseId);
        stockFormData.set("countedPhysicalQuantity", String(nextStock));
        stockFormData.set("note", `Stock editado desde Inventario: ${masterSku}`);

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
      willArchive
        ? `Quieres archivar el SKU ${masterSku}? Tiene ventas, relaciones o historial que se conserva para mantener numeros anteriores.`
        : `Quieres eliminar el SKU ${masterSku}? No tiene ventas, relaciones ni historial que conservar, asi que saldra de la tabla de maestros.`,
    );

    if (!confirmed) {
      return;
    }

    startTransition(async () => {
      setMessage("");
      setError("");

      const formData = new FormData();
      formData.set("masterSku", masterSku);

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
        setError(payload?.error ?? "No se pudo eliminar");
        return;
      }

      const payload = (await response.json()) as { mode?: string };
      setMessage(payload.mode === "archived" ? "Archivado" : "Eliminado");
      router.refresh();
    });
  }

  if (isEditing) {
    return (
      <div className="grid min-w-[300px] gap-2">
          <p className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600">
            Editando SKU maestro
          </p>
          <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            SKU maestro
          <input
            value={draftSku}
            onChange={(event) => setDraftSku(event.target.value)}
            className="h-9 rounded-md border border-zinc-300 px-2 text-xs outline-none focus:border-zinc-950"
            aria-label="SKU maestro"
          />
          </label>
          <div className="grid gap-2 rounded-md border border-blue-100 bg-blue-50 p-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">
              Stock fisico contado
            </p>
            <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Bodega
              <select
                value={draftWarehouseId}
                onChange={(event) => {
                  const warehouseId = event.target.value;
                  setDraftWarehouseId(warehouseId);
                  setDraftStock(
                    String(
                      balances.find((balance) => balance.warehouseId === warehouseId)
                        ?.estimatedPhysicalQuantity ?? 0,
                    ),
                  );
                }}
                className="h-9 rounded-md border border-zinc-300 px-2 text-xs outline-none focus:border-zinc-950"
              >
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Stock fisico actual
              <input
                value={draftStock}
                onChange={(event) => setDraftStock(event.target.value)}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.0001"
                className="h-9 rounded-md border border-zinc-300 px-2 text-xs outline-none focus:border-zinc-950"
                aria-label="Stock fisico contado"
              />
            </label>
            <p className="text-[11px] font-medium leading-4 text-blue-900">
              Este numero reemplaza el stock fisico de la bodega elegida. No suma ni resta.
            </p>
          </div>
          <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Producto
          <input
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            className="h-9 rounded-md border border-zinc-300 px-2 text-xs outline-none focus:border-zinc-950"
            aria-label="Nombre del producto"
          />
          </label>
          <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Costo promedio
          <input
            value={draftCost}
            onChange={(event) => setDraftCost(event.target.value)}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            className="h-9 rounded-md border border-zinc-300 px-2 text-xs outline-none focus:border-zinc-950"
            aria-label="Costo promedio"
          />
          </label>
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Publicaciones ligadas
            </p>
            {linkedOnlineSkus.length > 0 ? (
              <div className="mt-2 max-h-40 space-y-1 overflow-auto">
                {linkedOnlineSkus.map((sku) => (
                  <div
                    key={sku.id}
                    className="rounded border border-zinc-200 bg-white px-2 py-1 text-xs"
                  >
                    <p className="font-semibold text-zinc-950">{sku.onlineSku}</p>
                    <p className="line-clamp-2 text-zinc-600">{sku.title}</p>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      {formatChannelLabel(sku.channel)} / {sku.accountAlias || "sin cuenta"} · consume {sku.quantityRequired}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-xs text-zinc-500">
                Sin publicaciones ligadas todavia.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={save}
              disabled={isPending}
              className="h-8 rounded-md bg-zinc-950 px-3 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
            >
              Guardar
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
          </div>
          {error ? <p className="text-xs font-semibold text-red-600">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
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
          {willArchive ? <Archive size={14} /> : <Trash2 size={14} />}
          {willArchive ? "Archivar" : "Eliminar"}
        </button>
      </div>
      {message ? (
        <p className="mt-1 text-xs font-semibold text-emerald-700">{message}</p>
      ) : null}
      {error ? <p className="mt-1 text-xs font-semibold text-red-600">{error}</p> : null}
    </div>
  );
}

function parseDecimalInput(value: string) {
  return Number(value.trim().replace(",", ".") || 0);
}

function formatChannelLabel(channel: string) {
  if (channel === "mercado_libre") {
    return "Mercado Libre";
  }
  if (channel === "tiktok") {
    return "TikTok";
  }
  if (channel === "shopify") {
    return "Shopify";
  }
  if (channel === "manual") {
    return "Manual";
  }
  return channel;
}
