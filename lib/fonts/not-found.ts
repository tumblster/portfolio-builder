import { Anton, Inter } from "next/font/google";

/*
 * Para la 404 raíz (app/not-found.tsx): las mismas Anton e Inter, pero SIN precarga, en su propio módulo (next/font
 * precarga todo lo que declara un módulo importado). La 404 raíz forma parte del árbol de todas las rutas, así que lo que ella importe con precarga se precargaba en todas las páginas
 * (landing y portafolios públicos incluidos). Así solo se descargan cuando de verdad se muestra la 404.
 */
// Con un `fallback` propio son módulos de fuente distintos de los del studio: si fueran idénticos, el bundler
// reutiliza el módulo precargado y el `preload: false` no tiene efecto.
const antonLazy = Anton({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  preload: false,
  fallback: ["Arial Narrow", "Impact", "sans-serif"],
  variable: "--font-anton",
});
const interLazy = Inter({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
  variable: "--font-inter",
});
export const notFoundFontClasses = `${antonLazy.variable} ${interLazy.variable}`;
