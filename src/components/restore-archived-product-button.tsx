"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RotateCcw } from "lucide-react";

type RestoreArchivedProductButtonProps = {
  masterSku: string;
};

export function RestoreArchivedProductButton({
  masterSku,
}: RestoreArchivedProductButtonProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function restore() {
    startTransition(async () => {
      setError("");
      const formData = new FormData();
      formData.set("masterSku", masterSku);

      const response = await fetch("/api/products/restore", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "X-Requested-With": "fetch",
        },
        body: formData,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(payload?.error ?? "No se pudo desarchivar.");
        return;
      }

      router.refresh();
    });
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={restore}
        disabled={isPending}
        className="inline-flex h-8 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 text-xs font-black text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
      >
        <RotateCcw size={14} />
        {isPending ? "Restaurando" : "Desarchivar"}
      </button>
      {error ? <p className="text-xs font-semibold text-red-600">{error}</p> : null}
    </div>
  );
}
