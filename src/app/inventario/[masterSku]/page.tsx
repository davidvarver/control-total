import Link from "next/link";
import { notFound } from "next/navigation";
import { Coins, PlusCircle, Save, Warehouse } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AsyncForm } from "@/components/async-form";
import { ModalForm } from "@/components/modal-form";
import { ProductThumbnail } from "@/components/product-thumbnail";
import { formatDateTimeMx } from "@/lib/format";
import { requirePermission } from "@/lib/server/auth-store";
import { buildSkuDetailReport } from "@/lib/server/reports";

const number = new Intl.NumberFormat("es-MX");
const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});

type SkuDetailPageProps = {
  params: Promise<{ masterSku: string }>;
};

type SkuDetailReport = NonNullable<Awaited<ReturnType<typeof buildSkuDetailReport>>>;
type OnlineSkuChoice = SkuDetailReport["onlineSkuChoices"][number];

export default async function SkuDetailPage({ params }: SkuDetailPageProps) {
  const user = await requirePermission("inventory.view");
  const { masterSku } = await params;
  const report = await buildSkuDetailReport(masterSku);

  if (!report) {
    notFound();
  }

  return (
    <AppShell
      active="inventario"
      title={report.product.masterSku}
      subtitle={report.product.name}
      organization={report.organization.name}
      userEmail={user.email}
      actions={
        <>
          <Link
            href="/inventario"
            className="inline-flex h-10 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Volver inventario
          </Link>
          <Link
            href={`/utilidad?q=${encodeURIComponent(report.product.masterSku)}`}
            className="inline-flex h-10 items-center rounded-md bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Ver utilidad
          </Link>
        </>
      }
    >
      <div className="ct-ops-page">
      <section className="ct-ops-hero">
        <div className="flex items-center gap-4">
          <ProductThumbnail
            imageUrl={report.product.imageUrl}
            label={report.product.name || report.product.masterSku}
          />
          <div className="min-w-0">
            <p className="ct-ops-kicker font-mono">
              {report.product.masterSku}
            </p>
            <h2 className="line-clamp-2 text-xl font-black text-white">
              {report.product.name}
            </h2>
          </div>
        </div>
      </section>

      <section className="ct-ops-kpi-grid">
        <Kpi label="Fisico estimado" value={number.format(report.totals.estimatedPhysicalQuantity)} icon={<Warehouse size={18} />} />
        <Kpi label="Apartado ventas" value={number.format(report.totals.committedQuantity)} icon={<Warehouse size={18} />} tone={report.totals.committedQuantity > 0 ? "amber" : "neutral"} />
        <Kpi label="Disponible" value={number.format(report.totals.sellableQuantity)} icon={<Warehouse size={18} />} tone={report.totals.sellableQuantity < 0 ? "red" : "neutral"} />
        <Kpi label="Costo promedio" value={money.format(report.product.averageUnitCost)} icon={<Coins size={18} />} />
      </section>

      <section className="ct-ops-alert">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
          <div>
            <h2 className="ct-ops-title">Conteo rapido de este SKU</h2>
            <p className="ct-ops-copy">
              Si hoy contaste este producto, captura el fisico que ves. El sistema resta las ventas apartadas sin guia y resetea solo este SKU.
            </p>
          </div>
          <ModalForm
            buttonLabel="Reset de conteo"
            title={`Reset de inventario: ${report.product.masterSku}`}
            description="Cuenta las piezas fisicas visibles. Control Total deja el disponible real restando lo apartado por Meli."
          >
            <AsyncForm
              action="/api/inventory/count-reset"
              resetOnSuccess
              successMessage="Conteo aplicado"
              className="grid gap-3 md:grid-cols-2"
            >
              <input type="hidden" name="masterSku" value={report.product.masterSku} />
              <input
                type="hidden"
                name="back"
                value={`/inventario/${encodeURIComponent(report.product.masterSku)}`}
              />
              <label className="block text-sm font-semibold text-slate-700">
                Bodega
                <select
                  name="warehouseId"
                  defaultValue={report.balances[0]?.warehouseId ?? report.warehouses[0]?.id ?? "wh_main"}
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-950"
                >
                  {report.warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                Fisico contado
                <input
                  name="countedPhysicalQuantity"
                  type="number"
                  min="0"
                  step="0.0001"
                  defaultValue={String(Math.max(0, report.totals.estimatedPhysicalQuantity))}
                  required
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-950"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-700 md:col-span-2">
                Nota
                <input
                  name="note"
                  defaultValue={`Conteo fisico ${report.product.masterSku}`}
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-950"
                />
              </label>
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900 md:col-span-2">
                Apartado actual detectado: {number.format(report.totals.committedQuantity)} pieza(s). Disponible nuevo = fisico contado - apartado.
              </div>
              <button className="h-10 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 md:col-span-2">
                Aplicar conteo de este SKU
              </button>
            </AsyncForm>
          </ModalForm>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="ct-ops-panel">
          <div className="ct-ops-panel-header">
            <h2 className="ct-ops-title">Stock por bodega</h2>
          </div>
          <div>
            {report.balances.map((balance) => (
              <div key={balance.warehouseId} className="grid grid-cols-4 gap-3 border-t border-white/10 px-4 py-3 text-sm">
                <div className="col-span-2">
                  <p className="font-semibold">{balance.warehouseName}</p>
                  <p className="ct-ops-copy text-xs">{balance.warehouseType}</p>
                </div>
                <div>
                  <p className="ct-ops-mini-metric-label">Fisico estimado</p>
                  <p className="font-semibold">{number.format(balance.estimatedPhysicalQuantity)}</p>
                </div>
                <div>
                  <p className="ct-ops-mini-metric-label">Disponible</p>
                  <p className="font-semibold">
                    {number.format(balance.availableQuantity)}
                    {balance.committedQuantity > 0 ? (
                      <span className="ml-1 text-xs text-amber-700">
                        ({number.format(balance.committedQuantity)} apartado)
                      </span>
                    ) : null}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="ct-ops-panel">
          <div className="ct-ops-panel-header">
            <div>
            <h2 className="ct-ops-title">SKUs online que consumen este producto</h2>
            <p className="ct-ops-copy">
              Liga publicaciones detectadas de Meli, TikTok, Shopify o canales futuros a este SKU maestro.
            </p>
            </div>
          </div>
          <div>
            {report.onlineSkus.map((sku) => {
              const choice = report.onlineSkuChoices.find(
                (entry) => entry.onlineSku.toLowerCase() === sku.onlineSku.toLowerCase(),
              );

              return (
                <div key={sku.id} className="ct-ops-row text-sm">
                  <div className="mb-3 flex items-center gap-3">
                    <ProductThumbnail
                      imageUrl={choice?.imageUrl ?? sku.imageUrl}
                      label={sku.title || sku.onlineSku}
                      size="sm"
                    />
                    <div className="min-w-0">
                    <p className="font-mono text-xs font-semibold">{sku.onlineSku}</p>
                    <p className="mt-1 font-semibold">{sku.title}</p>
                    <p className="text-xs text-slate-500">
                      {getChannelLabel(choice?.channel ?? sku.channel)} ·{" "}
                      {choice?.accountAlias ?? sku.marketplaceAccount} · consume{" "}
                      {number.format(sku.quantityRequired)}
                    </p>
                    </div>
                  </div>
                  <OnlineSkuMappingForm
                    choices={report.onlineSkuChoices}
                    currentOnlineSku={sku.onlineSku}
                    defaultOnlineSku={sku.onlineSku}
                    defaultMultiplier={sku.quantityRequired}
                    masterSku={report.product.masterSku}
                  />
                </div>
              );
            })}
            <div className="ct-ops-inline-card m-4">
              <div className="mb-3">
                <p className="ct-ops-title text-sm">Agregar SKU online</p>
                <p className="ct-ops-copy text-xs">
                  Elige una publicacion detectada que todavia no consuma este producto.
                </p>
              </div>
              <OnlineSkuMappingForm
                choices={report.onlineSkuChoices.filter(
                  (choice) => !choice.isLinkedToThisProduct,
                )}
                defaultMultiplier={1}
                masterSku={report.product.masterSku}
                resetOnSuccess
              />
            </div>
          </div>
        </div>
      </section>

      <section className="ct-ops-panel">
        <div className="ct-ops-panel-header">
          <h2 className="ct-ops-title">Ventas recientes</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Orden</th>
                <th className="px-4 py-3">Origen</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Bodega</th>
                <th className="px-4 py-3">Consume</th>
                <th className="px-4 py-3">Venta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.orders.slice(0, 30).map((order) => (
                <tr key={order.externalOrderId}>
                  <td className="px-4 py-3 font-mono text-xs font-semibold">
                    <Link className="underline decoration-slate-300 underline-offset-2" href={`/ventas/${order.externalOrderId}`}>
                      {order.externalOrderId}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold">{getChannelLabel(order.channel)}</p>
                    <p className="text-xs text-slate-500">{order.accountAlias}</p>
                  </td>
                  <td className="px-4 py-3">{formatDateTimeMx(order.orderedAt)}</td>
                  <td className="px-4 py-3">{order.status}</td>
                  <td className="px-4 py-3">{order.items.map((item) => item.warehouseName).join(", ")}</td>
                  <td className="px-4 py-3">{number.format(order.items.reduce((sum, item) => sum + (item.consumedQuantity ?? 0), 0))}</td>
                  <td className="px-4 py-3 font-semibold">{money.format(order.grossAmount)}</td>
                </tr>
              ))}
              {report.orders.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-slate-500" colSpan={7}>
                    No hay ventas relacionadas.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <SimpleTable
          title="Movimientos"
          empty="No hay movimientos manuales/importados."
          headers={["Fecha", "Tipo", "Bodega", "Cantidad", "Referencia"]}
          rows={report.movements.slice(0, 40).map((movement) => [
            formatDateTimeMx(movement.date),
            movement.type,
            movement.warehouseName,
            number.format(movement.quantity),
            movement.reference,
          ])}
        />
        <SimpleTable
          title="Capas Full"
          empty="No hay capas Full para este SKU."
          headers={["Fecha", "Inicial", "Restante", "Envio/pza", "Almacenaje/pza/dia"]}
          rows={report.fullLayers.map((layer) => [
            formatDateTimeMx(layer.dateReceived),
            number.format(layer.initialQuantity),
            number.format(layer.remainingQuantity),
            money.format(layer.inboundFreightCostPerUnit),
            money.format(layer.storageCostPerUnitPerDay),
          ])}
        />
      </section>
      </div>
    </AppShell>
  );
}

function getChannelLabel(channel: string) {
  const labels: Record<string, string> = {
    mercado_libre: "Mercado Libre",
    tiktok: "TikTok",
    shopify: "Shopify",
    amazon: "Amazon",
    whatsapp: "WhatsApp",
    manual: "Manual",
    external: "Externa",
  };

  return labels[channel] ?? channel;
}

function OnlineSkuMappingForm({
  choices,
  currentOnlineSku,
  defaultOnlineSku = "",
  defaultMultiplier,
  masterSku,
  resetOnSuccess = false,
}: {
  choices: OnlineSkuChoice[];
  currentOnlineSku?: string;
  defaultOnlineSku?: string;
  defaultMultiplier: number;
  masterSku: string;
  resetOnSuccess?: boolean;
}) {
  const redirectTo = `/inventario/${encodeURIComponent(masterSku)}`;
  const hasChoices = choices.length > 0;
  const listId = `online-sku-choices-${((currentOnlineSku ?? defaultOnlineSku) || "nuevo")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")}`;

  return (
    <AsyncForm
      action="/api/skus/map"
      resetOnSuccess={resetOnSuccess}
      successMessage={currentOnlineSku ? "Equivalencia actualizada" : "SKU online agregado"}
      className="grid gap-2 md:grid-cols-[minmax(0,1fr)_120px_auto] md:items-end"
    >
      <input type="hidden" name="masterSku" value={masterSku} />
      <input type="hidden" name="redirectTo" value={redirectTo} />
      {currentOnlineSku ? (
        <input type="hidden" name="currentOnlineSku" value={currentOnlineSku} />
      ) : null}
      <label className="block text-xs font-black uppercase tracking-[0.08em] text-slate-500">
        SKU online (publicacion / marketplace)
        <input
          name="onlineSku"
          list={listId}
          defaultValue={defaultOnlineSku}
          required
          placeholder="Escribe o elige SKU online"
          className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-950 outline-none focus:border-slate-950"
        />
        <datalist id={listId}>
          {choices.map((choice) => (
            <option key={`${choice.marketplaceAccount}:${choice.onlineSku}`} value={choice.onlineSku}>
              {formatOnlineSkuChoice(choice)}
            </option>
          ))}
        </datalist>
      </label>
      <label className="block text-xs font-black uppercase tracking-[0.08em] text-slate-500">
        Consume
        <input
          name="multiplier"
          type="number"
          min="0.0001"
          step="0.0001"
          defaultValue={String(defaultMultiplier || 1)}
          required
          className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-semibold normal-case tracking-normal text-slate-950 outline-none focus:border-slate-950"
        />
      </label>
      <button
        className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {currentOnlineSku ? <Save size={16} /> : <PlusCircle size={16} />}
        {currentOnlineSku ? "Guardar" : "Agregar"}
      </button>
      {!hasChoices ? (
        <p className="text-xs font-semibold text-slate-500 md:col-span-3">
          No hay SKUs online detectados disponibles; puedes escribir uno manualmente.
        </p>
      ) : null}
    </AsyncForm>
  );
}

function formatOnlineSkuChoice(choice: OnlineSkuChoice) {
  const linkedLabel =
    choice.linkedMasterSkus.length > 0
      ? ` -> ${choice.linkedMasterSkus.join(", ")}`
      : " -> sin ligar";

  return `Online ${choice.onlineSku} | ${getChannelLabel(choice.channel)} / ${choice.accountAlias} | ${choice.title}${linkedLabel}`;
}

function Kpi({
  label,
  value,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: "neutral" | "amber" | "red";
}) {
  const valueColor =
    tone === "red"
      ? "is-danger"
      : tone === "amber"
        ? "is-warn"
        : "";

  return (
    <div className={`ct-ops-kpi ${tone === "red" ? "is-danger" : tone === "amber" ? "is-warn" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="ct-ops-kpi-label">{label}</p>
        <span className="ct-ops-icon">{icon}</span>
      </div>
      <p className={`ct-ops-kpi-value ${valueColor}`}>{value}</p>
    </div>
  );
}

function SimpleTable({
  title,
  empty,
  headers,
  rows,
}: {
  title: string;
  empty: string;
  headers: string[];
  rows: string[][];
}) {
  return (
    <section className="ct-ops-panel">
      <div className="ct-ops-panel-header">
        <h2 className="ct-ops-title">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              {headers.map((header) => (
                <th key={header} className="px-4 py-3">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, index) => (
              <tr key={`${title}-${index}`}>
                {row.map((cell, cellIndex) => (
                  <td key={`${title}-${index}-${cellIndex}`} className="px-4 py-3">{cell}</td>
                ))}
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center text-slate-500" colSpan={headers.length}>{empty}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
