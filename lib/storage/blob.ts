import "server-only";
import { BlobError, BlobNotFoundError, BlobPreconditionFailedError, get, head, put } from "@vercel/blob";
import type { Storage } from "./index";

/*
 * Vercel Blob en modo PRIVADO:
 *  - Los JSON se leen con useCache: false, que va directo al origen y garantiza
 *    ver la última versión justo después de guardar (solo existe en tiendas privadas).
 *  - Las ediciones usan ifMatch (etag): si alguien guardó en medio, no se pisa.
 *  - Las imágenes no son públicas por URL directa: se sirven por /media/[file].
 */

const JSON_CACHE_SECONDS = 60; // el mínimo que permite Blob
const MEDIA_CACHE_SECONDS = 60 * 60 * 24 * 365; // las imágenes nunca cambian

async function exists(pathname: string): Promise<boolean> {
  try {
    await head(pathname);
    return true;
  } catch (error) {
    if (error instanceof BlobNotFoundError) return false;
    throw error;
  }
}

const isAlreadyExistsError = (error: unknown) =>
  error instanceof BlobError && /already exists/i.test(error.message);

export const blobStorage: Storage = {
  name: "blob",

  async readJson(pathname) {
    const result = await get(pathname, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) return null;
    const text = await new Response(result.stream).text();
    return { data: JSON.parse(text), etag: result.blob.etag };
  },

  async createJson(pathname, data) {
    if (await exists(pathname)) return false;
    try {
      await put(pathname, JSON.stringify(data), {
        access: "private",
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: false, // si otro lo creó en el mismo instante, falla en vez de pisarlo
        cacheControlMaxAge: JSON_CACHE_SECONDS,
      });
      return true;
    } catch (error) {
      if (isAlreadyExistsError(error)) return false;
      throw error;
    }
  },

  async replaceJson(pathname, data, etag) {
    try {
      await put(pathname, JSON.stringify(data), {
        access: "private",
        contentType: "application/json",
        ifMatch: etag,
        cacheControlMaxAge: JSON_CACHE_SECONDS,
      });
      return true;
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError) return false;
      throw error;
    }
  },

  async putMedia(file, bytes, contentType) {
    await put(`media/${file}`, Buffer.from(bytes), {
      access: "private",
      contentType,
      addRandomSuffix: false,
      allowOverwrite: false,
      cacheControlMaxAge: MEDIA_CACHE_SECONDS,
    });
  },

  async getMedia(file) {
    const result = await get(`media/${file}`, { access: "private" });
    if (!result || result.statusCode !== 200) return null;
    return { body: result.stream, contentType: result.blob.contentType, size: result.blob.size };
  },
};
