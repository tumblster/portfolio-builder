import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { CREATOR_COOKIE, CREATOR_SESSION_MAX_AGE, creatorSessionToken, isValidCreatorKey } from "@/lib/auth";
import { errorResponse, jsonResponse, readJsonBody } from "@/lib/errors";
import { PORTFOLIO_COOKIE } from "@/lib/magic-link";
import { requestOrigin } from "@/lib/request";

const bodySchema = z.object({
  key: z.string({ error: "Escribe la clave." }).trim().min(1, { error: "Escribe la clave." }).max(500),
});

const cookieOptions = (request: NextRequest) => ({
  httpOnly: true, // el JavaScript de la página no puede leerla
  sameSite: "lax" as const, // no viaja en peticiones que otros sitios disparen
  secure: requestOrigin(request).startsWith("https:"),
  path: "/",
});

/** Entrar: valida la clave y guarda la sesión en una cookie. */
export async function POST(request: NextRequest) {
  try {
    const { key } = bodySchema.parse(await readJsonBody(request));
    if (!isValidCreatorKey(key)) {
      await new Promise((resolve) => setTimeout(resolve, 500)); // frena los intentos a ciegas
      return jsonResponse({ error: { code: "invalid_key", message: "La clave no es correcta." } }, { status: 401 });
    }
    const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(CREATOR_COOKIE, creatorSessionToken(), {
      ...cookieOptions(request),
      maxAge: CREATOR_SESSION_MAX_AGE,
    });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}

/** Salir: borra la cookie. */
export async function DELETE(request: NextRequest) {
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(CREATOR_COOKIE, "", { ...cookieOptions(request), maxAge: 0 });
  response.cookies.set(PORTFOLIO_COOKIE, "", { ...cookieOptions(request), maxAge: 0 }); // y el magic link (11.8)
  return response;
}
