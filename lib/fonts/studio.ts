import { Anton, DM_Sans, Fragment_Mono, Inter } from "next/font/google";

/*
 * Fuentes de la herramienta (v2 · M4: display Anton + Inter). Viven aparte de las de la página pública:
 * next/font precarga las fuentes de los módulos que importa cada ruta, y la página
 * pública no debe descargar estas (presupuesto de rendimiento en Slow 4G).
 */

// Titulares display en MAYÚSCULAS (v2 · M4, estilo de la referencia StoryFluence). Un solo peso.
export const anton = Anton({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-anton",
});

// Cuerpo e interfaz (§7.3).
export const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

// Micro-etiquetas en monoespaciada (§7.6). Un solo peso y sin precarga:
// es decorativa y no debe competir con lo importante al cargar.
export const fragmentMono = Fragment_Mono({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  preload: false,
  variable: "--font-fragment",
});

// La plantilla del portafolio, para la vista previa del editor. Sin precarga: solo la usa la vista previa.
export const dmSansPreview = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-dm-sans",
});

export const studioFontClasses = `${anton.variable} ${inter.variable} ${fragmentMono.variable} ${dmSansPreview.variable}`;
