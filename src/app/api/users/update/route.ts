import type { UserStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import {
  requireApiWritablePermission,
  updateOrganizationUser,
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
    const membership = await updateOrganizationUser({
      organizationId: auth.user.organizationId,
      membershipId: String(formData.get("membershipId") ?? ""),
      role: String(formData.get("role") ?? "read_only") as RoleName,
      status: String(formData.get("status") ?? "active") as UserStatus,
    });
    await addAuditLog({
      action: "user.update",
      entityType: "user",
      entityId: membership.userId,
      organizationId: auth.user.organizationId,
      after: {
        membershipId: String(formData.get("membershipId") ?? ""),
        role: String(formData.get("role") ?? "read_only"),
        status: String(formData.get("status") ?? "active"),
      },
    });

    if (wantsJson) {
      return NextResponse.json({ ok: true, membership });
    }

    return NextResponse.redirect(new URL("/usuarios?updated=1", request.url), {
      status: 303,
    });
  } catch (error) {
    if (wantsJson) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "No se pudo actualizar el usuario.",
        },
        { status: 400 },
      );
    }

    const url = new URL("/usuarios", request.url);
    url.searchParams.set(
      "error",
      error instanceof Error ? error.message : "No se pudo actualizar el usuario.",
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
