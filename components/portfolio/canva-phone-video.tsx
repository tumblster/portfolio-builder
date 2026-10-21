"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Canva v2 · A1: el video de Canva se ve y se reproduce DENTRO del mock de
 * celular. Sin póster de Canva (su filmstrip se veía como collage): el <video>
 * muestra su primer frame real, y al tocarlo reproduce ahí mismo, sin display
 * encima y sin salir a Canva. El src se conecta recién cuando el teléfono se
 * acerca a la pantalla (una página puede tener 30 videos).
 */
export function CanvaPhoneVideo({ src, title, poster }: { src: string; title: string; poster?: string | null }) {
  const wrap = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [attached, setAttached] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [controlsOn, setControlsOn] = useState(false);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setAttached(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setAttached(true);
          io.disconnect();
        }
      },
      { rootMargin: "500px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) {
      setControlsOn(true);
      void v.play().catch(() => {});
    } else {
      v.pause();
    }
  };

  return (
    <div ref={wrap} className="cv-phone__screenwrap">
      <video
        ref={video}
        className="cv-phone__video"
        src={attached ? src : undefined}
        poster={poster ?? undefined}
        preload="metadata"
        playsInline
        controls={controlsOn}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onClick={toggle}
        aria-label={title}
      />
      {!playing && (
        <button
          type="button"
          className="cv-phone__playbtn"
          onClick={toggle}
          aria-label={`Reproducir: ${title}`}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
            <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
          </svg>
        </button>
      )}
    </div>
  );
}
