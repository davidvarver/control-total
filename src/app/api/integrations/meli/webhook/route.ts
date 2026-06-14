import { NextResponse } from "next/server";
import { syncSingleMeliOrder } from "@/lib/meli/sync";
import {
  addIntegrationEvent,
  listOrganizationStores,
  runWithOrganization,
} from "@/lib/server/local-store";
import { hasValidSharedSecret } from "@/lib/server/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MeliWebhookPayload = {
  topic?: string;
  resource?: string;
  user_id?: string | number;
};

export async function POST(request: Request) {
  const secretStatus = hasValidSharedSecret({
    request,
    expectedSecret: process.env.MELI_WEBHOOK_SECRET,
    headerName: "x-webhook-secret",
  });

  if (secretStatus === "missing") {
    return NextResponse.json(
      {
        processed: false,
        stored: false,
        reason: "MELI_WEBHOOK_SECRET is not configured",
      },
      { status: 503 },
    );
  }

  if (secretStatus !== "valid") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as MeliWebhookPayload | null;
  const topic = typeof payload?.topic === "string" ? payload.topic.trim() : "";
  const resource = typeof payload?.resource === "string" ? payload.resource.trim() : "";
  const userId = payload?.user_id === undefined ? "" : String(payload.user_id).trim();

  if (
    !topic ||
    !resource ||
    !userId ||
    topic.length > 80 ||
    resource.length > 500 ||
    userId.length > 80
  ) {
    return NextResponse.json({ error: "Invalid notification payload" }, { status: 400 });
  }

  const stores = await listOrganizationStores();
  const matches = stores.filter(({ store }) =>
    store.marketplaceAccounts.some(
      (account) =>
        account.channel === "mercado_libre" &&
        account.externalAccountId === userId &&
        account.status === "connected",
    ),
  );
  const orderId = extractOrderId(resource);
  const results: Array<{
    organizationId: string;
    stored: boolean;
    processed: boolean;
    error?: string;
  }> = [];

  for (const { store } of matches) {
    await runWithOrganization(store.organization, async () => {
      try {
        await addIntegrationEvent({
          channel: "mercado_libre",
          topic,
          resource,
          userId,
          status: "received",
        });

        const account = store.marketplaceAccounts.find(
          (entry) =>
            entry.channel === "mercado_libre" &&
            entry.externalAccountId === userId &&
            entry.status === "connected",
        );

        if (account && orderId && topic === "orders_v2") {
          await syncSingleMeliOrder({ accountId: account.id, orderId });
          results.push({
            organizationId: store.organization.id,
            stored: true,
            processed: true,
          });
          return;
        }

        results.push({
          organizationId: store.organization.id,
          stored: true,
          processed: false,
        });
      } catch (error) {
        await addIntegrationEvent({
          channel: "mercado_libre",
          topic,
          resource,
          userId,
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        }).catch(() => undefined);
        results.push({
          organizationId: store.organization.id,
          stored: false,
          processed: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }

  return NextResponse.json({
    processed: results.some((result) => result.processed),
    stored: results.some((result) => result.stored),
    matchedOrganizations: matches.length,
    errors: results.filter((result) => result.error).length,
  });
}

function extractOrderId(resource: string) {
  const match = resource.match(/\/orders\/(\d+)/);
  return match?.[1] ?? null;
}
