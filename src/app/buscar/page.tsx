import Link from "next/link";
import { Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/server/auth-store";
import { readLocalStore } from "@/lib/server/local-store";
import { formatDateTimeMx } from "@/lib/format";

type SearchPageProps = {
  searchParams: Promise<{ q?: string }>;
};

const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const user = await requirePermission("dashboard.view");
  const params = await searchParams;
  const store = await readLocalStore();
  const query = (params.q ?? "").trim().toLowerCase();
  const products = query
    ? store.products.filter(
        (product) =>
          product.masterSku.toLowerCase().includes(query) ||
          product.name.toLowerCase().includes(query),
      )
    : [];
  const orders = query
    ? store.marketplaceOrders.filter(
        (order) =>
          order.externalOrderId.toLowerCase().includes(query) ||
          order.items.some(
            (item) =>
              item.externalSku.toLowerCase().includes(query) ||
              item.title.toLowerCase().includes(query) ||
              (item.masterSku ?? "").toLowerCase().includes(query),
          ),
      )
    : [];
  const onlineSkus = query
    ? store.onlineSkus.filter(
        (sku) =>
          sku.onlineSku.toLowerCase().includes(query) ||
          sku.title.toLowerCase().includes(query) ||
          sku.components.some((component) =>
            component.masterSku.toLowerCase().includes(query),
          ),
      )
    : [];

  return (
    <AppShell
      active="buscar"
      title="Busqueda"
      subtitle="Encuentra productos, ventas y SKUs online desde un solo lugar."
      organization={store.organization.name}
      userEmail={user.email}
    >
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <form action="/buscar#resultados" method="get" className="flex flex-wrap gap-2">
          <label className="flex h-10 min-w-[280px] flex-1 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm focus-within:border-slate-950">
            <Search size={16} className="text-slate-400" />
            <input
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="SKU, orden o producto"
              className="w-full outline-none"
            />
          </label>
          <button type="submit" className="h-10 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800">
            Buscar
          </button>
        </form>
      </section>

      <div id="resultados" className="scroll-mt-24" />

      <ResultSection title="Productos" empty="No encontre productos.">
        {products.map((product) => (
          <Link
            key={product.masterSku}
            href={`/inventario/${encodeURIComponent(product.masterSku)}`}
            className="block rounded-md border border-slate-200 bg-white p-4 hover:bg-slate-50"
          >
            <p className="font-mono text-xs font-semibold">{product.masterSku}</p>
            <p className="mt-1 font-semibold">{product.name}</p>
            <p className="mt-1 text-sm text-slate-500">
              Stock {product.currentStock} | Costo {money.format(product.averageUnitCost ?? 0)}
            </p>
          </Link>
        ))}
      </ResultSection>

      <ResultSection title="Ventas" empty="No encontre ventas.">
        {orders.slice(0, 40).map((order) => (
          <Link
            key={order.externalOrderId}
            href={`/ventas/${encodeURIComponent(order.externalOrderId)}`}
            className="block rounded-md border border-slate-200 bg-white p-4 hover:bg-slate-50"
          >
            <p className="font-mono text-xs font-semibold">{order.externalOrderId}</p>
            <p className="mt-1 font-semibold">
              {money.format(order.grossAmount)} | {order.status}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {formatDateTimeMx(order.orderedAt)} |{" "}
              {order.items.map((item) => item.title).join(" | ")}
            </p>
          </Link>
        ))}
      </ResultSection>

      <ResultSection title="SKUs online" empty="No encontre SKUs online.">
        {onlineSkus.slice(0, 40).map((sku) => (
          <div
            key={sku.id}
            className="rounded-md border border-slate-200 bg-white p-4"
          >
            <p className="font-mono text-xs font-semibold">{sku.onlineSku}</p>
            <p className="mt-1 font-semibold">{sku.title}</p>
            <p className="mt-1 text-sm text-slate-500">
              Consume:{" "}
              {sku.components
                .map(
                  (component) =>
                    `${component.masterSku} x ${component.quantityRequired}`,
                )
                .join(", ")}
            </p>
          </div>
        ))}
      </ResultSection>
    </AppShell>
  );
}

function ResultSection({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const count = Array.isArray(children) ? children.filter(Boolean).length : 0;

  return (
    <section>
      <h2 className="mb-3 font-semibold">{title}</h2>
      <div className="grid gap-3">
        {count > 0 ? children : <p className="text-sm text-slate-500">{empty}</p>}
      </div>
    </section>
  );
}
