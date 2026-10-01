import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { PORTFOLIO_COOKIE, verifyPortfolioToken } from "@/lib/magic-link";
import type { NextRequest } from "next/server";
import { ConfigError, errorResponse, jsonResponse } from "@/lib/errors";
import { requestHost } from "@/lib/request";

/*
 * Protección del creador: una sola clave compartida en CREATOR_ACCESS_KEY.
 * No son cuentas. La página pública /p/... sigue abierta para todos.
 *
 * Dos formas de presentar la clave:
 *  - Encabezado x-creator-key: para scripts y curl.
 *  - Cookie sc_creator: la crea la pantalla de acceso (/acceso). Guarda un
 *    valor derivado de la clave, nunca la clave misma. Si cambias la clave,
 *    todas las sesiones abiertas se cierran solas.
 */

export const CREATOR_HEADER = "x-creator-key";
export const CREATOR_COOKIE = "sc_creator";
export const CREATOR_SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 días, en segundos

const MIN_KEY_LENGTH = 24;

function readKey(): string {
  const key = process.env.CREATOR_ACCESS_KEY?.trim();
  if (!key) {
    throw new ConfigError(
      "Falta CREATOR_ACCESS_KEY. Agrégala en .env.local (en tu compu) o en las variables de entorno de Vercel.",
    );
  }
  if (key.length < MIN_KEY_LENGTH) {
    throw new ConfigError(
      `CREATOR_ACCESS_KEY es muy corta: usa al menos ${MIN_KEY_LENGTH} caracteres (genera una con: openssl rand -base64 32).`,
    );
  }
  return key;
}

const digest = (value: string) => createHash("sha256").update(value).digest();

/** Compara secretos en tiempo constante para no filtrar pistas por cuánto tarda la respuesta. */
const sameSecret = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));

/** Valor de la cookie de sesión: se deriva de la clave con HMAC. */
export function creatorSessionToken(): string {
  return createHmac("sha256", readKey()).update("portfolio-builder/creator-session/v1").digest("base64url");
}

/** ¿Es la clave del creador? (pantalla de acceso). */
export function isValidCreatorKey(candidate: string): boolean {
  return sameSecret(candidate.trim(), readKey());
}

/**
 * ¿La petición viene de una página de este mismo sitio? Compara el host del
 * encabezado Origin con el host al que llegó la petición (en Vercel, X-Forwarded-Host).
 * Sin Origin (curl, scripts) no es un navegador de terceros: se acepta.
 */
function comesFromSameSite(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) return true;
  try {
    return new URL(origin).host === requestHost(request);
  } catch {
    return false; // Origin mal formado (o "null")
  }
}

/**
 * Para rutas de la API. Devuelve una respuesta de error si la petición no trae
 * la clave, o null si puede seguir.
 * Uso:  const denied = requireCreator(request); if (denied) return denied;
 */
export function requireCreator(request: NextRequest): Response | null {
  try {
    const key = readKey();

    const header = request.headers.get(CREATOR_HEADER);
    if (header && sameSecret(header, key)) return null;

    const cookie = request.cookies.get(CREATOR_COOKIE)?.value;
    if (cookie && sameSecret(cookie, creatorSessionToken())) {
      // Con cookie, las escrituras solo se aceptan desde este mismo sitio (defensa extra contra CSRF).
      const isWrite = request.method !== "GET" && request.method !== "HEAD";
      if (isWrite && !comesFromSameSite(request)) {
        return jsonResponse({ error: { code: "forbidden", message: "Origen no permitido." } }, { status: 403 });
      }
      return null;
    }

    return jsonResponse(
      { error: { code: "unauthorized", message: "Necesitas la clave del creador para hacer esto." } },
      { status: 401 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export type CreatorAccess = { status: "ok" } | { status: "no-session" } | { status: "not-configured"; message: string };

/** Para páginas: ¿quien navega tiene la cookie de sesión válida? */
export async function getCreatorAccess(): Promise<CreatorAccess> {
  let expected: string;
  try {
    expected = creatorSessionToken();
  } catch (error) {
    if (error instanceof ConfigError) return { status: "not-configured", message: error.message };
    throw error;
  }
  const cookie = (await cookies()).get(CREATOR_COOKIE)?.value;
  return cookie && sameSecret(cookie, expected) ? { status: "ok" } : { status: "no-session" };
}

/*
 * Spec 11.8: además de la clave del piloto, un magic link deja editar UN portafolio (cookie sc_portfolio con el token
 * firmado; vence a los 30 días). Las escrituras con cookie solo se aceptan desde este mismo sitio.
 */
const portfolioCookieSlug = (request: NextRequest) => verifyPortfolioToken(request.cookies.get(PORTFOLIO_COOKIE)?.value)?.slug ?? null;

/** Para las rutas de UN portafolio: pasa con la clave del creador o con el magic link de ese mismo portafolio. */
export function requirePortfolioEditor(request: NextRequest, slug: string): Response | null {
  const denied = requireCreator(request);
  if (!denied) return null;
  if (portfolioCookieSlug(request) !== slug) return denied;
  const isWrite = request.method !== "GET" && request.method !== "HEAD";
  if (isWrite && !comesFromSameSite(request)) {
    return jsonResponse({ error: { code: "forbidden", message: "Origen no permitido." } }, { status: 403 });
  }
  return null;
}

/** Subir imágenes: con la clave del creador o con cualquier magic link vigente (quien edita su portafolio). */
export function requireUploader(request: NextRequest): Response | null {
  const denied = requireCreator(request);
  if (!denied || !portfolioCookieSlug(request)) return denied;
  return comesFromSameSite(request) ? null : jsonResponse({ error: { code: "forbidden", message: "Origen no permitido." } }, { status: 403 });
}

/** Para páginas de UN portafolio (el editor): "creator" (clave), "owner" (su magic link) o sin acceso. */
export async function getPortfolioAccess(slug: string): Promise<CreatorAccess | { status: "owner" }> {
  const access = await getCreatorAccess();
  if (access.status !== "no-session") return access;
  const token = (await cookies()).get(PORTFOLIO_COOKIE)?.value;
  return verifyPortfolioToken(token)?.slug === slug ? { status: "owner" } : access;
}
