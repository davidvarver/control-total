"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  ChevronDown,
  Link2,
  Link2Off,
  PlusCircle,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import { AsyncForm } from "@/components/async-form";
import { ProductThumbnail } from "@/components/product-thumbnail";

const number = new Intl.NumberFormat("es-MX");

type InventoryConnectionRow = {
  masterSku: string;
  name: string;
  imageUrl?: string | null;
  averageUnitCost: number;
  estimatedPhysicalQuantity: number;
  sellableQuantity: number;
  onlineSkuCount: number;
  hasHistoricalReferences: boolean;
  linkedOnlineSkus: Array<{
    id: string;
    onlineSku: string;
    title: string;
    imageUrl?: string | null;
    channel: string;
    marketplaceAccount: string;
    accountAlias: string;
    quantityRequired: number;
  }>;
};

type MasterWithoutOnline = {
  masterSku: string;
  name: string;
  hasHistoricalReferences: boolean;
};

type OnlineSkuOption = {
  onlineSku: string;
  title: string;
  channel: string;
  marketplaceAccount: string;
  accountAlias: string;
  linkedMasterSkus: string[];
  source: "mapeado" | "venta" | "full";
};

type SkuConnectionsManagerProps = {
  rows: InventoryConnectionRow[];
  masterSkusWithoutEquivalences: MasterWithoutOnline[];
  onlineSkuCatalog: OnlineSkuOption[];
  onlineSkusWithoutMaster: OnlineSkuOption[];
};

export function SkuConnectionsManager({
  rows,
  masterSkusWithoutEquivalences,
  onlineSkuCatalog,
  onlineSkusWithoutMaster,
}: SkuConnectionsManagerProps) {
  const [query, setQuery] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(35);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredRows = useMemo(() => {
    if (!normalizedQuery) {
      return rows;
    }

    return rows.filter(
      (row) =>
        row.masterSku.toLowerCase().includes(normalizedQuery) ||
        row.name.toLowerCase().includes(normalizedQuery) ||
        row.linkedOnlineSkus.some(
          (sku) =>
            sku.onlineSku.toLowerCase().includes(normalizedQuery) ||
            sku.title.toLowerCase().includes(normalizedQuery),
      ),
    );
  }, [normalizedQuery, rows]);
  const visibleRows = filteredRows.slice(0, visibleLimit);
  const hiddenRows = Math.max(0, filteredRows.length - visibleRows.length);

  useEffect(() => {
    const openFromHash = () => {
      if (window.location.hash === "#productos-skus") {
        window.setTimeout(() => setIsExpanded(true), 0);
      }
    };

    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, []);

  function updateQuery(value: string) {
    setQuery(value);
    setVisibleLimit(value.trim() ? 80 : 35);
  }

  return (
    <section id="productos-skus" className="ct-ops-panel scroll-mt-24">
      <div className="border-b border-zinc-200 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="ct-ops-kicker">Mapa maestro</p>
            <h2 className="ct-ops-title mt-1">Productos y SKUs conectados</h2>
            <p className="ct-ops-copy">
              SKU maestro de bodega, SKUs online que lo consumen y cantidad descontada por venta.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <ConnectionMetric label="Maestros" value={rows.length} />
              <ConnectionMetric
                label="Maestros sin online"
                value={masterSkusWithoutEquivalences.length}
                tone={masterSkusWithoutEquivalences.length > 0 ? "amber" : "emerald"}
              />
              <ConnectionMetric
                label="Online sin maestro"
                value={onlineSkusWithoutMaster.length}
                tone={onlineSkusWithoutMaster.length > 0 ? "amber" : "emerald"}
              />
            </div>
            <button
              type="button"
              onClick={() => setIsExpanded((value) => !value)}
              className="ct-button ct-button-secondary inline-flex items-center gap-2"
            >
              {isExpanded ? "Ocultar gestor" : "Abrir gestor"}
              <ChevronDown
                size={16}
                className={isExpanded ? "rotate-180 transition" : "transition"}
              />
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <ConnectionSummaryCard
            label="Maestros sin online"
            value={masterSkusWithoutEquivalences.length}
            detail="Productos que no descuentan ventas online."
            tone={masterSkusWithoutEquivalences.length > 0 ? "amber" : "emerald"}
          />
          <ConnectionSummaryCard
            label="Online sin maestro"
            value={onlineSkusWithoutMaster.length}
            detail="Publicaciones detectadas que no descuentan stock."
            tone={onlineSkusWithoutMaster.length > 0 ? "amber" : "emerald"}
          />
          <ConnectionSummaryCard
            label="Relaciones editables"
            value={rows.reduce((sum, row) => sum + row.linkedOnlineSkus.length, 0)}
            detail="Consumos por SKU listos para ajustar."
          />
        </div>
      </div>

      {isExpanded ? (
        <>
          <div className="border-b border-white/10 px-4 py-3">
            <div className="grid gap-2 md:grid-cols-[minmax(240px,1fr)_auto]">
              <label className="relative block">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                />
                <input
                  value={query}
                  onChange={(event) => updateQuery(event.target.value)}
                  placeholder="Buscar SKU maestro, producto o SKU online"
                  className="ct-input h-10 w-full pl-9 pr-3"
                />
              </label>
              <Link
                href="/meli#skus-sin-mapear"
                prefetch={false}
                className="ct-button ct-button-secondary inline-flex items-center justify-center gap-2"
              >
                <Link2Off size={16} />
                Pendientes Meli
              </Link>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1280px] text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-3">SKU maestro</th>
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">SKUs online que consumen este maestro</th>
                  <th className="px-4 py-3">Agregar relacion</th>
                  <th className="px-4 py-3">Stock</th>
                  <th className="px-4 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {visibleRows.map((row) => (
                  <tr key={row.masterSku} className="align-top">
                    <td className="px-4 py-3">
                      <Link
                        href={`/inventario/${encodeURIComponent(row.masterSku)}`}
                        prefetch={false}
                        className="font-mono text-xs font-black underline decoration-zinc-300 underline-offset-2"
                      >
                        {row.masterSku}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex max-w-[300px] items-center gap-3">
                        <ProductThumbnail imageUrl={row.imageUrl} label={row.name || row.masterSku} />
                        <div className="min-w-0">
                          <p className="line-clamp-2 font-semibold text-zinc-950">{row.name}</p>
                          <p className="mt-1 text-xs text-zinc-500">
                            {row.onlineSkuCount} online ligado(s)
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {row.linkedOnlineSkus.length > 0 ? (
                        <div className="space-y-2">
                          {row.linkedOnlineSkus.map((sku) => (
                            <ConnectionEditor
                              key={`${row.masterSku}:${sku.onlineSku}`}
                              masterSku={row.masterSku}
                              sku={sku}
                            />
                          ))}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                          <Link2Off size={14} />
                          Sin SKU online conectado
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <AddConnectionForm
                        masterSku={row.masterSku}
                        onlineSkuCatalog={onlineSkuCatalog}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold">
                        {number.format(row.estimatedPhysicalQuantity)}
                      </p>
                      <p className="text-xs text-zinc-500">
                        disponible {number.format(row.sellableQuantity)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <MasterProductDeleteForm
                        masterSku={row.masterSku}
                        hasHistoricalReferences={row.hasHistoricalReferences}
                      />
                    </td>
                  </tr>
                ))}
                {filteredRows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-zinc-500" colSpan={6}>
                      No encontre SKUs con ese filtro.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {hiddenRows > 0 ? (
            <div className="border-t border-white/10 px-4 py-3 text-center">
              <button
                type="button"
                onClick={() => setVisibleLimit((limit) => limit + 35)}
                className="ct-button ct-button-secondary"
              >
                Mostrar {Math.min(35, hiddenRows)} mas de {number.format(hiddenRows)}
              </button>
            </div>
          ) : null}

          <div className="grid gap-4 border-t border-zinc-200 p-4 xl:grid-cols-2">
            <UnlinkedMastersPanel rows={masterSkusWithoutEquivalences} />
            <UnlinkedOnlinePanel
              rows={onlineSkusWithoutMaster}
              masterProducts={rows.map((row) => ({
                masterSku: row.masterSku,
                name: row.name,
                hasHistoricalReferences: row.hasHistoricalReferences,
              }))}
            />
          </div>

          <datalist id="sku-connection-online-options">
            {onlineSkuCatalog.map((sku) => (
              <option key={sku.onlineSku} value={sku.onlineSku}>
                {sku.title} | {formatChannelLabel(sku.channel)} / {sku.accountAlias}
              </option>
            ))}
          </datalist>
          <datalist id="sku-connection-master-options">
            {rows.map((row) => (
              <option key={row.masterSku} value={row.masterSku}>
                {row.name}
              </option>
            ))}
          </datalist>
        </>
      ) : null}
    </section>
  );
}

function ConnectionEditor({
  masterSku,
  sku,
}: {
  masterSku: string;
  sku: InventoryConnectionRow["linkedOnlineSkus"][number];
}) {
  return (
    <div className="grid gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-2 md:grid-cols-[minmax(0,1fr)_220px_92px] md:items-center">
      <div className="flex min-w-0 items-center gap-2">
        <ProductThumbnail imageUrl={sku.imageUrl} label={sku.title || sku.onlineSku} size="sm" />
        <div className="min-w-0">
        <p className="truncate font-mono text-xs font-black text-zinc-950">
          {sku.onlineSku}
        </p>
        <p className="mt-1 truncate text-xs text-zinc-500">
          {sku.title} | {formatChannelLabel(sku.channel)} / {sku.accountAlias}
        </p>
        </div>
      </div>
      <AsyncForm
        action="/api/skus/component"
        successMessage="Cantidad guardada"
        className="grid grid-cols-[88px_40px] gap-2"
      >
        <input type="hidden" name="action" value="upsert" />
        <input type="hidden" name="masterSku" value={masterSku} />
        <input type="hidden" name="onlineSku" value={sku.onlineSku} />
        <input type="hidden" name="redirectTo" value="/inventario#productos-skus" />
        <input
          name="quantityRequired"
          type="number"
          min="0.0001"
          step="0.0001"
          defaultValue={sku.quantityRequired}
          aria-label={`Cantidad que consume ${sku.onlineSku}`}
          className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm outline-none focus:border-zinc-950"
        />
        <button
          className="inline-flex h-9 items-center justify-center rounded-md bg-zinc-950 text-white hover:bg-zinc-800"
          title="Guardar cantidad"
        >
          <Save size={15} />
        </button>
      </AsyncForm>
      <AsyncForm
        action="/api/skus/component"
        successMessage="Relacion eliminada"
        confirmTitle="Quitar relacion"
        confirmMessage={`Quitar ${sku.onlineSku} de ${masterSku} recalcula ventas e inventario para ese SKU online.`}
      >
        <input type="hidden" name="action" value="delete" />
        <input type="hidden" name="masterSku" value={masterSku} />
        <input type="hidden" name="onlineSku" value={sku.onlineSku} />
        <input type="hidden" name="redirectTo" value="/inventario#productos-skus" />
        <button className="inline-flex h-9 w-full items-center justify-center gap-1 rounded-md border border-red-200 bg-white px-2 text-xs font-semibold text-red-700 hover:bg-red-50">
          <Trash2 size={14} />
          Quitar
        </button>
      </AsyncForm>
    </div>
  );
}

function AddConnectionForm({
  masterSku,
  onlineSkuCatalog,
}: {
  masterSku: string;
  onlineSkuCatalog: OnlineSkuOption[];
}) {
  return (
    <AsyncForm
      action="/api/skus/component"
      resetOnSuccess
      successMessage="Relacion agregada"
      className="grid min-w-[300px] gap-2 md:grid-cols-[minmax(0,1fr)_82px_40px]"
    >
      <input type="hidden" name="action" value="upsert" />
      <input type="hidden" name="masterSku" value={masterSku} />
      <input type="hidden" name="redirectTo" value="/inventario#productos-skus" />
      <input
        name="onlineSku"
        list="sku-connection-online-options"
        placeholder="SKU online"
        required
        className="h-9 rounded-md border border-zinc-300 px-2 text-sm outline-none focus:border-zinc-950"
      />
      <input
        name="quantityRequired"
        type="number"
        min="0.0001"
        step="0.0001"
        defaultValue="1"
        required
        aria-label="Cantidad que consume"
        className="h-9 rounded-md border border-zinc-300 px-2 text-sm outline-none focus:border-zinc-950"
      />
      <button
        className="inline-flex h-9 items-center justify-center rounded-md bg-zinc-950 text-white hover:bg-zinc-800"
        title={onlineSkuCatalog.length > 0 ? "Agregar relacion" : "Agregar SKU escrito"}
      >
        <PlusCircle size={15} />
      </button>
    </AsyncForm>
  );
}

function MasterProductDeleteForm({
  masterSku,
  hasHistoricalReferences,
}: {
  masterSku: string;
  hasHistoricalReferences: boolean;
}) {
  return (
    <AsyncForm
      action="/api/products/delete"
      successMessage="SKU eliminado o archivado"
      confirmTitle={
        hasHistoricalReferences ? "Archivar SKU maestro" : "Eliminar SKU maestro"
      }
      confirmMessage={
        hasHistoricalReferences
          ? `Quieres archivar ${masterSku}? Tiene ventas, relaciones o historial que se conserva para mantener numeros anteriores.`
          : `Quieres eliminar ${masterSku}? No tiene ventas, relaciones ni historial que conservar, asi que saldra de la tabla de maestros.`
      }
    >
      <input type="hidden" name="masterSku" value={masterSku} />
      <button className="inline-flex h-9 items-center justify-center gap-1 rounded-md border border-red-200 bg-white px-2 text-xs font-semibold text-red-700 hover:bg-red-50">
        {hasHistoricalReferences ? <Archive size={14} /> : <Trash2 size={14} />}
        {hasHistoricalReferences ? "Archivar" : "Eliminar"}
      </button>
    </AsyncForm>
  );
}

function UnlinkedMastersPanel({ rows }: { rows: MasterWithoutOnline[] }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50">
      <div className="border-b border-amber-200 px-3 py-2">
        <h3 className="flex items-center gap-2 text-sm font-black text-amber-950">
          <Link2Off size={15} />
          SKU maestros sin SKU online
        </h3>
      </div>
      <div className="max-h-72 overflow-auto p-2">
        {rows.map((row) => (
          <div
            key={row.masterSku}
            className="grid gap-2 border-b border-amber-100 px-2 py-2 last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center"
          >
            <div className="min-w-0">
              <p className="truncate font-mono text-xs font-black text-amber-950">
                {row.masterSku}
              </p>
              <p className="truncate text-xs text-amber-800">{row.name}</p>
            </div>
            <a
              href={`#productos-skus`}
              className="inline-flex h-8 items-center justify-center rounded-md border border-amber-300 bg-white px-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
            >
              Ligar arriba
            </a>
            <MasterProductDeleteForm
              masterSku={row.masterSku}
              hasHistoricalReferences={row.hasHistoricalReferences}
            />
          </div>
        ))}
        {rows.length === 0 ? (
          <p className="px-2 py-5 text-center text-sm font-semibold text-emerald-800">
            Todos los maestros tienen al menos un SKU online.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function UnlinkedOnlinePanel({
  rows,
  masterProducts,
}: {
  rows: OnlineSkuOption[];
  masterProducts: MasterWithoutOnline[];
}) {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50">
      <div className="border-b border-blue-200 px-3 py-2">
        <h3 className="flex items-center gap-2 text-sm font-black text-blue-950">
          <Link2 size={15} />
          SKUs online sin SKU maestro
        </h3>
      </div>
      <div className="max-h-72 overflow-auto p-2">
        {rows.map((row) => (
          <div
            key={row.onlineSku}
            className="grid gap-2 border-b border-blue-100 px-2 py-2 last:border-b-0 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)] xl:items-center"
          >
            <div className="min-w-0">
              <p className="truncate font-mono text-xs font-black text-blue-950">
                {row.onlineSku}
              </p>
              <p className="truncate text-xs text-blue-800">
                {row.title} | {formatChannelLabel(row.channel)} / {row.accountAlias}
              </p>
            </div>
            <AsyncForm
              action="/api/skus/component"
              resetOnSuccess
              successMessage="Online ligado"
              className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_76px_38px]"
            >
              <input type="hidden" name="action" value="upsert" />
              <input type="hidden" name="onlineSku" value={row.onlineSku} />
              <input type="hidden" name="title" value={row.title} />
              <input type="hidden" name="channel" value={row.channel} />
              <input type="hidden" name="marketplaceAccountId" value={row.marketplaceAccount} />
              <input type="hidden" name="redirectTo" value="/inventario#productos-skus" />
              <input
                name="masterSku"
                list="sku-connection-master-options"
                placeholder="SKU maestro"
                required
                className="h-8 rounded-md border border-blue-200 bg-white px-2 text-xs outline-none focus:border-blue-900"
              />
              <input
                name="quantityRequired"
                type="number"
                min="0.0001"
                step="0.0001"
                defaultValue="1"
                required
                aria-label="Cantidad que consume"
                className="h-8 rounded-md border border-blue-200 bg-white px-2 text-xs outline-none focus:border-blue-900"
              />
              <button
                className="inline-flex h-8 items-center justify-center rounded-md bg-blue-950 text-white hover:bg-blue-800 disabled:opacity-60"
                disabled={masterProducts.length === 0}
                title="Ligar SKU online"
              >
                <PlusCircle size={14} />
              </button>
            </AsyncForm>
          </div>
        ))}
        {rows.length === 0 ? (
          <p className="px-2 py-5 text-center text-sm font-semibold text-emerald-800">
            No hay SKUs online pendientes de ligar.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ConnectionMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "amber" | "emerald";
}) {
  const toneClass =
    tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : tone === "emerald"
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : "border-zinc-200 bg-zinc-50 text-zinc-800";

  return (
    <div className={`min-w-24 rounded-md border px-2 py-1 ${toneClass}`}>
      <p className="text-[10px] font-black uppercase">{label}</p>
      <p className="text-lg font-black">{number.format(value)}</p>
    </div>
  );
}

function ConnectionSummaryCard({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: number;
  detail: string;
  tone?: "neutral" | "amber" | "emerald";
}) {
  const toneClass =
    tone === "amber"
      ? "border-amber-300/35 bg-amber-300/10 text-amber-100"
      : tone === "emerald"
        ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
        : "border-white/10 bg-white/[0.05] text-slate-100";

  return (
    <div className={`rounded-2xl border px-3 py-3 ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] opacity-80">
            {label}
          </p>
          <p className="mt-2 text-2xl font-black">{number.format(value)}</p>
        </div>
        <span className="mt-1 h-2.5 w-2.5 rounded-full bg-current opacity-70" />
      </div>
      <p className="mt-2 text-xs font-semibold leading-5 opacity-75">{detail}</p>
    </div>
  );
}

function formatChannelLabel(channel: string) {
  const labels: Record<string, string> = {
    mercado_libre: "Mercado Libre",
    manual: "Manual",
    tiktok: "TikTok",
    whatsapp: "WhatsApp",
    external: "Externo",
    amazon: "Amazon",
  };

  return labels[channel] ?? channel;
}
