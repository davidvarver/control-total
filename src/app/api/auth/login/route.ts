import { NextResponse } from "next/server";
import {
  createSession,
  verifyPasswordLogin,
} from "@/lib/server/auth-store";
import { getClientIp, hitRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const normalizedEmail = email.trim().toLowerCase();
    const ip = getClientIp(request);

    if (
      hitRateLimit(`login:ip:${ip}`, 24, 15 * 60 * 1000) ||
      hitRateLimit(`login:email:${normalizedEmail}`, 12, 15 * 60 * 1000) ||
      hitRateLimit(`login:pair:${ip}:${normalizedEmail}`, 8, 15 * 60 * 1000)
    ) {
      const url = new URL("/login", request.url);
      url.searchParams.set(
        "error",
        "Demasiados intentos. Espera unos minutos y vuelve a intentar.",
      );
      return NextResponse.redirect(url, { status: 303 });
    }

    const user = await verifyPasswordLogin(email, password);

    if (!user) {
      const url = new URL("/login", request.url);
      url.searchParams.set(
        "error",
        "Email o contrasena incorrectos.",
      );
      return NextResponse.redirect(url, { status: 303 });
    }

    await createSession(user.id);
    return NextResponse.redirect(new URL(user.isPlatformOnly ? "/admin" : "/dashboard", request.url), {
      status: 303,
    });
  } catch (error) {
    const url = new URL("/login", request.url);
    url.searchParams.set(
      "error",
      error instanceof Error && error.message.includes("exceeded the data transfer quota")
        ? "La base de datos llego al limite de transferencia de Neon. Hay que subir el plan/cuota o cambiar la base para poder entrar."
        : "No se pudo entrar por un problema de base de datos. Intenta de nuevo o revisa la configuracion.",
    );
    return NextResponse.redirect(url, { status: 303 });
  }
}
