import { errorResponse } from "@/lib/errors";
import { readImage } from "@/lib/media";

/**
 * Sirve las imágenes guardadas: /media/<uuid>.webp
 * Son públicas (se ven en la página del portafolio) y nunca cambian,
 * así que el navegador y la CDN de Vercel las guardan por un año.
 */
export async function GET(_request: Request, { params }: RouteContext<"/media/[file]">) {
  try {
    const { file } = await params;
    const media = await readImage(file);
    if (!media) {
      return new Response("Imagen no encontrada.", { status: 404, headers: { "Cache-Control": "no-store" } });
    }

    const headers = new Headers({
      "Content-Type": media.contentType,
      "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex", // como las páginas públicas: no aparecen en buscadores
    });
    if (media.size !== null) headers.set("Content-Length", String(media.size));
    return new Response(media.body, { headers });
  } catch (error) {
    return errorResponse(error);
  }
}
