import type { NextRequest } from "next/server";
import { requireCreator } from "@/lib/auth";
import { InvalidInputError, errorResponse, jsonResponse } from "@/lib/errors";
import { MAX_UPLOAD_BYTES, saveImage } from "@/lib/media";

/**
 * Sube una imagen (foto de perfil o pieza). Enviar como multipart/form-data en el campo "file".
 * Responde { image: { url, width, height } } para usarlo en el portafolio.
 */
export async function POST(request: NextRequest) {
  const denied = requireCreator(request);
  if (denied) return denied;

  try {
    const form = await request.formData().catch((): never => {
      throw new InvalidInputError('Envía la imagen como multipart/form-data en el campo "file".');
    });
    const file = form.get("file");
    if (!(file instanceof File)) throw new InvalidInputError('Adjunta la imagen en el campo "file".');
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new InvalidInputError("La imagen pesa más de 4 MB. Sube una versión más liviana.", 413);
    }

    const image = await saveImage(new Uint8Array(await file.arrayBuffer()));
    return jsonResponse({ image }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
