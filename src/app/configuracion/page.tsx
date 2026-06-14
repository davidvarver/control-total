import Link from "next/link";
import {
  Activity,
  ArrowRight,
  FileSpreadsheet,
  History,
  Import,
  ListChecks,
  Settings,
  Shield,
  Store,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { isPlatformAdminEmail, requireCurrentUser } from "@/lib/server/auth-store";

export const dynamic = "force-dynamic";

export default async function ConfigurationPage() {
  const user = await requireCurrentUser();
  const showAdmin = isPlatformAdminEmail(user.email);

  return (
    <AppShell
      active="configuracion"
      title="Configuracion"
      subtitle="Conexiones, usuarios, cuenta, carga de datos y herramientas tecnicas."
      organization={user.organizationName}
      userEmail={user.email}
    >
      <div className="ct-ops-page">
        <section className="ct-ops-panel p-5">
          <p className="ct-ops-kicker">Centro de control</p>
          <h2 className="ct-ops-title mt-1">Todo lo que no necesitas abrir cada minuto</h2>
          <p className="ct-ops-copy mt-2 max-w-3xl">
            El menu principal queda limpio; estas opciones viven aqui para configurar,
            conectar, auditar o administrar sin estorbar la operacion diaria.
          </p>
        </section>

        <section className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          <ConfigCard
            title="Cargar datos"
            detail="Inventario, equivalencias, costos promedio y capas Full desde Excel."
            href="/importar"
            icon={<Import size={20} />}
            tone="green"
          />
          <ConfigCard
            title="Mercado Libre"
            detail="Conexion, cuentas, sincronizacion, Full, billing y fotos de publicaciones."
            href="/meli"
            icon={<Store size={20} />}
            tone="green"
          />
          <ConfigCard
            title="Usuarios"
            detail="Invita equipo, roles y permisos de la cuenta."
            href="/usuarios"
            icon={<Users size={20} />}
          />
          <ConfigCard
            title="Cuenta"
            detail="Plan, vencimiento, estado de acceso y datos de la organizacion."
            href="/cuenta"
            icon={<Settings size={20} />}
          />
          <ConfigCard
            title="Guia de uso"
            detail="Ruta recomendada para cargar datos, resolver pendientes y revisar utilidad."
            href="/guia"
            icon={<ListChecks size={20} />}
          />
          <ConfigCard
            title="Diagnostico"
            detail="Salud tecnica, backups, retencion, escala y checklist de primer cliente."
            href="/salud"
            icon={<Activity size={20} />}
            tone="amber"
          />
          <ConfigCard
            title="Auditoria tecnica"
            detail="Historial interno para revisar cambios y eventos sensibles."
            href="/auditoria"
            icon={<History size={20} />}
          />
          <ConfigCard
            title="Reportes y exportes"
            detail="Acceso rapido a descargas y vistas financieras."
            href="/reportes"
            icon={<FileSpreadsheet size={20} />}
          />
          {showAdmin ? (
            <ConfigCard
              title="Admin plataforma"
              detail="Cuentas master, pagos manuales, bloqueos y consumo por cliente."
              href="/admin"
              icon={<Shield size={20} />}
              tone="red"
            />
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}

function ConfigCard({
  title,
  detail,
  href,
  icon,
  tone = "neutral",
}: {
  title: string;
  detail: string;
  href: string;
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
    <Link href={href} prefetch={false} className={`ct-ops-kpi group ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="ct-ops-icon">{icon}</div>
        <ArrowRight size={18} className="mt-1 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-white" />
      </div>
      <h2 className="ct-ops-title mt-4">{title}</h2>
      <p className="ct-ops-copy mt-2">{detail}</p>
    </Link>
  );
}
