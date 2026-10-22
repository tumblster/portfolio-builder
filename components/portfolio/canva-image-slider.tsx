"use client";

import Image from "next/image";  
import { useRef, useState } from "react";  
import type { StoredImage } from "@/lib/portfolio/schema";

/*  
 * Ronda 13 + 14 · el ÚNICO slider de la variante clonada (Métricas y Razón). Una imagen por vista con scroll-snap,  
 * anterior / siguiente y puntos de posición; con una sola imagen no hay controles. El desplazamiento suave lo pone  
 * el CSS (scroll-behavior) y se apaga con prefers-reduced-motion.  
 * - fit "contain": la imagen completa, sin recorte (capturas de métricas).  
 * - fit "cover": marco 4/5 que se llena (galería de fotos de "¿Por qué yo?").  
 */

export function CanvaImageSlider({  
  images,  
  label,  
  fit = "contain",  
  sizes = "(min-width: 768px) 480px, 92vw",  
}: {  
  images: readonly StoredImage[];  
  /** Base del texto alternativo ("Métricas de Aisha"): no se muestra en pantalla. */  
  label: string;  
  fit?: "contain" | "cover";  
  sizes?: string;  
}) {  
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
    <div className={`cv-slider cv-slider--${fit}`}>  
      <ul  
        ref={track}  
        className="cv-slider__track"  
        onScroll={multiple ? onScroll : undefined}  
        tabIndex={multiple ? 0 : undefined}  
        aria-label={multiple ? label : undefined}  
      >  
        {images.map((image, i) => (  
          <li key={`${image.url}-${i}`} className="cv-slider__slide" aria-hidden={multiple && i !== index ? true : undefined}>  
            <Image  
              src={image.url}  
              alt={image.alt ?? (multiple ? `${label} (${i + 1} de ${total})` : label)}  
              width={image.width ?? 900}  
              height={image.height ?? 1600}  
              className="cv-slider__img"  
              sizes={sizes}  
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
