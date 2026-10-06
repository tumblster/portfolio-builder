import type { NextRequest } from "next/server";
import { requireCreator } from "@/lib/auth";
import { errorResponse, jsonResponse, readJsonBody } from "@/lib/errors";
import { createPortfolio, toStoredPieces } from "@/lib/portfolio/repository";
import { resolvePortfolio } from "@/lib/portfolio/resolve";
import { createPortfolioInputSchema } from "@/lib/portfolio/schema";
import { publicPath } from "@/lib/portfolio/slug";
import { absoluteUrl } from "@/lib/request";

/** Crea un portafolio con datos escritos a mano (formulario manual). El de Instagram está en /api/import. */
export async function POST(request: NextRequest) {
  const denied = requireCreator(request);
  if (denied) return denied;

  try {
    const input = createPortfolioInputSchema.parse(await readJsonBody(request));
    const portfolio = await createPortfolio(
      {
        source: "manual",
        instagram: null,
        generated: null,
        manual: {
          name: input.name,
          bio: input.bio,
          photo: input.photo,
          valueProp: input.valueProp,
          contact: input.contact,
          services: input.services,
        },
        pieces: toStoredPieces(input.pieces),
        design: input.design,
      },
      input.name,
    );

    return jsonResponse(
      {
        url: absoluteUrl(request, publicPath(portfolio.slug)),
        portfolio,
        resolved: resolvePortfolio(portfolio),
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
