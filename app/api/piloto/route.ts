import type { NextRequest } from "next/server";
import { errorResponse, jsonResponse, readJsonBody } from "@/lib/errors";
import { pilotSignupSchema, savePilotSignup } from "@/lib/pilot";

/** Anotarse al programa piloto desde la landing: 201 si es nuevo, 200 si ya estaba. Pública (sin clave). */
export async function POST(request: NextRequest) {
  try {
    const input = pilotSignupSchema.parse(await readJsonBody(request));
    if (input.website) return jsonResponse({ ok: true }, { status: 200 }); // bot: se responde igual, no se guarda
    const { created } = await savePilotSignup(input.email);
    return jsonResponse({ ok: true, alreadySignedUp: !created }, { status: created ? 201 : 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
