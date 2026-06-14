import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BadgeDollarSign,
  CheckCircle2,
  FileSpreadsheet,
  PackageCheck,
  RefreshCw,
  Store,
} from "lucide-react";

const stages = [
  {
    icon: Store,
    title: "1. Conectar Mercado Libre",
    owner: "Admin de la tienda",
    output: "Token activo, cuenta ligada y permiso para consultar ventas, pagos, envios y publicaciones.",
  },
  {
    icon: FileSpreadsheet,
    title: "2. Importar base operativa",
    owner: "Operacion",
    output: "Productos maestros, costos promedio, stock, equivalencias de SKU y capas Full.",
  },
  {
    icon: PackageCheck,
    title: "3. Limpiar pendientes",
    owner: "Operacion",
    output: "SKUs ligados, productos con costo, stock sin negativos raros y ventas listas para calculo.",
  },
  {
    icon: BadgeDollarSign,
    title: "4. Revisar utilidad real",
    owner: "Direccion",
    output: "Venta bruta, recibido real, cargos, impuestos, costo, margen y utilidad por orden.",
  },
  {
    icon: AlertTriangle,
    title: "5. Actuar sobre alertas",
    owner: "Direccion y soporte",
    output: "Cargos raros para reclamar, ventas con perdida, stock bajo y resurtido prioritario.",
  },
  {
    icon: RefreshCw,
    title: "6. Sincronizar y repetir",
    owner: "Sistema",
    output: "Actualizacion periodica controlada para no gastar recursos en webhooks innecesarios.",
  },
];

export default function FlowPage() {
  return (
    <main className="min-h-screen bg-[#f6f7f9] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="text-sm font-black text-blue-700">
            Control Total
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/login" className="ct-button ct-button-secondary">
              Entrar
            </Link>
            <Link href="/register" className="ct-button ct-button-primary">
              Crear cuenta
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <p className="text-xs font-black uppercase text-blue-700">Flujo operativo</p>
          <h1 className="mt-2 text-4xl font-black text-slate-950 sm:text-5xl">
            De conectar Meli a saber donde se gana y donde se pierde.
          </h1>
          <p className="mt-5 text-base font-semibold leading-7 text-slate-600">
            Este flujo evita que el usuario se pierda. Primero trae datos, luego limpia
            pendientes, despues calcula utilidad y finalmente convierte alertas en acciones.
          </p>
        </div>

        <div className="mt-10 grid gap-4">
          {stages.map((stage) => {
            const Icon = stage.icon;
            return (
              <article key={stage.title} className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 md:grid-cols-[48px_1fr_220px] md:items-start">
                <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                  <Icon size={22} />
                </span>
                <div>
                  <h2 className="text-lg font-black text-slate-950">{stage.title}</h2>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{stage.output}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-[10px] font-black uppercase text-slate-400">Responsable</p>
                  <p className="mt-1 text-sm font-black text-slate-800">{stage.owner}</p>
                </div>
              </article>
            );
          })}
        </div>

        <section className="mt-10 rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-black text-slate-950">Criterios para decir que una cuenta esta lista</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {[
              "Mercado Libre conectado y sincronizacion funcionando.",
              "Costos promedio importados y productos sin costo revisados.",
              "Equivalencias de SKU resueltas para paquetes y variantes.",
              "Ventas recientes con recibido, cargos y margen calculados.",
              "Alertas de perdida y cargos raros visibles para seguimiento.",
              "Usuario admin separado para activar, desactivar y revisar cuentas.",
            ].map((item) => (
              <p key={item} className="flex gap-3 text-sm font-bold leading-6 text-slate-700">
                <CheckCircle2 size={18} className="mt-1 shrink-0 text-blue-700" />
                {item}
              </p>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
