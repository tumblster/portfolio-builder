"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { MARK_BOX } from "@/components/brand/supercreador-mark";
import { MASCOT_SIZE } from "./chispa";

/*
 * Carita viajera de la landing (v2 · M4-rev r2, B1). Reemplaza a la acompañante en burbuja.
 *
 * Es la cara del hero que "se desprende" y baja con quien lee: un único elemento fijo (aria-hidden, sin
 * eventos de puntero) cuya Y en pantalla sigue el progreso del scroll entre el hero y el footer, igual en
 * celular y escritorio. En cada tramo (data-mascot-zone="<expresión>") cambia de cara con un fundido corto y un
 * "pop" de escala. Al llegar al footer, ya en carcajada, rebota hasta calzar EXACTO sobre la sonrisa del logo
 * (data-mascot-target, medido con getBoundingClientRect) y se funde con él: el logo "la absorbe". Si se vuelve a
 * subir, sale del logo con el mismo rebote.
 *
 * Rendimiento: solo transform (y opacidad). Las medidas de layout se toman al montar y cuando cambia el tamaño
 * de la página; en cada frame solo se leen scrollY e innerHeight. Un rAF por frame como máximo.
 * Con "reducir movimiento" no existe: la cara del hero y el logo quedan quietos (ver landing.css).
 */

type Box = { x: number; y: number; size: number };
type State = "hero" | "travel" | "landing" | "absorbed" | "leaving";
type Zone = { top: number; bottom: number; face: string };
type Layout = {
  hero: Box; // en coordenadas del documento
  mark: Box; // la cara completa alineada al logo, en coordenadas del documento
  laneX: number;
  laneSize: number;
  laneTop: number;
  laneBottom: number;
  detach: number; // scroll en que termina de desprenderse del hero
  end: number; // scroll en que llega al footer
  zones: Zone[];
};

const FLIGHT_MS = 700;
const RETURN_GAP = 48; // subir esto por encima del final la saca del logo (histéresis)
const HERO_FACE = "carcajada";

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const mix = (a: Box, b: Box, t: number): Box => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  size: a.size + (b.size - a.size) * t,
});
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
/** Rebote con sobrepaso (≈ 12 %), estilo cartoon. */
const easeOutBack = (t: number) => {
  const c1 = 2.1;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

export function MascotTraveler({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = root.current;
    const pop = element?.firstElementChild as HTMLElement | null;
    const hero = document.querySelector<HTMLElement>("[data-hero-mascot]");
    const target = document.querySelector<SVGElement>("[data-mascot-target]");
    if (!element || !pop || !hero || !target || matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const html = document.documentElement;
    const faces = [...element.querySelectorAll<HTMLElement>("[data-face]")];
    let layout: Layout | null = null;
    let state: State = "hero";
    let face = HERO_FACE;
    let flight: { from: Box; start: number } | null = null;
    let frame = 0;

    function measure() {
      const scrollY = window.scrollY;
      const vw = html.clientWidth;
      const vh = window.innerHeight;
      const heroRect = hero!.getBoundingClientRect();
      const markRect = target!.getBoundingClientRect();
      const maxScroll = html.scrollHeight - vh;
      // La cara completa tal que su boca (MARK_BOX dentro del lienzo) coincide con el mark del logo.
      const scale = markRect.height / MARK_BOX.height;
      const desktop = vw >= 768;
      // Carril: en escritorio, la columna derecha libre (landing-column); en el celular, el borde derecho.
      // En el celular la cara va chica (52 px, ~42 px de tinta) pegada al borde, sobre el margen que deja libre
      // .landing-column (landing.css): no tapa texto.
      const laneSize = desktop ? 190 : 52;
      const laneX = desktop ? vw - (Math.max(32, (vw - 1200) / 2 + 32) + 8) - laneSize : vw - 2 - laneSize;
      const laneTop = 64 + 24; // bajo la navegación fija
      const reserve = 88; // aire para el botón flotante del piloto
      const end = Math.min(markRect.bottom + scrollY - vh + 24, maxScroll - 1);
      if (end < 160) {
        layout = null; // la página cabe casi entera en pantalla: no hay recorrido que hacer
        return;
      }
      layout = {
        hero: { x: heroRect.left, y: heroRect.top + scrollY, size: heroRect.width },
        mark: {
          x: markRect.left - MARK_BOX.x * scale,
          y: markRect.top + scrollY - MARK_BOX.y * scale,
          size: MASCOT_SIZE * scale,
        },
        laneX,
        laneSize,
        laneTop,
        laneBottom: Math.max(laneTop, vh - laneSize - reserve),
        detach: Math.max(160, heroRect.width),
        end,
        zones: [...document.querySelectorAll<HTMLElement>("[data-mascot-zone]")].map((zone) => {
          const rect = zone.getBoundingClientRect();
          return { top: rect.top + scrollY, bottom: rect.bottom + scrollY, face: zone.dataset.mascotZone ?? HERO_FACE };
        }),
      };
    }

    const laneBox = (l: Layout, scrollY: number): Box => ({
      x: l.laneX,
      y: l.laneTop + (l.laneBottom - l.laneTop) * clamp(scrollY / l.end),
      size: l.laneSize,
    });
    const travelBox = (l: Layout, scrollY: number): Box =>
      mix({ ...l.hero, y: l.hero.y - scrollY }, laneBox(l, scrollY), easeInOut(clamp(scrollY / l.detach)));
    const markBox = (l: Layout, scrollY: number): Box => ({ ...l.mark, y: l.mark.y - scrollY });

    function faceFor(l: Layout, scrollY: number): string {
      if (state !== "travel" && state !== "hero") return HERO_FACE;
      const center = scrollY + window.innerHeight / 2;
      if (!l.zones.length || center < l.zones[0].top) return HERO_FACE;
      return l.zones.find((zone) => center >= zone.top && center < zone.bottom)?.face ?? face;
    }

    function showFace(next: string) {
      if (next === face) return;
      face = next;
      faces.forEach((node) => node.toggleAttribute("data-active", node.dataset.face === next));
      // "Pop" cartoon: 1 → 1.08 → 1, sobre el envoltorio (el elemento de afuera lleva la posición).
      pop!.animate([{ transform: "scale(1)" }, { transform: "scale(1.08)" }, { transform: "scale(1)" }], {
        duration: 240,
        easing: "ease-out",
      });
    }

    function place(box: Box) {
      element!.style.transform = `translate3d(${box.x}px, ${box.y}px, 0) scale(${box.size / MASCOT_SIZE})`;
    }

    function setState(next: State) {
      state = next;
      element!.dataset.state = next;
      // Mientras viaja, la cara del hero se esconde (la viajera ocupa su lugar exacto) y el mark del footer
      // espera a que la cara llegue: el cruce de los dos es el "la absorbe".
      html.toggleAttribute("data-mascot-traveling", next !== "hero");
      html.toggleAttribute("data-mascot-hide-mark", next !== "absorbed");
    }

    function tick(now: number) {
      frame = 0;
      const l = layout;
      if (!l) {
        if (state !== "hero") setState("hero");
        html.removeAttribute("data-mascot-hide-mark");
        return;
      }
      const scrollY = window.scrollY;

      if (state === "hero" && scrollY > 2) setState("travel");
      if (state === "travel" && scrollY <= 2) setState("hero");
      if (state === "travel" && scrollY >= l.end) {
        flight = { from: travelBox(l, scrollY), start: now };
        setState("landing");
      }
      if (state === "absorbed" && scrollY < l.end - RETURN_GAP) {
        flight = { from: markBox(l, scrollY), start: now };
        setState("leaving");
      }

      showFace(faceFor(l, scrollY));

      if (state === "landing" || state === "leaving") {
        const t = clamp((now - (flight?.start ?? now)) / FLIGHT_MS);
        const to = state === "landing" ? markBox(l, scrollY) : travelBox(l, scrollY);
        place(mix(flight?.from ?? to, to, easeOutBack(t)));
        if (t < 1) {
          frame = requestAnimationFrame(tick);
          return;
        }
        flight = null;
        setState(state === "landing" ? "absorbed" : "travel");
        // Si mientras volaba se volvió a subir (o a bajar), el próximo frame lo corrige.
        request();
        return;
      }
      place(state === "absorbed" ? markBox(l, scrollY) : travelBox(l, scrollY));
    }

    function request() {
      if (!frame) frame = requestAnimationFrame(tick);
    }

    function remeasure() {
      measure();
      request();
    }

    measure();
    setState("hero");
    element.dataset.ready = "";
    request();

    window.addEventListener("scroll", request, { passive: true });
    window.addEventListener("resize", remeasure);
    const resize = new ResizeObserver(remeasure);
    resize.observe(document.body);
    document.fonts?.ready.then(remeasure).catch(() => {});

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", request);
      window.removeEventListener("resize", remeasure);
      resize.disconnect();
      html.removeAttribute("data-mascot-traveling");
      html.removeAttribute("data-mascot-hide-mark");
    };
  }, []);

  return (
    <div ref={root} className="mascot-traveler" aria-hidden="true" data-mascot-traveler>
      <div className="mascot-traveler__pop">{children}</div>
    </div>
  );
}
