import { NextResponse, type NextRequest } from "next/server";
import { ACCOUNT_COOKIE } from "@/lib/magic-link";
import { absoluteUrl } from "@/lib/request";

/*
 * Salir del panel "Mis portafolios" (ronda 6 · 13.14): borra la cookie de la cuenta y vuelve al panel (que pide el
 * correo). Los magic links de cada portafolio ya abiertos siguen como estaban.
 */
export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(absoluteUrl(request, "/mis-portafolios"), 303);
  response.cookies.delete(ACCOUNT_COOKIE);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
