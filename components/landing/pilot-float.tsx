"use client";

import { useEffect, useState } from "react";

/*
 * Botón flotante del programa piloto (v2 · M4-rev r2, B6): píldora fija abajo al centro que lleva a #piloto.
 * Aparece cuando el hero sale de pantalla y se esconde cuando el cierre (#piloto) está a la vista, para no
 * duplicar el CTA. Escondido no se puede enfocar ni lo leen los lectores de pantalla (inert). Va por debajo de
 * la carita viajera. Con "reducir movimiento" aparece sin animación (landing.css).
 */
export function PilotFloat() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const hero = document.querySelector("[data-hero]");
    const pilot = document.getElementById("piloto");
    if (!hero || !pilot) return;
    const inView = new Map<Element, boolean>([
      [hero, true],
      [pilot, false],
    ]);
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => inView.set(entry.target, entry.isIntersecting));
        setVisible(!inView.get(hero) && !inView.get(pilot));
      },
      // El hero cuenta como "pasado" cuando ya no asoma bajo la navegación fija (64 px).
      { rootMargin: "-64px 0px 0px 0px" },
    );
    observer.observe(hero);
    observer.observe(pilot);
    return () => observer.disconnect();
  }, []);

  return (
    <a href="#piloto" className="pilot-float" data-visible={visible ? "" : undefined} inert={!visible} data-pilot-float>
      Únete al programa piloto
    </a>
  );
}
