import "server-only";
import { createHash } from "node:crypto";
import { InvalidInputError } from "@/lib/errors";
import { copyRemoteImage } from "@/lib/remote-image";
import { LIMITS, type Piece } from "@/lib/portfolio/schema";

/*
 * "Agregar por link" (spec 11.5): el creador pega la URL de un post PÚBLICO y se importa vía oEmbed (gratis, sin
 * Apify): portada, título y autor. oEmbed solo resuelve URLs sueltas (el import del perfil sigue con Apify).
 * - TikTok: https://www.tiktok.com/oembed?url=… (sin autenticación).
 * - Instagram: oEmbed de Meta, con un app token gratuito en META_OEMBED_TOKEN ("APP_ID|CLIENT_TOKEN"). Sin token,
 *   los links de Instagram se rechazan con un mensaje claro (los de TikTok funcionan igual).
 * La portada se copia a nuestro almacenamiento (los links de los CDN caducan). TIKTOK_OEMBED_URL e
 * INSTAGRAM_OEMBED_URL solo existen para pruebas locales.
 */

const TIKTOK_HOSTS = [/(^|\.)tiktokcdn(-[a-z]+)?\.com$/i, /(^|\.)ttwstatic\.com$/i, /(^|\.)ibyteimg\.com$/i, /(^|\.)tiktokv\.com$/i];
const INSTAGRAM_HOSTS = [/(^|\.)cdninstagram\.com$/i, /(^|\.)fbcdn\.net$/i];

export type LinkPiece = Piece & { author: string | null };

function platformOf(url: URL): "tiktok" | "instagram" | null {
  const host = url.hostname.replace(/^www\./, "");
  if (/(^|\.)tiktok\.com$/.test(host)) return "tiktok";
  if (host === "instagram.com" && /^\/(p|reel|reels|tv)\/[A-Za-z0-9_-]+/.test(url.pathname)) return "instagram";
  return null;
}

async function fetchJson(endpoint: string) {
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(10_000), headers: { Accept: "application/json" } });
  if (!response.ok) throw new InvalidInputError("No pudimos leer ese post. ¿Es público? Revisa el link e intenta de nuevo.");
  return (await response.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
}

export async function resolvePostLink(raw: string): Promise<LinkPiece> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new InvalidInputError("Pega el link completo del post (empieza con https://).");
  }
  const platform = platformOf(url);
  if (!platform) throw new InvalidInputError("Por ahora se puede agregar por link un post de Instagram o un video de TikTok.");
  let data: Awaited<ReturnType<typeof fetchJson>>;
  if (platform === "tiktok") {
    data = await fetchJson(`${process.env.TIKTOK_OEMBED_URL?.trim() || "https://www.tiktok.com/oembed"}?url=${encodeURIComponent(url.toString())}`);
  } else {
    const token = process.env.META_OEMBED_TOKEN?.trim();
    if (!token) {
      throw new InvalidInputError("Agregar posts de Instagram por link aún no está activado (falta el token de Meta). Los de TikTok sí funcionan.");
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
