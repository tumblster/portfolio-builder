import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireCreator } from "@/lib/auth";
import { InvalidInputError, errorResponse, jsonResponse } from "@/lib/errors";
import { addLinkPiece } from "@/lib/import/draft";
import { resolvePostLink } from "@/lib/import/oembed";

/*
 * Spec 11.5: "Agregar por link". POST { draftId, url, permissionConfirmed } → la pieza
 * (portada, título y autor), ya elegible en el borrador. Requiere la clave del creador
 * (como toda la importación). Instagram trae su portada vía Apify (típico 20-60 s).
 * Obs. 4 (11/10): permissionConfirmed es obligatorio (la creadora confirma que tiene
 * permiso para mostrar el contenido externo).
 */
export const maxDuration = 120;
const inputSchema = z.object({
  draftId: z.uuid(),
  url: z.string().trim().min(8).max(500),
  permissionConfirmed: z.boolean(),
});

export async function POST(request: NextRequest) {
  const denied = requireCreator(request);
  if (denied) return denied;
  try {
    const parsed = inputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new InvalidInputError("Pega el link completo del post.");
    if (!parsed.data.permissionConfirmed) {
      throw new InvalidInputError("Confirma que tienes permiso para mostrar este video en tu portafolio.");
    }
    const piece = await resolvePostLink(parsed.data.url);
    return jsonResponse({ piece: await addLinkPiece(parsed.data.draftId, piece, true) });
  } catch (error) {
    return errorResponse(error);
  }
}
