"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import type { ControlAssistant } from "./control-assistant";

type AssistantComponent = typeof ControlAssistant;

export function ControlAssistantLoader() {
  const [Assistant, setAssistant] = useState<AssistantComponent | null>(null);
  const [loading, setLoading] = useState(false);

  async function openAssistant() {
    if (Assistant || loading) {
      return;
    }

    setLoading(true);
    const mod = await import("./control-assistant");
    setAssistant(() => mod.ControlAssistant);
    setLoading(false);
  }

  if (Assistant) {
    return <Assistant initialOpen />;
  }

  return (
    <button
      type="button"
      onClick={() => void openAssistant()}
      className="ct-assistant-trigger fixed bottom-4 right-4 z-50 inline-flex h-12 items-center gap-2 rounded-full px-4 text-sm font-black transition hover:-translate-y-0.5"
    >
      <MessageCircle size={18} />
      {loading ? "Cargando" : "Ayuda (beta)"}
    </button>
  );
}
