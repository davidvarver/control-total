import type { LockMode, SubscriptionStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import {
  requirePlatformAdmin,
  updatePlatformOrganizationSubscription,
} from "@/lib/server/auth-store";
import { addAuditLog } from "@/lib/server/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const wantsJson = wantsJsonResponse(request);

  try {
    const user = await requirePlatformAdmin();
    const formData = await request.formData();
    const organizationId = String(formData.get("organizationId") ?? "");
    const subscription = await updatePlatformOrganizationSubscription({
      organizationId,
      status: String(formData.get("status") ?? "active") as SubscriptionStatus,
      lockMode: String(formData.get("lockMode") ?? "read_only") as LockMode,
      expiresAt: parseDate(String(formData.get("expiresAt") ?? "")),
      graceUntil: parseDate(String(formData.get("graceUntil") ?? "")),
    });

    await addAuditLog({
      action: "platform.subscription.update",
      entityType: "subscription",
      entityId: subscription.id,
      organizationId,
      userId: user.id,
      after: {
        status: subscription.status,
        lockMode: subscription.lockMode,
        expiresAt: subscription.expiresAt,
        graceUntil: subscription.graceUntil,
      },
    });

    if (wantsJson) {
      return NextResponse.json({ ok: true, subscription });
    }

    return NextResponse.redirect(new URL("/admin?updated=1", request.url), {
      status: 303,
    });
  } catch (error) {
    if (wantsJson) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "No se pudo actualizar." },
        { status: 400 },
      );
    }

    const url = new URL("/admin", request.url);
    url.searchParams.set(
      "error",
      error instanceof Error ? error.message : "No se pudo actualizar.",
    );
    return NextResponse.redirect(url, { status: 303 });
  }
}

function parseDate(value: string) {
  const date = new Date(`${value}T23:59:59.000`);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Fecha invalida.");
  }
  return date;
}

function wantsJsonResponse(request: Request) {
  return (
    request.headers.get("accept")?.includes("application/json") ||
    request.headers.get("x-requested-with") === "fetch"
  );
}
