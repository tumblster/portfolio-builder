import "server-only";
import { ConfigError } from "@/lib/errors";
import { blobStorage } from "./blob";
import { diskStorage } from "./disk";

/*
 * Dónde se guardan los datos:
 *  - En Vercel: un Blob store PRIVADO (JSON de portafolios + imágenes).
 *  - En tu compu: la carpeta .data/ del proyecto (no se sube a git).
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
  readonly name: "blob" | "local";
  /** Lee la última versión (sin caché) o null si no existe. */
  readJson(path: string): Promise<StoredJson | null>;
  /** Crea el archivo solo si no existe. Devuelve false si ya existía. */
  createJson(path: string, data: unknown): Promise<boolean>;
  /** Reemplaza solo si nadie lo cambió desde que se leyó (etag). Devuelve false si cambió. */
  replaceJson(path: string, data: unknown, etag: string): Promise<boolean>;
  /** Guarda una imagen nueva (los nombres son únicos y nunca se sobrescriben). */
  putMedia(file: string, bytes: Uint8Array, contentType: string): Promise<void>;
  getMedia(file: string): Promise<StoredMedia | null>;
}

export function getStorage(): Storage {
  const onVercel = Boolean(process.env.VERCEL);
  const choice = process.env.STORAGE_DRIVER?.trim().toLowerCase() || (onVercel ? "blob" : "local");

  if (choice === "blob") {
    if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) {
      throw new ConfigError(
        "No hay un Blob store conectado. En Vercel: Storage → Create → Blob con acceso Private, y conéctalo a este proyecto.",
      );
    }
    return blobStorage;
  }
  if (choice === "local") {
    if (onVercel) {
      throw new ConfigError(
        "STORAGE_DRIVER=local no funciona en Vercel porque su disco no es permanente. Quita esa variable y conecta un Blob store.",
      );
    }
    return diskStorage;
  }
  throw new ConfigError(`STORAGE_DRIVER inválido ("${choice}"). Usa "local" o "blob".`);
}
