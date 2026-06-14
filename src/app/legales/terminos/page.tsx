import Link from "next/link";

const sections = [
  {
    title: "1. Servicio",
    body: "Control Total es un SaaS operativo para sellers que necesitan revisar inventario, costos, ventas, utilidad, cargos y alertas relacionadas con Mercado Libre y Mercado Pago.",
  },
  {
    title: "2. Cuenta y acceso",
    body: "Cada usuario debe usar datos reales y mantener seguras sus credenciales. La cuenta admin de la plataforma puede activar, suspender o desactivar organizaciones por soporte, seguridad, falta de pago o uso indebido.",
  },
  {
    title: "3. Integraciones",
    body: "El usuario autoriza la conexion con servicios externos como Mercado Libre y Mercado Pago. Si esos servicios cambian, limitan o interrumpen sus APIs, algunas funciones pueden tardar o dejar de estar disponibles.",
  },
  {
    title: "4. Datos y calculos",
    body: "Los calculos dependen de la informacion entregada por el usuario, archivos importados y datos de terceros. Control Total ayuda a detectar diferencias, pero el usuario debe validar cifras criticas antes de tomar decisiones fiscales, contables o legales.",
  },
  {
    title: "5. Pagos y planes",
    body: "Los planes, precios, pruebas y condiciones comerciales pueden cambiar. El acceso puede limitarse o suspenderse cuando una cuenta no pague, abuse del servicio o ponga en riesgo la plataforma.",
  },
  {
    title: "6. Uso permitido",
    body: "No se permite intentar acceder a datos de otras organizaciones, evadir controles de seguridad, sobrecargar deliberadamente el sistema, copiar el servicio para reventa no autorizada o usarlo para actividades ilegales.",
  },
  {
    title: "7. Disponibilidad",
    body: "Se busca mantener el servicio estable, pero no se garantiza disponibilidad perfecta. Pueden existir mantenimientos, errores, limites de proveedores, incidentes de infraestructura o interrupciones temporales.",
  },
  {
    title: "8. Responsabilidad",
    body: "Control Total no sustituye asesoria contable, fiscal, legal o financiera. La responsabilidad por decisiones comerciales tomadas con base en los reportes corresponde al usuario.",
  },
  {
    title: "9. Cambios",
    body: "Estos terminos pueden actualizarse para reflejar cambios del producto, integraciones, seguridad o reglas comerciales. La version publicada sera la vigente.",
  },
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#f6f7f9] px-4 py-12 text-slate-950 sm:px-6 lg:px-8">
      <article className="mx-auto max-w-4xl rounded-lg border border-slate-200 bg-white p-6 sm:p-8">
        <Link href="/legales" className="text-sm font-black text-blue-700">
          Legales
        </Link>
        <p className="mt-8 text-xs font-black uppercase text-blue-700">Control Total</p>
        <h1 className="mt-2 text-4xl font-black">Terminos y condiciones</h1>
        <p className="mt-4 text-sm font-semibold leading-7 text-slate-600">
          Version preliminar. Necesita revision legal antes de una venta publica masiva.
        </p>
        <div className="mt-8 space-y-6">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-lg font-black text-slate-950">{section.title}</h2>
              <p className="mt-2 text-sm font-semibold leading-7 text-slate-600">{section.body}</p>
            </section>
          ))}
        </div>
        <p className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-semibold leading-7 text-slate-600">
          Contacto para temas legales o soporte: soporte@gita.com.mx.
        </p>
      </article>
    </main>
  );
}
