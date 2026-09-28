import "server-only";
import type { NextRequest } from "next/server";

/*
 * Host y origen con los que llegó la petición.
 * No usamos request.nextUrl.origin: con `next start` siempre dice
 * localhost:3000, aunque abras la app desde tu celular por la red local.
 * Vercel y `next start` ponen el host real en X-Forwarded-Host.
 */

const firstValue = (header: string | null) => header?.split(",")[0].trim() || null;

export function requestHost(request: NextRequest): string {
  return firstValue(request.headers.get("x-forwarded-host")) ?? firstValue(request.headers.get("host")) ?? request.nextUrl.host;
}

export function requestOrigin(request: NextRequest): string {
  const proto = firstValue(request.headers.get("x-forwarded-proto")) ?? request.nextUrl.protocol.replace(/:$/, "");
  return `${proto}://${requestHost(request)}`;
}

/** Lo mismo para páginas (Server Components), con los encabezados de headers(). */
export function originFromHeaders(headers: Headers): string {
  const host = firstValue(headers.get("x-forwarded-host")) ?? firstValue(headers.get("host")) ?? "localhost:3000";
  const proto = firstValue(headers.get("x-forwarded-proto")) ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Link absoluto a una ruta de este sitio, p. ej. el portafolio público. */
export function absoluteUrl(request: NextRequest, path: string): string {
  return new URL(path, requestOrigin(request)).toString();
}
