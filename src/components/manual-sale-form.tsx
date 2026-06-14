"use client";

import { useMemo, useState } from "react";
import { BadgeDollarSign, Plus, Trash2, UserRound } from "lucide-react";

export type ManualSaleProductOption = {
  masterSku: string;
  name: string;
  averageUnitCost?: number;
  availableQuantity: number;
};

export type ManualSaleWarehouseOption = {
  id: string;
  name: string;
};

export type ManualSaleCustomerOption = {
  key: string;
  name: string;
  phone?: string;
  email?: string;
  note?: string;
  totalSales: number;
  lastSoldAt?: string;
  items: Array<{
    masterSku: string;
    title: string;
    quantity: number;
    unitPrice: number;
    orderedAt: string;
    externalOrderId: string;
  }>;
};

type LineState = {
  id: string;
  masterSku: string;
  skuQuery: string;
  quantity: string;
  unitPrice: string;
};

type ManualSaleFormProps = {
  defaultDate: string;
  products: ManualSaleProductOption[];
  warehouses: ManualSaleWarehouseOption[];
  customers: ManualSaleCustomerOption[];
};

const currency = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

const dateFormatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "short",
  timeStyle: "short",
});

export function ManualSaleForm({
  defaultDate,
  products,
  warehouses,
  customers,
}: ManualSaleFormProps) {
  const [selectedCustomerKey, setSelectedCustomerKey] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [lines, setLines] = useState<LineState[]>([
    { id: crypto.randomUUID(), masterSku: "", skuQuery: "", quantity: "1", unitPrice: "" },
  ]);

  const selectedCustomer = customers.find((entry) => entry.key === selectedCustomerKey);
  const productBySku = useMemo(
    () => new Map(products.map((product) => [product.masterSku, product])),
    [products],
  );
  const selectedCustomerPrices = useMemo(() => {
    const prices = new Map<string, ManualSaleCustomerOption["items"][number]>();

    for (const item of selectedCustomer?.items ?? []) {
      if (!prices.has(item.masterSku)) {
        prices.set(item.masterSku, item);
      }
    }

    return prices;
  }, [selectedCustomer]);

  const total = lines.reduce((sum, line) => {
    const quantity = Number(line.quantity);
    const unitPrice = Number(line.unitPrice);

    if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) {
      return sum;
    }

    return sum + quantity * unitPrice;
  }, 0);

  function chooseCustomer(key: string) {
    setSelectedCustomerKey(key);

    if (!key) {
      setCustomerName("");
      setCustomerPhone("");
      setCustomerEmail("");
      setCustomerNote("");
      return;
    }

    const customer = customers.find((entry) => entry.key === key);

    if (!customer) {
      return;
    }

    setCustomerName(customer.name);
    setCustomerPhone(customer.phone ?? "");
    setCustomerEmail(customer.email ?? "");
    setCustomerNote(customer.note ?? "");
  }

  function updateLine(id: string, patch: Partial<LineState>) {
    setLines((current) =>
      current.map((line) => {
        if (line.id !== id) {
          return line;
        }

        const next = { ...line, ...patch };

        if (patch.masterSku && (!line.unitPrice || Number(line.unitPrice) <= 0)) {
          const remembered = selectedCustomerPrices.get(patch.masterSku);
          if (remembered) {
            next.unitPrice = String(remembered.unitPrice);
          }
        }

        return next;
      }),
    );
  }

  function addLine() {
    setLines((current) => [
      ...current,
      { id: crypto.randomUUID(), masterSku: "", skuQuery: "", quantity: "1", unitPrice: "" },
    ]);
  }

  function removeLine(id: string) {
    setLines((current) =>
      current.length <= 1 ? current : current.filter((line) => line.id !== id),
    );
  }

  function chooseProduct(id: string, product: ManualSaleProductOption) {
    updateLine(id, {
      masterSku: product.masterSku,
      skuQuery: `${product.masterSku} - ${product.name}`,
    });
  }

  function updateProductSearch(id: string, value: string) {
    const exact = products.find((product) => {
      const query = value.trim().toLowerCase();
      return (
        product.masterSku.toLowerCase() === query ||
        `${product.masterSku} - ${product.name}`.toLowerCase() === query
      );
    });

    updateLine(id, {
      skuQuery: value,
      masterSku: exact?.masterSku ?? "",
    });
  }

  return (
    <form action="/api/orders/manual" method="post" className="rounded-lg border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 px-5 py-4">
        <h2 className="font-semibold">Datos de la venta</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Elige cliente y SKUs. Control Total descuenta inventario y calcula utilidad.
        </p>
      </div>

      <div className="grid gap-5 p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm font-semibold text-zinc-700">Canal</span>
            <select
              name="channel"
              defaultValue="manual"
              className="h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
            >
              <option value="manual">Mostrador / Bodega</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="tiktok">TikTok</option>
              <option value="external">Otro canal</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-semibold text-zinc-700">Fecha</span>
            <input
              name="orderedAt"
              type="datetime-local"
              defaultValue={defaultDate}
              className="h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-semibold text-zinc-700">Referencia</span>
            <input
              name="externalOrderId"
              placeholder="Opcional"
              className="h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-semibold text-zinc-700">Bodega que descuenta</span>
            <select
              name="warehouseId"
              defaultValue={warehouses[0]?.id ?? "wh_main"}
              className="h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
            >
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <section className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex items-center gap-2">
            <UserRound size={18} className="text-slate-500" />
            <h3 className="font-semibold">Cliente</h3>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-sm font-semibold text-zinc-700">Elegir cliente guardado</span>
              <select
                value={selectedCustomerKey}
                onChange={(event) => chooseCustomer(event.target.value)}
                className="h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
              >
                <option value="">Nuevo cliente</option>
                {customers.map((customer) => (
                  <option key={customer.key} value={customer.key}>
                    {customer.name} ({customer.totalSales})
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-sm font-semibold text-zinc-700">Nombre del cliente</span>
              <input
                name="customerName"
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                placeholder="Ej. Juan Perez / Tienda Centro"
                className="h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
              />
            </label>

            <label className="space-y-1">
              <span className="text-sm font-semibold text-zinc-700">Telefono</span>
              <input
                name="customerPhone"
                value={customerPhone}
                onChange={(event) => setCustomerPhone(event.target.value)}
                placeholder="Opcional"
                className="h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
              />
            </label>

            <label className="space-y-1">
              <span className="text-sm font-semibold text-zinc-700">Email</span>
              <input
                name="customerEmail"
                type="email"
                value={customerEmail}
                onChange={(event) => setCustomerEmail(event.target.value)}
                placeholder="Opcional"
                className="h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
              />
            </label>

            <label className="space-y-1 md:col-span-2">
              <span className="text-sm font-semibold text-zinc-700">Nota del cliente</span>
              <input
                name="customerNote"
                value={customerNote}
                onChange={(event) => setCustomerNote(event.target.value)}
                placeholder="Opcional"
                className="h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
              />
            </label>
          </div>

          {selectedCustomer ? (
            <div className="mt-4 rounded-md border border-slate-200 bg-white p-3">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                Historial recordado
              </p>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                {selectedCustomer.items.slice(0, 6).map((item) => (
                  <button
                    key={`${item.externalOrderId}-${item.masterSku}-${item.orderedAt}`}
                    type="button"
                    onClick={() => {
                      const emptyLine = lines.find((line) => !line.masterSku);
                      if (emptyLine) {
                        updateLine(emptyLine.id, {
                          masterSku: item.masterSku,
                          skuQuery: `${item.masterSku} - ${item.title}`,
                          quantity: String(item.quantity),
                          unitPrice: String(item.unitPrice),
                        });
                      } else {
                        setLines((current) => [
                          ...current,
                          {
                            id: crypto.randomUUID(),
                            masterSku: item.masterSku,
                            skuQuery: `${item.masterSku} - ${item.title}`,
                            quantity: String(item.quantity),
                            unitPrice: String(item.unitPrice),
                          },
                        ]);
                      }
                    }}
                    className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs hover:bg-white"
                  >
                    <span className="block font-mono font-semibold text-slate-900">
                      {item.masterSku}
                    </span>
                    <span className="block truncate text-slate-500">{item.title}</span>
                    <span className="mt-1 block text-slate-700">
                      {item.quantity} x {currency.format(item.unitPrice)} ·{" "}
                      {formatShortDate(item.orderedAt)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div>
              <h3 className="font-semibold">Productos</h3>
              <p className="text-sm text-slate-500">
                Precio unitario es el precio de venta por articulo. Recibido se calcula solo.
              </p>
            </div>
            <button type="button" onClick={addLine} className="ct-button ct-button-secondary">
              <Plus size={16} />
              Agregar SKU
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {lines.map((line, index) => {
              const product = productBySku.get(line.masterSku);
              const remembered = selectedCustomerPrices.get(line.masterSku);
              const productMatches = findProductMatches(products, line.skuQuery, line.masterSku);
              const showProductMenu = activeLineId === line.id && productMatches.length > 0;

              return (
                <div key={line.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_120px_150px_44px]">
                  <label className="relative space-y-1">
                    <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                      SKU {index + 1}
                    </span>
                    <input
                      value={line.skuQuery}
                      onChange={(event) => updateProductSearch(line.id, event.target.value)}
                      onFocus={() => setActiveLineId(line.id)}
                      onBlur={() => {
                        window.setTimeout(() => {
                          setActiveLineId((current) => (current === line.id ? null : current));
                        }, 120);
                      }}
                      placeholder="Busca SKU o producto"
                      required
                      className="h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
                    />
                    <input
                      name="lineMasterSku"
                      type="hidden"
                      value={line.masterSku}
                    />
                    {showProductMenu ? (
                      <div className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
                        {productMatches.map((entry) => (
                          <button
                            key={entry.masterSku}
                            type="button"
                            onClick={() => chooseProduct(line.id, entry)}
                            className="block w-full border-b border-slate-100 px-3 py-2 text-left text-xs last:border-b-0 hover:bg-slate-50"
                          >
                            <span className="block font-mono font-semibold text-slate-950">
                              {entry.masterSku}
                            </span>
                            <span className="block truncate text-slate-600">{entry.name}</span>
                            <span className="mt-1 block text-slate-400">
                              Disponible: {entry.availableQuantity}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {line.skuQuery && !line.masterSku && productMatches.length === 0 ? (
                      <p className="text-xs font-semibold text-red-600">
                        No encontre ese SKU en tu catalogo.
                      </p>
                    ) : null}
                    {product ? (
                      <p className="text-xs text-slate-500">
                        Disponible: {product.availableQuantity}
                        {remembered ? ` - ultimo a ${currency.format(remembered.unitPrice)}` : ""}
                      </p>
                    ) : null}
                  </label>

                  <label className="space-y-1">
                    <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                      Cantidad
                    </span>
                    <input
                      name="lineQuantity"
                      type="number"
                      min="1"
                      step="1"
                      required
                      value={line.quantity}
                      onChange={(event) => updateLine(line.id, { quantity: event.target.value })}
                      className="h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                      Precio unitario
                    </span>
                    <input
                      name="lineUnitPrice"
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      value={line.unitPrice}
                      onChange={(event) => updateLine(line.id, { unitPrice: event.target.value })}
                      placeholder="0.00"
                      className="h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => removeLine(line.id)}
                    className="ct-button ct-button-secondary self-end"
                    aria-label="Quitar renglon"
                    disabled={lines.length <= 1}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm font-semibold text-zinc-700">Cargo extra</span>
            <input
              name="chargeAmount"
              type="number"
              min="0"
              step="0.01"
              placeholder="Opcional"
              className="h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-semibold text-zinc-700">Tipo de cargo</span>
            <select
              name="chargeType"
              defaultValue="other"
              className="h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
            >
              <option value="other">Otro</option>
              <option value="shipping">Envio</option>
              <option value="marketplace_commission">Comision</option>
              <option value="advertising">Publicidad</option>
              <option value="packaging">Empaque</option>
            </select>
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-sm font-semibold text-zinc-700">Nota de la venta</span>
            <input
              name="note"
              placeholder="Opcional"
              className="h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
            />
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 px-5 py-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Venta</p>
          <p className="text-lg font-black text-slate-950">{currency.format(total)}</p>
        </div>
        <button className="ct-button ct-button-primary">
          <BadgeDollarSign size={16} />
          Registrar venta
        </button>
      </div>
    </form>
  );
}

function findProductMatches(
  products: ManualSaleProductOption[],
  query: string,
  selectedSku: string,
) {
  const trimmed = query.trim().toLowerCase();

  if (!trimmed) {
    return products.slice(0, 20);
  }

  const matches = products.filter((product) => {
    const sku = product.masterSku.toLowerCase();
    const name = product.name.toLowerCase();
    return sku.includes(trimmed) || name.includes(trimmed);
  });

  if (selectedSku && !matches.some((product) => product.masterSku === selectedSku)) {
    const selected = products.find((product) => product.masterSku === selectedSku);
    if (selected) {
      matches.unshift(selected);
    }
  }

  return matches.slice(0, 20);
}

function formatShortDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return dateFormatter.format(date);
}
