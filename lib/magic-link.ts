import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ConfigError } from "@/lib/errors";

/*
 * Magic link (spec 11.8): sin usuario, sin contraseña, sin Google. Un token firmado (HMAC-SHA256) con el slug y su
 * vencimiento: 30 días, y solo sirve para ESE portafolio (volver a su link o editarlo). Se firma con MAGIC_LINK_SECRET
 * o, si no está, con una clave derivada de CREATOR_ACCESS_KEY (cambiar cualquiera de las dos invalida los links).
 * Formato: <payload base64url>.<firma base64url>; payload = {"s": slug, "e": vence (ms), "v": 1}.
 */

export const MAGIC_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Cookie que deja el magic link al abrirse: da acceso de edición a un solo portafolio. */
export const PORTFOLIO_COOKIE = "sc_portfolio";

function secret(): string {
  const own = process.env.MAGIC_LINK_SECRET?.trim();
  if (own) return own;
  const key = process.env.CREATOR_ACCESS_KEY?.trim();
  if (!key) throw new ConfigError("Falta MAGIC_LINK_SECRET (o CREATOR_ACCESS_KEY) para firmar los magic links.");
  return createHmac("sha256", key).update("portfolio-builder/magic-link/v1").digest("hex");
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

export function createPortfolioToken(slug: string, now = Date.now()): { token: string; expiresAt: Date } {
  const expiresAt = new Date(now + MAGIC_LINK_TTL_MS);
  const payload = Buffer.from(JSON.stringify({ s: slug, e: expiresAt.getTime(), v: 1 })).toString("base64url");
  return { token: `${payload}.${sign(payload)}`, expiresAt };
}

/** El slug que habilita el token, o null si la firma no cuadra, está mal formado o venció. */
export function verifyPortfolioToken(token: string | undefined | null, now = Date.now()): { slug: string; expiresAt: number } | null {
  if (!token) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { s?: unknown; e?: unknown; v?: unknown };
    if (data.v !== 1 || typeof data.s !== "string" || typeof data.e !== "number" || data.e <= now) return null;
    return { slug: data.s, expiresAt: data.e };
  } catch {
    return null;
  }
}
