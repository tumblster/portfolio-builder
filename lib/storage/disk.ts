import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import type { Storage } from "./index";

/*
 * Solo para desarrollo: guarda todo en la carpeta .data/ del proyecto
 * (está en .gitignore). Se comporta igual que Blob: crear sin pisar,
 * reemplazar solo si nadie cambió el archivo, imágenes que nunca se sobrescriben.
 */

const ROOT = path.join(/* turbopackIgnore: true */ process.cwd(), ".data");

const CONTENT_TYPES: Record<string, string> = { ".webp": "image/webp" };

/** Resuelve una ruta dentro de .data/ y bloquea cualquier intento de salir de ahí. */
function resolveInside(relative: string): string {
  const full = path.resolve(ROOT, relative);
  if (!full.startsWith(ROOT + path.sep)) throw new Error(`Ruta fuera de .data/: ${relative}`);
  return full;
}

const etagOf = (content: Buffer) => createHash("sha1").update(content).digest("hex");

const hasCode = (error: unknown, code: string) =>
  typeof error === "object" && error !== null && "code" in error && error.code === code;

async function readIfExists(full: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(full);
  } catch (error) {
    if (hasCode(error, "ENOENT")) return null;
    throw error;
  }
}

export const diskStorage: Storage = {
  name: "local",

  async readJson(relative) {
    const content = await readIfExists(resolveInside(relative));
    return content ? { data: JSON.parse(content.toString("utf8")), etag: etagOf(content) } : null;
  },

  async createJson(relative, data) {
    const full = resolveInside(relative);
    await fs.mkdir(path.dirname(full), { recursive: true });
    try {
      await fs.writeFile(full, JSON.stringify(data, null, 2), { flag: "wx" }); // wx = falla si ya existe
      return true;
    } catch (error) {
      if (hasCode(error, "EEXIST")) return false;
      throw error;
    }
  },

  async replaceJson(relative, data, etag) {
    const full = resolveInside(relative);
    const current = await readIfExists(full);
    if (!current || etagOf(current) !== etag) return false;
    const temp = `${full}.${randomUUID()}.tmp`;
    await fs.writeFile(temp, JSON.stringify(data, null, 2));
    await fs.rename(temp, full); // reemplazo atómico
    return true;
  },

  async putMedia(file, bytes) {
    const full = resolveInside(path.join("media", file));
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, bytes, { flag: "wx" });
  },

  async getMedia(file) {
    const full = resolveInside(path.join("media", file));
    try {
      const stats = await fs.stat(full);
      const body = Readable.toWeb(createReadStream(full)) as ReadableStream<Uint8Array>;
      return {
        body,
        contentType: CONTENT_TYPES[path.extname(file)] ?? "application/octet-stream",
        size: stats.size,
      };
    } catch (error) {
      if (hasCode(error, "ENOENT")) return null;
      throw error;
    }
  },
};
