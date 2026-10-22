"use client";

import Image from "next/image";  
import { useEffect, useRef, useState } from "react";

/**  
 * Ronda 14 · 1: el video de una pieza como tarjeta limpia (sin marco de dispositivo). Misma técnica ya verificada del  
 * teléfono: el src se conecta cuando la tarjeta se acerca a la pantalla, el póster cubre solo hasta el primer frame  
 * real (loadeddata / canplay) y se desvanece en 200ms, y el play corre AQUÍ dentro con controles nativos, sin  
 * salir a Canva. Si el video no carga, el póster queda como respaldo.  
 */

/** Pide el primer frame (Safari iOS no lo dibuja solo con preload="metadata"). El fragmento no viaja al servidor. */  
function firstFrameSrc(src: string): string {  
  return src.includes("#") ? src : `${src}#t=0.001`;  
}

export function CanvaVideoCard({  
  src,  
  title,  
  poster,  
  sizes,  
}: {  
  src: string;  
  title: string;  
  poster?: string | null;  
  sizes: string;  
}) {  
  const wrap = useRef<HTMLDivElement>(null);  
  const video = useRef<HTMLVideoElement>(null);  
  const [attached, setAttached] = useState(false);  
  const [playing, setPlaying] = useState(false);  
  const [controlsOn, setControlsOn] = useState(false);  
  const [frameReady, setFrameReady] = useState(false);

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

  // Por si el navegador ya tenía el frame antes de que llegara el evento.  
  useEffect(() => {  
    if (attached && (video.current?.readyState ?? 0) >= 2) setFrameReady(true);  
  }, [attached]);

  const markReady = () => setFrameReady(true);

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

  const posterHidden = frameReady || playing;

  return (  
    <div ref={wrap} className="cv-card__media" data-playing={playing ? "" : undefined}>  
      <video  
        ref={video}  
        className="cv-card__video"  
        src={attached ? firstFrameSrc(src) : undefined}  
        preload="metadata"  
        playsInline  
        controls={controlsOn}  
        onLoadedData={markReady}  
        onCanPlay={markReady}  
        onPlay={() => setPlaying(true)}  
        onPause={() => setPlaying(false)}  
        onClick={toggle}  
        aria-label={title}  
      />  
      {poster && (  
        <Image  
          src={poster}  
          alt=""  
          fill  
          sizes={sizes}  
          className={posterHidden ? "cv-card__poster cv-card__poster--hidden" : "cv-card__poster"}  
          aria-hidden="true"  
        />  
      )}  
      {!playing && (  
        <button type="button" className="cv-card__play" onClick={toggle} aria-label={`Reproducir: ${title}`}>  
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">  
            <path d="M8 5.5v13l11-6.5z" fill="currentColor" />  
          </svg>  
        </button>  
      )}  
    </div>  
  );  
}
