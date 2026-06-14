import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    { error: "Los pagos y vencimientos se administran solo desde el panel de plataforma." },
    { status: 403 },
  );
}
