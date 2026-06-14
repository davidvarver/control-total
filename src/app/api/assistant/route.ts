import { NextResponse } from "next/server";
import { buildAssistantReply } from "@/lib/server/assistant";
import { requireApiUser } from "@/lib/server/auth-store";

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.response || !auth.user) {
    return auth.response;
  }

  const body = (await request.json().catch(() => null)) as {
    message?: unknown;
  } | null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";

  if (!message) {
    return NextResponse.json(
      { error: "Escribe una pregunta para el asistente." },
      { status: 400 },
    );
  }

  if (message.length > 600) {
    return NextResponse.json(
      { error: "Pregunta demasiado larga. Hazla mas corta." },
      { status: 400 },
    );
  }

  const reply = await buildAssistantReply({ message, user: auth.user });
  return NextResponse.json(reply);
}
