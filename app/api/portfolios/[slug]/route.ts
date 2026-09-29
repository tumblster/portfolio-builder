import type { NextRequest } from "next/server";
import { requireCreator } from "@/lib/auth";
import { NotFoundError, errorResponse, jsonResponse, readJsonBody } from "@/lib/errors";
import { getPortfolio, toStoredPieces, updatePortfolio } from "@/lib/portfolio/repository";
import { resolvePortfolio } from "@/lib/portfolio/resolve";
import { updatePortfolioInputSchema, type Portfolio } from "@/lib/portfolio/schema";
import { publicPath } from "@/lib/portfolio/slug";
import { absoluteUrl } from "@/lib/request";

type Context = RouteContext<"/api/portfolios/[slug]">;

function body(request: NextRequest, portfolio: Portfolio) {
  return {
    url: absoluteUrl(request, publicPath(portfolio.slug)),
    portfolio,
    resolved: resolvePortfolio(portfolio),
  };
}

/** Lee el portafolio completo: datos scrapeados, generados, manuales y lo que se muestra. */
export async function GET(request: NextRequest, { params }: Context) {
  const denied = requireCreator(request);
  if (denied) return denied;

  try {
    const { slug } = await params;
    const portfolio = await getPortfolio(slug);
    if (!portfolio) throw new NotFoundError();
    return jsonResponse(body(request, portfolio));
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Edita. Cuerpo: { revision, manual?, pieces? }.
 * Cada sección enviada reemplaza a la guardada. Si alguien guardó antes, responde 409.
 */
export async function PATCH(request: NextRequest, { params }: Context) {
  const denied = requireCreator(request);
  if (denied) return denied;

  try {
    const { slug } = await params;
    const input = updatePortfolioInputSchema.parse(await readJsonBody(request));
    const portfolio = await updatePortfolio(slug, input.revision, (current) => ({
      ...(input.manual !== undefined && { manual: input.manual }),
      ...(input.pieces !== undefined && { pieces: toStoredPieces(input.pieces, current.pieces) }),
      ...(input.design !== undefined && { design: input.design }),
    }));
    return jsonResponse(body(request, portfolio));
  } catch (error) {
    return errorResponse(error);
  }
}
