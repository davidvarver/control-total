import { NextResponse } from "next/server";
import { createSession, registerUser } from "@/lib/server/auth-store";
import { getClientIp, hitRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const ip = getClientIp(request);

    if (
      hitRateLimit(`register:ip:${ip}`, 5, 60 * 60 * 1000) ||
      hitRateLimit(`register:email:${email}`, 3, 60 * 60 * 1000)
    ) {
      const url = new URL("/register", request.url);
      url.searchParams.set(
        "error",
        "Demasiados registros desde esta conexion. Intenta mas tarde.",
      );
      return NextResponse.redirect(url, { status: 303 });
    }

    const user = await registerUser({
      name: String(formData.get("name") ?? ""),
      organizationName: String(formData.get("organizationName") ?? ""),
      email,
      password: String(formData.get("password") ?? ""),
    });

    await createSession(user.id);
    return NextResponse.redirect(new URL("/dashboard", request.url), { status: 303 });
  } catch (error) {
    const url = new URL("/register", request.url);
    url.searchParams.set(
      "error",
      error instanceof Error ? error.message : "No se pudo crear la cuenta.",
    );
    return NextResponse.redirect(url, { status: 303 });
  }
}
