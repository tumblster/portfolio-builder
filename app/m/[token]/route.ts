import { NextResponse, type NextRequest } from "next/server";
import { MAGIC_LINK_TTL_MS, PORTFOLIO_COOKIE, verifyPortfolioToken } from "@/lib/magic-link";
import { setArchived } from "@/lib/portfolio/repository";
import { absoluteUrl, requestOrigin } from "@/lib/request";

/*
 * Abrir un magic link (spec 11.8): si la firma cuadra y no venció, deja la cookie de edición de ESE portafolio (dura lo
 * que le queda al link) y lleva al editor. Si no, a /acceso con un aviso de link vencido.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = verifyPortfolioToken(token);
  if (!valid) return NextResponse.redirect(absoluteUrl(request, "/acceso?enlace=vencido"), 303);
  // 11.9: el link de los avisos lleva ?reactivar=1: abrirlo vuelve a publicar el portafolio (1 clic).
  const reactivate = request.nextUrl.searchParams.get("reactivar") === "1";
  if (reactivate) await setArchived(valid.slug, false).catch(() => null);
  const response = NextResponse.redirect(absoluteUrl(request, `/editar/${valid.slug}${reactivate ? "?reactivado=1" : ""}`), 303);
  response.cookies.set(PORTFOLIO_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: requestOrigin(request).startsWith("https:"),
    path: "/",
    maxAge: Math.max(60, Math.min(Math.floor((valid.expiresAt - Date.now()) / 1000), MAGIC_LINK_TTL_MS / 1000)),
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
