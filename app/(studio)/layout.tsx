import type { ReactNode } from "react";
import { studioFontClasses } from "@/lib/fonts/studio";

/** La herramienta de creación (acceso, importar, formulario, editor): tema índigo. */
export default function StudioLayout({ children }: { children: ReactNode }) {
  return <div className={`${studioFontClasses} min-h-dvh font-sans`}>{children}</div>;
}
