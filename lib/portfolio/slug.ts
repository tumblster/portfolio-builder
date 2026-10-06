import { z } from "zod";
import { slugify as slugifyText } from "@/lib/text/slugify";

export const SLUG_MAX_LENGTH = 48;
const BASE_MAX_LENGTH = 40;

/** Solo minúsculas, números y guiones: "valentina-ruiz", "valen-creative-2". */
export const slugSchema = z
  .string()
  .max(SLUG_MAX_LENGTH)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { error: "Link inválido." });

/**
 * Convierte un nombre o usuario en la parte legible del link.
 * "Valentina Ruíz" → "valentina-ruiz" · "@valen.creative_" → "valen-creative" · "Begoña" → "begona"
 */
export function slugify(text: string): string {
  return slugifyText(text, BASE_MAX_LENGTH, "portafolio");
}

/** Candidatos en orden: base, base-2 … base-20 y, si todos están tomados, uno con sufijo aleatorio. */
export function slugCandidates(base: string): string[] {
  const candidates = [base];
  for (let n = 2; n <= 20; n += 1) candidates.push(`${base}-${n}`);
  candidates.push(`${base}-${Math.random().toString(36).slice(2, 7)}`);
  return candidates;
}

/** Ruta pública del portafolio: la versión general (Todo), o la de un nicho (/p/<slug>/belleza). */
export function publicPath(slug: string, niche?: string | null): string {
  return niche ? `/p/${slug}/${niche}` : `/p/${slug}`;
}

/** Todas las versiones públicas: la general y una por cada nicho indicado (sin repetir). */
export function publicPaths(slug: string, nicheSlugs: readonly string[]): string[] {
  return [publicPath(slug), ...[...new Set(nicheSlugs)].map((niche) => publicPath(slug, niche))];
}
