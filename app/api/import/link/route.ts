import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireCreator } from "@/lib/auth";
import { InvalidInputError, errorResponse, jsonResponse } from "@/lib/errors";
import { addLinkPiece } from "@/lib/import/draft";
import { resolvePostLink } from "@/lib/import/oembed";

/*
 * Spec 11.5: "Agregar por link". POST { draftId, url } → la pieza (portada, título y autor vía oEmbed), ya elegible
 * en el borrador. Requiere la clave del creador (como toda la importación).
 */
const inputSchema = z.object({ draftId: z.uuid(), url: z.string().trim().min(8).max(500) });

export async function POST(request: NextRequest) {
  const denied = requireCreator(request);
  if (denied) return denied;
  try {
    const parsed = inputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new InvalidInputError("Pega el link completo del post.");
    const piece = await resolvePostLink(parsed.data.url);
    return jsonResponse({ piece: await addLinkPiece(parsed.data.draftId, piece) });
  } catch (error) {
    return errorResponse(error);
  }
}
