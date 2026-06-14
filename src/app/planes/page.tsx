import Link from "next/link";
import { ArrowRight, CheckCircle2, Mail } from "lucide-react";

const included = [
  "Conexion Mercado Libre para ventas y Full",
  "Inventario con SKU maestro, equivalencias y kits",
  "Utilidad por venta con recibido, cargos, costos y margen",
  "Alertas de SKUs sin mapear, costos faltantes, perdidas y cargos raros",
  "Importacion por Excel para inventario, costos, equivalencias y ventas externas",
  "Roles y permisos por usuario",
];

export default function PlansPage() {
  return (
    <main className="min-h-screen bg-[#f6f7f9] px-4 py-12 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/" className="text-sm font-black text-blue-700">
          Control Total
        </Link>
        <section className="mt-8 grid gap-8 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
          <div>
            <p className="text-xs font-black uppercase text-blue-700">Planes</p>
            <h1 className="mt-2 text-4xl font-black leading-tight sm:text-5xl">
              Acceso por invitacion antes de venta publica.
            </h1>
            <p className="mt-5 text-base font-semibold leading-8 text-slate-600">
              Control Total usa cuentas reales para validar sync, utilidad, Full,
              cargos raros y flujo operativo antes de publicar precios finales.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/register" className="ct-button ct-button-primary">
                Solicitar acceso
                <ArrowRight size={16} />
              </Link>
              <a href="mailto:soporte@gita.com.mx" className="ct-button ct-button-secondary">
                <Mail size={16} />
                Contactar
              </a>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <article className="rounded-lg border border-blue-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-black uppercase text-blue-700">Invitacion</p>
              <h2 className="mt-2 text-2xl font-black">Acceso guiado</h2>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
                Acceso limitado para validar con vendedores cercanos. Ideal si ya tienes
                Excel de inventario/costos y ventas en Mercado Libre.
              </p>
              <p className="mt-5 rounded-lg bg-blue-50 px-3 py-2 text-sm font-black text-blue-800">
                Sin cobro publico todavia; condiciones por confirmar durante validacion inicial.
              </p>
            </article>
            <article className="rounded-lg border border-slate-200 bg-white p-6">
              <p className="text-xs font-black uppercase text-slate-500">Despues</p>
              <h2 className="mt-2 text-2xl font-black">Produccion</h2>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
                Los planes publicos se definiran cuando el cron, persistencia, backups,
                soporte y monitoreo esten estables para mas organizaciones.
              </p>
              <p className="mt-5 rounded-lg bg-slate-50 px-3 py-2 text-sm font-black text-slate-700">
                Sin venta masiva todavia.
              </p>
            </article>
          </div>
        </section>

        <section className="mt-8 rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-black">Que incluye el acceso</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {included.map((item) => (
              <div key={item} className="flex items-start gap-3 rounded-lg bg-slate-50 p-3">
                <CheckCircle2 size={18} className="mt-0.5 text-blue-700" />
                <p className="text-sm font-semibold leading-6 text-slate-700">{item}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
