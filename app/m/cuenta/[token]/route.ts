import { NextResponse, type NextRequest } from "next/server";
import { ACCOUNT_COOKIE, MAGIC_LINK_TTL_MS, verifyAccountToken } from "@/lib/magic-link";
import { absoluteUrl, requestOrigin } from "@/lib/request";

/*
 * Abrir el link de la cuenta (ronda 6 · 13.14): si es un token de cuenta válido y vigente, deja la cookie del panel
 * (dura lo que le queda al link) y lleva a "Mis portafolios". Si no (vencido, alterado o un token de portafolio), a
 * /acceso con el aviso de link vencido.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let valid: ReturnType<typeof verifyAccountToken> = null;
  try {
    valid = verifyAccountToken(token);
  } catch {
    valid = null; // sin secreto para firmar (configuración incompleta): como un link inválido
  }
  if (!valid) return NextResponse.redirect(absoluteUrl(request, "/acceso?enlace=vencido"), 303);
  const response = NextResponse.redirect(absoluteUrl(request, "/mis-portafolios"), 303);
  response.cookies.set(ACCOUNT_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: requestOrigin(request).startsWith("https:"),
    path: "/",
    maxAge: Math.max(60, Math.min(Math.floor((valid.expiresAt - Date.now()) / 1000), MAGIC_LINK_TTL_MS / 1000)),
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
