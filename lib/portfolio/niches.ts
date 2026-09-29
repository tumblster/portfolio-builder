import { slugify } from "@/lib/text/slugify";

/*
 * Nichos por portafolio (v2). Sin dependencias: se usa en el servidor y en el navegador.
 *
 * Cada portafolio tiene hasta 3 nichos propios ({ slug, label }), detectados por la IA
 * a partir del contenido real ("Fitness", "Cocina saludable"…). Cada uno tiene su link:
 * /p/<slug>/<nicho>. Las piezas se etiquetan con el slug de un nicho, o con null (solo en "Todo").
 *
 * Compatibilidad con la v1: los portafolios creados antes no guardan nichos y usan los
 * tres de siempre (Belleza, Lifestyle, Viajes), así sus links ya compartidos siguen abriendo.
 */

export type NicheDef = { slug: string; label: string };

export const MAX_NICHES = 3;
export const NICHE_LABEL_MAX = 24;
export const NICHE_SLUG_MAX = 32;
export const NICHE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** "todo" es la versión general (/p/<slug>): ningún nicho puede llamarse así. */
export const RESERVED_NICHE_SLUGS: readonly string[] = ["todo"];

/** Los nichos de la v1. También son los nombres que se prefieren si el contenido calza. */
export const LEGACY_NICHES: readonly NicheDef[] = [
  { slug: "belleza", label: "Belleza" },
  { slug: "lifestyle", label: "Lifestyle" },
  { slug: "viajes", label: "Viajes" },
];

export const isNicheSlug = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length <= NICHE_SLUG_MAX &&
  NICHE_SLUG_PATTERN.test(value) &&
  !RESERVED_NICHE_SLUGS.includes(value);

/**
 * Nombre → nicho con slug seguro para URL. "cocina saludable" → { slug: "cocina-saludable", label: "Cocina saludable" }.
 * Belleza, Lifestyle y Viajes conservan exactamente su forma de la v1. Devuelve null si no sirve.
 */
export function nicheFromLabel(raw: string): NicheDef | null {
  const label = raw.replace(/\s+/g, " ").trim().slice(0, NICHE_LABEL_MAX).trim();
  if (!label) return null;
  const slug = slugify(label, NICHE_SLUG_MAX, "");
  if (!isNicheSlug(slug)) return null;
  const legacy = LEGACY_NICHES.find((niche) => niche.slug === slug);
  if (legacy) return { ...legacy };
  return { slug, label: label.replace(/^\p{L}/u, (letter) => letter.toLocaleUpperCase("es")) };
}

type NicheSources = {
  manual: { niches?: NicheDef[] };
  generated: { niches?: NicheDef[] } | null;
};

/** Regla de siempre: manual → IA → (portafolios v1 o sin IA) los tres nichos de la v1. */
export function resolveNiches(doc: NicheSources): NicheDef[] {
  return (doc.manual.niches ?? doc.generated?.niches ?? LEGACY_NICHES).map((niche) => ({ ...niche }));
}

/** Los nichos que tienen al menos una pieza: son los que aparecen como píldoras en la página. */
export function nichesWithPieces<T extends { niche: string | null }>(niches: readonly NicheDef[], pieces: readonly T[]): NicheDef[] {
  return niches.filter((niche) => pieces.some((piece) => piece.niche === niche.slug));
}

export const findNiche = (niches: readonly NicheDef[], slug: string | null | undefined) =>
  slug ? (niches.find((niche) => niche.slug === slug) ?? null) : null;

/** Qué nicho está activo según la URL (/p/<slug>/<nicho>), o null si es la versión general. */
export function nicheFromPath(pathname: string, basePath: string, validSlugs: readonly string[]): string | null {
  if (!pathname.startsWith(`${basePath}/`)) return null;
  const segment = pathname.slice(basePath.length + 1).replace(/\/+$/, "");
  return validSlugs.includes(segment) ? segment : null;
}
