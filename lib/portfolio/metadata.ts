import type { Metadata } from "next";
import type { NicheDef } from "./niches";
import type { ResolvedPortfolio } from "./resolve";

/** Se comparten por link, no por Google (las imágenes llevan X-Robots-Tag: noindex, ver app/media). */
export const NO_INDEX = { index: false, follow: false } as const;

/** Título de la pestaña: "Valentina Ruiz · Portafolio UGC" o "… — Belleza" en el link de un nicho. */
export function portfolioTitle(name: string, nicheLabel?: string | null): string {
  return nicheLabel ? `${name} · Portafolio UGC — ${nicheLabel}` : `${name} · Portafolio UGC`;
}

export function portfolioMetadata(portfolio: ResolvedPortfolio | null, niche: NicheDef | null): Metadata {
  if (!portfolio) return { title: "Portafolio no encontrado", robots: NO_INDEX };
  const title = portfolioTitle(portfolio.name, niche?.label);
  const description = portfolio.valueProp || portfolio.bio || "Portafolio UGC";
  return {
    title: { absolute: title },
    description,
    robots: NO_INDEX,
    openGraph: { title, description, type: "profile" },
  };
}
