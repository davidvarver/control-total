export const dynamic = "force-dynamic";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BadgeDollarSign,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Database,
  PackageCheck,
  Search,
  ShieldCheck,
  ShoppingCart,
  Upload,
  Warehouse,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { formatDateTimeMx } from "@/lib/format";
import {
  getOrganizationAccess,
  requirePermission,
} from "@/lib/server/auth-store";
import { buildMvpStatus } from "@/lib/server/mvp-status";

const number = new Intl.NumberFormat("es-MX");

type GuideStep = {
  title: string;
  goal: string;
  how: string[];
  result: string;
  href: string;
  action: string;
  done: boolean;
  warning?: string;
};

type ModuleCard = {
  title: string;
  href: string;
  icon: ReactNode;
  useFor: string;
  keyActions: string[];
};

export default async function GuidePage() {
  const user = await requirePermission("dashboard.view");
  const status = await buildMvpStatus();
  const access = await getOrganizationAccess(user.organizationId);
  const steps = buildOperatingSteps(status, access.canWrite);
  const pendingSteps = steps.filter((step) => !step.done);
  const completedSteps = steps.length - pendingSteps.length;
  const progress =
    steps.length > 0 ? Math.round((completedSteps / steps.length) * 100) : 0;
  const nextStep = pendingSteps[0];
  const hasData =
    status.readiness.hasInventory ||
    status.readiness.hasMeliAccount ||
    status.readiness.hasMeliOrders ||
    status.counts.products > 0 ||
    status.counts.skuEquivalences > 0;
  const criticalCount =
    status.counts.unmappedSkus +
    status.counts.productsWithoutCost +
    status.counts.pendingCostImports +
    status.counts.staleBillingOrders;

  return (
    <AppShell
      active="guia"
      title="Guia de uso"
      subtitle="El camino corto para cargar datos, resolver pendientes y confiar en utilidad."
      organization={status.organization.name}
      userEmail={user.email}
      actions={
        <>
          <Link href="/importar" prefetch={false} className="ct-button ct-button-secondary">
            <Upload size={16} />
            Cargar datos
          </Link>
          <Link href="/setup" prefetch={false} className="ct-button ct-button-secondary">
            <ClipboardCheck size={16} />
            Por resolver
          </Link>
        </>
      }
    >
      <div className="ct-guide-page space-y-5">
        <section className="ct-guide-stage">
          <div className="flex min-h-full flex-col justify-between gap-8">
            <div>
              <p className="ct-guide-kicker">Mapa operativo</p>
              <h2 className="ct-guide-title mt-3 max-w-4xl text-3xl font-black leading-[0.98] sm:text-4xl lg:text-6xl">
                Primero ordena datos. Despues confia en utilidad.
              </h2>
              <p className="ct-guide-copy mt-4 max-w-3xl text-base">
                Esta pantalla no compite con Inicio. Te dice que falta para que
                inventario, Meli, costos y utilidad esten alineados antes de tomar
                decisiones.
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-end">
              <div>
                <div className="ct-guide-progress">
                  <span style={{ width: `${progress}%` }} />
                </div>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <p className="ct-guide-metric">{number.format(progress)}%</p>
                  <p className="pb-2 text-sm font-black text-slate-300">
                    {completedSteps}/{steps.length} pasos listos
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                <a href="#paso-a-paso" className="ct-button ct-button-primary">
                  Paso a paso
                </a>
                <a href="#rutinas" className="ct-button ct-button-secondary">
                  Rutinas
                </a>
              </div>
            </div>
          </div>

          <NextActionCard nextStep={nextStep} canWrite={access.canWrite} />
        </section>

        <section className="ct-guide-flow">
          <FlowLane
            icon={<Upload size={18} />}
            title="1. Datos"
            text="Inventario, equivalencias y costos."
            href="/importar"
            action="Cargar"
            done={status.readiness.hasInventory && status.readiness.hasCosts}
          />
          <FlowLane
            icon={<Database size={18} />}
            title="2. Meli"
            text="Cuenta conectada, ventas y Full."
            href="/meli"
            action="Conectar"
            done={status.readiness.hasMeliAccount && status.readiness.hasMeliOrders}
          />
          <FlowLane
            icon={<ClipboardCheck size={18} />}
            title="3. Pendientes"
            text="SKUs, costos y dinero por corregir."
            href="/setup"
            action="Resolver"
            done={criticalCount === 0}
          />
          <FlowLane
            icon={<BadgeDollarSign size={18} />}
            title="4. Utilidad"
            text="Margen real por venta y SKU."
            href="/utilidad"
            action="Analizar"
            done={status.readiness.hasCleanProfit}
          />
        </section>

        {!hasData ? (
          <section className="ct-guide-panel p-5">
            <p className="ct-guide-kicker">Cuenta nueva</p>
            <h2 className="ct-guide-title mt-2 text-2xl font-black">
              Todavia no hay suficiente informacion para detectar problemas.
            </h2>
            <p className="ct-guide-copy mt-2 max-w-3xl text-sm">
              Empieza cargando inventario y equivalencias o conecta Meli para que el
              sistema pueda encontrar SKUs sin mapear, costos faltantes y ventas por
              revisar.
            </p>
          </section>
        ) : null}

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_410px]">
          <div className="ct-guide-panel p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="ct-guide-kicker">Dos caminos validos</p>
                <h2 className="ct-guide-title mt-2 text-2xl font-black">
                  Arranca con Excel o construye desde ventas reales.
                </h2>
                <p className="ct-guide-copy mt-2 max-w-3xl text-sm">
                  Si ya tienes archivos, carga todo en lote. Si no, deja que las
                  ventas revelen los SKUs online y vas armando catalogo maestro sin
                  bloquear operacion.
                </p>
              </div>
              <Link href="/importar" prefetch={false} className="ct-button ct-button-primary">
                Cargar datos
                <ArrowRight size={16} />
              </Link>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <StartPathCard
                kicker="Si ya tienes archivos"
                title="Sube inventario, equivalencias y costos"
                text="Es el camino mas rapido: plantillas, errores claros y utilidad lista para revisar."
                links={[
                  { href: "/importar", label: "Cargar datos" },
                  { href: "/api/templates/inventario", label: "Plantilla inventario" },
                ]}
              />
              <StartPathCard
                kicker="Si no tienes Excel"
                title="Construye la base desde Meli"
                text="Conecta Meli, mapea los SKUs que aparezcan, cuenta por SKU y completa costos conforme avances."
                links={[
                  { href: "/meli", label: "Conectar Meli" },
                  { href: "/setup#mapear", label: "Crear/mapear SKUs" },
                  { href: "/inventario", label: "Contar por SKU" },
                  { href: "/inventario?stock=no_cost", label: "Completar costos" },
                ]}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <StatusTile
              label="SKUs sin mapear"
              value={status.counts.unmappedSkus}
              href="/setup#mapear"
            />
            <StatusTile
              label="Productos sin costo"
              value={status.counts.productsWithoutCost}
              href="/inventario?stock=no_cost"
            />
            <StatusTile
              label="Dinero Meli pendiente"
              value={status.counts.pendingBillingOrders}
              href="/ventas?pending=billing"
            />
            <StatusTile
              label="Pendientes criticos"
              value={criticalCount}
              href="/setup"
            />
          </div>
        </section>

        <section id="paso-a-paso" className="ct-guide-panel scroll-mt-24 overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-white/10 px-5 py-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="ct-guide-kicker">Paso a paso</p>
              <h2 className="ct-guide-title mt-2 text-2xl font-black">
                Lo minimo para operar sin adivinar.
              </h2>
            </div>
            <p className="ct-guide-copy max-w-xl text-sm">
              Cada paso apunta a una pantalla real. Si esta pendiente, tiene impacto
              directo en stock, dinero o utilidad.
            </p>
          </div>
          <div className="grid gap-3 p-4">
            {steps.map((step, index) => (
              <GuideStepRow key={step.title} index={index + 1} step={step} />
            ))}
          </div>
        </section>

        <section id="rutinas" className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px] scroll-mt-24">
          <div className="ct-guide-panel overflow-hidden">
            <div className="border-b border-white/10 px-5 py-5">
              <p className="ct-guide-kicker">Pantallas</p>
              <h2 className="ct-guide-title mt-2 text-2xl font-black">
                Que abrir segun lo que quieres resolver.
              </h2>
            </div>
            <div className="grid gap-3 p-4 md:grid-cols-2">
              {moduleCards.map((module) => (
                <ModuleCardView key={module.title} module={module} />
              ))}
            </div>
          </div>

          <aside className="space-y-3">
            <RoutineCard
              title="Diario"
              items={[
                "Entrar a Por resolver.",
                "Mapear SKUs y costos faltantes.",
                "Revisar ventas con perdida.",
                "Recalcular ventas raras.",
              ]}
            />
            <RoutineCard
              title="Semanal"
              items={[
                "Revisar Resurtido y stock bajo.",
                "Comparar SKUs parecidos.",
                "Auditar Full si no cuadra.",
                "Revisar cargos raros.",
              ]}
            />
            <RoutineCard
              title="Mensual"
              items={[
                "Cerrar utilidad mensual.",
                "Validar cargos Full.",
                "Actualizar gastos.",
                "Revisar margen por SKU.",
              ]}
            />
          </aside>
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <InfoPanel title="Como leer la utilidad" kicker="Formula">
            <div className="grid gap-3 md:grid-cols-2">
              <FormulaCard
                title="Recibido real"
                text="Lo que Meli deja despues de comisiones, envios, impuestos y ajustes confirmados."
              />
              <FormulaCard
                title="Costo producto"
                text="Costo promedio del SKU maestro multiplicado por piezas consumidas."
              />
              <FormulaCard
                title="Full mensual"
                text="Almacenamiento, antiguedad y otros cargos Full por periodo."
              />
              <FormulaCard
                title="Utilidad final"
                text="Recibido menos producto, cargos, Full mensual y gastos del negocio."
              />
            </div>
          </InfoPanel>

          <InfoPanel title="Conteo sin parar ventas" kicker="Inventario">
            <div className="grid gap-3">
              <Definition
                title="Fisico estimado"
                text="Lo que deberias ver en bodega: disponible real mas ventas apartadas."
              />
              <Definition
                title="Apartado ventas"
                text="Ventas Meli pagadas, no canceladas, sin guia detectada todavia."
              />
              <Definition
                title="Disponible real"
                text="Lo que queda libre para vender despues de descontar lo apartado."
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/inventario" prefetch={false} className="ct-button ct-button-primary">
                Ir a conteo
                <ArrowRight size={16} />
              </Link>
              <Link href="/inventario?stock=negative" prefetch={false} className="ct-button ct-button-secondary">
                Ver negativos
              </Link>
            </div>
          </InfoPanel>
        </section>

        <section className="ct-guide-panel p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="ct-guide-kicker">Estado de cuenta</p>
              <h2 className="ct-guide-title mt-2 text-2xl font-black">
                Datos reales de esta organizacion.
              </h2>
            </div>
            <div className="ct-guide-tag is-done">
              {access.canWrite ? "Activo para editar" : `Bloqueo ${access.lockMode}`}
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Metric label="Productos" value={status.counts.products} />
            <Metric label="Equivalencias" value={status.counts.skuEquivalences} />
            <Metric label="Ordenes Meli" value={status.counts.meliOrders} />
            <Metric label="Cuentas Meli" value={status.counts.meliAccounts} />
            <Metric
              label="Ultimo sync Full"
              value={
                status.dates.fullSyncedAt
                  ? formatDateTimeMx(status.dates.fullSyncedAt)
                  : "Pendiente"
              }
            />
            <Metric label="Pendientes clave" value={criticalCount} />
          </div>
        </section>

        <section className="ct-guide-panel p-5">
          <p className="ct-guide-kicker">Notas</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Note text="Las ventas se sincronizan por cron externo; si una venta puntual se ve rara, entra a su detalle y usa Recalcular esta venta." />
            <Note text="Full se actualiza por cron diario para conocer stock real en bodegas Meli y detectar diferencias contra lo esperado." />
            <Note text="Los cargos Full mensuales se sincronizan automaticamente cada dia 1 para el mes anterior." />
            <Note text="Para levantar inventario inicial con ventas activas, usa Conteo por SKU: captura fisico y el sistema descuenta ventas apartadas sin guia." />
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function NextActionCard({
  nextStep,
  canWrite,
}: {
  nextStep?: GuideStep;
  canWrite: boolean;
}) {
  return (
    <aside className={`ct-guide-next ${nextStep ? "ct-guide-alert" : "ct-guide-ok"} flex flex-col justify-between gap-5 p-5`}>
      <div>
        <div className="ct-guide-lane-icon">
          {nextStep ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
        </div>
        <p className="ct-guide-kicker mt-5">Siguiente accion</p>
        <h3 className="ct-guide-title mt-2 text-2xl font-black">
          {nextStep?.title ?? "Base operativa lista"}
        </h3>
        <p className="ct-guide-copy mt-2 text-sm">
          {nextStep?.goal ??
            "Los pasos base estan completos. Usa Inicio para operar diario y Utilidad para decidir que empujar."}
        </p>
      </div>
      <div>
        <p className="text-xs font-bold text-slate-400">
          Escritura: {canWrite ? "activa" : "bloqueada"}
        </p>
        {nextStep ? (
          <Link href={nextStep.href} prefetch={false} className="ct-button ct-button-primary mt-3 w-full">
            {nextStep.action}
            <ArrowRight size={16} />
          </Link>
        ) : (
          <Link href="/dashboard" prefetch={false} className="ct-button ct-button-primary mt-3 w-full">
            Ir a Inicio
            <ArrowRight size={16} />
          </Link>
        )}
      </div>
    </aside>
  );
}

function FlowLane({
  icon,
  title,
  text,
  href,
  action,
  done,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  href: string;
  action: string;
  done: boolean;
}) {
  return (
    <Link href={href} prefetch={false} className="ct-guide-card p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="ct-guide-lane-icon">{icon}</span>
        <span className={`ct-guide-tag ${done ? "is-done" : "is-pending"}`}>
          {done ? "Listo" : "Pendiente"}
        </span>
      </div>
      <h3 className="ct-guide-title mt-4 text-lg font-black">{title}</h3>
      <p className="ct-guide-copy mt-1 text-sm">{text}</p>
      <p className="mt-4 inline-flex items-center gap-2 text-sm font-black text-blue-200">
        {action}
        <ArrowRight size={14} />
      </p>
    </Link>
  );
}

function StartPathCard({
  kicker,
  title,
  text,
  links,
}: {
  kicker: string;
  title: string;
  text: string;
  links: Array<{ href: string; label: string }>;
}) {
  return (
    <div className="ct-guide-card p-4">
      <p className="ct-guide-kicker">{kicker}</p>
      <h3 className="ct-guide-title mt-2 text-xl font-black">{title}</h3>
      <p className="ct-guide-copy mt-2 text-sm">{text}</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            prefetch={false}
            className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.055] px-3 py-2 text-sm font-black text-blue-100 transition hover:bg-white/[0.09]"
          >
            {link.label}
            <ArrowRight size={14} />
          </Link>
        ))}
      </div>
    </div>
  );
}

function StatusTile({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href: string;
}) {
  const ok = value === 0;

  return (
    <Link
      href={href}
      prefetch={false}
      className={`ct-guide-status p-4 ${ok ? "ct-guide-ok" : "ct-guide-alert"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-black text-slate-200">{label}</p>
        {ok ? (
          <CheckCircle2 size={18} className="text-emerald-200" />
        ) : (
          <AlertTriangle size={18} className="text-yellow-200" />
        )}
      </div>
      <p className="ct-guide-title mt-3 text-3xl font-black">
        {number.format(value)}
      </p>
      <p className="ct-guide-copy mt-1 text-xs">{ok ? "Listo" : "Tocar para resolver"}</p>
    </Link>
  );
}

function GuideStepRow({ index, step }: { index: number; step: GuideStep }) {
  return (
    <div className="ct-guide-step">
      <span className={`ct-guide-step-index ${step.done ? "is-done" : ""}`}>
        {step.done ? <CheckCircle2 size={18} /> : index}
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="ct-guide-title text-lg font-black">{step.title}</h3>
          <span className={`ct-guide-tag ${step.done ? "is-done" : "is-pending"}`}>
            {step.done ? "Listo" : "Pendiente"}
          </span>
        </div>
        <p className="ct-guide-copy mt-1 text-sm">{step.goal}</p>
        <ol className="ct-guide-mini-list mt-3">
          {step.how.map((line) => (
            <li key={line} className="px-3 py-2 text-xs font-semibold leading-5">
              {line}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs font-black uppercase tracking-[0.14em] text-blue-200">
          {step.result}
        </p>
        {step.warning ? (
          <p className="ct-guide-warning mt-2 px-3 py-2 text-xs font-semibold leading-5">
            {step.warning}
          </p>
        ) : null}
      </div>
      <div className="flex items-start justify-start lg:justify-end">
        <Link href={step.href} prefetch={false} className="ct-button ct-button-primary w-full lg:w-auto">
          {step.action}
          <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}

function ModuleCardView({ module }: { module: ModuleCard }) {
  return (
    <Link href={module.href} prefetch={false} className="ct-guide-card p-4">
      <div className="flex items-start gap-3">
        <div className="ct-guide-lane-icon">{module.icon}</div>
        <div className="min-w-0">
          <h3 className="ct-guide-title font-black">{module.title}</h3>
          <p className="ct-guide-copy mt-1 text-sm">{module.useFor}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {module.keyActions.map((action) => (
          <span key={action} className="ct-guide-tag is-pending">
            {action}
          </span>
        ))}
      </div>
    </Link>
  );
}

function RoutineCard({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="ct-guide-panel p-4">
      <h2 className="ct-guide-title font-black">{title}</h2>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-sm font-semibold leading-6 text-slate-300">
            <CheckCircle2 size={16} className="mt-1 shrink-0 text-blue-200" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function InfoPanel({
  title,
  kicker,
  children,
}: {
  title: string;
  kicker: string;
  children: ReactNode;
}) {
  return (
    <section className="ct-guide-panel p-5">
      <p className="ct-guide-kicker">{kicker}</p>
      <h2 className="ct-guide-title mt-2 text-2xl font-black">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function FormulaCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="ct-guide-formula p-4">
      <h3 className="ct-guide-title font-black">{title}</h3>
      <p className="ct-guide-copy mt-1 text-sm">{text}</p>
    </div>
  );
}

function Definition({ title, text }: { title: string; text: string }) {
  return (
    <div className="ct-guide-definition p-4">
      <p className="ct-guide-kicker">{title}</p>
      <p className="ct-guide-copy mt-2 text-sm">{text}</p>
    </div>
  );
}

function Note({ text }: { text: string }) {
  return (
    <div className="ct-guide-note flex gap-2 px-3 py-2 text-sm font-semibold leading-6">
      <Search size={16} className="mt-1 shrink-0 text-blue-200" />
      <p>{text}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="ct-guide-card p-4">
      <p className="ct-guide-kicker">{label}</p>
      <p className="ct-guide-title mt-2 text-lg font-black">
        {typeof value === "number" ? number.format(value) : value}
      </p>
    </div>
  );
}

function buildOperatingSteps(
  status: Awaited<ReturnType<typeof buildMvpStatus>>,
  canWrite: boolean,
): GuideStep[] {
  return [
    {
      title: "Carga inventario maestro",
      goal: "Que el sistema conozca tus productos reales y cuanto stock tienes.",
      how: [
        "Ve a Cargar datos.",
        "Sube el Excel de inventario con SKU maestro y cantidad.",
        "Revisa duplicados o stock negativo.",
      ],
      result: `${number.format(status.counts.products)} productos cargados`,
      href: "/importar#inventario",
      action: "Cargar inventario",
      done: status.readiness.hasInventory,
    },
    {
      title: "Carga equivalencias de SKU",
      goal: "Que cada SKU de marketplace descuente el SKU maestro correcto.",
      how: [
        "Sube el Excel de equivalencias.",
        "Usa SKU online, SKU maestro y multiplicador.",
        "En kits, el multiplicador es cuantas piezas consume.",
      ],
      result: `${number.format(status.counts.skuEquivalences)} equivalencias cargadas`,
      href: "/importar#equivalencias",
      action: "Cargar equivalencias",
      done: status.readiness.hasMappings,
      warning:
        "Sin equivalencia, la venta no puede descontar inventario ni calcular utilidad completa.",
    },
    {
      title: "Carga costos promedio",
      goal: "Que la utilidad se calcule con costo real de producto.",
      how: [
        "Sube el Excel de costos.",
        "Liga cualquier costo que no coincida exacto.",
        "Descarta filas que no sean productos reales.",
      ],
      result: `${number.format(status.counts.productsWithoutCost)} productos sin costo`,
      href: "/inventario?stock=no_cost",
      action: "Ver costos faltantes",
      done: status.readiness.hasCosts,
      warning:
        "Si falta costo, el sistema puede mostrar utilidad incompleta o demasiado optimista.",
    },
    {
      title: "Conecta Mercado Libre",
      goal: "Traer ventas, cargos, pagos y datos operativos desde Meli.",
      how: [
        "Entra a Mercado Libre.",
        "Conecta la cuenta.",
        "El cron externo importa ventas automaticamente.",
      ],
      result: `${number.format(status.counts.meliAccounts)} cuenta(s) conectada(s)`,
      href: "/meli",
      action: "Abrir Mercado Libre",
      done: status.readiness.hasMeliAccount,
    },
    {
      title: "Revisa ventas sincronizadas",
      goal: "Importar ventas para calcular utilidad, stock vendido y pendientes.",
      how: [
        "El cron externo trae ventas y billing disponible.",
        "Si una venta se ve rara, entra al detalle.",
        "Recalcula cuando Meli ya tenga dinero final.",
      ],
      result: `${number.format(status.counts.meliOrders)} ordenes importadas`,
      href: "/ventas",
      action: "Ver ventas",
      done: status.readiness.hasMeliOrders,
    },
    {
      title: "Resuelve pendientes",
      goal: "Limpiar lo que impide confiar en inventario y utilidad.",
      how: [
        "Entra a Por resolver.",
        "Mapea SKUs pendientes.",
        "Liga costos y revisa billing viejo.",
      ],
      result: `${number.format(status.counts.unmappedSkus + status.counts.pendingCostImports + status.counts.staleBillingOrders)} pendientes clave`,
      href: "/setup",
      action: "Ir a pendientes",
      done:
        status.counts.unmappedSkus === 0 &&
        status.counts.pendingCostImports === 0 &&
        status.counts.staleBillingOrders === 0,
    },
    {
      title: "Corrige inventario por SKU",
      goal: "Levantar inventario real aunque sigan entrando ventas.",
      how: [
        "Entra a Inventario.",
        "Presiona Conteo en el SKU.",
        "Captura fisico contado; el sistema resta ventas apartadas.",
      ],
      result: "Conteo parcial disponible por SKU",
      href: "/inventario",
      action: "Abrir conteo",
      done: status.readiness.hasInventory,
      warning:
        "Usalo cuando no puedes parar ventas o cuando un SKU aparece con stock negativo.",
    },
    {
      title: "Revisa Full",
      goal: "Separar stock de Mi Bodega y stock en bodegas Full.",
      how: [
        "El cron diario consulta inventario Full.",
        "Revisa la foto de Full en Mercado Libre.",
        "Resuelve SKUs Full sin mapear.",
      ],
      result: status.dates.fullSyncedAt
        ? `Ultimo Full ${formatDateTimeMx(status.dates.fullSyncedAt)}`
        : "Full pendiente",
      href: "/meli",
      action: "Ver Full",
      done: status.readiness.hasFullSync,
    },
    {
      title: "Revisa utilidad",
      goal: "Ver donde ganas, donde pierdes y que producto conviene empujar.",
      how: [
        "Entra a Utilidad.",
        "Revisa ventas con perdida.",
        "Compara SKUs por ventas, margen, Full y problemas.",
      ],
      result: `${number.format(status.counts.incompleteOrders)} ventas incompletas`,
      href: "/utilidad",
      action: "Ver utilidad",
      done:
        status.readiness.hasMeliOrders &&
        status.counts.incompleteOrders === 0 &&
        status.readiness.hasCosts,
    },
    {
      title: "Confirma acceso de la cuenta",
      goal: "Evitar operar una cuenta bloqueada o en solo lectura.",
      how: [
        "Entra a Cuenta.",
        "Revisa suscripcion y permisos.",
        "Si no esta pagada, el admin activa o suspende acceso.",
      ],
      result: canWrite ? "Cuenta activa para editar" : "Cuenta sin escritura",
      href: "/cuenta",
      action: "Ver cuenta",
      done: canWrite,
    },
  ];
}

const moduleCards: ModuleCard[] = [
  {
    title: "Inicio",
    href: "/dashboard",
    icon: <BarChart3 size={18} />,
    useFor: "Resumen rapido de ventas, utilidad, pendientes y alertas.",
    keyActions: ["Salud", "Alertas", "Pendientes"],
  },
  {
    title: "Cargar datos",
    href: "/importar",
    icon: <Upload size={18} />,
    useFor: "Subir inventario, equivalencias, costos, ventas manuales y capas Full.",
    keyActions: ["Plantillas", "Excel", "Errores"],
  },
  {
    title: "Por resolver",
    href: "/setup",
    icon: <ClipboardCheck size={18} />,
    useFor: "Arreglar lo que impide calcular bien.",
    keyActions: ["Mapear", "Ligar costos", "Dinero Meli"],
  },
  {
    title: "Mercado Libre",
    href: "/meli",
    icon: <Database size={18} />,
    useFor: "Conexion, sync automatico, Full y cargos Full.",
    keyActions: ["Sync", "Full", "Billing"],
  },
  {
    title: "Inventario",
    href: "/inventario",
    icon: <Warehouse size={18} />,
    useFor: "Stock por SKU maestro, conteo, fisico, apartado y disponible.",
    keyActions: ["Conteo", "Ajustar", "Transferir"],
  },
  {
    title: "Ventas",
    href: "/ventas",
    icon: <ShoppingCart size={18} />,
    useFor: "Cada venta, recibido, cargos y estado.",
    keyActions: ["Detalle", "Recalcular", "Cargo extra"],
  },
  {
    title: "Utilidad",
    href: "/utilidad",
    icon: <BadgeDollarSign size={18} />,
    useFor: "Ganancia o perdida por venta, mes y SKU.",
    keyActions: ["Perdidas", "Comparar", "Gastos"],
  },
  {
    title: "Resurtido",
    href: "/resurtido",
    icon: <PackageCheck size={18} />,
    useFor: "Que productos comprar o mandar a Full.",
    keyActions: ["Stock bajo", "Dias", "Prioridad"],
  },
  {
    title: "Alertas",
    href: "/alertas",
    icon: <AlertTriangle size={18} />,
    useFor: "Problemas relevantes sin revisar todo.",
    keyActions: ["Cargos", "Full", "Pendientes"],
  },
  {
    title: "Diagnostico",
    href: "/salud",
    icon: <ShieldCheck size={18} />,
    useFor: "Validar si el sistema esta listo para clientes.",
    keyActions: ["Readiness", "Errores", "Escala"],
  },
];
