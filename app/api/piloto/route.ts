import type { NextRequest } from "next/server";
import { errorResponse, jsonResponse, readJsonBody } from "@/lib/errors";
import { pilotSignupSchema, savePilotSignup } from "@/lib/pilot";

/**
 * Anotarse al programa piloto desde la landing: 201 si es nuevo, 200 si ya estaba. Pública (sin clave).
 * Ronda 30/09 · 8.4: el correo va al Google Sheet; `sink` y la cabecera X-Pilot-Sink dicen a dónde fue
 * ("sheet", o "mock" si el Sheet aún no está configurado). 502 si Google no aceptó la fila.
 */
export async function POST(request: NextRequest) {
  try {
    const input = pilotSignupSchema.parse(await readJsonBody(request));
    if (input.website) return jsonResponse({ ok: true }, { status: 200 }); // bot: se responde igual, no se guarda
    const { created, sink } = await savePilotSignup(input.email);
    return jsonResponse(
      { ok: true, alreadySignedUp: !created, sink },
      { status: created ? 201 : 200, headers: { "X-Pilot-Sink": sink } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
