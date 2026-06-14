import { ShieldCheck, UserPlus, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AsyncForm } from "@/components/async-form";
import {
  listOrganizationRoles,
  listOrganizationUsers,
  permissionDefinitions,
  requirePermission,
  roleLabels,
  type RoleName,
} from "@/lib/server/auth-store";

type UsersPageProps = {
  searchParams: Promise<{
    created?: string;
    updated?: string;
    role_created?: string;
    role_updated?: string;
    error?: string;
  }>;
};

export default async function UsersPage({ searchParams }: UsersPageProps) {
  const user = await requirePermission("users.manage");
  const params = await searchParams;
  const members = await listOrganizationUsers(user.organizationId);
  const roles = await listOrganizationRoles(user.organizationId);
  const assignableRoles = roles.filter((role) => role.name !== "owner");

  return (
    <AppShell
      active="usuarios"
      title="Usuarios y permisos"
      subtitle="Agrega usuarios a la cuenta master y controla que puede hacer cada uno."
      organization={user.organizationName}
      userEmail={user.email}
    >
      <div className="ct-ops-page">
        {params.created ? (
          <Banner tone="success">Usuario agregado o reactivado.</Banner>
        ) : null}
        {params.updated ? <Banner tone="success">Permisos actualizados.</Banner> : null}
        {params.role_created ? <Banner tone="success">Rol creado.</Banner> : null}
        {params.role_updated ? <Banner tone="success">Rol actualizado.</Banner> : null}
        {params.error ? <Banner tone="error">{params.error}</Banner> : null}

      <section className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <details className="ct-ops-panel group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-2">
              <UserPlus size={18} className="text-slate-500" />
              <div>
                <h3 className="ct-ops-title">Nuevo usuario</h3>
                <p className="ct-ops-copy">
                  Invita a alguien solo cuando necesites darle acceso.
                </p>
              </div>
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 group-open:hidden">
              Abrir
            </span>
            <span className="hidden rounded-full bg-slate-950 px-2 py-1 text-xs font-semibold text-white group-open:inline">
              Cerrar
            </span>
          </summary>
          <AsyncForm
            action="/api/users"
            className="space-y-3 border-t border-white/10 p-4"
            resetOnSuccess
            successMessage="Usuario agregado"
          >
            <Field label="Nombre" name="name" autoComplete="name" />
            <Field label="Email" name="email" type="email" autoComplete="email" />
            <Field
              label="Contrasena temporal"
              name="password"
              type="password"
              autoComplete="new-password"
            />
            <label className="block text-sm font-semibold text-slate-700">
              Rol
              <select
                name="role"
                defaultValue="read_only"
                className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-950"
              >
                {assignableRoles.map((role) => (
                  <option key={role.id} value={role.name}>
                    {roleLabels[role.name as keyof typeof roleLabels] ?? role.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="ct-button ct-button-primary h-10 w-full justify-center">
              Agregar usuario
            </button>
          </AsyncForm>
        </details>

        <section className="ct-ops-panel">
          <div className="ct-ops-panel-header justify-start">
            <span className="ct-ops-icon">
              <Users size={18} />
            </span>
            <h3 className="ct-ops-title">Equipo de la cuenta</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Usuario</th>
                  <th className="px-4 py-3">Rol actual</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Editar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {members.map((member) => {
                  const role = member.role.name as RoleName;
                  const isOwner = role === "owner";

                  return (
                    <tr key={member.id}>
                      <td className="px-4 py-3">
                        <p className="font-semibold">{member.user.name}</p>
                        <p className="text-slate-500">{member.user.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                          <ShieldCheck size={14} />
                          {roleLabels[role as keyof typeof roleLabels] ?? member.role.name}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-md px-2 py-1 text-xs font-semibold ${
                            member.status === "active"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-red-50 text-red-700"
                          }`}
                        >
                          {member.status === "active" ? "Activo" : "Suspendido"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {isOwner ? (
                          <span className="text-slate-400">El dueno no se edita aqui</span>
                        ) : (
                          <details className="ct-ops-inline-card group w-[360px] max-w-full">
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-slate-700">
                              <span>Editar usuario</span>
                              <span className="rounded-full bg-white px-2 py-1 text-xs text-slate-500 group-open:hidden">
                                Abrir
                              </span>
                              <span className="hidden rounded-full bg-slate-950 px-2 py-1 text-xs text-white group-open:inline">
                                Cerrar
                              </span>
                            </summary>
                            <AsyncForm
                              action="/api/users/update"
                              className="grid gap-2 border-t border-white/10 p-3"
                              successMessage="Permisos actualizados"
                              confirmTitle="Cambiar usuario"
                              confirmMessage={`Vas a cambiar rol o estado de ${member.user.email}. Esto puede quitarle acceso.`}
                            >
                              <input type="hidden" name="membershipId" value={member.id} />
                              <select
                                name="role"
                                defaultValue={member.role.name}
                                className="h-9 rounded-md border border-slate-300 px-2 text-sm"
                              >
                                {assignableRoles.map((entry) => (
                                  <option key={entry.id} value={entry.name}>
                                    {roleLabels[entry.name as keyof typeof roleLabels] ?? entry.name}
                                  </option>
                                ))}
                              </select>
                              <select
                                name="status"
                                defaultValue={member.status}
                                className="h-9 rounded-md border border-slate-300 px-2 text-sm"
                              >
                                <option value="active">Activo</option>
                                <option value="suspended">Suspendido</option>
                              </select>
                              <button className="ct-button ct-button-primary h-9 justify-center">
                                Guardar
                              </button>
                            </AsyncForm>
                          </details>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      <section className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <details className="ct-ops-panel group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-slate-500" />
              <div>
                <h3 className="ct-ops-title">Nuevo rol</h3>
                <p className="ct-ops-copy">
                  Crea un rol propio y elige exactamente que puede hacer.
                </p>
              </div>
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 group-open:hidden">
              Abrir
            </span>
            <span className="hidden rounded-full bg-slate-950 px-2 py-1 text-xs font-semibold text-white group-open:inline">
              Cerrar
            </span>
          </summary>
          <AsyncForm
            action="/api/roles"
            className="space-y-3 border-t border-white/10 p-4"
            resetOnSuccess
            successMessage="Rol creado"
          >
            <Field label="Nombre del rol" name="name" autoComplete="off" />
            <PermissionCheckboxes />
            <button className="ct-button ct-button-primary h-10 w-full justify-center">
              Crear rol
            </button>
          </AsyncForm>
        </details>

        <section className="ct-ops-panel">
          <div className="ct-ops-panel-header block">
            <h3 className="ct-ops-title">Editar permisos por rol</h3>
            <p className="ct-ops-copy">
              El rol Dueno queda protegido; los demas se pueden ajustar.
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {roles.map((role) => {
              const selected = new Set(
                role.permissions.map((entry) => entry.permission.code),
              );
              const isOwner = role.name === "owner";

              return (
                <div key={role.id} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">
                        {roleLabels[role.name as keyof typeof roleLabels] ?? role.name}
                      </p>
                      <p className="text-sm text-slate-500">
                        {role._count.users} usuario(s)
                        {role.isSystemRole ? " | rol base" : " | rol personalizado"}
                      </p>
                    </div>
                    {isOwner ? (
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                        Protegido
                      </span>
                    ) : null}
                  </div>
                  {isOwner ? (
                    <p className="mt-3 text-sm text-slate-500">
                      El dueno conserva acceso total para evitar dejar la cuenta sin control.
                    </p>
                  ) : (
                    <details className="ct-ops-inline-card group mt-3">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-slate-700">
                        <span>Editar permisos</span>
                        <span className="rounded-full bg-white px-2 py-1 text-xs text-slate-500 group-open:hidden">
                          Abrir
                        </span>
                        <span className="hidden rounded-full bg-slate-950 px-2 py-1 text-xs text-white group-open:inline">
                          Cerrar
                        </span>
                      </summary>
                      <AsyncForm
                        action="/api/roles"
                        className="space-y-3 border-t border-white/10 p-3"
                        successMessage="Rol actualizado"
                      >
                        <input type="hidden" name="action" value="update" />
                        <input type="hidden" name="roleId" value={role.id} />
                        <PermissionCheckboxes selected={selected} />
                        <button className="ct-button ct-button-primary h-9 justify-center">
                          Guardar permisos
                        </button>
                      </AsyncForm>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </section>

      <section className="ct-ops-panel">
        <div className="ct-ops-panel-header block">
          <h3 className="ct-ops-title">Que puede hacer cada rol</h3>
          <p className="ct-ops-copy">Matriz viva basada en tus permisos reales.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Rol</th>
                <th className="px-4 py-3">Inventario</th>
                <th className="px-4 py-3">Ventas</th>
                <th className="px-4 py-3">Utilidad</th>
                <th className="px-4 py-3">Importaciones</th>
                <th className="px-4 py-3">Meli</th>
                <th className="px-4 py-3">Usuarios</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {roles.map((role) => {
                const selected = new Set(
                  role.permissions.map((entry) => entry.permission.code),
                );

                return (
                  <tr key={role.id}>
                    <td className="px-4 py-3 font-semibold">
                      {roleLabels[role.name as keyof typeof roleLabels] ?? role.name}
                    </td>
                    <MatrixCell
                      view={selected.has("inventory.view")}
                      write={selected.has("inventory.write")}
                    />
                    <MatrixCell
                      view={selected.has("sales.view")}
                      write={selected.has("sales.write")}
                    />
                    <MatrixCell
                      view={selected.has("profit.view")}
                      write={selected.has("reports.export")}
                    />
                    <MatrixCell write={selected.has("imports.write")} />
                    <MatrixCell write={selected.has("integrations.write")} />
                    <MatrixCell write={selected.has("users.manage")} />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      </div>
    </AppShell>
  );
}

function Field({
  label,
  name,
  type = "text",
  autoComplete,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      {label}
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        required
        className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-950"
      />
    </label>
  );
}

function PermissionCheckboxes({ selected }: { selected?: Set<string> }) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {permissionDefinitions.map((permission) => (
        <label
          key={permission.code}
          className="flex items-start gap-2 rounded-md border border-slate-200 p-2 text-sm"
        >
          <input
            type="checkbox"
            name="permissions"
            value={permission.code}
            defaultChecked={selected?.has(permission.code) ?? permission.code === "dashboard.view"}
            className="mt-1 h-4 w-4 rounded border-slate-300"
          />
          <span>
            <span className="block font-semibold text-slate-800">
              {permission.label}
            </span>
            <span className="text-xs text-slate-500">{permission.group}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

function MatrixCell({ view, write }: { view?: boolean; write?: boolean }) {
  const cell = write ? "Editar" : view ? "Ver" : "No";

  return (
    <td className="px-4 py-3">
      <span
        className={`rounded-md px-2 py-1 text-xs font-semibold ${
          cell === "Editar"
            ? "bg-emerald-50 text-emerald-700"
            : cell === "Ver"
              ? "bg-blue-50 text-blue-700"
              : "bg-slate-100 text-slate-500"
        }`}
      >
        {cell}
      </span>
    </td>
  );
}

function Banner({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "success" | "error";
}) {
  return (
    <div
      className={`ct-ops-alert text-sm font-medium ${
        tone === "success"
          ? "is-ok"
          : "is-danger"
      }`}
    >
      {children}
    </div>
  );
}
