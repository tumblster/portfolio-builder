import type { ReactNode } from "react";
import { studioFontClasses } from "@/lib/fonts/studio";

/*
 * Todo el studio (landing, acceso, crear, editar) comparte un solo sistema visual (v2 · M4):
 * la clase `studio` activa sus estilos de base (app/globals.css) sin tocar la página pública.
 */
export default function StudioLayout({ children }: { children: ReactNode }) {
  return <div className={`${studioFontClasses} studio min-h-dvh bg-cream font-sans text-ink`}>{children}</div>;
}
