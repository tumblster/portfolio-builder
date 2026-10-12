/*
 * "Agregar por link" (spec 11.5; ronda 6 · 13.4): qué se puede pegar hoy y los textos que ve la creadora. Sin
 * dependencias de servidor: lo usan el studio (components/import/confirm-pickers.tsx) y el servidor
 * (lib/import/oembed.ts), así el mensaje es el mismo en los dos lados.
 *
 * Decisión del dueño (11/10/2026, reemplaza la del 06/10): los links de Instagram SÍ se aceptan. Sin oEmbed
 * de Meta (exige verificación de empresa y el dueño no cambiará su RUC por esto): la portada, el título y el
 * autor se traen vía Apify (un post ≈ US$0,003, típico 20-60 s; sin membresía por ahora). TikTok sigue por oEmbed
 * (público, con miniatura). El interruptor INSTAGRAM_LINKS_ENABLED queda para el día en que se active el oEmbed
 * de Meta con miniatura.
 */

export const INSTAGRAM_LINKS_ENABLED: boolean = false;

/** Texto histórico (ya no se muestra en el flujo). */
export const INSTAGRAM_LINKS_SOON = "Los links de Instagram estarán disponibles pronto.";

/** Si lo pegado no es un video de TikTok ni de Instagram. */
export const LINK_ONLY_VIDEO = "Por ahora puedes agregar por link videos de TikTok o Instagram.";

/** Si lo pegado no se puede leer como link. */
export const LINK_INVALID = "Ese link no se ve completo. Cópialo de nuevo desde TikTok (Compartir → Copiar enlace).";

/**
 * Lo pegado, listo para leer como link: si viene con texto alrededor ("Mira mi video https://…") se toma el link, y
 * si le falta https:// se le pone ("tiktok.com/@ana/video/…" también vale).
 */
export function normalizeLink(raw: string): string {
  const text = raw.trim();
  const found = text.match(/https?:\/\/\S+/i)?.[0];
  if (found) return found;
  return /^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : `https://${text}`;
}

/** El dominio de lo pegado, sin "www." (null si no se puede leer como link). */
export function linkHost(raw: string): string | null {
  if (!raw.trim()) return null;
  try {
    return new URL(normalizeLink(raw)).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

export const isTikTokHost = (host: string | null) => host !== null && /(^|\.)tiktok\.com$/.test(host);
export const isInstagramHost = (host: string | null) => host !== null && /(^|\.)(instagram\.com|instagr\.am)$/.test(host);
