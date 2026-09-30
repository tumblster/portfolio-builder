import type { NextRequest } from "next/server";
import { requireCreator } from "@/lib/auth";
import { errorResponse, jsonResponse, readJsonBody } from "@/lib/errors";
import { confirmDraft } from "@/lib/import/draft";
import type { ImportResult } from "@/lib/import/events";
import { resolvePortfolio } from "@/lib/portfolio/resolve";
import { confirmImportInputSchema } from "@/lib/portfolio/schema";
import { publicPath } from "@/lib/portfolio/slug";
import { absoluteUrl } from "@/lib/request";

/*
 * Genera el portafolio de una importación (v2 · M2), con los nichos que confirmó el creador y la
 * plantilla y paleta que eligió. 201 si lo creó; 200 con el mismo portafolio si ya estaba creado.
 * 409 solo mientras otra petición lo está generando (el candado se cura solo a los 5 min: lib/import/draft.ts).
 */

// Tope explícito: garantiza que un candado con más de 5 minutos ya no tiene ninguna ejecución viva detrás.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const denied = requireCreator(request);
  if (denied) return denied;

  try {
    const input = confirmImportInputSchema.parse(await readJsonBody(request));
    const { portfolio, username, warnings, created } = await confirmDraft(input);
    const result: ImportResult = {
      url: absoluteUrl(request, publicPath(portfolio.slug)),
      slug: portfolio.slug,
      username,
      revision: portfolio.revision,
      resolved: resolvePortfolio(portfolio),
      warnings,
    };
    return jsonResponse(result, { status: created ? 201 : 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
