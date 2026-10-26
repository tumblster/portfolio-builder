"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/*
 * Ronda 14 · 5: el video de su cierre como FONDO de la sección "¿Trabajamos juntos?". En loop, sin sonido, corre
 * solo mientras la sección está en pantalla (se pausa al salir) y nunca con prefers-reduced-motion. Encima, un velo
 * con el color de la banda: el texto conserva el contraste que ya calculó la guardia para esa banda.
 *
 * Ronda de corrección:
 * - V1: en celular el velo usa la opacidad que calcula la plantilla (--cv-veil-m): el movimiento se ve.
 * - V2: cuando el dispositivo no reproduce (Reduce Motion, o el navegador rechaza el autoplay en bajo consumo), la
 *   sección sigue leyéndose como video: queda su póster si la importación lo dio por útil y, si no, un cuadro real
 *   del video tomado ya entrado el clip (no el cuadro 0, que suele ser negro o un fundido).
 */

/** V2: el cuadro de reposo: al 25 % del clip, sin pasar de 1 s. */
const STILL_MAX_SECONDS = 1;
const STILL_SHARE = 0.25;
const HAVE_METADATA = 1;

export function CanvaBackdropVideo({ src, poster }: { src: string; poster: string | null }) {
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false);
  const [inView, setInView] = useState(false);

  // V2: con póster útil queda el póster; sin él, se busca un cuadro representativo del video.
  const showStill = useCallback(() => {
    const v = video.current;
    if (!v || poster) return;
    const seek = () => {
      if (!v.paused) return;
      const duration = v.duration;
      const at =
        Number.isFinite(duration) && duration > 0 ? Math.min(STILL_MAX_SECONDS, duration * STILL_SHARE) : STILL_MAX_SECONDS;
      if (Math.abs(v.currentTime - at) < 0.05) return;
      try {
        v.currentTime = at;
      } catch {
        // Sin cuadro disponible: queda el velo de la banda (lo de antes).
      }
    };
    if (v.readyState >= HAVE_METADATA) seek();
    else v.addEventListener("loadedmetadata", seek, { once: true });
  }, [poster]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        if (entry.isIntersecting) setNear(true);
        setInView(entry.isIntersecting);
      },
      { rootMargin: "200px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const v = video.current;
    if (!v || !near) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    v.muted = true;
    if (reduce) {
      v.pause();
      showStill();
      return;
    }
    if (inView) void v.play().catch(() => showStill());
    else v.pause();
  }, [near, inView, showStill]);

  return (
    <div ref={box} className="cv-backdrop" aria-hidden="true">
      <video
        ref={video}
        className="cv-backdrop__video"
        src={near ? src : undefined}
        poster={poster ?? undefined}
        muted
        loop
        playsInline
        preload="metadata"
        tabIndex={-1}
      />
      <span className="cv-backdrop__veil" />
    </div>
  );
}
