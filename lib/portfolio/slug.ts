import { z } from "zod";
import { NICHES, type Niche } from "./niches";

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
  const slug = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // quita tildes y la virgulilla de la ñ
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, BASE_MAX_LENGTH)
    .replace(/-+$/g, "");
  return slug || "portafolio";
}

/** Candidatos en orden: base, base-2 … base-20 y, si todos están tomados, uno con sufijo aleatorio. */
export function slugCandidates(base: string): string[] {
  const candidates = [base];
  for (let n = 2; n <= 20; n += 1) candidates.push(`${base}-${n}`);
  candidates.push(`${base}-${Math.random().toString(36).slice(2, 7)}`);
  return candidates;
}

/** Ruta pública del portafolio: la versión general, o la de un nicho (/p/<slug>/belleza). */
export function publicPath(slug: string, niche?: Niche | null): string {
  return niche ? `/p/${slug}/${niche}` : `/p/${slug}`;
}

/** Todas las versiones públicas de un portafolio: la general y una por nicho. */
export function publicPaths(slug: string): string[] {
  return [publicPath(slug), ...NICHES.map((niche) => publicPath(slug, niche))];
}
