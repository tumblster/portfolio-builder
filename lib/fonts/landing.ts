import { Inter, Inter_Tight } from "next/font/google";
import localFont from "next/font/local";

/*
 * Fuente de la landing (v2 · M4-rev): una grotesca en pesos medios, como pide el brief. Es la misma Inter
 * del studio (mismos archivos, se comparten en caché), pero la landing la declara aparte para NO precargar
 * las otras fuentes del studio (Anton, la mono, DM Sans): así rinde en Slow 4G.
 */
export const landingSans = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

/*
 * Inter Tight SemiBold (r3 · 3): titulares. En la landing, el H1 (salvo "superpoderes", que va en TMJ); en /crear,
 * sus títulos. Un solo peso (600). Combina con TMJ y tiene una altura de x parecida (0,55 em contra 0,57 em).
 */
export const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: "600",
  display: "swap",
  variable: "--font-inter-tight",
});

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
