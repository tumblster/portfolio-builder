"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import type { StoredImage } from "@/lib/portfolio/schema";

/*
 * El ÚNICO slider de la variante clonada (Métricas, Razón y Fotos). Una imagen por vista con scroll-snap,
 * anterior / siguiente y puntos de posición; con una sola imagen no hay controles.
 *
 * Ronda 15 · C2:
 * - La imagen SIEMPRE entra completa (sin recorte) en todos los sliders. `fit` se acepta por compatibilidad y ya no
 *   cambia nada.
 * - `stage` (Métricas): en pantallas de 1024 px o más, escenario al ancho del contenedor (máx. 1120 px), la captura
 *   activa centrada y completa (alto máx. 640 px), la anterior y la siguiente asomando con opacidad reducida y
 *   flechas a los lados. En celular, como siempre.
 * La posición activa se mide por el centro de cada lámina, así sirve para los dos formatos.
 */

function Chevron({ direction }: { direction: "prev" | "next" }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        d={direction === "prev" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CanvaImageSlider({
  images,
  label,
  sizes = "(min-width: 768px) 480px, 92vw",
  stage = false,
}: {
  images: readonly StoredImage[];
  /** Base del texto alternativo ("Métricas de Aisha"): no se muestra en pantalla. */
  label: string;
  /** Compatibilidad: desde la ronda 15 toda imagen se muestra completa. */
  fit?: "contain" | "cover";
  sizes?: string;
  /** C2: escenario desktop con vecinas asomando. */
  stage?: boolean;
}) {
  const track = useRef<HTMLUListElement>(null);
  const [index, setIndex] = useState(0);
  const total = images.length;
  const multiple = total > 1;
  const clamp = (value: number) => Math.min(Math.max(value, 0), total - 1);
  const slides = () => (track.current ? (Array.from(track.current.children) as HTMLElement[]) : []);

  const onScroll = () => {
    const el = track.current;
    if (!el || el.clientWidth === 0) return;
    const center = el.scrollLeft + el.clientWidth / 2;
    let best = 0;
    let distance = Number.POSITIVE_INFINITY;
    slides().forEach((slide, i) => {
      const gap = Math.abs(slide.offsetLeft + slide.offsetWidth / 2 - center);
      if (gap < distance) {
        distance = gap;
        best = i;
      }
    });
    setIndex(best);
  };

  const goTo = (target: number) => {
    const el = track.current;
    const slide = slides()[clamp(target)];
    if (!el || !slide) return;
    el.scrollTo({ left: slide.offsetLeft + slide.offsetWidth / 2 - el.clientWidth / 2 });
  };

  const prevButton = (className: string) => (
    <button type="button" className={className} onClick={() => goTo(index - 1)} disabled={index === 0} aria-label="Anterior">
      <Chevron direction="prev" />
    </button>
  );
  const nextButton = (className: string) => (
    <button
      type="button"
      className={className}
      onClick={() => goTo(index + 1)}
      disabled={index === total - 1}
      aria-label="Siguiente"
    >
      <Chevron direction="next" />
    </button>
  );

  return (
    <div className={stage ? "cv-slider cv-slider--stage" : "cv-slider"}>
      <div className="cv-slider__stage">
        <ul
          ref={track}
          className="cv-slider__track"
          onScroll={multiple ? onScroll : undefined}
          tabIndex={multiple ? 0 : undefined}
          aria-label={multiple ? label : undefined}
        >
          {images.map((image, i) => (
            <li
              key={`${image.url}-${i}`}
              className="cv-slider__slide"
              data-active={i === index ? "" : undefined}
              aria-hidden={multiple && i !== index ? true : undefined}
            >
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
        {multiple && stage && (
          <>
            {prevButton("cv-slider__side cv-slider__side--prev")}
            {nextButton("cv-slider__side cv-slider__side--next")}
          </>
        )}
      </div>
      {multiple && (
        <div className="cv-slider__controls">
          {prevButton("cv-slider__nav")}
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
          {nextButton("cv-slider__nav")}
        </div>
      )}
    </div>
  );
}
