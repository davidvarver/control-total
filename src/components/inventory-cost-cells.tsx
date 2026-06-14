"use client";

import { useMemo, useState, useTransition } from "react";

const costNumber = new Intl.NumberFormat("es-MX", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});

type InventoryCostCellsProps = {
  masterSku: string;
  initialAverageUnitCost: number;
  physicalQuantity: number;
};

export function InventoryCostCells({
  masterSku,
  initialAverageUnitCost,
  physicalQuantity,
}: InventoryCostCellsProps) {
  const [cost, setCost] = useState(initialAverageUnitCost);
  const [draftCost, setDraftCost] = useState(String(initialAverageUnitCost || ""));
  const [isEditing, setIsEditing] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const inventoryValue = useMemo(
    () => physicalQuantity * cost,
    [cost, physicalQuantity],
  );

  function saveCost() {
    startTransition(async () => {
      setStatus("idle");
      setMessage("");

      const nextCost = parseDecimalInput(draftCost);
      if (!Number.isFinite(nextCost) || nextCost < 0) {
        setStatus("error");
        setMessage("Costo invalido");
        return;
      }

      const formData = new FormData();
      formData.set("masterSku", masterSku);
      formData.set("averageUnitCost", String(nextCost));

      const response = await fetch("/api/products/cost", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "X-Requested-With": "fetch",
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        setStatus("error");
        setMessage(error?.error ?? "No se pudo guardar");
        return;
      }

      const payload = (await response.json()) as {
        averageUnitCost?: number;
      };
      const savedCost = payload.averageUnitCost ?? nextCost;
      setCost(savedCost);
      setDraftCost(String(savedCost || ""));
      setIsEditing(false);
      setStatus("saved");
      setMessage("Guardado");
      window.setTimeout(() => {
        setStatus("idle");
        setMessage("");
      }, 1800);
    });
  }

  return (
    <>
      <td className="px-4 py-3">
        {isEditing ? (
          <div className="flex min-w-[220px] flex-wrap items-center gap-2">
            <input
              value={draftCost}
              onChange={(event) => setDraftCost(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  saveCost();
                }
                if (event.key === "Escape") {
                  setDraftCost(String(cost || ""));
                  setIsEditing(false);
                  setStatus("idle");
                  setMessage("");
                }
              }}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.0001"
              className="h-9 w-28 rounded-md border border-zinc-300 px-2 text-sm outline-none focus:border-zinc-950"
              autoFocus
            />
            <button
              type="button"
              onClick={saveCost}
              disabled={isPending}
              className="h-9 rounded-md bg-zinc-950 px-3 text-xs font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Guardando" : "Guardar"}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraftCost(String(cost || ""));
                setIsEditing(false);
                setStatus("idle");
                setMessage("");
              }}
              className="h-9 rounded-md border border-zinc-300 px-3 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <div className="flex min-w-[160px] items-center gap-2">
            <span
              className={`font-semibold ${
                cost > 0 ? "text-zinc-950" : "text-amber-700"
              }`}
            >
              {cost > 0 ? costNumber.format(roundUpToTwoDecimals(cost)) : "Sin costo"}
            </span>
            <button
              type="button"
              onClick={() => {
                setIsEditing(true);
                setStatus("idle");
                setMessage("");
              }}
              className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
            >
              Editar
            </button>
          </div>
        )}
        {message ? (
          <p
            className={`mt-1 text-xs font-medium ${
              status === "error" ? "text-red-600" : "text-emerald-700"
            }`}
          >
            {message}
          </p>
        ) : null}
      </td>
      <td className="px-4 py-3 font-semibold">{money.format(inventoryValue)}</td>
    </>
  );
}

function roundUpToTwoDecimals(value: number) {
  return Math.ceil(value * 100) / 100;
}

function parseDecimalInput(value: string) {
  return Number(value.trim().replace(",", ".") || 0);
}
