import { NextResponse } from "next/server";
import {
  createOrganizationUser,
  requireApiWritablePermission,
  type RoleName,
} from "@/lib/server/auth-store";
import { addAuditLog } from "@/lib/server/audit";

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
    const membership = await createOrganizationUser({
      organizationId: auth.user.organizationId,
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      role: String(formData.get("role") ?? "read_only") as RoleName,
    });
    await addAuditLog({
      action: "user.create",
      entityType: "user",
      entityId: membership.userId,
      organizationId: auth.user.organizationId,
      after: {
        name: String(formData.get("name") ?? ""),
        email: String(formData.get("email") ?? ""),
        role: String(formData.get("role") ?? "read_only"),
      },
    });

    if (wantsJson) {
      return NextResponse.json({ ok: true, membership }, { status: 201 });
    }

    return NextResponse.redirect(new URL("/usuarios?created=1", request.url), {
      status: 303,
    });
  } catch (error) {
    if (wantsJson) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "No se pudo crear el usuario." },
        { status: 400 },
      );
    }

    const url = new URL("/usuarios", request.url);
    url.searchParams.set(
      "error",
      error instanceof Error ? error.message : "No se pudo crear el usuario.",
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
