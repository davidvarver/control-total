import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    { error: "Los pagos se registran solo desde el panel de plataforma." },
    { status: 403 },
  );
}
