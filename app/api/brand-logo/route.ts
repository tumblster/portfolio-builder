import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireUploader } from "@/lib/auth";
import { findBrandLogo } from "@/lib/brand-logo";
import { InvalidInputError, errorResponse, jsonResponse, readJsonBody } from "@/lib/errors";
import { parseInstagramUsername } from "@/lib/instagram/username";

/*
 * Ronda 6 · 13.19 b: busca el logo de una marca (la foto de perfil de su Instagram) y lo guarda en nuestro
 * almacenamiento. Body: { instagram } con "@marca", "marca" o el link de su perfil.
 * Responde 200 { instagram, logo, source }: logo null = no se pudo (sin crédito, cuenta privada, sin foto) y el
 * studio usa el logo subido o la inicial. Con la clave del creador o el magic link (como subir una foto).
 */

export const maxDuration = 60;

const inputSchema = z.object({
  instagram: z.string({ error: "Pega el link del Instagram de la marca." }).max(300),
});

export async function POST(request: NextRequest) {
  const denied = requireUploader(request);
  if (denied) return denied;

  try {
    const { instagram } = inputSchema.parse(await readJsonBody(request));
    const parsed = parseInstagramUsername(instagram);
    if (!parsed.ok) throw new InvalidInputError(parsed.error);
    const { logo, source } = await findBrandLogo(parsed.username);
    return jsonResponse({ instagram: parsed.username, logo, source });
  } catch (error) {
    return errorResponse(error);
  }
}
