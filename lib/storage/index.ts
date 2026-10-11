import "server-only";
import { ConfigError } from "@/lib/errors";
import { blobStorage } from "./blob";
import { diskStorage } from "./disk";
import { r2GetMedia, r2PutMedia } from "./r2";

/*
 * Dónde se guardan los datos:
 *  - En Vercel: un Blob store PRIVADO (JSON de portafolios + imágenes).
 *  - En tu compu: la carpeta .data/ del proyecto (no se sube a git).
 *  - Con STORAGE_DRIVER=r2: los JSON siguen en Vercel Blob, pero las IMÁGENES van a Cloudflare R2
 *    (cada subida a Vercel Blob cuenta como operación avanzada: 2,000/mes en Hobby; en R2 el free tier
 *    sobra). Requiere R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY y R2_BUCKET en las env vars.
 *
 * La elección es explícita a propósito: aunque bajes las variables de Vercel
 * a tu compu, en local NO se escribe en producción salvo que pongas
 * STORAGE_DRIVER=blob en .env.local.
 */

export type StoredJson = { data: unknown; etag: string };

export type StoredMedia = {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  size: number | null;
};

export interface Storage {
  readonly name: "blob" | "local" | "r2";
  /** Lee la última versión (sin caché) o null si no existe. */
  readJson(path: string): Promise<StoredJson | null>;
  /** Crea el archivo solo si no existe. Devuelve false si ya existía. */
  createJson(path: string, data: unknown): Promise<boolean>;
  /** Reemplaza solo si nadie lo cambió desde que se leyó (etag). Devuelve false si cambió. */
  replaceJson(path: string, data: unknown, etag: string): Promise<boolean>;
  /** Guarda una imagen nueva (los nombres son únicos y nunca se sobrescriben). */
  putMedia(file: string, bytes: Uint8Array, contentType: string): Promise<void>;
  getMedia(file: string): Promise<StoredMedia | null>;
  /** Rutas de los archivos bajo un prefijo de carpeta (p. ej. "portfolios/"). Spec 11.9 (limpieza por inactividad). */
  list(prefix: string): Promise<string[]>;
  /** Borra un archivo si existe (si no, no hace nada). Spec 11.9. */
  deleteJson(path: string): Promise<void>;
}

export function getStorage(): Storage {
  const onVercel = Boolean(process.env.VERCEL);
  // Los stores se conectaron con prefijo por entorno (Vercel lo exigió):
  // PROD_BLOB_* en producción, PREV_BLOB_* en preview. El SDK espera BLOB_READ_WRITE_TOKEN.
  if (onVercel && !process.env.BLOB_READ_WRITE_TOKEN) {
    const prefix = process.env.VERCEL_ENV === "production" ? "PROD_BLOB" : "PREV_BLOB";
    const token = process.env[`${prefix}_READ_WRITE_TOKEN`];
    const storeId = process.env[`${prefix}_STORE_ID`];
    if (token) process.env.BLOB_READ_WRITE_TOKEN = token;
    if (storeId) process.env.BLOB_STORE_ID = storeId;
  }

  const choice = process.env.STORAGE_DRIVER?.trim().toLowerCase() || (onVercel ? "blob" : "local");

  if (choice === "blob") {
    if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) {
      throw new ConfigError(
        "No hay un Blob store conectado. En Vercel: Storage → Create → Blob con acceso Private, y conéctalo a este proyecto.",
      );
    }
    return blobStorage;
  }
  if (choice === "r2") {
    // Híbrido: los JSON siguen en Vercel Blob (el candado con etags ya está probado ahí); solo las imágenes
    // van a R2. La lectura cae a Vercel Blob si la imagen es anterior a la mudanza (puente de transición).
    if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) {
      throw new ConfigError(
        "STORAGE_DRIVER=r2 también necesita el Blob store de Vercel para los JSON. Conéctalo como con \"blob\".",
      );
    }
    for (const name of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"]) {
      if (!process.env[name]?.trim()) {
        throw new ConfigError(
          `Falta la variable ${name} para STORAGE_DRIVER=r2. En Vercel: Settings → Environment Variables del proyecto.`,
        );
      }
    }
    return {
      ...blobStorage,
      name: "r2" as const,
      putMedia: r2PutMedia,
      getMedia: async (file: string) => (await r2GetMedia(file)) ?? blobStorage.getMedia(file),
    };
  }
  if (choice === "local") {
    if (onVercel) {
      throw new ConfigError(
        "STORAGE_DRIVER=local no funciona en Vercel porque su disco no es permanente. Quita esa variable y conecta un Blob store.",
      );
    }
    return diskStorage;
  }
  throw new ConfigError(`STORAGE_DRIVER inválido ("${choice}"). Usa "local", "blob" o "r2".`);
}
