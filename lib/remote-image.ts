import "server-only";
import { MAX_UPLOAD_BYTES, saveImage } from "@/lib/media";
import type { StoredImage } from "@/lib/portfolio/schema";

/*
 * Copia una imagen de otro sitio a nuestro almacenamiento, con la misma
 * normalización que una subida (WebP, 1600 px, sin metadatos).
 *
 * Seguridad: solo HTTPS, solo hosts de la lista que pasa cada llamador y sin
 * seguir redirecciones. Así una URL rara nunca hace que el servidor le pida
 * algo a otro sitio (ni a su propia red interna).
 */

const DOWNLOAD_TIMEOUT_MS = 15_000;

export function allowedUrl(raw: string | null | undefined, hosts: RegExp[]): URL | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && hosts.some((host) => host.test(url.hostname)) ? url : null;
  } catch {
    return null;
  }
}

/** Devuelve null si no se pudo (host no permitido, error, no es imagen): quien llama decide qué hacer. */
export async function copyRemoteImage(raw: string | null | undefined, hosts: RegExp[]): Promise<StoredImage | null> {
  const url = allowedUrl(raw, hosts);
  if (!url) return null;
  try {
    const response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      headers: { Accept: "image/avif,image/webp,image/jpeg,image/png,*/*;q=0.5" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (Number(response.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES) throw new Error("imagen muy pesada");
    return await saveImage(new Uint8Array(await response.arrayBuffer()));
  } catch (error) {
    console.warn(`[imagen] no se pudo copiar ${url.hostname}${url.pathname.slice(0, 40)}…:`, error);
    return null;
  }
}
