/*
 * Lo que comparten la tarjeta con QR (components/share/qr-card.tsx) y la prueba de humo (spec 12.5 · ronda 6 · 13.7).
 * Sin dependencias.
 */

/** Tag de origen: las visitas que llegan escaneando el QR se cuentan como ?ref=qr (12.9). */
export const QR_REF = "qr";

/** El link que codifica el QR: el del portafolio con ?ref=qr (reemplaza otro ?ref y conserva el resto). */
export function qrTargetUrl(url: string): string {
  try {
    const target = new URL(url);
    target.searchParams.set("ref", QR_REF);
    return target.toString();
  } catch {
    return `${url}${url.includes("?") ? "&" : "?"}ref=${QR_REF}`;
  }
}

/** El link como se lee impreso en la tarjeta: sin https://, sin ?ref y sin barra final. */
export function displayUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`.replace(/\/$/, "");
  } catch {
    return url.replace(/^https?:\/\//i, "").replace(/[?#].*$/, "").replace(/\/$/, "");
  }
}

/** Nombre del archivo descargado: tarjeta-qr-<slug>.png (solo minúsculas, números y guiones). */
export function qrFileName(slug: string): string {
  const safe =
    slug
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "portafolio";
  return `tarjeta-qr-${safe}.png`;
}
