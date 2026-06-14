"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

type BulkOrderRepairControlsProps = {
  backPath: string;
  checkboxSelector: string;
  formId: string;
  limit?: number;
};

export function BulkOrderRepairControls({
  backPath,
  checkboxSelector,
  formId,
  limit = 25,
}: BulkOrderRepairControlsProps) {
  const [selectedCount, setSelectedCount] = useState(0);
  const [availableCount, setAvailableCount] = useState(0);

  useEffect(() => {
    const checkboxes = getCheckboxes(checkboxSelector);

    function updateCount() {
      const current = getCheckboxes(checkboxSelector);
      setAvailableCount(current.length);
      setSelectedCount(current.filter((checkbox) => checkbox.checked).length);
    }

    updateCount();
    checkboxes.forEach((checkbox) => {
      checkbox.addEventListener("change", updateCount);
    });

    return () => {
      checkboxes.forEach((checkbox) => {
        checkbox.removeEventListener("change", updateCount);
      });
    };
  }, [checkboxSelector]);

  function toggleAll(checked: boolean) {
    const checkboxes = getCheckboxes(checkboxSelector).slice(0, limit);
    checkboxes.forEach((checkbox) => {
      checkbox.checked = checked;
    });
    setSelectedCount(checked ? checkboxes.length : 0);
    setAvailableCount(getCheckboxes(checkboxSelector).length);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    if (selectedCount === 0) {
      event.preventDefault();
      window.alert("Selecciona al menos una venta para recalcular.");
      return;
    }

    if (
      !window.confirm(
        `Se recalcularan ${selectedCount} venta(s) con Meli/Mercado Pago. Continua?`,
      )
    ) {
      event.preventDefault();
    }
  }

  return (
    <form
      id={formId}
      action="/api/integrations/meli/repair-audit"
      method="post"
      onSubmit={submit}
      className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-950"
    >
      <input type="hidden" name="back" value={backPath} />
      <input type="hidden" name="limit" value={String(limit)} />
      <label className="inline-flex h-9 items-center gap-2 rounded-md border border-blue-200 bg-white px-3 text-xs font-semibold text-blue-800">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-blue-300 text-blue-700 focus:ring-blue-700"
          disabled={availableCount === 0}
          checked={availableCount > 0 && selectedCount === Math.min(availableCount, limit)}
          onChange={(event) => toggleAll(event.currentTarget.checked)}
        />
        Seleccionar todas
      </label>
      <button className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white hover:bg-blue-800">
        <RefreshCw size={15} />
        Actualizar seleccionadas
      </button>
      <span className="text-xs font-medium text-blue-800">
        {selectedCount} seleccionada(s). Maximo {limit} por tanda.
      </span>
    </form>
  );
}

function getCheckboxes(selector: string) {
  return Array.from(document.querySelectorAll<HTMLInputElement>(selector)).filter(
    (checkbox) => !checkbox.disabled,
  );
}
