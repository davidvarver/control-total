import Link from "next/link";
import { ArrowLeft, UsersRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ImportPreviewForm } from "@/components/import-preview-form";
import {
  ManualSaleForm,
  type ManualSaleCustomerOption,
} from "@/components/manual-sale-form";
import { formatDateTimeMx } from "@/lib/format";
import { requirePermission } from "@/lib/server/auth-store";
import { readLocalStore, type LocalMarketplaceOrder, type LocalStore } from "@/lib/server/local-store";

type NewManualSalePageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function NewManualSalePage({ searchParams }: NewManualSalePageProps) {
  const user = await requirePermission("sales.write");
  const params = await searchParams;
  const store = await readLocalStore();
  const products = store.products
    .slice()
    .sort((a, b) => a.masterSku.localeCompare(b.masterSku));
  const warehouses = store.warehouses.filter((warehouse) => warehouse.isSellable);
  const availableBySku = buildAvailableBySku(store);
  const customers = buildManualCustomers(store.marketplaceOrders);
  const now = new Date();
  const defaultDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);

  return (
    <AppShell
      active="ventas"
      title="Registrar venta externa"
      subtitle="Mostrador, WhatsApp, TikTok u otro canal que no esta conectado por API."
      organization={store.organization.name}
      userEmail={user.email}
      actions={
        <Link
          href="/ventas"
          className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft size={16} />
          Volver a ventas
        </Link>
      }
    >
      {params.error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {params.error}
        </div>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <ManualSaleForm
          defaultDate={defaultDate}
          products={products.map((product) => ({
            masterSku: product.masterSku,
            name: product.name,
            averageUnitCost: product.averageUnitCost,
            availableQuantity: availableBySku.get(product.masterSku) ?? product.currentStock,
          }))}
          warehouses={warehouses.map((warehouse) => ({
            id: warehouse.id,
            name: warehouse.name,
          }))}
          customers={customers}
        />

        <aside className="space-y-5">
          <section className="rounded-lg border border-zinc-200 bg-white p-4">
            <h2 className="font-semibold">Importar muchas ventas</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Usa Excel cuando tengas ventas de mostrador, TikTok, WhatsApp u otros canales.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/api/templates/ventas_externas"
                className="inline-flex h-9 items-center rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Descargar plantilla
              </Link>
            </div>
            <ImportPreviewForm
              action="/api/import/manual-sales"
              importType="manual-sales"
            />
          </section>

          <section className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <UsersRound size={18} className="text-zinc-400" />
              <h2 className="font-semibold">Clientes recordados</h2>
            </div>
            <p className="mt-1 text-sm text-zinc-500">
              Se construyen con ventas manuales anteriores. Al elegir uno se cargan sus datos y precios.
            </p>
            <div className="mt-3 max-h-[320px] divide-y divide-zinc-100 overflow-y-auto rounded-md border border-zinc-100">
              {customers.length ? (
                customers.slice(0, 20).map((customer) => (
                  <div key={customer.key} className="px-3 py-2 text-xs">
                    <p className="font-semibold">{customer.name}</p>
                    <p className="text-zinc-500">
                      {customer.totalSales} venta(s)
                      {customer.lastSoldAt ? ` · ${formatDateTimeMx(customer.lastSoldAt)}` : ""}
                    </p>
                  </div>
                ))
              ) : (
                <p className="px-3 py-4 text-sm text-zinc-500">
                  Aun no hay clientes manuales guardados.
                </p>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-zinc-200 bg-white p-4">
            <h2 className="font-semibold">SKUs activos</h2>
            <p className="mt-1 text-xs text-zinc-500">
              {products.length} producto(s). Ultima importacion: {formatDateTimeMx(store.importedAt)}.
            </p>
            <div className="mt-3 max-h-[420px] divide-y divide-zinc-100 overflow-y-auto rounded-md border border-zinc-100">
              {products.slice(0, 80).map((product) => (
                <div key={product.masterSku} className="px-3 py-2 text-xs">
                  <p className="font-mono font-semibold">{product.masterSku}</p>
                  <p className="truncate text-zinc-500">{product.name}</p>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </AppShell>
  );
}

function buildAvailableBySku(store: LocalStore) {
  const map = new Map<string, number>();

  for (const balance of store.inventoryBalances) {
    const available =
      Number(balance.physicalQuantity ?? 0) -
      Number(balance.reservedQuantity ?? 0) -
      Number(balance.blockedQuantity ?? 0);
    map.set(balance.masterSku, (map.get(balance.masterSku) ?? 0) + available);
  }

  return map;
}

function buildManualCustomers(orders: LocalMarketplaceOrder[]): ManualSaleCustomerOption[] {
  const map = new Map<string, ManualSaleCustomerOption>();

  const manualOrders = orders
    .filter((order) => order.channel !== "mercado_libre")
    .sort((a, b) => new Date(b.orderedAt).getTime() - new Date(a.orderedAt).getTime());

  for (const order of manualOrders) {
    const raw = isRecord(order.raw) ? order.raw : {};
    const name = stringValue(raw.customerName);

    if (!name) {
      continue;
    }

    const key = normalizeCustomerKey(name);
    const existing =
      map.get(key) ??
      ({
        key,
        name,
        phone: stringValue(raw.customerPhone),
        email: stringValue(raw.customerEmail),
        note: stringValue(raw.customerNote),
        totalSales: 0,
        lastSoldAt: undefined,
        items: [],
      } satisfies ManualSaleCustomerOption);

    existing.totalSales += 1;
    existing.lastSoldAt ??= order.orderedAt;
    existing.phone ||= stringValue(raw.customerPhone);
    existing.email ||= stringValue(raw.customerEmail);
    existing.note ||= stringValue(raw.customerNote);

    for (const item of order.items) {
      if (!item.masterSku) {
        continue;
      }

      existing.items.push({
        masterSku: item.masterSku,
        title: item.title,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        orderedAt: order.orderedAt,
        externalOrderId: order.externalOrderId,
      });
    }

    map.set(key, existing);
  }

  return Array.from(map.values()).sort((a, b) => {
    const aTime = a.lastSoldAt ? new Date(a.lastSoldAt).getTime() : 0;
    const bTime = b.lastSoldAt ? new Date(b.lastSoldAt).getTime() : 0;
    return bTime - aTime;
  });
}

function normalizeCustomerKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
