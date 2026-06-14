import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeDollarSign,
  CheckCircle2,
  FileSpreadsheet,
  LockKeyhole,
  PackageSearch,
  Scale,
  ShieldCheck,
  TrendingDown,
  Warehouse,
} from "lucide-react";
import controlTotalLogo from "../../assets/control-total-logo.png";

const productSignals = [
  "Utilidad por venta",
  "Cargos raros",
  "Inventario Full",
  "SKU maestro",
];

const strengths = [
  {
    icon: BadgeDollarSign,
    title: "Utilidad que sí cuadra",
    text: "Cruza venta, recibido, cargos, impuestos, costo promedio e inventario para ver si realmente ganaste.",
  },
  {
    icon: AlertTriangle,
    title: "Cargos que saltan",
    text: "Detecta diferencias que pueden convertir una venta buena en pérdida y deja visible qué revisar.",
  },
  {
    icon: Warehouse,
    title: "Inventario operable",
    text: "SKU maestro, equivalencias, kits, bodega propia, Full y stock disponible para vender sin perder control.",
  },
  {
    icon: FileSpreadsheet,
    title: "Arranque flexible",
    text: "Puedes cargar Excel si ya tienes datos o empezar desde Meli y resolver pendientes poco a poco.",
  },
];

const flow = [
  {
    title: "Conecta Mercado Libre",
    text: "Autorizas la cuenta para traer ventas, pagos, envíos, comisiones e impuestos.",
  },
  {
    title: "Carga o construye tu base",
    text: "Importas Excel o creas SKUs desde lo que Meli ya vendió y publicó.",
  },
  {
    title: "Limpia pendientes",
    text: "Resuelves SKUs sin mapear, productos sin costo, stock negativo y datos incompletos.",
  },
  {
    title: "Opera diario",
    text: "Revisas ventas con pérdida, dinero por confirmar, resurtido y cargos Full.",
  },
  {
    title: "Decide con números",
    text: "Compara productos, márgenes, rotación y problemas antes de comprar o pausar.",
  },
];

const dashboardRows = [
  {
    product: "Mochila cámara gris",
    received: "$172.13",
    cost: "$141.49",
    alert: "Envío explicado",
    tone: "red",
  },
  {
    product: "Tripie reforzado",
    received: "$248.90",
    cost: "$116.82",
    alert: "Margen sano",
    tone: "green",
  },
  {
    product: "Kit fotografía",
    received: "$94.20",
    cost: "$101.00",
    alert: "Pérdida",
    tone: "red",
  },
];

export default function LandingPage() {
  return (
    <main className="ct-marketing-dark min-h-screen text-slate-50">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#080d18]/95 text-white shadow-[0_14px_45px_rgba(8,13,24,0.18)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="Control Total inicio">
            <Image
              src={controlTotalLogo}
              alt="Control Total"
              width={42}
              height={42}
              className="rounded-md ring-1 ring-white/15"
              priority
            />
            <span>
              <span className="block text-base font-black leading-tight text-white">Control Total</span>
              <span className="block text-[10px] font-black uppercase tracking-normal text-blue-200">
                Inventario y utilidad real
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-6 text-sm font-bold text-slate-300 md:flex">
            <a href="#producto" className="hover:text-white">
              Producto
            </a>
            <Link href="/flujo" className="hover:text-white">
              Flujo
            </Link>
            <Link href="/planes" className="hover:text-white">
              Planes
            </Link>
            <a href="#legales" className="hover:text-white">
              Legales
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <Link href="/login" className="hidden text-sm font-black text-slate-300 hover:text-white sm:inline">
              Entrar
            </Link>
            <Link href="/register" className="ct-button border-white/10 bg-white text-slate-950 hover:bg-blue-50">
              Empezar
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </header>

      <section className="relative isolate overflow-hidden border-b border-white/10 bg-[#070c16]">
        <div className="absolute inset-0 opacity-55" aria-hidden="true">
          <HeroProductScene />
        </div>
        <div className="absolute inset-0 bg-[#070c16]/62" aria-hidden="true" />

        <div className="relative mx-auto flex min-h-[78svh] max-w-7xl flex-col justify-center px-4 py-12 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/10 px-3 py-2 text-xs font-black uppercase text-blue-100 shadow-sm backdrop-blur-xl">
              <ShieldCheck size={15} />
              Para sellers que necesitan números reales
            </div>

            <h1 className="mt-6 text-5xl font-black leading-[1.02] tracking-normal text-white sm:text-6xl lg:text-7xl">
              Control Total
            </h1>
            <p className="mt-5 max-w-2xl text-lg font-semibold leading-8 text-slate-200 sm:text-xl">
              Utilidad real, inventario operable y cargos que no cuadran. Un SaaS para vendedores de
              Mercado Libre que quieren saber dónde ganan, dónde pierden y qué deben corregir.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/register" className="ct-button border-white/10 bg-white text-slate-950 hover:bg-blue-50">
                Crear cuenta
                <ArrowRight size={16} />
              </Link>
              <Link href="/flujo" className="ct-button border-white/20 bg-white/10 text-white hover:bg-white/15">
                Ver flujo completo
              </Link>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              {productSignals.map((signal) => (
                <span
                  key={signal}
                  className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/10 px-3 py-2 text-sm font-bold text-slate-100"
                >
                  <CheckCircle2 size={15} className="text-blue-300" />
                  {signal}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="producto" className="border-b border-slate-200 bg-[var(--surface)] px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-normal text-blue-700">Lo fuerte</p>
            <h2 className="mt-2 text-3xl font-black leading-tight text-slate-950 sm:text-4xl">
              No competir solo por reportes bonitos. Competir por control.
            </h2>
            <p className="mt-4 text-base font-semibold leading-7 text-slate-600">
              El valor está en explicar el dinero de cada venta, encontrar pendientes reales y ayudar al
              seller a decidir precio, resurtido y reclamos.
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {strengths.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className="ct-card p-6">
                  <div className="flex h-11 w-11 items-center justify-center rounded-md bg-blue-50 text-blue-700">
                    <Icon size={22} />
                  </div>
                  <h3 className="mt-5 text-lg font-black text-slate-950">{item.title}</h3>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{item.text}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.82fr_1.18fr]">
          <div>
            <p className="text-xs font-black uppercase tracking-normal text-blue-700">Flujo</p>
            <h2 className="mt-2 text-3xl font-black leading-tight text-slate-950 sm:text-4xl">
              De datos sueltos a utilidad real sin perderte en pantallas.
            </h2>
            <p className="mt-4 text-base font-semibold leading-7 text-slate-600">
              Control Total guía la operación: conectar, cargar, limpiar, operar y decidir. Si no tienes
              Excel, el sistema también te da una ruta para empezar.
            </p>
            <Link href="/flujo" className="ct-button ct-button-secondary mt-6">
              Ver detalle del flujo
              <ArrowRight size={16} />
            </Link>
          </div>

          <div className="grid gap-3">
            {flow.map((step, index) => (
              <article
                key={step.title}
                className="grid gap-4 rounded-md border border-slate-200 bg-slate-50/80 p-4 shadow-sm sm:grid-cols-[44px_1fr]"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-md bg-white text-sm font-black text-blue-700 ring-1 ring-slate-200">
                  {index + 1}
                </span>
                <div>
                  <h3 className="font-black text-slate-950">{step.title}</h3>
                  <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{step.text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="legales" className="border-y border-slate-200 bg-slate-950 px-4 py-14 text-white sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1fr_1fr]">
          <div>
            <p className="text-xs font-black uppercase tracking-normal text-blue-300">Legales claros</p>
            <h2 className="mt-2 text-3xl font-black leading-tight sm:text-4xl">
              Promesa simple: transparencia, control y datos protegidos.
            </h2>
            <p className="mt-4 text-sm font-semibold leading-7 text-slate-300">
              Control Total calcula con datos de Mercado Libre, Mercado Pago, Excel y capturas del
              usuario. No sustituye asesoría fiscal, legal o contable.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Link href="/legales/terminos" className="rounded-md border border-white/10 bg-white/5 p-5 transition hover:bg-white/10">
              <Scale size={22} className="text-blue-300" />
              <h3 className="mt-4 font-black">Términos</h3>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">
                Uso permitido, cuentas, pagos, integraciones y responsabilidades claras.
              </p>
            </Link>
            <Link href="/legales/privacidad" className="rounded-md border border-white/10 bg-white/5 p-5 transition hover:bg-white/10">
              <LockKeyhole size={22} className="text-blue-300" />
              <h3 className="mt-4 font-black">Privacidad</h3>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">
                Qué datos usamos, para qué, dónde se procesan y cómo pedir cambios.
              </p>
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-[var(--surface)] px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.82fr_1.18fr]">
          <div>
            <p className="text-xs font-black uppercase tracking-normal text-blue-700">Acceso guiado</p>
            <h2 className="mt-2 text-3xl font-black leading-tight text-slate-950 sm:text-4xl">
              Primero exactitud. Luego escala.
            </h2>
            <p className="mt-4 text-base font-semibold leading-7 text-slate-600">
              El acceso inicial se activa por invitacion para validar sync, utilidad, inventario, Full y cargos
              reales antes de abrir venta publica.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <article className="ct-card border-2 border-blue-700 p-6">
              <p className="text-xs font-black uppercase tracking-normal text-blue-700">Acceso activo</p>
              <h3 className="mt-2 text-2xl font-black text-slate-950">Por invitacion</h3>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
                Para sellers que quieren probar ventas, costos, Full, alertas y utilidad real con
                acompañamiento cercano.
              </p>
              <Link href="/register" className="ct-button ct-button-primary mt-5">
                Solicitar acceso
                <ArrowRight size={16} />
              </Link>
            </article>

            <article className="ct-card p-6">
              <p className="text-xs font-black uppercase tracking-normal text-slate-500">Producción</p>
              <h3 className="mt-2 text-2xl font-black text-slate-950">Planes por definir</h3>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
                Los precios finales se publicarán cuando sync, persistencia, backups y soporte estén
                listos para más clientes.
              </p>
              <p className="mt-5 rounded-md bg-slate-50 px-3 py-2 text-xs font-black text-slate-600">
                Contacto: soporte@gita.com.mx
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1fr_0.78fr]">
          <div>
            <p className="text-xs font-black uppercase tracking-normal text-blue-700">Listo para probar</p>
            <h2 className="mt-2 text-3xl font-black leading-tight text-slate-950 sm:text-4xl">
              La ventaja no es guardar datos por guardar.
            </h2>
            <p className="mt-4 max-w-2xl text-base font-semibold leading-7 text-slate-600">
              Es sintetizar lo que importa, mostrar diferencias y ayudar a tomar decisiones de inventario,
              precio, resurtido y reclamos.
            </p>
          </div>
          <div className="flex flex-col justify-center gap-3 sm:flex-row lg:flex-col">
            <Link href="/register" className="ct-button ct-button-primary">
              Crear cuenta
              <ArrowRight size={16} />
            </Link>
            <Link href="/login" className="ct-button ct-button-secondary">
              Entrar al sistema
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-[var(--surface)] px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 text-sm font-semibold text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>Control Total. SaaS operativo para sellers de Mercado Libre.</p>
          <div className="flex flex-wrap gap-4">
            <Link href="/planes">Planes</Link>
            <Link href="/flujo">Flujo</Link>
            <Link href="/legales/terminos">Términos</Link>
            <Link href="/legales/privacidad">Privacidad</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

function HeroProductScene() {
  return (
    <div className="h-full w-full bg-slate-950 p-4 sm:p-8 lg:p-12">
      <div className="ml-auto grid h-full max-w-5xl content-center gap-4">
        <div className="rounded-md border border-white/10 bg-white/10 p-4 shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div>
              <p className="text-xs font-black uppercase text-blue-200">Dashboard operativo</p>
              <p className="text-lg font-black text-white">Utilidad y cargos por venta</p>
            </div>
            <span className="rounded-md bg-emerald-400/15 px-3 py-1 text-xs font-black text-emerald-200">
              Sincronizado
            </span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <Metric label="Venta Meli" value="$279.36" />
            <Metric label="Recibido" value="$172.13" />
            <Metric label="Cargos" value="$81.94" />
            <Metric label="Utilidad" value="-$6.85" negative />
          </div>

          <div className="mt-4 overflow-hidden rounded-md border border-white/10 bg-slate-950/50">
            <div className="grid grid-cols-[1.2fr_0.7fr_0.7fr_0.8fr] border-b border-white/10 px-4 py-3 text-xs font-black uppercase text-slate-300">
              <span>Venta</span>
              <span>Recibido</span>
              <span>Costo</span>
              <span>Alerta</span>
            </div>
            {dashboardRows.map((row) => (
              <div
                key={row.product}
                className="grid grid-cols-[1.2fr_0.7fr_0.7fr_0.8fr] items-center border-b border-white/10 px-4 py-4 text-sm last:border-b-0"
              >
                <span className="font-black text-white">{row.product}</span>
                <span className="font-bold text-slate-200">{row.received}</span>
                <span className="font-bold text-slate-200">{row.cost}</span>
                <span
                  className={`w-fit rounded-md px-2 py-1 text-xs font-black ${
                    row.tone === "green"
                      ? "bg-emerald-400/15 text-emerald-200"
                      : "bg-red-400/15 text-red-200"
                  }`}
                >
                  {row.alert}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <SmallSignal icon={<TrendingDown size={18} />} title="Ventas con pérdida" value="12" />
          <SmallSignal icon={<PackageSearch size={18} />} title="SKUs sin mapear" value="3" />
          <SmallSignal icon={<Warehouse size={18} />} title="Stock Full" value="4,556" />
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  negative = false,
}: {
  label: string;
  value: string;
  negative?: boolean;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-white/10 p-4">
      <p className="text-xs font-bold text-slate-300">{label}</p>
      <p className={`mt-2 text-2xl font-black ${negative ? "text-red-200" : "text-white"}`}>
        {value}
      </p>
    </div>
  );
}

function SmallSignal({
  icon,
  title,
  value,
}: {
  icon: ReactNode;
  title: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-white/10 p-4 text-white">
      <div className="flex items-center gap-2 text-blue-200">{icon}</div>
      <p className="mt-3 text-xs font-bold text-slate-300">{title}</p>
      <p className="text-2xl font-black">{value}</p>
    </div>
  );
}
