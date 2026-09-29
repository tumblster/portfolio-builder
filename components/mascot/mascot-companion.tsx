"use client";

import { useEffect, useRef, type ReactNode } from "react";

/*
 * Chispa acompañante (v2 · M4-rev). Cuando la cara del hero sale de pantalla, Chispa "baja" con quien lee: entra
 * fija en el costado (escritorio) o en una burbuja abajo a la derecha (celular) y cambia de expresión según el
 * tramo de la página que cruza el centro de la pantalla (elementos con data-mascot-zone="<expresión>").
 * Las caras llegan ya dibujadas desde el servidor (children con data-face); aquí solo se elige cuál se ve.
 * Con "reducir movimiento" no aparece: todo queda quieto (ver landing.css).
 */
export function MascotCompanion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = root.current;
    if (!element || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const faces = [...element.querySelectorAll<HTMLElement>("[data-face]")];
    const show = (name: string | undefined) => {
      if (name) faces.forEach((face) => face.toggleAttribute("data-active", face.dataset.face === name));
    };

    const hero = document.querySelector("[data-hero-mascot]");
    // La cara del hero "se fue" cuando queda menos del 35 % a la vista, sin contar lo que tapa la barra fija.
    const heroObserver = new IntersectionObserver(
      ([entry]) => element.toggleAttribute("data-visible", entry.intersectionRatio < 0.35),
      { rootMargin: "-64px 0px 0px 0px", threshold: [0, 0.35, 1] },
    );
    if (hero) heroObserver.observe(hero);

    const zoneObserver = new IntersectionObserver(
      (entries) => entries.forEach((entry) => entry.isIntersecting && show((entry.target as HTMLElement).dataset.mascotZone)),
      { rootMargin: "-45% 0px -45% 0px" },
    );
    document.querySelectorAll("[data-mascot-zone]").forEach((zone) => zoneObserver.observe(zone));

    return () => {
      heroObserver.disconnect();
      zoneObserver.disconnect();
    };
  }, []);

  return (
    <div ref={root} className="mascot-companion" aria-hidden="true" data-mascot-companion>
      {children}
    </div>
  );
}
