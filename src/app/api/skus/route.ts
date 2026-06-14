import { NextResponse } from "next/server";
import { readLocalStore } from "@/lib/server/local-store";
import { requireApiPermission } from "@/lib/server/auth-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireApiPermission("imports.write");
    if (auth.response) {
      return auth.response;
    }

    const store = await readLocalStore();
    return NextResponse.json({ onlineSkus: store.onlineSkus });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
