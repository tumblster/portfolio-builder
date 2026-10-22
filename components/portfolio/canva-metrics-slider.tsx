"use client";

import Image from "next/image";  
import { useRef, useState } from "react";  
import type { StoredImage } from "@/lib/portfolio/schema";

/*  
 * Ronda 13 · sección "Resultados" de la variante clonada: TODAS las capturas  
 * de métricas de su Canva (`canva.metricsImages`) en un slider horizontal.  
 * Una imagen por vista, completa (sin recorte), con scroll-snap; anterior /  
 * siguiente y puntos de posición. Con una sola imagen no hay controles.  
 * El desplazamiento suave lo pone el CSS (scroll-behavior) y se apaga con  
 * prefers-reduced-motion. El Media kit sigue mostrando las mismas capturas.  
 */

export function CanvaMetricsSlider({ images, name }: { images: readonly StoredImage[]; name: string }) {  
  const track = useRef<HTMLUListElement>(null);  
  const [index, setIndex] = useState(0);  
  const total = images.length;  
  const multiple = total > 1;  
  const clamp = (value: number) => Math.min(Math.max(value, 0), total - 1);

  const onScroll = () => {  
    const el = track.current;  
    if (!el || el.clientWidth === 0) return;  
    setIndex(clamp(Math.round(el.scrollLeft / el.clientWidth)));  
  };

  const goTo = (target: number) => {  
    const el = track.current;  
    if (!el) return;  
    el.scrollTo({ left: clamp(target) * el.clientWidth });  
  };

  return (  
    <div className="cv-slider">  
      <ul  
        ref={track}  
        className="cv-slider__track"  
        onScroll={multiple ? onScroll : undefined}  
        tabIndex={multiple ? 0 : undefined}  
        aria-label={multiple ? `Resultados de ${name}` : undefined}  
      >  
        {images.map((image, i) => (  
          <li  
            key={`${image.url}-${i}`}  
            className="cv-slider__slide"  
            aria-hidden={multiple && i !== index ? true : undefined}  
          >  
            <Image  
              src={image.url}  
              alt={image.alt ?? (multiple ? `Resultados de $name(${i + 1} de ${total})` : `Resultados de ${name}`)}  
              width={image.width ?? 900}  
              height={image.height ?? 1600}  
              className="cv-slider__img"  
              sizes="(min-width: 768px) 480px, 92vw"  
            />  
          </li>  
        ))}  
      </ul>  
      {multiple && (  
        <div className="cv-slider__controls">  
          <button  
            type="button"  
            className="cv-slider__nav"  
            onClick={() => goTo(index - 1)}  
            disabled={index === 0}  
            aria-label="Anterior"  
          >  
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">  
              <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />  
            </svg>  
          </button>  
          <div className="cv-slider__dots">  
            {images.map((image, i) => (  
              <button  
                key={`${image.url}-dot-${i}`}  
                type="button"  
                className="cv-slider__dot"  
                aria-label={`${i + 1} de ${total}`}  
                aria-current={i === index ? "true" : undefined}  
                onClick={() => goTo(i)}  
              />  
            ))}  
          </div>  
          <button  
            type="button"  
            className="cv-slider__nav"  
            onClick={() => goTo(index + 1)}  
            disabled={index === total - 1}  
            aria-label="Siguiente"  
          >  
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">  
              <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />  
            </svg>  
          </button>  
        </div>  
      )}  
    </div>  
  );  
}
