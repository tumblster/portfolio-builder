/*
 * Enlace opcional (v2 · M4), fijado en el build con NEXT_PUBLIC_PILOT_URL (ver DEPLOY.md). Desde el M4-rev la
 * landing tiene su propia captura de correo; este enlace solo aparece en /acceso para quien no tiene clave.
 */
function safeUrl(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["https:", "mailto:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

/** A dónde lleva "Únete al programa piloto": un formulario, un WhatsApp (https://wa.me/…) o un mailto:. */
export const PILOT_URL = safeUrl(process.env.NEXT_PUBLIC_PILOT_URL);


/**
 * Formulario de soporte (r3 · 9): la vía de escape del cargador de "Generar portafolio" cuando tarda más de
 * 60 s o falla sin remedio. Se abre en una pestaña nueva.
 */
export const SUPPORT_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSfTLIBuVWSNB1-Ws_MUXOjS4zcrWQzpxiAPTj7K6SzwY-04Zw/viewform";
