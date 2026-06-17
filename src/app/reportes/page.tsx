export const dynamic = "force-dynamic";

import Link from "next/link";
import { Suspense } from "react";
import {
  AlertTriangle,
  BadgeDollarSign,
  Download,
  FileSpreadsheet,
  Package,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/server/auth-store";
import { buildStoreDashboard } from "@/lib/server/dashboard-store";
import { buildRestockReport } from "@/lib/server/restock-report";

const number = new Intl.NumberFormat("es-MX");
const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});

export default async function ReportsPage() {
  const user = await requirePermission("profit.view");
  return (
    <AppShell
      active="reportes"
      title="Reportes"
      subtitle="Descargas y vistas ejecutivas sin saturar inventario ni ventas."
      organization={user.organizationName}
      userEmail={user.email}
      actions={<ReportsActions />}
    >
      <Suspense fallback={<ReportsPageSkeleton />}>
        <ReportsContent />
      </Suspense>
    </AppShell>
  );
}

async function ReportsContent() {
  const [dashboard, restock] = await Promise.all([
    buildStoreDashboard(),
    buildRestockReport(),
  ]);

  return (
    <div className="ct-ops-page">
      <ReportsHero
        orders={dashboard.kpis.meliOrders}
        netProfit={dashboard.kpis.netProfit}
        suggestedUnits={restock.totals.suggestedUnits}
      />

      <section className="ct-ops-kpi-grid">
        <Kpi
          label="Venta Meli"
          value={money.format(dashboard.kpis.grossMeliSales)}
          detail={`${number.format(dashboard.kpis.meliOrders)} ventas importadas.`}
          icon={<ShoppingCart size={18} />}
        />
        <Kpi
          label="Utilidad final"
          value={money.format(dashboard.kpis.netProfit)}
          detail={`${number.format(dashboard.kpis.marginPercent)}% margen final.`}
          icon={<BadgeDollarSign size={18} />}
          tone={dashboard.kpis.netProfit >= 0 ? "green" : "red"}
        />
        <Kpi
          label="Pendientes criticos"
          value={number.format(dashboard.kpis.productsWithoutCost + dashboard.kpis.unmappedItems)}
          detail="Costos o SKUs que frenan utilidad confiable."
          icon={<AlertTriangle size={18} />}
          tone={
            dashboard.kpis.productsWithoutCost + dashboard.kpis.unmappedItems > 0
              ? "amber"
              : "green"
          }
        />
        <Kpi
          label="Resurtido sugerido"
          value={number.format(restock.totals.suggestedUnits)}
          detail={money.format(restock.totals.suggestedValue)}
          icon={<TrendingUp size={18} />}
        />
      </section>

      <ReportSection
        title="Operacion diaria"
        detail="Lo que el equipo revisa para entender ventas, utilidad e inventario."
      >
        <ReportCard
          title="Ventas"
          detail="Ordenes importadas, estados, cargos reales, fotos e items."
          href="/ventas"
          exportHref="/api/export/ventas"
          icon={<ShoppingCart size={20} />}
        />
        <ReportCard
          title="Utilidad"
          detail="Utilidad por venta y mes, con gastos operativos."
          href="/utilidad"
          exportHref="/api/export/utilidad"
          icon={<BadgeDollarSign size={20} />}
          tone="green"
        />
        <ReportCard
          title="Inventario"
          detail="Stock por SKU maestro, costo promedio, valor y bodega."
          href="/inventario"
          exportHref="/api/export/inventario"
          icon={<Package size={20} />}
        />
      </ReportSection>

      <ReportSection
        title="Decisiones"
        detail="Vistas para corregir riesgos, comprar mejor y no confiar en datos incompletos."
      >
        <ReportCard
          title="Resurtido"
          detail="Compra sugerida segun ventas de 90 dias."
          href="/resurtido"
          exportHref="/api/export/resurtido"
          icon={<TrendingUp size={20} />}
          tone="amber"
        />
        <ReportCard
          title="Alertas"
          detail="Riesgos historicos, problemas de inventario, utilidad y cargos raros."
          href="/alertas"
          exportHref={null}
          icon={<AlertTriangle size={20} />}
          tone="red"
        />
        <ReportCard
          title="Historial mensual"
          detail="Utilidad final por mes desde snapshots, sin recalcular todo el historico."
          href="/utilidad#historial-mensual"
          exportHref={null}
          icon={<FileSpreadsheet size={20} />}
        />
      </ReportSection>

      <ReportSection
        title="Control"
        detail="Herramientas de revision cuando algo no cuadra o falta para cerrar numeros."
      >
        <ReportCard
          title="Auditoria"
          detail="Ventas con datos inconsistentes para reparar contra Meli."
          href="/auditoria"
          exportHref={null}
          icon={<AlertTriangle size={20} />}
        />
        <ReportCard
          title="Pendientes"
          detail="Costos, equivalencias y billing que faltan para confiar."
          href="/setup"
          exportHref={null}
          icon={<FileSpreadsheet size={20} />}
        />
      </ReportSection>
    </div>
  );
}

function ReportsHero({
  orders,
  netProfit,
  suggestedUnits,
}: {
  orders: number;
  netProfit: number;
  suggestedUnits: number;
}) {
  return (
    <section className="ct-dashboard-hero grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:p-8">
      <div>
        <p className="ct-ops-kicker">Centro de reportes</p>
        <h2 className="ct-dashboard-hero-title mt-3">
          Ventas y utilidad viven aqui
        </h2>
        <p className="ct-dashboard-hero-copy mt-3 max-w-3xl">
          Reportes agrupa dinero, operacion y decisiones para que el menu principal
          no se vuelva una lista eterna.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link href="/ventas" prefetch={false} className="ct-button ct-button-primary">
            <ShoppingCart size={16} />
            Ver ventas
          </Link>
          <Link href="/utilidad" prefetch={false} className="ct-button ct-button-secondary">
            <BadgeDollarSign size={16} />
            Ver utilidad
          </Link>
          <Link href="/resurtido" prefetch={false} className="ct-button ct-button-secondary">
            <TrendingUp size={16} />
            Resurtido
          </Link>
        </div>
      </div>

      <div className="ct-dashboard-hero-summary">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
          Resumen
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <HeroStat label="Ventas" value={number.format(orders)} />
          <HeroStat label="Utilidad" value={money.format(netProfit)} />
          <HeroStat label="Resurtido" value={number.format(suggestedUnits)} />
        </div>
      </div>
    </section>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-black/15 px-3 py-3">
      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 truncate text-base font-black text-white">{value}</p>
    </div>
  );
}

function ReportsActions() {
  return (
    <>
      <Link href="/utilidad" prefetch={false} className="ct-button ct-button-primary">
        <BadgeDollarSign size={16} />
        Ver utilidad
      </Link>
      <Link href="/api/export/ventas" className="ct-button ct-button-primary">
        <Download size={16} />
        Exportar ventas
      </Link>
      <Link href="/api/export/inventario" className="ct-button ct-button-secondary">
        Inventario CSV
      </Link>
    </>
  );
}

function ReportsPageSkeleton() {
  return (
    <div className="ct-ops-page">
      <section className="ct-ops-kpi-grid">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="ct-ops-kpi h-32 animate-pulse" />
        ))}
      </section>
      <section className="grid gap-4 xl:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((item) => (
          <div key={item} className="ct-ops-panel h-44 animate-pulse" />
        ))}
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  detail,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  tone?: "neutral" | "green" | "amber" | "red";
}) {
  const toneClass = {
    neutral: "",
    green: "is-ok",
    amber: "is-warn",
    red: "is-danger",
  }[tone];

  return (
    <div className={`ct-ops-kpi ${toneClass}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="ct-ops-kpi-label">{label}</p>
        <div className="ct-ops-icon">{icon}</div>
      </div>
      <p className="ct-ops-kpi-value">{value}</p>
      <p className="ct-ops-kpi-detail">{detail}</p>
    </div>
  );
}

function ReportSection({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <p className="ct-ops-kicker">{title}</p>
        <p className="ct-ops-copy mt-1">{detail}</p>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">{children}</div>
    </section>
  );
}

function ReportCard({
  title,
  detail,
  href,
  exportHref,
  icon,
  tone = "neutral",
}: {
  title: string;
  detail: string;
  href: string;
  exportHref: string | null;
  icon: React.ReactNode;
  tone?: "neutral" | "green" | "amber" | "red";
}) {
  const toneClass = {
    neutral: "",
    green: "is-ok",
    amber: "is-warn",
    red: "is-danger",
  }[tone];

  return (
    <article className={`ct-ops-panel p-4 ${toneClass}`}>
      <div className="flex items-start gap-3">
        <div className="ct-ops-icon">
          {icon}
        </div>
        <div className="min-w-0">
          <h2 className="ct-ops-title">{title}</h2>
          <p className="ct-ops-copy">{detail}</p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Link href={href} className="ct-button ct-button-primary">
          Abrir
        </Link>
        {exportHref ? (
          <Link href={exportHref} className="ct-button ct-button-secondary">
            Descargar CSV
          </Link>
        ) : null}
      </div>
    </article>
  );
}
