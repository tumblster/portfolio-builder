"use client";

import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { embedFor } from "@/lib/portfolio/embed";
import "./inline-reel.css";

/*
 * Reel en línea (spec 3.1 / 7.1, ajuste 5 + ajuste 30/09: play siempre manual), patrón facade: la miniatura queda
 * tal cual y el embed oficial se carga recién al interactuar (la carga inicial no trae ningún iframe ni JS de las
 * plataformas).
 * - Web y móvil: tap/click en la miniatura abre el reproductor inline ahí mismo; el play es manual dentro del
 *   reproductor de cada plataforma (sin autoplay, sin hover-to-play). La ×, un toque fuera o Escape lo cierran.
 * - Nunca dos a la vez: hay un solo reel activo en toda la página; al activar uno, los demás se desmontan (su iframe
 *   desaparece y deja de sonar), como en TikTok o Instagram.
 * El reproductor va sobre la miniatura ([data-reel-media]): la llena si es grande o flota agrandado encima si es
 * chica, y la sigue al hacer scroll. Instagram no permite autoplay: su embed se abre ahí y se toca para reproducir.
 */

let activeId: string | null = null;
const listeners = new Set<() => void>();
function setActive(id: string | null) {
  if (activeId === id) return;
  activeId = id;
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const MIN_FILL = 200;
const FLOAT_WIDTH = 280;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

export function InlineReel({
  link,
  title,
  className,
  children,
}: {
  link: { platform: string; url: string };
  title: string;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  const active = useSyncExternalStore(
    subscribe,
    () => activeId === id,
    () => false,
  );
  const wrap = useRef<HTMLDivElement>(null);
  const player = useRef<HTMLDivElement>(null);
  const embed = embedFor(link);

  // Mientras está activo: el reproductor sigue a su miniatura (un rAF por frame, sin re-render).
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    let last = "";
    const place = () => {
      const media = wrap.current?.querySelector<HTMLElement>("[data-reel-media]") ?? wrap.current;
      const node = player.current;
      if (media && node) {
        const rect = media.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        if (rect.bottom < 0 || rect.top > vh) return setActive(null); // salió de la pantalla
        let { left, top, width, height } = rect;
        if (width < MIN_FILL || height < MIN_FILL) {
          width = Math.min(FLOAT_WIDTH, vw - 24);
          height = Math.min((width * 16) / 9, vh - 24);
          left = clamp(rect.left + rect.width / 2 - width / 2, 12, vw - width - 12);
          top = clamp(rect.top + rect.height / 2 - height / 2, 12, vh - height - 12);
        }
        const key = `${left}|${top}|${width}|${height}`;
        if (key !== last) {
          last = key;
          node.style.transform = `translate(${left}px, ${top}px)`;
          node.style.width = `${width}px`;
          node.style.height = `${height}px`;
          // Instagram mide al menos 326 px: se dibuja a su ancho natural y se escala para que quepa.
          const scale = embed?.naturalWidth ? Math.min(1, width / embed.naturalWidth) : 1;
          node.style.setProperty("--reel-scale", String(scale));
        }
      }
      frame = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(frame);
  }, [active, embed?.naturalWidth]);

  // Toque fuera o Escape: se cierra. Al desmontarse activo, suelta el turno.
  useEffect(() => {
    if (!active) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (wrap.current?.contains(target) || player.current?.contains(target)) return;
      setActive(null);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setActive(null);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      if (activeId === id) setActive(null);
    };
  }, [active, id]);

  if (!embed) return <div className={className}>{children}</div>;

  const label = `${active ? "Pausar" : "Reproducir"} «${title}»`;

  return (
    <div
      ref={wrap}
      className={`reel-card ${className ?? ""}`}
      data-inline-reel={embed.platform}
      data-active={active ? "" : undefined}
    >
      {children}
      <button
        type="button"
        className="reel-hit"
        aria-label={label}
        aria-pressed={active}
        onClick={() => setActive(active ? null : id)}
      />
      {active &&
        createPortal(
          <div
            ref={player}
            className="reel-player"
            data-platform={embed.platform}
            role="region"
            aria-label={`Video: ${title}`}
          >
            <div className="reel-player__frame">
              <iframe
                src={embed.src}
                title={`Video: ${title}`}
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                data-reel-iframe
              />
            </div>
            <button type="button" className="reel-player__close" aria-label="Cerrar el video" onClick={() => setActive(null)}>
              <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
                <path d="M3 3l6 6M9 3l-6 6" />
              </svg>
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
