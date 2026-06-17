import { NextResponse } from "next/server";
import { addAuditLog } from "@/lib/server/audit";
import {
  requireApiWritablePermission,
  userHasPermission,
} from "@/lib/server/auth-store";
import { addInventoryIngress } from "@/lib/server/local-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IngressLineInput = {
  masterSku?: unknown;
  quantity?: unknown;
  averageUnitCost?: unknown;
};

type IngressPayload = {
  warehouseId?: unknown;
  reference?: unknown;
  lines?: unknown;
};

export async function POST(request: Request) {
  const auth = await requireApiWritablePermission("inventory.write");
  if (auth.response) {
    return auth.response;
  }

  try {
    const payload = (await request.json()) as IngressPayload;
    const warehouseId = String(payload.warehouseId ?? "").trim();
    const reference = String(payload.reference ?? "").trim();
    const rawLines = Array.isArray(payload.lines)
      ? (payload.lines as IngressLineInput[])
      : [];

    if (!warehouseId) {
      return NextResponse.json(
        { error: "Selecciona una bodega." },
        { status: 400 },
      );
    }

    if (rawLines.length === 0) {
      return NextResponse.json(
        { error: "Agrega al menos una linea." },
        { status: 400 },
      );
    }

    if (rawLines.length > 100) {
      return NextResponse.json(
        { error: "Maximo 100 lineas por ingreso." },
        { status: 400 },
      );
    }

    const lines = rawLines.map((line) => ({
      masterSku: String(line.masterSku ?? "").trim(),
      quantity: Number(line.quantity ?? 0),
      averageUnitCost:
        line.averageUnitCost === undefined || line.averageUnitCost === null
          ? null
          : Number(line.averageUnitCost),
    }));
    const hasCostUpdates = lines.some((line) => line.averageUnitCost !== null);

    if (hasCostUpdates && !userHasPermission(auth.user, "costs.write")) {
      return NextResponse.json(
        {
          error:
            "No tienes permiso para editar costos. Borra la columna costo o pide permiso de costos.",
        },
        { status: 403 },
      );
    }

    const result = await addInventoryIngress({
      warehouseId,
      reference,
      lines,
      updateCosts: hasCostUpdates,
    });

    await addAuditLog({
      action: "inventory.ingress",
      entityType: "inventory",
      entityId: warehouseId,
      organizationId: auth.user.organizationId,
      after: {
        warehouseId,
        reference,
        lineCount: result.appliedLines.length,
        costUpdates: result.costUpdates,
      },
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo guardar." },
      { status: 400 },
    );
  }
}
