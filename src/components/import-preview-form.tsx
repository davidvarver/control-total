"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { CheckCircle2, Eye, Upload } from "lucide-react";

type ImportPreviewFormProps = {
  action: string;
  importType: string;
};

type PreviewPayload = {
  count: number;
  examples: string[];
  warnings?: string[];
  summary: string;
};

export function ImportPreviewForm({ action, importType }: ImportPreviewFormProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function selectedFile() {
    const selected = inputRef.current?.files?.[0] ?? null;
    setFile(selected);
    setPreview(null);
    setMessage("");
    setError("");
  }

  function previewFile() {
    if (!file) {
      setError("Selecciona un Excel primero.");
      return;
    }

    const formData = new FormData();
    formData.set("type", importType);
    formData.set("file", file);
    setError("");
    setMessage("");

    startTransition(async () => {
      const response = await fetch("/api/import/preview", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "X-Requested-With": "fetch",
        },
        body: formData,
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setPreview(null);
        setError(payload?.error ?? "No se pudo previsualizar el Excel.");
        return;
      }

      setPreview(payload);
    });
  }

  function applyImport() {
    if (!file || !preview) {
      setError("Primero previsualiza el Excel.");
      return;
    }

    const accepted = window.confirm(
      `Se aplicaran ${preview.count} registros.\n\n${preview.summary}\n\nEsta accion cambiara los datos del sistema. Continua?`,
    );
    if (!accepted) {
      return;
    }

    const formData = new FormData();
    formData.set("file", file);
    setError("");
    setMessage("");

    startTransition(async () => {
      const response = await fetch(action, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "X-Requested-With": "fetch",
        },
        body: formData,
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setError(payload?.error ?? "No se pudo aplicar la importacion.");
        return;
      }

      setMessage(payload?.message ?? "Importacion aplicada.");
      setPreview(null);
      setFile(null);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <Upload size={16} />
          {file ? file.name : "Seleccionar Excel"}
          <input
            ref={inputRef}
            className="sr-only"
            name="file"
            type="file"
            accept=".xlsx,.xls"
            required
            onChange={selectedFile}
          />
        </label>
        <button
          type="button"
          className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          disabled={!file || isPending}
          onClick={previewFile}
        >
          <Eye size={16} />
          Previsualizar
        </button>
        <button
          type="button"
          className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          disabled={!preview || isPending}
          onClick={applyImport}
        >
          <CheckCircle2 size={16} />
          Confirmar e importar
        </button>
      </div>
      {preview ? (
        <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">
          <p className="font-black">{preview.summary}</p>
          {preview.examples.length > 0 ? (
            <ul className="mt-2 list-disc pl-5 text-xs font-semibold">
              {preview.examples.map((example) => (
                <li key={example}>{example}</li>
              ))}
            </ul>
          ) : null}
          {preview.warnings?.length ? (
            <div className="mt-2 text-xs font-semibold text-amber-800">
              {preview.warnings.join(" ")}
            </div>
          ) : null}
        </div>
      ) : null}
      {message ? (
        <p className="mt-2 text-xs font-semibold text-emerald-700">{message}</p>
      ) : null}
      {error ? <p className="mt-2 text-xs font-semibold text-red-700">{error}</p> : null}
    </div>
  );
}
