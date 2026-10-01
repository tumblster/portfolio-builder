import "server-only";
import { BlobError, BlobNotFoundError, BlobPreconditionFailedError, del, get, head, list, put } from "@vercel/blob";
import type { Storage } from "./index";

/*
 * Vercel Blob en modo PRIVADO:
 *  - Los JSON se leen con useCache: false, que va directo al origen y garantiza
 *    ver la última versión justo después de guardar (solo existe en tiendas privadas).
 *  - Las ediciones usan ifMatch (etag): si alguien guardó en medio, no se pisa.
 *  - Spec 10.1: el etag para ifMatch es el CANÓNICO de la API (el de head() / put()), no el header HTTP ETag de la
 *    descarga (el de get()). El SDK solo documenta como válidos para ifMatch los de head, put y list; el de get es
 *    para ifNoneMatch (lecturas 304) y puede venir en otro formato (entre comillas o débil W/"…"). Con el de get,
 *    toda escritura condicional respondía 412: "La escritura condicional del borrador falló sin que otra petición
 *    lo tomara (etag)", y nunca se generaba nada. Verificable en el deployment: GET /api/import/health?roundtrip=1.
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
    // Primero el etag canónico (head), DESPUÉS el contenido. En ese orden, si el archivo cambia entre medio, el
    // contenido leído es más nuevo que el etag y la escritura condicional falla (412) en vez de pisar algo: nunca se
    // pierde un cambio. El diseño del candado no cambia.
    let meta: Awaited<ReturnType<typeof head>>;
    try {
      meta = await head(pathname);
    } catch (error) {
      if (error instanceof BlobNotFoundError) return null;
      throw error;
    }
    const result = await get(pathname, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) return null;
    const text = await new Response(result.stream).text();
    return { data: JSON.parse(text), etag: meta.etag };
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
  async list(prefix) {
    const paths: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix, cursor, limit: 1000 });
      paths.push(...page.blobs.map((blob) => blob.pathname));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return paths;
  },
  async deleteJson(pathname) {
    await del(pathname);
  },
};

/**
 * Autodiagnóstico de escrituras condicionales en el Blob store real (spec 10.1), para verificar la causa en el
 * deployment: compara el etag de head() con el de get() y prueba ifMatch con cada uno. Escribe solo en
 * health/etag-check.json. Lo expone GET /api/import/health?roundtrip=1 (con sesión).
 */
export async function diagnoseBlobEtags(): Promise<Record<string, unknown>> {
  const pathname = "health/etag-check.json";
  const write = (n: number, ifMatch?: string) =>
    put(pathname, JSON.stringify({ n, at: new Date().toISOString() }), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      cacheControlMaxAge: JSON_CACHE_SECONDS,
      ...(ifMatch ? { ifMatch } : { allowOverwrite: true }),
    });
  const attempt = async (n: number, ifMatch: string) => {
    try {
      await write(n, ifMatch);
      return "ok";
    } catch (error) {
      return error instanceof BlobPreconditionFailedError ? "412 (precondición fallida)" : `error: ${String(error)}`;
    }
  };
  const putEtag = (await write(0)).etag;
  const headEtag = (await head(pathname)).etag;
  const got = await get(pathname, { access: "private", useCache: false });
  const getEtag = got?.blob.etag ?? "";
  const writeWithGetEtag = await attempt(1, getEtag);
  const freshHead = (await head(pathname)).etag;
  const writeWithHeadEtag = await attempt(2, freshHead);
  const staleWrite = await attempt(3, freshHead); // ya no es la versión actual: debe rechazarse
  return {
    putEtag,
    headEtag,
    getEtag,
    sameEtag: headEtag === getEtag,
    writeWithGetEtag,
    writeWithHeadEtag,
    staleWriteRejected: staleWrite.startsWith("412"),
  };
}
