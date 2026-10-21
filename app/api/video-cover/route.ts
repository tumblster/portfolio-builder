import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireCreator } from "@/lib/auth";
import { HttpError, InvalidInputError, errorResponse, jsonResponse, readJsonBody } from "@/lib/errors";
import { parseVideoLink } from "@/lib/portfolio/schema";
import { fetchVideoCover } from "@/lib/video-cover";

const bodySchema = z.object({ url: z.string({ error: "Falta el link del video." }).max(500) });

const PLATFORM = { tiktok: "TikTok", youtube: "YouTube", instagram: "Instagram", canva: "Canva" } as const;

/** Instagram vía Apify tarda típico 20-60 s. */
export const maxDuration = 120;

/** Busca la portada de un video de YouTube, TikTok o Instagram y la guarda. Cuerpo: { url }. */
export async function POST(request: NextRequest) {
  const denied = requireCreator(request);
  if (denied) return denied;

  try {
    const { url } = bodySchema.parse(await readJsonBody(request));
    const video = parseVideoLink(url);
    if (!video) throw new InvalidInputError("Pega un link de video de TikTok, Instagram, YouTube o Canva.");
    const image = await fetchVideoCover(video);
    if (!image) {
      throw new HttpError(
        404,
        "cover_not_found",
        `No encontramos la portada en ${PLATFORM[video.platform]}. Revisa el link o sube una a mano.`,
      );
    }
    return jsonResponse({ image }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
