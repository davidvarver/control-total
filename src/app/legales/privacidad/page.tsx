import Link from "next/link";

const sections = [
  {
    title: "Datos que podemos tratar",
    body: "Nombre, correo, organizacion, usuarios, roles, archivos importados, SKUs, costos, stock, equivalencias, ventas, pagos, envios, cargos, tokens de integracion, registros de auditoria y datos tecnicos de uso.",
  },
  {
    title: "Finalidades",
    body: "Operar la cuenta, sincronizar datos autorizados, calcular utilidad, mostrar alertas, detectar pendientes, dar soporte, mejorar seguridad, generar reportes y administrar pagos o estado de suscripcion.",
  },
  {
    title: "Proveedores e integraciones",
    body: "El servicio puede usar infraestructura y proveedores como Vercel, DigitalOcean, Mercado Libre, Mercado Pago y otros servicios tecnicos necesarios para operar, almacenar, procesar o proteger la informacion.",
  },
  {
    title: "Conservacion",
    body: "Los datos se conservan mientras la cuenta este activa o mientras sean necesarios para soporte, seguridad, cumplimiento, auditoria o continuidad operativa. El usuario puede pedir revision o eliminacion cuando aplique.",
  },
  {
    title: "Seguridad",
    body: "Se aplican controles razonables como autenticacion, sesiones, separacion por organizacion, permisos y restricciones de acceso. Ningun sistema conectado a internet puede prometer riesgo cero.",
  },
  {
    title: "Derechos del usuario",
    body: "El usuario puede solicitar acceso, correccion, actualizacion o eliminacion de informacion, sujeto a validacion de identidad, obligaciones operativas y limites tecnicos o legales.",
  },
  {
    title: "Cambios al aviso",
    body: "Este aviso puede actualizarse cuando cambien funciones, proveedores, integraciones o reglas de tratamiento de datos. La version publicada sera la referencia vigente.",
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#f6f7f9] px-4 py-12 text-slate-950 sm:px-6 lg:px-8">
      <article className="mx-auto max-w-4xl rounded-lg border border-slate-200 bg-white p-6 sm:p-8">
        <Link href="/legales" className="text-sm font-black text-blue-700">
          Legales
        </Link>
        <p className="mt-8 text-xs font-black uppercase text-blue-700">Control Total</p>
        <h1 className="mt-2 text-4xl font-black">Aviso de privacidad</h1>
        <p className="mt-4 text-sm font-semibold leading-7 text-slate-600">
          Version preliminar. Debe validarse legalmente antes de operar con clientes a escala.
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
          Contacto para solicitudes de privacidad: soporte@gita.com.mx.
        </p>
      </article>
    </main>
  );
}
