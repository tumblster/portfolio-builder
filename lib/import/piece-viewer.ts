/*
 * Qué visor abre cada pieza de la grilla "Tus últimos 12 contenidos" (spec 10.2): TODA pieza se puede ver con
 * tap/click, esté o no agregada. Sin dependencias: lo usan la grilla (components/import/confirm-pickers.tsx) y la
 * prueba de humo.
 * - "carousel": carrusel de Instagram con su post → overlay con la cadena de embeds (ronda 6 · 13.3) y, si no carga,
 *   su portada + "Ver carrusel en Instagram".
 * - "reel": video con embed oficial → overlay con su reproductor (13.2; play manual).
 * - "image": foto o video sin embed reconocible → visor de imagen (lightbox).
 * - null: sin nada que mostrar (no debería pasar: la grilla solo trae publicaciones con imagen).
 */
export type PieceViewer = "carousel" | "reel" | "image" | null;

/** Link de un post de Instagram del que se puede sacar su código (sin depender de lib/portfolio/embed.ts). */
const INSTAGRAM_POST = /^https?:\/\/(?:[a-z0-9-]+\.)*instagram\.com\/(?:p|reel|reels|tv)\/[A-Za-z0-9_-]+/i;

export function viewerFor(
  piece: {
    video: { platform: string; url: string } | null;
    image: unknown;
    /** Qué es en Instagram (opcional: las piezas agregadas a mano no lo traen). */
    kind?: string;
    /** El post original en Instagram, si lo hay. */
    postUrl?: string | null;
  },
  hasEmbed: (video: { platform: string; url: string }) => boolean,
): PieceViewer {
  if (piece.kind === "carousel" && piece.postUrl && INSTAGRAM_POST.test(piece.postUrl)) return "carousel";
  if (piece.video && hasEmbed(piece.video)) return "reel";
  if (piece.image) return "image";
  return null;
}
