import { NextResponse } from "next/server";
import { runDataRetention } from "@/lib/server/data-retention";
import { hasValidSharedSecret } from "@/lib/server/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function GET(request: Request) {
  const secretStatus = hasValidSharedSecret({
    request,
    expectedSecret: process.env.CRON_SECRET,
  });

  if (secretStatus === "missing") {
    return new Response("CRON_SECRET is not configured", { status: 503 });
  }

  if (secretStatus !== "valid") {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const result = await runDataRetention();
    return NextResponse.json({
      ...result,
      ranAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        ranAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown data retention error",
      },
      { status: 200 },
    );
  }
}
