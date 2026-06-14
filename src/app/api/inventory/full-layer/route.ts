import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { requireWritablePermission } from "@/lib/server/auth-store";
import {
  addFullInventoryLayer,
  addFullShipment,
  deleteFullInventoryLayer,
  updateFullInventoryLayer,
} from "@/lib/server/local-store";
import { addAuditLog } from "@/lib/server/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const wantsJson = wantsJsonResponse(request);
  const user = await requireWritablePermission("inventory.write");
  try {
    const formData = await request.formData();
    const action = String(formData.get("action") ?? "create");

    if (action === "update") {
      const layer = await updateFullInventoryLayer({
      layerId: String(formData.get("layerId") ?? ""),
      quantity: getQuantity(formData),
      unitVolumeM3: getUnitVolumeM3(formData),
      inboundFreightCostTotal: Number(
        formData.get("inboundFreightCostTotal") ?? 0,
      ),
      storageCostPerUnitPerDay: Number(
        formData.get("storageCostPerUnitPerDay") ?? 0,
      ),
      dateReceived: String(formData.get("dateReceived") ?? ""),
      note: String(formData.get("note") ?? ""),
    });
      await addAuditLog({
        action: "full_layer.update",
        entityType: "full_layer",
        entityId: layer.id,
        organizationId: user.organizationId,
        after: layer,
      });

      if (wantsJson) {
        return NextResponse.json({ ok: true, layer });
      }

      redirect("/inventario?movement=full_layer_updated");
    }

    if (action === "delete") {
      const layer = await deleteFullInventoryLayer(String(formData.get("layerId") ?? ""));
      await addAuditLog({
        action: "full_layer.delete",
        entityType: "full_layer",
        entityId: layer.id,
        organizationId: user.organizationId,
        before: layer,
      });
      if (wantsJson) {
        return NextResponse.json({ ok: true, layer });
      }
      redirect("/inventario?movement=full_layer_deleted");
    }

    if (action === "shipment") {
      const layers = await addFullShipment({
        rows: parseShipmentRows(formData),
        shipmentFreightCostTotal: Number(
          formData.get("shipmentFreightCostTotal") ?? 0,
        ),
        storageCostPerUnitPerDay: Number(
          formData.get("storageCostPerUnitPerDay") ?? 0,
        ),
        dateReceived: String(formData.get("dateReceived") ?? ""),
        note: String(formData.get("note") ?? ""),
      });
      await addAuditLog({
        action: "full_shipment.create",
        entityType: "full_shipment",
        entityId: String(formData.get("note") ?? "full_shipment"),
        organizationId: user.organizationId,
        after: { layers },
      });

      if (wantsJson) {
        return NextResponse.json({ ok: true, layers });
      }

      redirect(`/inventario?movement=full_shipment&full_layers_imported=${layers.length}`);
    }

    const layer = await addFullInventoryLayer({
    masterSku: String(formData.get("masterSku") ?? ""),
    quantity: getQuantity(formData),
    unitVolumeM3: getUnitVolumeM3(formData),
    inboundFreightCostTotal: Number(
      formData.get("inboundFreightCostTotal") ?? 0,
    ),
    storageCostPerUnitPerDay: Number(
      formData.get("storageCostPerUnitPerDay") ?? 0,
    ),
    dateReceived: String(formData.get("dateReceived") ?? ""),
    note: String(formData.get("note") ?? ""),
  });
    await addAuditLog({
      action: "full_layer.create",
      entityType: "full_layer",
      entityId: layer.id,
      organizationId: user.organizationId,
      after: layer,
    });

    if (wantsJson) {
      return NextResponse.json({ ok: true, layer });
    }

    redirect("/inventario?movement=full_layer");
  } catch (error) {
    if (wantsJson) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "No se pudo guardar." },
        { status: 400 },
      );
    }
    throw error;
  }
}

function getQuantity(formData: FormData) {
  return Number(formData.get("quantity") ?? 0);
}

function getUnitVolumeM3(formData: FormData) {
  const quantity = getQuantity(formData);
  const totalVolume = Number(formData.get("totalVolume") ?? 0);
  const volumeUnit = String(formData.get("volumeUnit") ?? "cm3");

  if (Number.isFinite(totalVolume) && totalVolume > 0 && quantity > 0) {
    const totalM3 = volumeUnit === "m3" ? totalVolume : totalVolume / 1_000_000;
    return totalM3 / quantity;
  }

  return Number(formData.get("unitVolumeM3") ?? 0);
}

function parseShipmentRows(formData: FormData) {
  const volumeUnit = String(formData.get("volumeUnit") ?? "cm3");
  const text = String(formData.get("shipmentRows") ?? "");
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line
        .split(/\t|\||,/)
        .map((part) => part.trim())
        .filter(Boolean);
      const [masterSku = "", quantityText = "", volumeText = ""] = parts;
      const quantity = Number(quantityText.replace(/[$,\s]/g, ""));
      const totalVolume = Number(volumeText.replace(/[$,\s]/g, ""));
      const totalVolumeM3 =
        volumeUnit === "m3" ? totalVolume : totalVolume / 1_000_000;

      return {
        masterSku,
        quantity,
        totalVolumeM3: Number.isFinite(totalVolumeM3) ? totalVolumeM3 : 0,
      };
    });

  if (rows.length === 0) {
    const singleMasterSku = String(formData.get("masterSku") ?? "").trim();
    const quantity = getQuantity(formData);
    const totalVolume = Number(formData.get("totalVolume") ?? 0);
    const totalVolumeM3 =
      volumeUnit === "m3" ? totalVolume : totalVolume / 1_000_000;

    if (singleMasterSku && quantity > 0) {
      return [
        {
          masterSku: singleMasterSku,
          quantity,
          totalVolumeM3: Number.isFinite(totalVolumeM3) ? totalVolumeM3 : 0,
        },
      ];
    }
  }

  return rows;
}

function wantsJsonResponse(request: Request) {
  return (
    request.headers.get("accept")?.includes("application/json") ||
    request.headers.get("x-requested-with") === "fetch"
  );
}
