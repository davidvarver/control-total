import { NextResponse } from "next/server";
import { syncMeliFullBilling } from "@/lib/meli/full-billing";
import {
  retryPendingMeliBilling,
  syncMeliAutomationOrders,
  syncMeliFullStock,
} from "@/lib/meli/sync";
import { addAuditLog } from "@/lib/server/audit";
import { requirePlatformAdmin } from "@/lib/server/auth-store";
import {
  readOrganizationStore,
  runWithOrganization,
} from "@/lib/server/local-store";
import { getMeliSyncLimits } from "@/lib/server/sync-config";
import { finishSyncRun, startSyncRun } from "@/lib/server/sync-runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

type AdminMeliSyncTask = "sales-history" | "full-stock" | "full-billing";

export async function POST(request: Request) {
  const user = await requirePlatformAdmin();
  const formData = await request.formData();
  const organizationId = String(formData.get("organizationId") ?? "").trim();
  const accountId = String(formData.get("accountId") ?? "").trim();
  const task = String(formData.get("task") ?? "").trim() as AdminMeliSyncTask;

  if (!organizationId || !accountId || !isValidTask(task)) {
    return NextResponse.json(
      { error: "Organizacion, cuenta Meli y tarea son requeridas." },
      { status: 400 },
    );
  }

  const store = await readOrganizationStore(organizationId);
  if (!store) {
    return NextResponse.json({ error: "Organizacion no encontrada." }, { status: 404 });
  }

  const account = store.marketplaceAccounts.find(
    (entry) => entry.id === accountId && entry.channel === "mercado_libre",
  );
  if (!account || account.status !== "connected") {
    return NextResponse.json(
      { error: "Cuenta Meli no encontrada o no conectada." },
      { status: 400 },
    );
  }

  const startedAt = new Date();
  const limits = getMeliSyncLimits();
  const syncRun = await startSyncRun({
    organizationId,
    marketplaceAccountId: account.id,
    channel: "mercado_libre",
    jobType: `admin-${task}`,
    details: {
      platformAdmin: user.email,
      accountAlias: account.alias,
    },
  });

  try {
    const result = await runWithOrganization(store.organization, async () => {
      if (task === "sales-history") {
        const months = clampNumber(Number(formData.get("months") ?? 3), 1, 12);
        const backfillLimit = clampNumber(
          Number(formData.get("backfillLimit") ?? limits.adminBackfillDefault),
          50,
          limits.adminBackfillMax,
        );
        const orders = await syncMeliAutomationOrders({
          accountId,
          backfillMonths: months,
          backfillLimit,
          recentLimit: limits.hourlyRecentLimit,
          recentIntervalMinutes: 60,
          maxRuntimeMs: limits.initialRuntimeMs,
        });
        const pending = await retryPendingMeliBilling({
          accountId,
          limit: limits.adminPendingBillingLimit,
        });

        return {
          task,
          months,
          checked: orders.checked + pending.checked,
          imported: orders.importedOrders + pending.updated,
          pending: (orders.remaining ?? 0) + pending.pending,
          total: orders.total,
          mode: orders.mode,
          unmapped: orders.unmappedItems.length,
        };
      }

      if (task === "full-stock") {
        const maxItems = clampNumber(
          Number(formData.get("maxItems") ?? limits.adminFullStockMaxItems),
          50,
          limits.adminFullStockMaxItems,
        );
        const full = await syncMeliFullStock({ accountId, maxItems });

        return {
          task,
          checked: full.scannedItems,
          imported: full.mappedUnits,
          pending: full.unmappedItems.length,
          total: full.totalFulfillmentUnits,
          fullListings: full.fullListings,
        };
      }

      const period = normalizeBillingPeriod(String(formData.get("period") ?? ""));
      if (!period) {
        throw new Error("Selecciona un periodo valido para cargos Full.");
      }

      const fullBilling = await syncMeliFullBilling({ accountId, period });
      return {
        task,
        period,
        checked: fullBilling.fetchedRows,
        imported: fullBilling.charges.length,
        pending: 0,
        total: fullBilling.totalUnits,
        totalAmount: fullBilling.totalAmount,
      };
    });

    await finishSyncRun({
      id: syncRun.id,
      status: "success",
      startedAt,
      checked: result.checked,
      imported: result.imported,
      pending: result.pending,
      total: result.total,
      details: result,
    });

    await addAuditLog({
      action: `admin.meli.${task}`,
      entityType: "integration",
      entityId: accountId,
      organizationId,
      after: {
        ...result,
        platformAdmin: user.email,
      },
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo sincronizar.";

    await finishSyncRun({
      id: syncRun.id,
      status: "failed",
      startedAt,
      errorMessage: message,
    });

    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function isValidTask(value: string): value is AdminMeliSyncTask {
  return value === "sales-history" || value === "full-stock" || value === "full-billing";
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(Math.floor(value), max));
}

function normalizeBillingPeriod(period: string) {
  if (/^\d{4}-\d{2}$/.test(period)) {
    return `${period}-01`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) {
    return period;
  }

  return null;
}
