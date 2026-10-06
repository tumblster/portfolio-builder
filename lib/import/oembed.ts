import "server-only";
import { createHash } from "node:crypto";
import { InvalidInputError } from "@/lib/errors";
import {
  INSTAGRAM_LINKS_ENABLED,
  INSTAGRAM_LINKS_SOON,
  LINK_INVALID,
  LINK_ONLY_TIKTOK,
  isInstagramHost,
  isTikTokHost,
  normalizeLink,
} from "@/lib/import/link-sources";
import { copyRemoteImage } from "@/lib/remote-image";
import { LIMITS, type Piece } from "@/lib/portfolio/schema";

/*
 * "Agregar por link" (spec 11.5): el creador pega la URL de un post PÚBLICO y se importa vía oEmbed (gratis, sin
 * Apify): portada, título y autor. oEmbed solo resuelve URLs sueltas (el import del perfil sigue con Apify).
 * - TikTok: https://www.tiktok.com/oembed?url=… (sin autenticación). Es lo único activo hoy (ronda 6 · 13.4).
 * - Instagram: OCULTO hasta que el dueño complete la verificación de empresa en Meta (decisión del 06/10/2026). Un
 *   link de Instagram responde "Los links de Instagram estarán disponibles pronto." sin llamar a Meta. El código
 *   queda listo abajo: usa el oEmbed de Meta con un app token gratuito en META_OEMBED_TOKEN ("APP_ID|CLIENT_TOKEN").
 *   Cómo activarlo: lib/import/link-sources.ts.
 * Los mensajes de error son para la creadora: nada de jerga técnica (los detalles van a los logs, nunca el token).
 * La portada se copia a nuestro almacenamiento (los links de los CDN caducan). TIKTOK_OEMBED_URL e
 * INSTAGRAM_OEMBED_URL solo existen para pruebas locales.
 */

const TIKTOK_HOSTS = [/(^|\.)tiktokcdn(-[a-z]+)?\.com$/i, /(^|\.)ttwstatic\.com$/i, /(^|\.)ibyteimg\.com$/i, /(^|\.)tiktokv\.com$/i];
const INSTAGRAM_HOSTS = [/(^|\.)cdninstagram\.com$/i, /(^|\.)fbcdn\.net$/i];

/** El post no se pudo leer (privado, borrado o link incompleto). */
const UNREADABLE = "No pudimos abrir ese video. Revisa que el link esté completo y que el video sea público.";
/** La plataforma no respondió a tiempo. */
const UNAVAILABLE = "No pudimos abrir ese video ahora. Intenta de nuevo en un momento.";

export type LinkPiece = Piece & { author: string | null };

function platformOf(url: URL): "tiktok" | "instagram" | null {
  const host = url.hostname.replace(/^www\./i, "").toLowerCase();
  if (isTikTokHost(host)) return "tiktok";
  if (isInstagramHost(host) && /^\/(p|reel|reels|tv)\/[A-Za-z0-9_-]+/.test(url.pathname)) return "instagram";
  return null;
}

async function fetchJson(endpoint: string) {
  let response: Response;
  try {
    response = await fetch(endpoint, { signal: AbortSignal.timeout(10_000), headers: { Accept: "application/json" } });
  } catch (error) {
    // No se loguea el endpoint: en Instagram lleva el token.
    console.warn("[agregar por link] la plataforma no respondió:", error);
    throw new InvalidInputError(UNAVAILABLE, 502);
  }
  if (!response.ok) {
    console.warn(`[agregar por link] la plataforma respondió HTTP ${response.status}`);
    throw new InvalidInputError(UNREADABLE);
  }
  const data: unknown = await response.json().catch(() => null);
  if (!data || typeof data !== "object") throw new InvalidInputError(UNREADABLE);
  return data as { title?: string; author_name?: string; thumbnail_url?: string };
}

export async function resolvePostLink(raw: string): Promise<LinkPiece> {
  let url: URL;
  try {
    url = new URL(normalizeLink(raw));
  } catch {
    throw new InvalidInputError(LINK_INVALID);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new InvalidInputError(LINK_INVALID);
  // 13.4: Instagram por link sigue oculto: mensaje amable, sin llamar a Meta.
  if (isInstagramHost(url.hostname.replace(/^www\./i, "").toLowerCase()) && !INSTAGRAM_LINKS_ENABLED) {
    throw new InvalidInputError(INSTAGRAM_LINKS_SOON);
  }
  const platform = platformOf(url);
  if (!platform) throw new InvalidInputError(LINK_ONLY_TIKTOK);
  let data: Awaited<ReturnType<typeof fetchJson>>;
  if (platform === "tiktok") {
    data = await fetchJson(`${process.env.TIKTOK_OEMBED_URL?.trim() || "https://www.tiktok.com/oembed"}?url=${encodeURIComponent(url.toString())}`);
  } else {
    // Listo para cuando el dueño active Instagram (lib/import/link-sources.ts).
    const token = process.env.META_OEMBED_TOKEN?.trim();
    if (!token) {
      // El detalle es para el dueño (logs); la creadora ve el mismo mensaje amable.
      console.error("[agregar por link] Instagram está activado pero falta META_OEMBED_TOKEN en las variables de entorno.");
      throw new InvalidInputError(INSTAGRAM_LINKS_SOON);
    }
    data = await fetchJson(
      `${process.env.INSTAGRAM_OEMBED_URL?.trim() || "https://graph.facebook.com/v21.0/instagram_oembed"}?url=${encodeURIComponent(url.toString())}&fields=title,author_name,thumbnail_url&access_token=${encodeURIComponent(token)}`,
    );
  }
  const image = await copyRemoteImage(data.thumbnail_url, platform === "tiktok" ? TIKTOK_HOSTS : INSTAGRAM_HOSTS);
  const clean = (data.title ?? "").replace(/\s+/g, " ").replace(/#\S+/g, "").trim();
  const title =
    (clean.length > LIMITS.pieceTitle ? `${clean.slice(0, LIMITS.pieceTitle - 1).trimEnd()}…` : clean) ||
    (platform === "tiktok" ? "Video de TikTok" : "Post de Instagram");
  return {
    id: `link-${createHash("sha256").update(url.toString()).digest("hex").slice(0, 24)}`,
    origin: "manual",
    title,
    niche: null,
    image,
    video: { platform, url: url.toString() },
    sourcePostId: undefined,
    author: data.author_name?.trim() || null,
  } as LinkPiece;
}
