"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { AsyncForm } from "./async-form";

type FullShipmentRow = {
  id: string;
  masterSku: string;
  quantity: string;
  volume: string;
};

type FullShipmentFormProps = {
  today: string;
};

function createRow(id = createDynamicRowId()): FullShipmentRow {
  return {
    id,
    masterSku: "",
    quantity: "",
    volume: "",
  };
}

function createDynamicRowId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `full_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function FullShipmentForm({ today }: FullShipmentFormProps) {
  const [rows, setRows] = useState<FullShipmentRow[]>([
    createRow("full_initial_0"),
  ]);
  const shipmentRows = useMemo(
    () =>
      rows
        .map((row) => `${row.masterSku} | ${row.quantity} | ${row.volume}`)
        .join("\n"),
    [rows],
  );

  function updateRow(
    id: string,
    field: keyof Omit<FullShipmentRow, "id">,
    value: string,
  ) {
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.id === id ? { ...row, [field]: value } : row,
      ),
    );
  }

  function addRow() {
    setRows((currentRows) => [...currentRows, createRow()]);
  }

  function removeRow(id: string) {
    setRows((currentRows) =>
      currentRows.length === 1
        ? currentRows.map((row) =>
            row.id === id ? { ...row, masterSku: "", quantity: "", volume: "" } : row,
          )
        : currentRows.filter((row) => row.id !== id),
    );
  }

  return (
    <AsyncForm
      action="/api/inventory/full-layer"
      className="mt-3 space-y-4"
      resetOnSuccess
      successMessage="Envio Full creado"
    >
      <input type="hidden" name="action" value="shipment" />
      <input type="hidden" name="shipmentRows" value={shipmentRows} />

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-800">
              Productos del envio
            </h3>
            <p className="text-xs text-zinc-500">
              Agrega todos los SKUs que mandaste a Full. El costo de envio se
              captura una sola vez abajo.
            </p>
          </div>
          <button
            type="button"
            onClick={addRow}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            <Plus size={16} />
            Agregar producto
          </button>
        </div>

        {rows.map((row, index) => (
          <div
            key={row.id}
            className="rounded-lg border border-zinc-200 bg-zinc-50 p-3"
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Producto {index + 1}
              </p>
              <button
                type="button"
                onClick={() => removeRow(row.id)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 hover:text-red-700"
                aria-label={`Quitar producto ${index + 1}`}
              >
                <Trash2 size={15} />
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_120px_160px]">
              <label className="block text-sm font-semibold text-zinc-700">
                SKU maestro
                <input
                  list="master-skus"
                  value={row.masterSku}
                  onChange={(event) =>
                    updateRow(row.id, "masterSku", event.target.value)
                  }
                  placeholder="Ej. LONCHERA ESCOLAR"
                  required
                  className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm font-normal outline-none focus:border-zinc-950"
                />
              </label>
              <label className="block text-sm font-semibold text-zinc-700">
                Piezas
                <input
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  value={row.quantity}
                  onChange={(event) =>
                    updateRow(row.id, "quantity", event.target.value)
                  }
                  placeholder="100"
                  required
                  className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm font-normal outline-none focus:border-zinc-950"
                />
              </label>
              <label className="block text-sm font-semibold text-zinc-700">
                Volumen total
                <input
                  type="number"
                  min="0"
                  step="0.0001"
                  value={row.volume}
                  onChange={(event) =>
                    updateRow(row.id, "volume", event.target.value)
                  }
                  placeholder="250000"
                  required
                  className="mt-1 h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm font-normal outline-none focus:border-zinc-950"
                />
              </label>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 border-t border-zinc-100 pt-4 md:grid-cols-[1fr_160px_160px]">
        <label className="block text-sm font-semibold text-zinc-700">
          Unidad de volumen
          <select
            name="volumeUnit"
            defaultValue="cm3"
            className="mt-1 h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
          >
            <option value="cm3">cm3 totales por SKU</option>
            <option value="m3">m3 totales por SKU</option>
          </select>
        </label>
        <label className="block text-sm font-semibold text-zinc-700">
          Costo total envio
          <input
            name="shipmentFreightCostTotal"
            type="number"
            min="0"
            step="0.01"
            placeholder="Ej. 1200"
            required
            className="mt-1 h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
          />
        </label>
        <label className="block text-sm font-semibold text-zinc-700">
          Almacenaje diario/pza
          <input
            name="storageCostPerUnitPerDay"
            type="number"
            min="0"
            step="0.0001"
            placeholder="Ej. 0.12"
            className="mt-1 h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
          />
        </label>
        <label className="block text-sm font-semibold text-zinc-700">
          Fecha de entrada
          <input
            name="dateReceived"
            type="date"
            defaultValue={today}
            className="mt-1 h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
          />
        </label>
        <label className="block text-sm font-semibold text-zinc-700 md:col-span-2">
          Folio o nota Full
          <input
            name="note"
            placeholder="Ej. FULL-MAYO-001"
            className="mt-1 h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
          />
        </label>
      </div>

      <button className="h-10 w-full rounded-md bg-zinc-950 px-3 text-sm font-semibold text-white hover:bg-zinc-800 md:w-auto md:min-w-56">
        Crear envio Full
      </button>
    </AsyncForm>
  );
}
