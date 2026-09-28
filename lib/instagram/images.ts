import "server-only";
import type { StoredImage } from "@/lib/portfolio/schema";
import { copyRemoteImage } from "@/lib/remote-image";

/*
 * Las URLs de imágenes de Instagram caducan a los pocos días, así que se copian
 * a nuestro almacenamiento apenas se scrapea. Solo desde los CDN de Instagram/Facebook.
 */

const INSTAGRAM_HOSTS = [/(^|\.)cdninstagram\.com$/i, /(^|\.)fbcdn\.net$/i];

/** Copia una imagen de Instagram. Si no se puede, devuelve null (la importación sigue sin esa foto). */
export function copyInstagramImage(raw: string | null | undefined): Promise<StoredImage | null> {
  return copyRemoteImage(raw, INSTAGRAM_HOSTS);
}

/** Como Promise.all, pero con un máximo de tareas a la vez (no saturar el CDN ni la función). */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
