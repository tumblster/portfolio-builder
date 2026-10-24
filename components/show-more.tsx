"use client";

import { useState } from "react";

/*
 * Ronda 15 · D1 + Parte 2 · addendum A1: "Ver más" universal. Ninguna lista de piezas se muestra completa de entrada,
 * venga de donde venga (Instagram, Canva o carga manual): las primeras 6 y un botón de texto sin borde "Ver más";
 * desplegada, "Ver menos". El conteo total lo sigue mostrando cada pantalla: se colapsa la lista, no la información.
 */

export const SHOW_MORE_INITIAL = 6;

export function useShowMore(total: number, initial: number = SHOW_MORE_INITIAL) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = total > initial;
  const limit = expanded || !hasMore ? total : initial;
  return { expanded, setExpanded, limit, hasMore, hidden: total - limit };
}

export function ShowMoreButton({
  expanded,
  hidden,
  onToggle,
  controls,
}: {
  expanded: boolean;
  /** Cuántas quedan ocultas (para lectores de pantalla). */
  hidden: number;
  onToggle: () => void;
  /** id de la lista que despliega. */
  controls?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-controls={controls}
      className="inline-flex min-h-tap items-center px-4 text-sm font-semibold text-ink underline decoration-accent decoration-2 underline-offset-4 transition-transform duration-150 ease-out hover:decoration-ink active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
      data-show-more={expanded ? "less" : "more"}
    >
      {expanded ? "Ver menos" : "Ver más"}
      {!expanded && hidden > 0 && <span className="sr-only"> ({hidden} piezas más)</span>}
    </button>
  );
}
