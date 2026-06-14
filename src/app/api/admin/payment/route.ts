import { NextResponse } from "next/server";
import {
  recordPlatformSubscriptionPayment,
  requirePlatformAdmin,
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
    const amount = Number(formData.get("amount") ?? 0);
    const method = String(formData.get("method") ?? "manual");
    const coveredUntil = parseDate(String(formData.get("coveredUntil") ?? ""));
    const notes = String(formData.get("notes") ?? "");
    const payment = await recordPlatformSubscriptionPayment({
      organizationId,
      amount,
      method,
      coveredUntil,
      notes,
      createdById: user.id,
    });

    await addAuditLog({
      action: "platform.subscription.payment",
      entityType: "subscription_payment",
      entityId: payment.id,
      organizationId,
      userId: user.id,
      after: { amount, method, coveredUntil, notes },
    });

    if (wantsJson) {
      return NextResponse.json({ ok: true, payment });
    }

    return NextResponse.redirect(new URL("/admin?payment=1", request.url), {
      status: 303,
    });
  } catch (error) {
    if (wantsJson) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "No se pudo registrar." },
        { status: 400 },
      );
    }

    const url = new URL("/admin", request.url);
    url.searchParams.set(
      "error",
      error instanceof Error ? error.message : "No se pudo registrar.",
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
