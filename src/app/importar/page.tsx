export const dynamic = "force-dynamic";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  BadgeDollarSign,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  Store,
  Warehouse,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ImportPreviewForm } from "@/components/import-preview-form";
import { requirePermission } from "@/lib/server/auth-store";
import { readLocalStore } from "@/lib/server/local-store";

const importItems = [
  {
    id: "inventario",
    title: "Inventario inicial",
    detail: "Carga cuanto tienes en tu bodega por SKU maestro.",
    columns: ["SKU maestro", "Cantidad"],
    example: "ABRAZADERA ENGRASADOR | 821",
    action: "/api/import/inventory-quantities",
    importType: "inventario",
    template: "/api/templates/inventario",
  },
  {
    id: "equivalencias",
    title: "Equivalencias SKU online",
    detail: "Le dice al sistema que descuenta cada publicacion o variante.",
    columns: ["SKU online", "SKU maestro", "Multiplicador"],
    example: "SILLA.02 10PZ | SILLA.02 | 10",
    action: "/api/import/sku-mappings",
    importType: "equivalencias",
    template: "/api/templates/equivalencias",
  },
  {
    id: "costos",
    title: "Costos promedio",
    detail: "Carga el costo unitario para calcular utilidad real.",
    columns: ["SKU maestro", "Costo promedio"],
    example: "CASCO MOTO | 118.50",
    action: "/api/import/product-costs",
    importType: "costos",
    template: "/api/templates/costos",
  },
  {
    id: "full",
    title: "Envios a Full FIFO",
    detail: "Carga un envio completo. El costo total se reparte por volumen entre los SKUs.",
    columns: [
      "SKU maestro",
      "Piezas",
      "Volumen total",
      "Costo envio del embarque",
      "Fecha",
      "Folio",
    ],
    example: "LONCHERA | 100 | 250000 cm3 | envio FULL-001 de $1200",
    action: "/api/import/full-layers",
    importType: "full",
    template: "/api/templates/full",
  },
];

export default async function ImportPage() {
  const user = await requirePermission("imports.write");
  const store = await readLocalStore();
  const activeProducts = store.products.filter((product) => product.isActive !== false);
  const hasMeliAccount = store.marketplaceAccounts.some(
    (account) => account.channel === "mercado_libre" && account.status === "connected",
  );
  const hasMeliOrders = store.marketplaceOrders.some(
    (order) => order.channel === "mercado_libre",
  );
  const hasProducts = activeProducts.length > 0;
  const hasMappings = store.onlineSkus.length > 0;
  const productsWithoutCost = activeProducts.filter(
    (product) => !product.averageUnitCost || product.averageUnitCost <= 0,
  ).length;

  return (
    <AppShell
      active="importar"
      title="Cargar datos"
      subtitle="Elige que informacion quieres actualizar, baja la plantilla correcta y sube tu Excel."
      organization={store.organization.name}
      userEmail={user.email}
      actions={
        <Link
          href="/setup"
          className="inline-flex h-10 items-center rounded-md bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Ver pendientes
        </Link>
      }
    >
      <section className="rounded-lg border border-blue-200 bg-blue-50 p-5">
        <div className="grid gap-3 md:grid-cols-3">
          <StepPill numberLabel="1" title="Baja plantilla" detail="Usa el formato correcto." />
          <StepPill numberLabel="2" title="Llena Excel" detail="Pega tus datos reales." />
          <StepPill numberLabel="3" title="Importa" detail="El sistema te manda a pendientes si algo falta." />
        </div>
      </section>

      <section
        id="sin-excel"
        className="scroll-mt-28 rounded-lg border border-slate-200 bg-white"
      >
        <div className="border-b border-slate-200 px-5 py-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">
            No tengo Excel
          </p>
          <h2 className="mt-1 text-xl font-black text-slate-950">
            Empieza desde Mercado Libre y arma la base poco a poco
          </h2>
          <p className="mt-1 max-w-3xl text-sm font-medium leading-6 text-slate-500">
            No necesitas tener todo ordenado el primer dia. Conecta Meli, crea SKU maestro desde lo vendido, cuenta por producto y completa costos conforme salgan pendientes.
          </p>
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-5">
          <NoExcelAction
            step="1"
            title="Conecta Meli"
            detail={hasMeliAccount ? "Cuenta conectada" : "Trae ventas y SKUs reales"}
            href="/meli"
            icon={<Store size={18} />}
            done={hasMeliAccount}
          />
          <NoExcelAction
            step="2"
            title="Crea SKUs"
            detail={
              hasMappings
                ? "Ya hay equivalencias"
                : hasMeliOrders
                  ? "Usa SKUs sin mapear"
                  : "Aparecen al traer ventas"
            }
            href="/meli#skus-sin-mapear"
            icon={<ClipboardCheck size={18} />}
            done={hasMappings}
          />
          <NoExcelAction
            step="3"
            title="Cuenta por SKU"
            detail={hasProducts ? "Ya hay productos base" : "Crea y cuenta pocos al dia"}
            href="/inventario"
            icon={<Warehouse size={18} />}
            done={hasProducts}
          />
          <NoExcelAction
            step="4"
            title="Pon costos"
            detail={
              hasProducts && productsWithoutCost === 0
                ? "Costos completos"
                : `${productsWithoutCost} sin costo`
            }
            href="/inventario?stock=no_cost"
            icon={<BadgeDollarSign size={18} />}
            done={hasProducts && productsWithoutCost === 0}
          />
          <NoExcelAction
            step="5"
            title="Revisa utilidad"
            detail="Cuando lo basico ya cuadra"
            href="/utilidad"
            icon={<CheckCircle2 size={18} />}
            done={hasProducts && hasMappings && productsWithoutCost === 0}
          />
        </div>
      </section>

      <section className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-white px-5 py-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
            Tengo Excel
          </p>
          <h2 className="mt-1 text-xl font-black text-slate-950">
            Usa plantillas para cargar mucho de golpe
          </h2>
          <p className="mt-1 text-sm font-medium leading-6 text-slate-500">
            Si ya tienes inventario, equivalencias o costos, este es el camino mas rapido. Si algo no coincide, aparecera en pendientes.
          </p>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
        {importItems.map((item) => (
          <div
            key={item.title}
            id={item.id}
            className="scroll-mt-28 rounded-lg border border-slate-200 bg-white p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-100 text-slate-600">
                <FileSpreadsheet size={20} />
                </div>
                <div>
                  <h2 className="font-semibold">{item.title}</h2>
                  <p className="mt-1 text-sm text-slate-500">{item.detail}</p>
                </div>
              </div>
              <Link
                href={item.template}
                className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-800 hover:bg-blue-100"
              >
                <Download size={16} />
                Plantilla
              </Link>
            </div>
            <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="font-semibold text-slate-800">Tu Excel debe traer:</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {item.columns.map((column) => (
                  <span
                    key={column}
                    className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200"
                  >
                    {column}
                  </span>
                ))}
              </div>
              <p className="mt-2 font-mono text-xs text-slate-500">
                Ejemplo: {item.example}
              </p>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-3">
              <MiniStep numberLabel="1" label="Plantilla" doneText="Formato listo" />
              <MiniStep numberLabel="2" label="Excel" doneText="Selecciona archivo" />
              <MiniStep numberLabel="3" label="Importar" doneText="Procesar" />
            </div>
            <ImportPreviewForm action={item.action} importType={item.importType} />
            <Link
              href="/setup"
              className="mt-3 inline-flex items-center gap-1 text-xs font-black uppercase tracking-[0.14em] text-blue-700"
            >
              Ver pendientes despues de importar
              <ArrowRight size={14} />
            </Link>
          </div>
        ))}
        </div>
      </section>
    </AppShell>
  );
}

function NoExcelAction({
  step,
  title,
  detail,
  href,
  icon,
  done,
}: {
  step: string;
  title: string;
  detail: string;
  href: string;
  icon: ReactNode;
  done: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-lg border p-4 transition hover:-translate-y-0.5 hover:shadow-sm ${
        done
          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
          : "border-blue-200 bg-blue-50/50 text-blue-950"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-md text-xs font-black ${
            done ? "bg-white text-emerald-700" : "bg-blue-700 text-white"
          }`}
        >
          {done ? <CheckCircle2 size={16} /> : step}
        </span>
        <span className={done ? "text-emerald-700" : "text-blue-700"}>{icon}</span>
      </div>
      <h3 className="mt-4 font-black">{title}</h3>
      <p className="mt-1 text-sm font-medium leading-5 opacity-75">{detail}</p>
      <p className="mt-4 inline-flex items-center gap-1 text-xs font-black uppercase tracking-[0.12em]">
        Abrir
        <ArrowRight size={13} />
      </p>
    </Link>
  );
}

function StepPill({
  numberLabel,
  title,
  detail,
}: {
  numberLabel: string;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-white/80 p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-700 text-sm font-black text-white">
        {numberLabel}
      </span>
      <div>
        <p className="font-black text-blue-950">{title}</p>
        <p className="text-xs font-semibold text-blue-700">{detail}</p>
      </div>
    </div>
  );
}

function MiniStep({
  numberLabel,
  label,
  doneText,
}: {
  numberLabel: string;
  label: string;
  doneText: string;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
        {numberLabel}. {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-700">{doneText}</p>
    </div>
  );
}
