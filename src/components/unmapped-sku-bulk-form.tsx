"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Archive, RotateCcw, Save } from "lucide-react";

type UnmappedSkuItem = {
  id: string;
  orderId: string;
  externalSku: string;
  title: string;
  quantity: number;
  channel: string;
  marketplaceAccountId: string;
  accountAlias: string;
  archived: boolean;
};

type MasterProduct = {
  masterSku: string;
  name: string;
};

type RowDraft = {
  selected: boolean;
  masterSku: string;
  name: string;
  multiplier: string;
  averageUnitCost: string;
};

type UnmappedSkuBulkFormProps = {
  items: UnmappedSkuItem[];
  masterProducts: MasterProduct[];
  showArchived: boolean;
};

export function UnmappedSkuBulkForm({
  items,
  masterProducts,
  showArchived,
}: UnmappedSkuBulkFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>(() =>
    Object.fromEntries(items.map((item) => [item.id, createInitialDraft(item)])),
  );

  const selectedCount = useMemo(
    () => Object.values(drafts).filter((draft) => draft.selected).length,
    [drafts],
  );
  const activeItemsCount = items.filter((item) => !item.archived).length;

  function updateDraft(id: string, patch: Partial<RowDraft>) {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...(current[id] ?? createInitialDraft(items.find((item) => item.id === id))),
        ...patch,
      },
    }));
  }

  function toggleAll(checked: boolean) {
    setDrafts((current) =>
      Object.fromEntries(
        items.map((item) => [
          item.id,
          {
            ...(current[item.id] ?? createInitialDraft(item)),
            selected: item.archived ? false : checked,
          },
        ]),
      ),
    );
  }

  function saveSelected() {
    const rows = items
      .map((item) => ({ item, draft: drafts[item.id] ?? createInitialDraft(item) }))
      .filter(({ item, draft }) => !item.archived && draft.selected)
      .map(({ item, draft }) => ({
        id: item.id,
        onlineSku: item.externalSku,
        title: item.title,
        channel: item.channel,
        marketplaceAccountId: item.marketplaceAccountId,
        masterSku: draft.masterSku.trim(),
        name: draft.name.trim(),
        multiplier: Number(draft.multiplier || 1),
        averageUnitCost: Number(draft.averageUnitCost || 0),
      }))
      .filter(
        (row) =>
          row.onlineSku &&
          row.masterSku &&
          row.name &&
          Number.isFinite(row.multiplier) &&
          row.multiplier > 0,
      );

    if (rows.length === 0) {
      setError("Selecciona pendientes y llena SKU maestro, producto y unidades.");
      return;
    }

    startTransition(async () => {
      setMessage("");
      setError("");

      const response = await fetch("/api/skus/create-and-map-bulk", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Requested-With": "fetch",
        },
        body: JSON.stringify({ rows }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error ?? "No se pudo guardar.");
        return;
      }

      setMessage(`Mapeados ${payload?.mapped ?? rows.length} SKU(s).`);
      router.refresh();
    });
  }

  function mapExisting(item: UnmappedSkuItem) {
    const draft = drafts[item.id] ?? createInitialDraft(item);
    const masterSku = draft.masterSku.trim();
    const multiplier = Number(draft.multiplier || 1);

    if (!masterSku || !Number.isFinite(multiplier) || multiplier <= 0) {
      setError("Para mapear existente llena SKU maestro y unidades.");
      return;
    }

    const formData = new FormData();
    formData.set("onlineSku", item.externalSku);
    formData.set("masterSku", masterSku);
    formData.set("multiplier", String(multiplier));

    startTransition(async () => {
      setMessage("");
      setError("");
      const response = await fetch("/api/skus/map", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "X-Requested-With": "fetch",
        },
        body: formData,
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error ?? "No se pudo mapear.");
        return;
      }

      setMessage(`Mapeado ${item.externalSku}.`);
      router.refresh();
    });
  }

  function archive(item: UnmappedSkuItem, action: "archive" | "restore") {
    const formData = new FormData();
    formData.set("action", action);
    formData.set("id", item.id);
    formData.set("channel", item.channel);
    formData.set("marketplaceAccountId", item.marketplaceAccountId);
    formData.set("onlineSku", item.externalSku);
    formData.set("title", item.title);

    startTransition(async () => {
      setMessage("");
      setError("");
      const response = await fetch("/api/skus/archive-unmapped", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "X-Requested-With": "fetch",
        },
        body: formData,
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error ?? "No se pudo actualizar el archivo.");
        return;
      }

      setMessage(action === "restore" ? "Pendiente restaurado." : "Pendiente archivado.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <label className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-700">
          <input
            type="checkbox"
            checked={activeItemsCount > 0 && selectedCount === activeItemsCount}
            onChange={(event) => toggleAll(event.target.checked)}
            className="h-4 w-4 rounded border-zinc-300"
          />
          Seleccionar todos
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={showArchived ? "/meli#skus-sin-mapear" : "/meli?archivados=1#skus-sin-mapear"}
            className="inline-flex h-9 items-center rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            {showArchived ? "Ocultar archivados" : "Ver archivados"}
          </a>
          <button
            type="button"
            onClick={saveSelected}
            disabled={isPending}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-zinc-950 px-3 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            <Save size={15} />
            Guardar seleccionados ({selectedCount})
          </button>
        </div>
      </div>
      {message ? <p className="px-4 text-sm font-semibold text-emerald-700">{message}</p> : null}
      {error ? <p className="px-4 text-sm font-semibold text-red-700">{error}</p> : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1120px] text-left text-sm">
          <thead className="border-y border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-3">Usar</th>
              <th className="px-4 py-3">Origen</th>
              <th className="px-4 py-3">Orden</th>
              <th className="px-4 py-3">SKU online</th>
              <th className="px-4 py-3">Producto vendido</th>
              <th className="px-4 py-3">Unidades</th>
              <th className="px-4 py-3">Crear / mapear</th>
              <th className="px-4 py-3">Accion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {items.map((item) => {
              const draft = drafts[item.id] ?? createInitialDraft(item);
              return (
                <tr
                  key={item.id}
                  className={item.archived ? "bg-zinc-50 text-zinc-500" : "align-top"}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={draft.selected}
                      disabled={item.archived}
                      onChange={(event) => updateDraft(item.id, { selected: event.target.checked })}
                      className="h-4 w-4 rounded border-zinc-300"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold">{formatChannelLabel(item.channel)}</p>
                    <p className="text-xs text-zinc-500">{item.accountAlias}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{item.orderId}</td>
                  <td className="px-4 py-3 font-semibold">{item.externalSku}</td>
                  <td className="px-4 py-3">{item.title}</td>
                  <td className="px-4 py-3">{item.quantity}</td>
                  <td className="px-4 py-3">
                    <div className="grid min-w-[520px] gap-2 md:grid-cols-[1fr_1fr_82px_82px]">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                        SKU maestro (tu bodega)
                        <input
                          value={draft.masterSku}
                          onChange={(event) => updateDraft(item.id, { masterSku: event.target.value })}
                          list="master-products"
                          placeholder="SKU maestro"
                          disabled={item.archived}
                          className="mt-1 h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm font-normal text-zinc-950 outline-none focus:border-zinc-950 disabled:bg-zinc-100"
                        />
                      </label>
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                        Producto maestro
                        <input
                          value={draft.name}
                          onChange={(event) => updateDraft(item.id, { name: event.target.value })}
                          placeholder="Nombre del producto"
                          disabled={item.archived}
                          className="mt-1 h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm font-normal text-zinc-950 outline-none focus:border-zinc-950 disabled:bg-zinc-100"
                        />
                      </label>
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                        Consume
                        <input
                          value={draft.multiplier}
                          onChange={(event) => updateDraft(item.id, { multiplier: event.target.value })}
                          type="number"
                          min="0.0001"
                          step="0.0001"
                          disabled={item.archived}
                          className="mt-1 h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm font-normal text-zinc-950 outline-none focus:border-zinc-950 disabled:bg-zinc-100"
                        />
                      </label>
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                        Costo
                        <input
                          value={draft.averageUnitCost}
                          onChange={(event) => updateDraft(item.id, { averageUnitCost: event.target.value })}
                          type="number"
                          min="0"
                          step="0.0001"
                          disabled={item.archived}
                          className="mt-1 h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm font-normal text-zinc-950 outline-none focus:border-zinc-950 disabled:bg-zinc-100"
                        />
                      </label>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => updateDraft(item.id, { masterSku: item.externalSku })}
                        disabled={item.archived}
                        className="h-8 rounded-md border border-blue-200 px-2 text-xs font-semibold text-blue-800 hover:bg-blue-50 disabled:opacity-50"
                      >
                        Usar online como maestro
                      </button>
                      <button
                        type="button"
                        onClick={() => updateDraft(item.id, { name: item.title })}
                        disabled={item.archived || !item.title.trim()}
                        className="h-8 rounded-md border border-zinc-300 px-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                      >
                        Producto = titulo
                      </button>
                      <button
                        type="button"
                        onClick={() => updateDraft(item.id, { name: draft.masterSku })}
                        disabled={item.archived || !draft.masterSku.trim()}
                        className="h-8 rounded-md border border-zinc-300 px-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                      >
                        Producto = SKU maestro
                      </button>
                      <button
                        type="button"
                        onClick={() => mapExisting(item)}
                        disabled={item.archived || isPending}
                        className="h-8 rounded-md border border-zinc-300 px-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                      >
                        Mapear existente
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {item.archived ? (
                      <button
                        type="button"
                        onClick={() => archive(item, "restore")}
                        disabled={isPending}
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-zinc-300 px-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                      >
                        <RotateCcw size={14} />
                        Restaurar
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => archive(item, "archive")}
                        disabled={isPending}
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-amber-200 px-2 text-xs font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-60"
                      >
                        <Archive size={14} />
                        Archivar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {items.length === 0 ? (
              <tr>
                <td className="px-4 py-5 text-zinc-500" colSpan={8}>
                  {showArchived
                    ? "No hay pendientes archivados."
                    : "Todo lo importado esta mapeado."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <datalist id="master-products">
          {masterProducts.map((product) => (
            <option key={product.masterSku} value={product.masterSku}>
              {product.name}
            </option>
          ))}
        </datalist>
      </div>
    </div>
  );
}

function createInitialDraft(item?: UnmappedSkuItem): RowDraft {
  return {
    selected: false,
    masterSku: "",
    name: item?.title ?? "",
    multiplier: "1",
    averageUnitCost: "0",
  };
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
