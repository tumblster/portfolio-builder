import "server-only";
import { cache } from "react";
import { getPortfolio } from "./repository";
import { resolvePortfolio } from "./resolve";

/** Portafolio listo para mostrar, leído una sola vez por petición (metadatos + página). */
export const loadPublicPortfolio = cache(async (slug: string) => {
  const doc = await getPortfolio(slug);
  return doc ? resolvePortfolio(doc) : null;
});
