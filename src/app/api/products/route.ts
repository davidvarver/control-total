import { NextResponse } from "next/server";
import { createProduct, listProducts } from "@/lib/server/local-store";
import {
  requireApiPermission,
  requireApiWritablePermission,
} from "@/lib/server/auth-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireApiPermission("inventory.view");
    if (auth.response) {
      return auth.response;
    }

    const products = await listProducts();
    return NextResponse.json({ products });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiWritablePermission("inventory.write");
    if (auth.response) {
      return auth.response;
    }

    const body = (await request.json()) as {
      masterSku?: string;
      name?: string;
      initialStock?: number;
      averageUnitCost?: number;
      warehouseId?: string;
    };
    const product = await createProduct({
      masterSku: body.masterSku ?? "",
      name: body.name ?? "",
      initialStock: body.initialStock,
      averageUnitCost: body.averageUnitCost,
      warehouseId: body.warehouseId,
    });

    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 },
    );
  }
}
