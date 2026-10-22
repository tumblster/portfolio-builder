"use client";

import Image from "next/image";  
import { useEffect, useRef, useState } from "react";

/**  
 * Canva v2 · A1: el video de Canva se ve y se reproduce DENTRO del mock de  
 * celular, con controles nativos, sin display encima y sin salir a Canva. El  
 * src se conecta recién cuando el teléfono se acerca a la pantalla (una página  
 * puede tener 30 videos).  
 *  
 * Ronda 13: el póster del import (un collage) solo cubre la pantalla hasta que  
 * el video puede mostrar su primer frame real (loadeddata / canplay); ahí se  
 * desvanece en 200ms. Si el video no carga, el póster queda como respaldo.  
 */

/** Pide el primer frame (Safari iOS no lo dibuja solo con preload="metadata").  
 * El fragmento no viaja al servidor: el archivo es el mismo. */  
function firstFrameSrc(src: string): string {  
  return src.includes("#") ? src : `${src}#t=0.001`;  
}

export function CanvaPhoneVideo({ src, title, poster }: { src: string; title: string; poster?: string | null }) {  
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
    <div ref={wrap} className="cv-phone__screenwrap">  
      <video  
        ref={video}  
        className="cv-phone__video"  
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
          sizes="(min-width: 768px) 228px, 46vw"  
          className={posterHidden ? "cv-phone__poster cv-phone__poster--hidden" : "cv-phone__poster"}  
          aria-hidden="true"  
        />  
      )}  
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
