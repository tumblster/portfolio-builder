"use client";

import { useEffect, useRef, useState } from "react";

/*  
 * Ronda 14 · 5: el video de su cierre como FONDO de la sección "¿Trabajamos juntos?". En loop, sin sonido, corre  
 * solo mientras la sección está en pantalla (se pausa al salir) y nunca con prefers-reduced-motion (queda su  
 * primer frame o su póster). Encima, un velo con el color de la banda a opacidad alta: el video se insinúa, no  
 * compite, y el texto conserva el contraste que ya calculó la guardia para esa banda.  
 */

function firstFrameSrc(src: string): string {  
  return src.includes("#") ? src : `${src}#t=0.001`;  
}

export function CanvaBackdropVideo({ src, poster }: { src: string; poster: string | null }) {  
  const box = useRef<HTMLDivElement>(null);  
  const video = useRef<HTMLVideoElement>(null);  
  const [near, setNear] = useState(false);  
  const [inView, setInView] = useState(false);

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
    if (inView && !reduce) void v.play().catch(() => {});  
    else v.pause();  
  }, [near, inView]);

  return (  
    <div ref={box} className="cv-backdrop" aria-hidden="true">  
      <video  
        ref={video}  
        className="cv-backdrop__video"  
        src={near ? firstFrameSrc(src) : undefined}  
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
