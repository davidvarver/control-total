import { NextResponse } from "next/server";
import { requireWritablePermission } from "@/lib/server/auth-store";
import { addAuditLog } from "@/lib/server/audit";
import {
  createManualSaleOrder,
  type LocalMarketplaceOrder,
  type ManualSaleLineInput,
} from "@/lib/server/local-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedChannels = new Set<LocalMarketplaceOrder["channel"]>([
  "manual",
  "tiktok",
  "whatsapp",
  "external",
]);

export async function POST(request: Request) {
  const user = await requireWritablePermission("sales.write");
  const formData = await request.formData();
  const channel = String(formData.get("channel") ?? "manual") as LocalMarketplaceOrder["channel"];
  const externalOrderId = String(formData.get("externalOrderId") ?? "");
  const orderedAt = String(formData.get("orderedAt") ?? "");
  const customerName = String(formData.get("customerName") ?? "");
  const customerPhone = String(formData.get("customerPhone") ?? "");
  const customerEmail = String(formData.get("customerEmail") ?? "");
  const customerNote = String(formData.get("customerNote") ?? "");
  const warehouseId = String(formData.get("warehouseId") ?? "wh_main");
  const netReceivedAmountRaw = String(formData.get("netReceivedAmount") ?? "");
  const chargeAmountRaw = String(formData.get("chargeAmount") ?? "");
  const chargeType = String(formData.get("chargeType") ?? "other");
  const note = String(formData.get("note") ?? "");
  const linesText = String(formData.get("lines") ?? "");
  const redirectUrl = new URL("/ventas/nueva", request.url);

  try {
    if (!allowedChannels.has(channel)) {
      throw new Error("Canal invalido");
    }

    const order = await createManualSaleOrder({
      channel,
      externalOrderId,
      orderedAt,
      customerName,
      customerPhone,
      customerEmail,
      customerNote,
      warehouseId,
      netReceivedAmount: netReceivedAmountRaw ? Number(netReceivedAmountRaw) : undefined,
      chargeAmount: chargeAmountRaw ? Number(chargeAmountRaw) : undefined,
      chargeType,
      note,
      lines: parseStructuredLines(formData) ?? parseLines(linesText),
    });

    await addAuditLog({
      action: "order.manual.create",
      entityType: "order",
      entityId: order.externalOrderId,
      organizationId: user.organizationId,
      after: {
        channel: order.channel,
        externalOrderId: order.externalOrderId,
        grossAmount: order.grossAmount,
        netReceivedAmount: order.netReceivedAmount,
        items: order.items.length,
      },
    });

    return NextResponse.redirect(
      new URL(`/ventas/${encodeURIComponent(order.externalOrderId)}?manual_created=1`, request.url),
      { status: 303 },
    );
  } catch (error) {
    redirectUrl.searchParams.set(
      "error",
      error instanceof Error ? error.message : "No se pudo registrar la venta.",
    );
    return NextResponse.redirect(redirectUrl, { status: 303 });
  }
}

function parseStructuredLines(formData: FormData): ManualSaleLineInput[] | null {
  const masterSkus = formData.getAll("lineMasterSku");
  const quantities = formData.getAll("lineQuantity");
  const unitPrices = formData.getAll("lineUnitPrice");

  if (masterSkus.length === 0 && quantities.length === 0 && unitPrices.length === 0) {
    return null;
  }

  const length = Math.max(masterSkus.length, quantities.length, unitPrices.length);
  const lines: ManualSaleLineInput[] = [];

  for (let index = 0; index < length; index += 1) {
    const masterSku = String(masterSkus[index] ?? "").trim();
    const quantity = Number(String(quantities[index] ?? "").trim());
    const unitPrice = Number(String(unitPrices[index] ?? "").trim());

    if (!masterSku && !quantity && !unitPrice) {
      continue;
    }

    if (!masterSku || !Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`Linea ${index + 1}: elige SKU y cantidad valida`);
    }

    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new Error(`Linea ${index + 1}: precio unitario invalido`);
    }

    lines.push({ masterSku, quantity, unitPrice });
  }

  return lines;
}

function parseLines(value: string): ManualSaleLineInput[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line
        .split(/[,\t|;]/)
        .map((part) => part.trim())
        .filter(Boolean);

      if (parts.length < 3) {
        throw new Error(`Linea incompleta: ${line}`);
      }

      return {
        masterSku: parts[0],
        quantity: Number(parts[1]),
        unitPrice: Number(parts[2]),
      };
    });
}
