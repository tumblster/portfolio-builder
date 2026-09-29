import { Inter } from "next/font/google";

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
