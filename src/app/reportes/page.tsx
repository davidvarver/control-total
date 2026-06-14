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

      <section className="grid gap-4 xl:grid-cols-3">
        <ReportCard
          title="Utilidad"
          detail="Utilidad por venta y mes, con gastos operativos."
          href="/utilidad"
          exportHref="/api/export/utilidad"
          icon={<BadgeDollarSign size={20} />}
          tone="green"
        />
        <ReportCard
          title="Ventas"
          detail="Ventas importadas, estados, cargos reales y items."
          href="/ventas"
          exportHref="/api/export/ventas"
          icon={<ShoppingCart size={20} />}
        />
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
        <ReportCard
          title="Inventario"
          detail="Stock por SKU maestro, costo promedio, valor y bodega."
          href="/inventario"
          exportHref="/api/export/inventario"
          icon={<Package size={20} />}
        />
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
      </section>
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
