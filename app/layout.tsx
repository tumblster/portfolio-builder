import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Fraunces, Inter, Fragment_Mono } from "next/font/google";
import "./globals.css";

// Titulares (§7.3). El eje "opsz" deja que el navegador use el corte de
// display en tamaños grandes: trazos más finos y más contraste = más elegante.
const fraunces = Fraunces({
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
  variable: "--font-fraunces",
});

// Cuerpo e interfaz (§7.3).
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

// Micro-etiquetas en monoespaciada (§7.6). Un solo peso y sin precarga:
// es decorativa y no debe competir con lo importante al cargar.
const fragmentMono = Fragment_Mono({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  preload: false,
  variable: "--font-fragment",
});

export const metadata: Metadata = {
  title: {
    default: "Supercreador · Portafolios UGC",
    template: "%s · Supercreador",
  },
  description: "Arma en minutos el portafolio UGC de tu clienta y compártelo con un link.",
  applicationName: "Supercreador",
};

export const viewport: Viewport = {
  // Pinta la barra del navegador móvil con el fondo índigo.
  themeColor: "#16163a",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="es-419"
      className={`${fraunces.variable} ${inter.variable} ${fragmentMono.variable}`}
    >
      <body className="font-sans">{children}</body>
    </html>
  );
}
