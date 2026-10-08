/*
 * Utilidades de Brand partners (ronda 6 · 13.19).
 * Faltó en el zip de la pieza 6: lo escribió el integrador con el contrato
 * que usan brand-partners-field.tsx y media-kit.tsx (mismo formato de URL
 * que instagramProfileUrl en lib/instagram/username.ts).
 */

/** Link al perfil de Instagram de la marca. Recibe el usuario ya normalizado (sin @, en minúsculas). */
export function brandProfileUrl(instagram: string): string {
  return `https://www.instagram.com/${instagram}/`;
}

/** Inicial para el avatar cuando la marca no tiene logo: primer carácter del nombre, en mayúscula. */
export function brandInitial(name: string): string {
  const first = name.trim().charAt(0);
  return first ? first.toUpperCase() : "?";
}
