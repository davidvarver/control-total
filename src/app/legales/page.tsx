import Link from "next/link";
import { ArrowRight, LockKeyhole, Scale } from "lucide-react";

export default function LegalIndexPage() {
  return (
    <main className="min-h-screen bg-[#f6f7f9] px-4 py-12 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/" className="text-sm font-black text-blue-700">
          Control Total
        </Link>
        <section className="mt-8 rounded-lg border border-slate-200 bg-white p-6 sm:p-8">
          <p className="text-xs font-black uppercase text-blue-700">Legales</p>
          <h1 className="mt-2 text-4xl font-black text-slate-950">
            Documentos claros para operar el SaaS.
          </h1>
          <p className="mt-4 max-w-3xl text-base font-semibold leading-7 text-slate-600">
            Estos textos explican el uso de Control Total, el tratamiento de datos y
            los limites del servicio. Deben revisarse con asesoria legal antes de venta masiva.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <Link href="/legales/terminos" className="rounded-lg border border-slate-200 bg-slate-50 p-5 transition hover:bg-white">
              <Scale size={24} className="text-blue-700" />
              <h2 className="mt-4 text-xl font-black">Terminos y condiciones</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                Reglas de uso, cuentas, pagos, integraciones y responsabilidades.
              </p>
              <span className="mt-4 inline-flex items-center gap-2 text-sm font-black text-blue-700">
                Abrir <ArrowRight size={15} />
              </span>
            </Link>
            <Link href="/legales/privacidad" className="rounded-lg border border-slate-200 bg-slate-50 p-5 transition hover:bg-white">
              <LockKeyhole size={24} className="text-blue-700" />
              <h2 className="mt-4 text-xl font-black">Aviso de privacidad</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                Datos tratados, finalidades, proveedores, seguridad y derechos del usuario.
              </p>
              <span className="mt-4 inline-flex items-center gap-2 text-sm font-black text-blue-700">
                Abrir <ArrowRight size={15} />
              </span>
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
