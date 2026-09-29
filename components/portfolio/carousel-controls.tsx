"use client";

import { useEffect, useState } from "react";
import { ArrowIcon } from "./icons";

/**
 * Flechas del carrusel de piezas (tablet y escritorio; en el celular se desliza con el dedo).
 * Solo aparecen si hay piezas fuera de vista, y se actualizan al filtrar por nicho.
 */
export function CarouselControls({ targetId }: { targetId: string }) {
  const [edges, setEdges] = useState({ start: true, end: true });

  useEffect(() => {
    const element = document.getElementById(targetId);
    if (!element) return;
    const update = () =>
      setEdges({
        start: element.scrollLeft <= 4,
        end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 4,
      });
    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    return () => {
      element.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [targetId]);

  function go(direction: -1 | 1) {
    const element = document.getElementById(targetId);
    if (!element) return;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollBy({ left: direction * element.clientWidth * 0.75, behavior: smooth ? "smooth" : "auto" });
  }

  if (edges.start && edges.end) return null;
  return (
    <div className="pf-arrows">
      <button type="button" className="pf-arrow" onClick={() => go(-1)} disabled={edges.start} aria-label="Ver piezas anteriores" aria-controls={targetId}>
        <ArrowIcon direction="left" size={20} />
      </button>
      <button type="button" className="pf-arrow" onClick={() => go(1)} disabled={edges.end} aria-label="Ver más piezas" aria-controls={targetId}>
        <ArrowIcon direction="right" size={20} />
      </button>
    </div>
  );
}
