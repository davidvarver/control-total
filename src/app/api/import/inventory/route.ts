import { NextResponse } from "next/server";
import { requireApiWritablePermission } from "@/lib/server/auth-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const auth = await requireApiWritablePermission("imports.write");
    if (auth.response) {
      return auth.response;
    }

    return NextResponse.json(
      {
        error:
          "Importacion total desactivada en produccion. Usa /api/import/inventory-quantities para actualizar inventario sin reemplazar la base operativa.",
      },
      { status: 410 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
