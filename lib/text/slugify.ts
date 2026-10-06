/**
 * Convierte un texto en una parte de URL legible. Sin dependencias: se usa en el servidor y en el navegador.
 * "Valentina Ruíz" → "valentina-ruiz" · "@valen.creative_" → "valen-creative" · "Cocina saludable" → "cocina-saludable"
 */
export function slugify(text: string, maxLength = 40, fallback = "portafolio"): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // quita tildes y la virgulilla de la ñ
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
  return slug || fallback;
}
