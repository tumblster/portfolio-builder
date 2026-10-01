import type { ReactNode } from "react";
import { interTight } from "@/lib/fonts/inter-tight";
import { studioFontClasses } from "@/lib/fonts/studio";
import "@/components/crear-brand.css";

/*
 * Todo el studio (landing, acceso, crear, editar) comparte un solo sistema visual (v2 · M4):
 * la clase `studio` activa sus estilos de base (app/globals.css) sin tocar la página pública.
 */
export default function StudioLayout({ children }: { children: ReactNode }) {
  // Spec 11.10: todo el studio con el branding actual (alcance .crear-brand: títulos en Inter Tight, tarjetas y
  // botones de la marca), igual que /crear.
  return (
    <div className={`${studioFontClasses} ${interTight.variable} studio crear-brand min-h-dvh bg-cream font-sans text-ink`}>
      {children}
    </div>
  );
}
