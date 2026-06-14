"use client";

import { Search } from "lucide-react";

export function GlobalSearch() {
  return (
    <form action="/buscar" className="w-full xl:w-auto">
      <label className="ct-global-search flex h-11 items-center gap-2 rounded-lg px-3 text-sm transition">
        <Search size={16} />
        <input
          name="q"
          placeholder="Buscar SKU, orden o producto"
          className="w-full min-w-0 bg-transparent outline-none placeholder:text-slate-400 xl:w-64"
        />
      </label>
    </form>
  );
}
