import "server-only";
import { z } from "zod";
import { assertApifyConfigured, scrapeInstagramProfile } from "@/lib/instagram/apify";
import { copyInstagramImage } from "@/lib/instagram/images";
import { storedImageSchema, type StoredImage } from "@/lib/portfolio/schema";
import { getStorage } from "@/lib/storage";

/*
 * Logo de una marca para Brand partners (ronda 6 · 13.19 b): la foto de perfil de su Instagram, leída con el mismo
 * actor de Apify del import (apify/instagram-scraper, modo details) y copiada a NUESTRO almacenamiento (las URLs de
 * Instagram caducan).
 *
 * Si no hay crédito en Apify, falta la configuración, tarda demasiado o la cuenta es privada, devuelve null y el
 * studio usa el logo subido o la inicial de la marca. Nunca Google ni Wikipedia (descartados por el dueño).
 *
 * Costo: una corrida por marca (≈ US$0,003). Para no pagar dos veces por la misma marca, el resultado queda en
 * brand-logos/<usuario>.json: el logo encontrado vale 30 días; "no tiene foto" vale 1 día. Los errores del proveedor
 * (sin crédito, sin token, tiempo agotado) no se guardan, así se reintenta cuando vuelva el crédito.
 */

const FOUND_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MISSING_TTL_MS = 24 * 60 * 60 * 1000;
/** Debajo del maxDuration de la ruta (60 s): si Apify tarda más, se sigue con el fallback. */
const LOOKUP_TIMEOUT_MS = 45_000;

const cachePath = (handle: string) => `brand-logos/${handle}.json`;
const cacheSchema = z.object({ at: z.iso.datetime(), logo: storedImageSchema.nullable() });
type CacheEntry = z.infer<typeof cacheSchema>;

export type BrandLogoLookup = { logo: StoredImage | null; source: "cache" | "instagram" | "none" };

async function readCache(handle: string): Promise<CacheEntry | null> {
  try {
    const stored = await getStorage().readJson(cachePath(handle));
    if (!stored) return null;
    const parsed = cacheSchema.safeParse(stored.data);
    if (!parsed.success) return null;
    const age = Date.now() - Date.parse(parsed.data.at);
    return age < (parsed.data.logo ? FOUND_TTL_MS : MISSING_TTL_MS) ? parsed.data : null;
  } catch {
    return null;
  }
}

async function writeCache(handle: string, logo: StoredImage | null): Promise<void> {
  const storage = getStorage();
  const entry: CacheEntry = { at: new Date().toISOString(), logo };
  try {
    if (await storage.createJson(cachePath(handle), entry)) return;
    const current = await storage.readJson(cachePath(handle));
    if (current) await storage.replaceJson(cachePath(handle), entry, current.etag);
  } catch (error) {
    console.warn(JSON.stringify({ scope: "brand-logo", event: "cache.write_failed", handle, error: String(error) }));
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Tiempo de espera agotado al buscar el logo.")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** El logo de la marca (usuario de Instagram ya validado), o null para usar el fallback. Nunca lanza. */
export async function findBrandLogo(handle: string): Promise<BrandLogoLookup> {
  const cached = await readCache(handle);
  if (cached) return { logo: cached.logo, source: cached.logo ? "cache" : "none" };

  try {
    assertApifyConfigured();
  } catch {
    return { logo: null, source: "none" };
  }

  let result: Awaited<ReturnType<typeof scrapeInstagramProfile>>;
  try {
    result = await withTimeout(scrapeInstagramProfile(handle), LOOKUP_TIMEOUT_MS);
  } catch (error) {
    // Sin crédito, tope de gasto, tiempo agotado o error de red: se usa el fallback y no se guarda nada.
    console.warn(JSON.stringify({ scope: "brand-logo", event: "lookup.failed", handle, error: String(error) }));
    return { logo: null, source: "none" };
  }

  const logo =
    result.status === "ok" ? await copyInstagramImage(result.profile.profilePicUrlHD ?? result.profile.profilePicUrl) : null;
  await writeCache(handle, logo);
  return { logo, source: logo ? "instagram" : "none" };
}
