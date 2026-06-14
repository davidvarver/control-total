import { NextResponse } from "next/server";
import { getRegisteredOrganizationIds } from "@/lib/server/auth-store";
import { hasValidSharedSecret } from "@/lib/server/request-security";
import { processStockSyncQueue } from "@/lib/server/stock-sync";

// Simple state lock to prevent concurrent overlapping executions
let isRunning = false;

export async function GET(request: Request) {
  const secretStatus = hasValidSharedSecret({
    request,
    expectedSecret: process.env.CRON_SECRET,
  });

  if (secretStatus === "missing") {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 503 },
    );
  }

  if (secretStatus !== "valid") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isRunning) {
    return NextResponse.json({ 
      status: "busy", 
      message: "Stock synchronization is already in progress" 
    });
  }

  isRunning = true;
  try {
    const orgIds = await getRegisteredOrganizationIds();
    const results: Array<{ organizationId: string; processed: number; error?: string }> = [];

    for (const orgId of orgIds) {
      try {
        const res = await processStockSyncQueue(orgId);
        results.push({ 
          organizationId: orgId, 
          processed: res.processed ?? 0 
        });
      } catch (err) {
        results.push({ 
          organizationId: orgId, 
          processed: 0, 
          error: err instanceof Error ? err.message : String(err) 
        });
      }
    }

    return NextResponse.json({ 
      status: "success", 
      results 
    });
  } catch (err) {
    return NextResponse.json({ 
      status: "error", 
      error: err instanceof Error ? err.message : String(err) 
    }, { status: 500 });
  } finally {
    isRunning = false;
  }
}

export async function POST(request: Request) {
  return GET(request);
}
