/** Nichos del MVP (§3.4). Sin dependencias: se puede importar en el navegador sin cargar zod. */
export const NICHES = ["belleza", "lifestyle", "viajes"] as const;
export type Niche = (typeof NICHES)[number];

export const NICHE_LABELS: Record<Niche, string> = {
  belleza: "Belleza",
  lifestyle: "Lifestyle",
  viajes: "Viajes",
};

export const isNiche = (value: unknown): value is Niche =>
  typeof value === "string" && (NICHES as readonly string[]).includes(value);

/**
 * Orden sugerido para la versión de un nicho (RF-04): primero las piezas etiquetadas
 * con ese nicho y después el resto; cada grupo conserva su orden. Sin nicho, no cambia.
 */
export function orderForNiche<T extends { niche: Niche | null }>(pieces: readonly T[], niche: Niche | null): T[] {
  if (!niche) return [...pieces];
  return [...pieces.filter((piece) => piece.niche === niche), ...pieces.filter((piece) => piece.niche !== niche)];
}
