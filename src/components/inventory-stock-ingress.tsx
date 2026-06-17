"use client";

import { type FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { PackagePlus, Plus, Trash2, X } from "lucide-react";

type ProductCatalogItem = {
  masterSku: string;
  name: string;
  averageUnitCost: number;
};

type WarehouseOption = {
  id: string;
  name: string;
};

type IngressRow = {
  id: string;
  masterSku: string;
  name: string;
  quantity: string;
  averageUnitCost: string;
};

type InventoryStockIngressProps = {
  products: ProductCatalogItem[];
  warehouses: WarehouseOption[];
  firstWarehouseId: string;
};

export function InventoryStockIngress({
  products,
  warehouses,
  firstWarehouseId,
}: InventoryStockIngressProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [warehouseId, setWarehouseId] = useState(firstWarehouseId);
  const [reference, setReference] = useState("");
  const [rows, setRows] = useState<IngressRow[]>(() => createInitialRows());
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const portalTarget = typeof document === "undefined" ? null : document.body;

  const productBySku = useMemo(() => {
    return new Map(
      products.map((product) => [normalizeSkuInput(product.masterSku), product]),
    );
  }, [products]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  function updateRow(id: string, patch: Partial<IngressRow>) {
    setRows((currentRows) =>
      normalizeRows(
        currentRows.map((row) => {
          if (row.id !== id) {
            return row;
          }

          const nextRow = { ...row, ...patch };
          if (patch.masterSku !== undefined) {
            const product = productBySku.get(normalizeSkuInput(nextRow.masterSku));
            nextRow.name = product?.name ?? "";
          }
          return nextRow;
        }),
      ),
    );
    setMessage("");
    setError("");
  }

  function removeRow(id: string) {
    setRows((currentRows) => {
      if (currentRows.length <= 3) {
        return normalizeRows(
          currentRows.map((row) =>
            row.id === id
              ? {
                  ...row,
                  masterSku: "",
                  name: "",
                  quantity: "",
                  averageUnitCost: "",
                }
              : row,
          ),
        );
      }

      return normalizeRows(currentRows.filter((row) => row.id !== id));
    });
    setMessage("");
    setError("");
  }

  function resetForm() {
    setRows(createInitialRows());
    setReference("");
    setMessage("");
    setError("");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    const parsed = parseRows(rows, productBySku);
    if (parsed.error) {
      setError(parsed.error);
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch("/api/inventory/ingress", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "X-Requested-With": "fetch",
          },
          body: JSON.stringify({
            warehouseId,
            reference,
            lines: parsed.lines,
          }),
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          setError(payload?.error ?? "No se pudo guardar.");
          return;
        }

        const appliedLines = Number(payload?.appliedLines?.length ?? 0);
        const costUpdates = Number(payload?.costUpdates ?? 0);
        resetForm();
        setMessage(
          `Ingreso registrado: ${appliedLines} linea(s)${
            costUpdates ? `, ${costUpdates} costo(s)` : ""
          }.`,
        );
        router.refresh();
        window.setTimeout(() => setMessage(""), 2400);
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "No se pudo guardar.",
        );
      }
    });
  }

  const modal = (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-950/70 px-3 py-4 backdrop-blur-md sm:px-6 sm:py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="inventory-ingress-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Cerrar ingreso rapido"
        onClick={() => setIsOpen(false)}
      />
      <div className="relative my-auto max-h-[calc(100vh-2rem)] w-full max-w-[min(96vw,1120px)] overflow-auto rounded-[28px] border border-white/15 bg-[#111720]/95 text-white shadow-2xl shadow-black/50">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-[#111720]/90 px-5 py-4 backdrop-blur-xl">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-100/80">
              Entrada de inventario
            </p>
            <h2
              id="inventory-ingress-title"
              className="mt-1 text-2xl font-black tracking-tight"
            >
              Nuevo ingreso de stock
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-300">
              Captura varios articulos a la vez. Al escribir SKU en la ultima
              linea, se abre otra automaticamente.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="rounded-2xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-5 p-5">
          <fieldset disabled={isPending} className="space-y-5">
            <div className="grid gap-3 md:grid-cols-[minmax(220px,320px)_1fr]">
              <label className="block text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                Bodega
                <select
                  value={warehouseId}
                  onChange={(event) => setWarehouseId(event.target.value)}
                  className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.07] px-3 text-sm font-semibold text-white outline-none focus:border-cyan-200"
                >
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id} className="text-slate-950">
                      {warehouse.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                Referencia
                <input
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  placeholder="Proveedor, factura, contenedor..."
                  className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.07] px-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-cyan-200"
                />
              </label>
            </div>

            <div className="overflow-x-auto rounded-[24px] border border-white/10 bg-white/[0.04]">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="border-b border-white/10 bg-white/[0.06] text-xs uppercase tracking-[0.14em] text-slate-400">
                  <tr>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Nombre producto</th>
                    <th className="px-4 py-3">Cantidad</th>
                    <th className="px-4 py-3">Costo opcional</th>
                    <th className="w-14 px-4 py-3" aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {rows.map((row) => {
                    const hasSku = row.masterSku.trim().length > 0;
                    const skuExists = productBySku.has(
                      normalizeSkuInput(row.masterSku),
                    );
                    return (
                      <tr key={row.id}>
                        <td className="px-4 py-3 align-top">
                          <input
                            value={row.masterSku}
                            onChange={(event) =>
                              updateRow(row.id, { masterSku: event.target.value })
                            }
                            list="inventory-ingress-skus"
                            placeholder="SKU maestro"
                            className="h-11 w-full rounded-2xl border border-white/10 bg-black/20 px-3 font-mono text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-cyan-200"
                          />
                          {hasSku && !skuExists ? (
                            <p className="mt-1 text-xs font-semibold text-red-300">
                              SKU no existe o esta archivado.
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <input
                            value={row.name}
                            readOnly
                            placeholder="Se llena al reconocer el SKU"
                            className="h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-slate-200 outline-none placeholder:text-slate-500"
                          />
                        </td>
                        <td className="px-4 py-3 align-top">
                          <input
                            value={row.quantity}
                            onChange={(event) =>
                              updateRow(row.id, { quantity: event.target.value })
                            }
                            type="number"
                            min="0.0001"
                            step="0.0001"
                            placeholder="0"
                            className="h-11 w-full rounded-2xl border border-white/10 bg-black/20 px-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-cyan-200"
                          />
                        </td>
                        <td className="px-4 py-3 align-top">
                          <input
                            value={row.averageUnitCost}
                            onChange={(event) =>
                              updateRow(row.id, {
                                averageUnitCost: event.target.value,
                              })
                            }
                            type="number"
                            min="0"
                            step="0.0001"
                            placeholder="No cambia costo"
                            className="h-11 w-full rounded-2xl border border-white/10 bg-black/20 px-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-cyan-200"
                          />
                        </td>
                        <td className="px-4 py-3 align-top">
                          <button
                            type="button"
                            onClick={() => removeRow(row.id)}
                            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-slate-300 transition hover:border-red-300/50 hover:bg-red-400/10 hover:text-red-200"
                            aria-label="Eliminar linea"
                          >
                            <Trash2 size={17} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <datalist id="inventory-ingress-skus">
              {products.map((product) => (
                <option key={product.masterSku} value={product.masterSku}>
                  {product.name}
                </option>
              ))}
            </datalist>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-2xl text-xs font-semibold leading-5 text-slate-400">
                Ingreso suma stock. Para reemplazar el stock fisico contado usa
                Conteo por SKU.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="ct-button ct-button-secondary"
                >
                  Limpiar
                </button>
                <button
                  type="submit"
                  className="ct-button ct-button-primary inline-flex items-center gap-2"
                >
                  <Plus size={17} />
                  Registrar ingreso
                </button>
              </div>
            </div>
          </fieldset>

          {message ? (
            <p className="rounded-2xl border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-sm font-bold text-emerald-100">
              {message}
            </p>
          ) : null}
          {error ? (
            <p className="rounded-2xl border border-red-300/30 bg-red-400/10 px-3 py-2 text-sm font-bold text-red-100">
              {error}
            </p>
          ) : null}
        </form>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="ct-button ct-button-primary inline-flex items-center gap-2"
      >
        <PackagePlus size={18} />
        Ingreso rapido
      </button>
      {portalTarget && isOpen ? createPortal(modal, portalTarget) : null}
    </>
  );
}

function parseRows(
  rows: IngressRow[],
  productBySku: Map<string, ProductCatalogItem>,
) {
  const enteredRows = rows.filter(rowHasEntry);
  if (enteredRows.length === 0) {
    return { error: "Agrega al menos una linea.", lines: [] };
  }

  const lines = [];
  for (const row of enteredRows) {
    const product = productBySku.get(normalizeSkuInput(row.masterSku));
    if (!product) {
      return {
        error: `SKU maestro no existe o esta archivado: ${row.masterSku}.`,
        lines: [],
      };
    }

    const quantity = parseLooseNumber(row.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return {
        error: `Cantidad invalida para ${row.masterSku}.`,
        lines: [],
      };
    }

    const rawCost = row.averageUnitCost.trim();
    const averageUnitCost = rawCost ? parseLooseNumber(rawCost) : null;
    if (
      averageUnitCost !== null &&
      (!Number.isFinite(averageUnitCost) || averageUnitCost < 0)
    ) {
      return {
        error: `Costo invalido para ${row.masterSku}.`,
        lines: [],
      };
    }

    lines.push({
      masterSku: product.masterSku,
      quantity,
      averageUnitCost,
    });
  }

  return { error: "", lines };
}

function normalizeRows(rows: IngressRow[]) {
  const nextRows = [...rows];
  while (
    nextRows.length > 3 &&
    !rowHasEntry(nextRows[nextRows.length - 1]) &&
    !rowHasEntry(nextRows[nextRows.length - 2])
  ) {
    nextRows.pop();
  }
  if (rowHasEntry(nextRows[nextRows.length - 1])) {
    nextRows.push(createEmptyRow());
  }
  while (nextRows.length < 3) {
    nextRows.push(createEmptyRow());
  }
  return nextRows;
}

function createInitialRows() {
  return [createEmptyRow(), createEmptyRow(), createEmptyRow()];
}

function createEmptyRow(): IngressRow {
  return {
    id: `ingress_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    masterSku: "",
    name: "",
    quantity: "",
    averageUnitCost: "",
  };
}

function rowHasEntry(row: IngressRow) {
  return Boolean(
    row.masterSku.trim() || row.quantity.trim() || row.averageUnitCost.trim(),
  );
}

function normalizeSkuInput(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function parseLooseNumber(value: string) {
  return Number(value.trim().replace(",", "."));
}
