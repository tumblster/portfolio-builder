import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

/*
 * HTML base, compartido por la herramienta y la página pública. Las fuentes NO se cargan
 * aquí: cada zona trae las suyas en su layout (app/(studio)/layout.tsx y app/p/layout.tsx),
 * así la página pública no descarga las de la herramienta.
 */

export const metadata: Metadata = {
  title: {
    default: "Supercreador · Portafolios UGC",
    template: "%s · Supercreador",
  },
  description: "Arma en minutos el portafolio UGC de tu clienta y compártelo con un link.",
  applicationName: "Supercreador",
};

export const viewport: Viewport = {
  // Pinta la barra del navegador móvil con el fondo índigo (la página pública la cambia).
  themeColor: "#16163a",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-419">
      <body>{children}</body>
    </html>
  );
}
