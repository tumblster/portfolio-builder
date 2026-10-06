import type { ReactNode } from "react";
import { landingSans } from "@/lib/fonts/landing";
import "./landing.css";

/*
 * Landing pública "/" (v2 · M4-rev, referencia superhuman.com). Vive aparte del studio: su propia fuente
 * (Inter, sin Anton) y su propio CSS (Chispa y la navegación), así el interior del studio no cambia.
 */
export default function LandingLayout({ children }: { children: ReactNode }) {
  return <div className={`${landingSans.variable} landing min-h-dvh bg-cream font-sans text-ink antialiased`}>{children}</div>;
}
