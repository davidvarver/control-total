import { NextResponse } from "next/server";
import { addAuditLog } from "@/lib/server/audit";
import {
  createOrganizationRole,
  requireApiWritablePermission,
  updateOrganizationRole,
} from "@/lib/server/auth-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const wantsJson = wantsJsonResponse(request);

  try {
    const auth = await requireApiWritablePermission("users.manage");
    if (auth.response || !auth.user) {
      return auth.response;
    }

    const formData = await request.formData();
    const action = String(formData.get("action") ?? "create");
    const permissions = formData
      .getAll("permissions")
      .map((permission) => String(permission));

    if (action === "update") {
      const role = await updateOrganizationRole({
        organizationId: auth.user.organizationId,
        roleId: String(formData.get("roleId") ?? ""),
        permissions,
      });
      await addAuditLog({
        action: "role.update",
        entityType: "role",
        entityId: role.id,
        organizationId: auth.user.organizationId,
        after: { roleId: role.id, permissions },
      });

      if (wantsJson) {
        return NextResponse.json({ ok: true, role });
      }

      return NextResponse.redirect(new URL("/usuarios?role_updated=1", request.url), {
        status: 303,
      });
    }

    const role = await createOrganizationRole({
      organizationId: auth.user.organizationId,
      name: String(formData.get("name") ?? ""),
      permissions,
    });
    await addAuditLog({
      action: "role.create",
      entityType: "role",
      entityId: role.id,
      organizationId: auth.user.organizationId,
      after: { name: role.name, permissions },
    });

    if (wantsJson) {
      return NextResponse.json({ ok: true, role }, { status: 201 });
    }

    return NextResponse.redirect(new URL("/usuarios?role_created=1", request.url), {
      status: 303,
    });
  } catch (error) {
    if (wantsJson) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "No se pudo guardar el rol." },
        { status: 400 },
      );
    }

    const url = new URL("/usuarios", request.url);
    url.searchParams.set(
      "error",
      error instanceof Error ? error.message : "No se pudo guardar el rol.",
    );
    return NextResponse.redirect(url, { status: 303 });
  }
}

function wantsJsonResponse(request: Request) {
  return (
    request.headers.get("accept")?.includes("application/json") ||
    request.headers.get("x-requested-with") === "fetch"
  );
}
