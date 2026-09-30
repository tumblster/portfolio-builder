/*
 * Qué visor abre cada pieza de "De tu perfil" (spec 10.2): TODA pieza se puede ver con tap/click, esté o no
 * agregada. Sin dependencias: lo usan la grilla (components/import/confirm-pickers.tsx) y la prueba de humo.
 * - "reel": video con embed oficial → InlineReel (play manual, inline).
 * - "image": foto, carrusel (se ve su portada: es lo que se importa) o video sin embed reconocible → lightbox.
 * - null: sin nada que mostrar (no debería pasar: "De tu perfil" solo trae publicaciones con imagen).
 */
export type PieceViewer = "reel" | "image" | null;

export function viewerFor(
  piece: { video: { platform: string; url: string } | null; image: unknown },
  hasEmbed: (video: { platform: string; url: string }) => boolean,
): PieceViewer {
  if (piece.video && hasEmbed(piece.video)) return "reel";
  if (piece.image) return "image";
  return null;
}
