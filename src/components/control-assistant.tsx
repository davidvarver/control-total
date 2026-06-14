"use client";

import { FormEvent, useRef, useState } from "react";
import Link from "next/link";
import { Bot, Loader2, MessageCircle, Send, X } from "lucide-react";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  links?: Array<{ label: string; href: string }>;
  denied?: boolean;
};

const starterQuestions = [
  "Que hago hoy?",
  "Como mapeo un SKU?",
  "Por que una venta salio en perdida?",
  "Como comparo dos SKUs?",
];

export function ControlAssistant({ initialOpen = false }: { initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Soy Ayuda (beta) de Control Total. Te puedo explicar donde hacer cada cosa y llevarte a la pantalla correcta. Solo respondo con informacion que tu usuario tenga permiso de ver.",
      links: [
        { label: "Guia", href: "/guia" },
        { label: "Alertas", href: "/alertas" },
      ],
    },
  ]);
  const inputRef = useRef<HTMLInputElement>(null);

  async function ask(message: string) {
    const question = message.trim();
    if (!question || loading) return;

    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", text: question },
    ]);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question }),
      });
      const data = (await response.json()) as {
        answer?: string;
        links?: Array<{ label: string; href: string }>;
        denied?: boolean;
        error?: string;
      };

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: data.answer ?? data.error ?? "No pude responder eso ahorita.",
          links: data.links ?? [],
          denied: data.denied,
        },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: "No pude conectar con el asistente. Intenta otra vez.",
        },
      ]);
    } finally {
      setLoading(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(input);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ct-assistant-trigger fixed bottom-4 right-4 z-50 inline-flex h-12 items-center gap-2 rounded-full px-4 text-sm font-black transition hover:-translate-y-0.5"
      >
        <MessageCircle size={18} />
        Ayuda (beta)
      </button>

      {open ? (
        <div className="fixed inset-0 z-[70] bg-slate-950/35 backdrop-blur-[8px]">
          <aside className="ct-assistant-panel ml-auto flex h-full w-full max-w-[440px] flex-col">
            <header className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-200/15 text-blue-100 ring-1 ring-blue-100/20">
                  <Bot size={20} />
                </div>
                <div>
                  <h2 className="font-black text-white">Ayuda (beta) Control Total</h2>
                  <p className="mt-1 text-xs font-semibold leading-5 text-slate-400">
                    Guia segura por permisos. Aun no es IA completa ni ejecuta cambios sola.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-2 text-slate-400 hover:bg-white/10 hover:text-white"
                aria-label="Cerrar asistente"
              >
                <X size={18} />
              </button>
            </header>

            <div className="flex-1 space-y-3 overflow-y-auto bg-white/[0.025] px-4 py-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[86%] rounded-lg border px-3 py-2 text-sm leading-6 ${
                      message.role === "user"
                        ? "border-blue-700 bg-blue-700 text-white"
                        : message.denied
                          ? "border-amber-200/30 bg-amber-300/10 text-amber-100"
                          : "border-white/10 bg-white/[0.07] text-slate-100"
                    }`}
                  >
                    <p className="font-medium">{message.text}</p>
                    {message.links && message.links.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {message.links.map((link) => (
                          <Link
                            key={`${message.id}-${link.href}`}
                            href={link.href}
                            onClick={() => setOpen(false)}
                            className="rounded-md border border-white/10 bg-white/[0.08] px-2.5 py-1.5 text-xs font-black text-blue-100 hover:bg-white/[0.13]"
                          >
                            {link.label}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
              {loading ? (
                <div className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.07] px-3 py-2 text-sm font-semibold text-slate-300">
                  <Loader2 size={16} className="animate-spin" />
                  Pensando
                </div>
              ) : null}
            </div>

            <div className="border-t border-white/10 bg-white/[0.035] px-4 py-3">
              <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
                {starterQuestions.map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => void ask(question)}
                    className="shrink-0 rounded-full border border-white/10 bg-white/[0.07] px-3 py-1.5 text-xs font-black text-slate-200 hover:bg-white/[0.12]"
                  >
                    {question}
                  </button>
                ))}
              </div>
              <form onSubmit={onSubmit} className="flex gap-2">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Pregunta como hacer algo..."
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.06] px-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-blue-200/70"
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-blue-200 text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Enviar pregunta"
                >
                  <Send size={17} />
                </button>
              </form>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
