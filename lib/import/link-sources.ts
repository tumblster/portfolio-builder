/*
 * "Agregar por link" (spec 11.5; ronda 6 · 13.4): qué se puede pegar hoy y los textos que ve la creadora. Sin
 * dependencias de servidor: lo usan el studio (components/import/confirm-pickers.tsx) y el servidor
 * (lib/import/oembed.ts), así el mensaje es el mismo en los dos lados.
 *
 * Decisión del dueño (06/10/2026): los links de Instagram quedan OCULTOS hasta completar la verificación de empresa
 * en Meta. Por ahora solo TikTok (su oEmbed es público y no pide autenticación). Si la creadora pega un link de
 * instagram.com, ve un mensaje amable y sin jerga (INSTAGRAM_LINKS_SOON) y no se llama a nada.
 *
 * El código del oEmbed de Instagram sigue listo en lib/import/oembed.ts. Para activarlo cuando el dueño avise:
 *   1. Variable META_OEMBED_TOKEN=<tu app token> en Vercel (y en .env.local).
 *      Preview) y en .env.local.
 *   2. INSTAGRAM_LINKS_ENABLED = true (aquí: un solo interruptor para el studio y el servidor) y desplegar.
 *   3. Sumar Instagram a los textos de la sección (placeholder y ayuda en components/import/confirm-pickers.tsx, y
 *      LINK_ONLY_TIKTOK aquí) y actualizar el check 13.4 de scripts/smoke.mjs.
 */

export const INSTAGRAM_LINKS_ENABLED: boolean = false;

/** Lo que ve la creadora si pega un link de Instagram mientras siga oculto (texto exacto del dueño). */
export const INSTAGRAM_LINKS_SOON = "Los links de Instagram estarán disponibles pronto.";

/** Si pega algo que no es un video de TikTok. */
export const LINK_ONLY_TIKTOK = "Por ahora puedes agregar por link solo videos de TikTok.";

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

/** true si lo pegado es de Instagram y esa opción sigue oculta: se responde con INSTAGRAM_LINKS_SOON. */
export const instagramLinkBlocked = (raw: string) => !INSTAGRAM_LINKS_ENABLED && isInstagramHost(linkHost(raw));
