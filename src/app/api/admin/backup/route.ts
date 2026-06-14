import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/server/auth-store";
import { prisma } from "@/lib/server/prisma";
import { redactSensitive } from "@/lib/server/redact-sensitive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requirePlatformAdmin();
  const organizations = await prisma.organization.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      users: {
        include: {
          role: { select: { name: true } },
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              status: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      },
      subscriptions: {
        include: {
          plan: true,
          payments: {
            orderBy: { paidAt: "desc" },
          },
        },
        orderBy: { startsAt: "desc" },
      },
      subscriptionPayments: {
        orderBy: { paidAt: "desc" },
      },
      marketplaceAccounts: {
        select: {
          id: true,
          channel: true,
          alias: true,
          externalAccountId: true,
          authStatus: true,
          lastSyncAt: true,
          settings: true,
          isActive: true,
        },
      },
      masterProducts: {
        include: {
          costSnapshots: {
            orderBy: { calculatedAt: "desc" },
          },
        },
        orderBy: { masterSku: "asc" },
      },
      onlineSkus: {
        include: {
          components: true,
        },
        orderBy: { onlineSku: "asc" },
      },
      warehouses: {
        orderBy: { name: "asc" },
      },
      inventoryBalances: {
        orderBy: [{ warehouseId: "asc" }, { masterProductId: "asc" }],
      },
      inventoryMovements: {
        orderBy: { createdAt: "desc" },
        take: 5000,
      },
      suppliers: {
        include: {
          purchaseOrders: {
            include: {
              items: true,
            },
            orderBy: { purchasedAt: "desc" },
            take: 1000,
          },
        },
        orderBy: { name: "asc" },
      },
      saleOrders: {
        include: {
          items: {
            include: {
              components: true,
              charges: true,
            },
          },
          charges: true,
        },
        orderBy: { orderedAt: "desc" },
        take: 20000,
      },
      operatingExpenses: {
        orderBy: [{ month: "desc" }, { description: "asc" }],
      },
      fullInventoryLayers: {
        orderBy: [{ dateReceived: "desc" }, { masterSku: "asc" }],
      },
      stockSyncQueues: {
        orderBy: { updatedAt: "desc" },
      },
      localDataStore: true,
      auditLogs: {
        orderBy: { createdAt: "desc" },
        take: 1000,
      },
      syncRuns: {
        orderBy: { startedAt: "desc" },
        take: 1000,
      },
    },
  });

  const payload = {
    exportedAt: new Date().toISOString(),
    exportedBy: user.email,
    version: 2,
    note:
      "Backup operativo sin passwords, sesiones ni tokens de integraciones. Incluye tablas relacionales de inventario, ventas, gastos, Full y sync; SaleOrder se limita a 20,000 ordenes recientes e InventoryMovement a 5,000 movimientos recientes por cuenta.",
    organizations: organizations.map((organization) => ({
      ...organization,
      auditLogs: organization.auditLogs.map((log) => ({
        ...log,
        before: redactSensitive(log.before),
        after: redactSensitive(log.after),
      })),
      localDataStore: organization.localDataStore
        ? {
            ...organization.localDataStore,
            payload: redactSensitive(organization.localDataStore.payload),
          }
        : null,
    })),
  };

  const body = JSON.stringify(payload, null, 2);
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(body, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Content-Disposition": `attachment; filename="control-total-backup-${date}.json"`,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
