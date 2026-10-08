import "server-only";
import { createHash } from "node:crypto";
import { getStorage } from "@/lib/storage";

/*
 * El correo ES la cuenta (spec 12.1, estilo Substack): sin contraseña ni registro tradicional. Desde la ronda 6
 * (13.15) se pide en el onboarding, al empezar, y se guarda al generar el portafolio; cada acceso posterior es un
 * magic link a ese correo (11.8, y el del panel "Mis portafolios", 13.14). Se usa solo para eso y para los avisos de
 * archivado (11.9) y de hitos (12.8).
 *  - owners/<slug>.json → { email, savedAt, igsid? } (igsid: si algún día escribió a @supercreador.tech, 12.2)
 *  - accounts/<clave>.json → { email, slugs } (clave = hash del correo: entrar solo con el correo y el panel)
 */

export type Owner = { email: string; savedAt: string; igsid?: string };
export type Account = { email: string; slugs: string[] };

const ownerPath = (slug: string) => `owners/${slug}.json`;
const normalize = (email: string) => email.trim().toLowerCase();

/** Clave de la cuenta: un hash del correo. Es lo que viaja en el link del panel (nunca el correo). */
export const accountKey = (email: string) => createHash("sha256").update(normalize(email)).digest("hex").slice(0, 40);
const accountPath = (key: string) => `accounts/${key}.json`;

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
  await upsert(accountPath(accountKey(value)), (current) => {
    const slugs = new Set(((current as { slugs?: string[] } | null)?.slugs ?? []).concat(slug));
    return { email: value, slugs: [...slugs].slice(-20), updatedAt: savedAt };
  });
}

export async function slugsForEmail(email: string): Promise<string[]> {
  return (await getAccountByKey(accountKey(email)))?.slugs ?? [];
}

/** 13.14: la cuenta por su clave (la del link del panel), o null. */
export async function getAccountByKey(key: string): Promise<Account | null> {
  if (!/^[0-9a-f]{40}$/.test(key)) return null;
  const data = (await getStorage().readJson(accountPath(key)))?.data as Partial<Account> | undefined;
  return typeof data?.email === "string" ? { email: data.email, slugs: Array.isArray(data.slugs) ? data.slugs : [] } : null;
}
