import localFont from "next/font/local";

/*
 * TMJ (r2, D2; r3 · 3): fuente manuscrita de un solo peso, SOLO para la palabra "superpoderes" del H1 de la landing.
 * Se importa desde la página "/" y no desde el layout, así /acceso no la precarga. next/font la precarga en "/"
 * y genera un fallback con métricas ajustadas: sin saltos de layout.
 * Pendiente: confirmar que su licencia permite uso web comercial (el archivo no trae datos de licencia).
 * No incluye í, ñ, Í ni ¡: si el H1 llega a usarlas, esas letras salen en la fuente de respaldo.
 */
export const fontTmj = localFont({
  src: "../../app/fonts/TMJ.woff2",
  variable: "--font-tmj",
  display: "swap",
});
