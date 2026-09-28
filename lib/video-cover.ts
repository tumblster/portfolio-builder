import "server-only";
import type { StoredImage, VideoLink } from "@/lib/portfolio/schema";
import { allowedUrl, copyRemoteImage } from "@/lib/remote-image";

/*
 * Portada automática para piezas de video agregadas a mano (RF-02):
 *  - YouTube: la miniatura pública del video (i.ytimg.com).
 *  - TikTok: su oEmbed oficial devuelve la miniatura (720×1280).
 *  - Instagram no entrega portadas sin una app de Meta: se sube a mano (opcional).
 */

const YOUTUBE_IMAGE_HOSTS = [/^i\.ytimg\.com$/i];
const TIKTOK_OEMBED = "https://www.tiktok.com/oembed";
const TIKTOK_IMAGE_HOSTS = [/(^|\.)tiktokcdn(-[a-z]+)?\.com$/i, /(^|\.)muscdn\.com$/i, /(^|\.)i?byteimg\.com$/i];

/** "https://youtu.be/abc123" / "…/watch?v=abc123" / "…/shorts/abc123" → "abc123" */
export function youTubeVideoId(raw: string): string | null {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
    const candidate =
      host === "youtu.be"
        ? url.pathname.split("/")[1]
        : (url.searchParams.get("v") ?? url.pathname.match(/^\/(?:shorts|live|embed)\/([^/?#]+)/)?.[1]);
    return candidate && /^[\w-]{6,20}$/.test(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

async function tiktokThumbnailUrl(videoUrl: string): Promise<string | null> {
  const endpoint = new URL(TIKTOK_OEMBED);
  endpoint.searchParams.set("url", videoUrl);
  try {
    const response = await fetch(endpoint, {
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data: unknown = await response.json();
    const thumbnail = typeof data === "object" && data !== null ? (data as Record<string, unknown>).thumbnail_url : null;
    return typeof thumbnail === "string" && allowedUrl(thumbnail, TIKTOK_IMAGE_HOSTS) ? thumbnail : null;
  } catch (error) {
    console.warn("[portada] TikTok oEmbed falló:", error);
    return null;
  }
}

/** Copia la portada del video a nuestro almacenamiento, o null si no se consiguió. */
export async function fetchVideoCover(video: VideoLink): Promise<StoredImage | null> {
  if (video.platform === "youtube") {
    const id = youTubeVideoId(video.url);
    if (!id) return null;
    // maxresdefault (1280×720) no existe en todos los videos; hqdefault (480×360) siempre.
    for (const size of ["maxresdefault", "hqdefault"]) {
      const image = await copyRemoteImage(`https://i.ytimg.com/vi/${id}/${size}.jpg`, YOUTUBE_IMAGE_HOSTS);
      if (image) return image;
    }
    return null;
  }
  if (video.platform === "tiktok") {
    return copyRemoteImage(await tiktokThumbnailUrl(video.url), TIKTOK_IMAGE_HOSTS);
  }
  return null;
}
