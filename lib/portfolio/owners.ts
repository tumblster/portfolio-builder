import "server-only";
import { createHash } from "node:crypto";
import { getStorage } from "@/lib/storage";

/*
 * El correo ES la cuenta (spec 12.1, estilo Substack): sin contraseña ni registro tradicional. Se pide en "Portafolio
 * listo" y se guarda desde ese primer registro; cada acceso posterior es un magic link a ese correo (11.8). Se usa
 * solo para eso y para los avisos de archivado (11.9) y de hitos (12.8).
 *  - owners/<slug>.json → { email, savedAt, igsid? } (igsid: si algún día escribió a @supercreador.tech, 12.2)
 *  - accounts/<sha256(correo)>.json → { email, slugs } (para entrar solo con el correo)
 */

export type Owner = { email: string; savedAt: string; igsid?: string };
const ownerPath = (slug: string) => `owners/${slug}.json`;
const normalize = (email: string) => email.trim().toLowerCase();
const accountPath = (email: string) => `accounts/${createHash("sha256").update(normalize(email)).digest("hex").slice(0, 40)}.json`;

export async function getOwner(slug: string): Promise<Owner | null> {
  return ((await getStorage().readJson(ownerPath(slug)))?.data as Owner | undefined) ?? null;
}

/** Escribe o reemplaza (con un reintento si alguien escribió en medio). */
async function upsert(path: string, build: (current: unknown) => unknown) {
  const storage = getStorage();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await storage.readJson(path);
    const next = build(current?.data ?? null);
    if (current ? await storage.replaceJson(path, next, current.etag) : await storage.createJson(path, next)) return;
  }
}

export async function saveOwner(slug: string, email: string): Promise<void> {
  const value = normalize(email);
  const savedAt = new Date().toISOString();
  await upsert(ownerPath(slug), (current) => ({ ...((current as Owner | null) ?? {}), email: value, savedAt }));
  await upsert(accountPath(value), (current) => {
    const slugs = new Set(((current as { slugs?: string[] } | null)?.slugs ?? []).concat(slug));
    return { email: value, slugs: [...slugs].slice(-20), updatedAt: savedAt };
  });
}

export async function slugsForEmail(email: string): Promise<string[]> {
  const account = (await getStorage().readJson(accountPath(email)))?.data as { slugs?: string[] } | undefined;
  return account?.slugs ?? [];
}
