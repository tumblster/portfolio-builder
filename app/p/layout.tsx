import type { Viewport } from "next";
import type { ReactNode } from "react";
import { dmSans } from "@/lib/fonts/portfolio";

/*
 * Páginas públicas de los portafolios. data-site="portfolio" le dice a globals.css que
 * esta zona no lleva el fondo índigo de la herramienta (ver "Zona pública").
 */

export const viewport: Viewport = {
  themeColor: "#faf7f2",
  colorScheme: "light",
};

export default function PortfolioLayout({ children }: { children: ReactNode }) {
  return (
    <div data-site="portfolio" className={dmSans.variable}>
      {children}
    </div>
  );
}
