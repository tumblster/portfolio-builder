import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ConfigError } from "@/lib/errors";

/*
 * Magic link (spec 11.8): sin usuario, sin contraseña, sin Google. Un token firmado (HMAC-SHA256) con su
 * vencimiento: 30 días. Se firma con MAGIC_LINK_SECRET o, si no está, con una clave derivada de CREATOR_ACCESS_KEY
 * (cambiar cualquiera de las dos invalida los links). Formato: <payload base64url>.<firma base64url>.
 *
 * Dos clases de token, que nunca se confunden:
 *  - de PORTAFOLIO (11.8): payload = {"s": slug, "e": vence (ms), "v": 1}. Edita SOLO ese portafolio.
 *  - de CUENTA (ronda 6 · 13.14): payload = {"a": clave de la cuenta, "e": vence, "v": 1, "t": "account"}. Abre el
 *    panel "Mis portafolios" de ese correo. Lleva la clave de la cuenta (un hash del correo), nunca el correo.
 * Un token de un tipo no sirve como del otro (se valida su forma completa, no solo la firma).
 */

export const MAGIC_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Cookie que deja el magic link al abrirse: da acceso de edición a un solo portafolio. */
export const PORTFOLIO_COOKIE = "sc_portfolio";
/** Cookie que deja el link de la cuenta (13.14): da acceso al panel "Mis portafolios" de ese correo. */
export const ACCOUNT_COOKIE = "sc_account";

function secret(): string {
  const own = process.env.MAGIC_LINK_SECRET?.trim();
  if (own) return own;
  const key = process.env.CREATOR_ACCESS_KEY?.trim();
  if (!key) throw new ConfigError("Falta MAGIC_LINK_SECRET (o CREATOR_ACCESS_KEY) para firmar los magic links.");
  return createHmac("sha256", key).update("portfolio-builder/magic-link/v1").digest("hex");
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

function seal(data: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** El contenido de un token con la firma correcta, versión 1 y sin vencer; null si no. */
function open(token: string | undefined | null, now: number): Record<string, unknown> | null {
  if (!token) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as unknown;
    if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
    const record = data as Record<string, unknown>;
    if (record.v !== 1 || typeof record.e !== "number" || record.e <= now) return null;
    return record;
  } catch {
    return null;
  }
}

export function createPortfolioToken(slug: string, now = Date.now()): { token: string; expiresAt: Date } {
  const expiresAt = new Date(now + MAGIC_LINK_TTL_MS);
  return { token: seal({ s: slug, e: expiresAt.getTime(), v: 1 }), expiresAt };
}

/** El slug que habilita el token, o null si la firma no cuadra, está mal formado, venció o es de una cuenta. */
export function verifyPortfolioToken(token: string | undefined | null, now = Date.now()): { slug: string; expiresAt: number } | null {
  const data = open(token, now);
  if (!data || data.t !== undefined || typeof data.s !== "string") return null;
  return { slug: data.s, expiresAt: data.e as number };
}

/** 13.14: token de la cuenta (abre "Mis portafolios"). `accountKey`: lib/portfolio/owners.ts → accountKey(correo). */
export function createAccountToken(accountKey: string, now = Date.now()): { token: string; expiresAt: Date } {
  const expiresAt = new Date(now + MAGIC_LINK_TTL_MS);
  return { token: seal({ a: accountKey, e: expiresAt.getTime(), v: 1, t: "account" }), expiresAt };
}

/** La cuenta que habilita el token, o null si no es un token de cuenta válido y vigente. */
export function verifyAccountToken(token: string | undefined | null, now = Date.now()): { accountKey: string; expiresAt: number } | null {
  const data = open(token, now);
  if (!data || data.t !== "account" || typeof data.a !== "string" || !/^[0-9a-f]{40}$/.test(data.a)) return null;
  return { accountKey: data.a, expiresAt: data.e as number };
}
