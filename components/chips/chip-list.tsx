"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import "./chips.css";

/*
 * Lista de chips ordenable (ronda 30/09 · 7.1), patrón "combobox con chips" (Tagify, Mantine TagsInput).
 * - Cada chip tiene su asa (⠿) y su ×. El orden es el de elección: nunca se reordena solo.
 * - Arrastrar: se toma el asa (dedo o mouse) y el chip cambia de lugar en vivo.
 * - Teclado: con el foco en cualquier parte del chip, Alt + flechas lo mueve; el foco lo acompaña.
 * - Al quitar un chip, el foco vuelve al campo (onAfterRemove): nunca se pierde.
 * - Cada movimiento y cada quitada se anuncia a lectores de pantalla.
 * - Ronda 6 · 13.22: el scroll es libre. Solo el asa toma el gesto del dedo (touch-action: none, en chips.css); el
 *   resto del chip (miniatura, título, selector de nicho) deja deslizar la página como siempre. Y si al arrastrar
 *   el puntero llega cerca del borde de arriba o de abajo, la página se desplaza sola.
 */

/** 13.22: franja (px) junto al borde de la ventana donde el arrastre desplaza la página, y su velocidad máxima. */
const AUTO_SCROLL_EDGE = 96;
const AUTO_SCROLL_SPEED = 16;
/** Cuánto (px) hay que mover el puntero antes de que el borde desplace la página (tocar el asa no basta). */
const DRAG_THRESHOLD = 6;

type Props<T> = {
  /** Nombre accesible de la lista ("Nichos elegidos"). */
  label: string;
  items: T[];
  getKey: (item: T) => string;
  getLabel: (item: T) => string;
  /** Lo que va dentro del chip, entre el asa y la ×. */
  renderContent: (item: T, index: number) => ReactNode;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  /** Se llama después de quitar (con el ratón o el teclado): devuelve el foco al campo. */
  onAfterRemove?: () => void;
  /** "wrap": chips en línea (nichos); "stack": uno bajo otro (piezas, con miniatura). */
  layout: "wrap" | "stack";
  idPrefix: string;
  emptyText: string;
};

export function ChipList<T>(props: Props<T>) {
  const { items, getKey, getLabel, layout, idPrefix } = props;
  const listRef = useRef<HTMLUListElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  // Lo vigente para el arrastre (sus escuchas viven en la ventana, fuera del render): se actualiza tras cada render.
  const latest = useRef({ items, onMove: props.onMove, getKey, getLabel });
  useEffect(() => {
    latest.current = { items, onMove: props.onMove, getKey, getLabel };
  });
  const handleId = (key: string) => `${idPrefix}-handle-${key}`;

  function move(from: number, to: number, focusKey: string) {
    if (to < 0 || to >= items.length || from === to) return;
    props.onMove(from, to);
    setAnnouncement(`«${getLabel(items[from])}» movido a la posición ${to + 1} de ${items.length}.`);
    requestAnimationFrame(() => document.getElementById(handleId(focusKey))?.focus());
  }

  function remove(index: number) {
    setAnnouncement(`Quitaste «${getLabel(items[index])}».`);
    props.onRemove(index);
    props.onAfterRemove?.();
  }

  function onKeyDown(event: KeyboardEvent<HTMLLIElement>, index: number, key: string) {
    if (!event.altKey) return;
    const back = event.key === "ArrowLeft" || event.key === "ArrowUp";
    const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
    if (!back && !forward) return;
    event.preventDefault();
    move(index, index + (back ? -1 : 1), key);
  }

  // Arrastre con el asa (dedo o mouse): mientras dura, se escucha el puntero en toda la ventana y el chip va a la
  // posición del chip más cercano. Así no depende de que el puntero siga encima del asa.
  function onPointerDown(event: ReactPointerEvent<HTMLButtonElement>, key: string) {
    if (event.button !== 0) return;
    event.preventDefault();
    setDragging(key);
    const startX = event.clientX;
    const startY = event.clientY;
    let pointerX = startX;
    let pointerY = startY;
    let moved = false;
    let frame = 0;

    // El chip va a la posición del chip más cercano al puntero.
    const reorder = () => {
      const list = listRef.current;
      if (!list) return;
      const chips = [...list.querySelectorAll<HTMLElement>(":scope > li[data-chip]")];
      let nearest = -1;
      let best = Infinity;
      chips.forEach((chip, index) => {
        const rect = chip.getBoundingClientRect();
        const distance = Math.hypot(pointerX - (rect.left + rect.width / 2), pointerY - (rect.top + rect.height / 2));
        if (distance < best) {
          best = distance;
          nearest = index;
        }
      });
      const { items: current, onMove, getKey: keyOf } = latest.current;
      const from = current.findIndex((item) => keyOf(item) === key);
      if (nearest >= 0 && from >= 0 && nearest !== from) onMove(from, nearest);
    };

    // 13.22: cerca del borde de arriba o de abajo, la página se desplaza sola (más rápido cuanto más cerca), así se
    // puede llevar una pieza más allá de lo que se ve sin soltarla.
    const autoScroll = () => {
      const edge = Math.min(AUTO_SCROLL_EDGE, window.innerHeight / 4);
      const bottom = window.innerHeight - edge;
      const pull = pointerY < edge ? (pointerY - edge) / edge : pointerY > bottom ? (pointerY - bottom) / edge : 0;
      const delta = Math.round(Math.max(-1, Math.min(1, pull)) * AUTO_SCROLL_SPEED);
      if (moved && delta !== 0) {
        window.scrollBy({ top: delta, behavior: "instant" });
        reorder();
      }
      frame = requestAnimationFrame(autoScroll);
    };

    const onMoveWindow = (moveEvent: PointerEvent) => {
      pointerX = moveEvent.clientX;
      pointerY = moveEvent.clientY;
      if (!moved && Math.hypot(pointerX - startX, pointerY - startY) > DRAG_THRESHOLD) moved = true;
      reorder();
    };
    const onEnd = () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMoveWindow);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      setDragging(null);
      const { items: current, getKey: keyOf, getLabel: labelOf } = latest.current;
      const to = current.findIndex((item) => keyOf(item) === key);
      if (to >= 0) setAnnouncement(`«${labelOf(current[to])}» quedó en la posición ${to + 1} de ${current.length}.`);
    };
    window.addEventListener("pointermove", onMoveWindow);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    frame = requestAnimationFrame(autoScroll);
  }

  return (
    <>
      {items.length === 0 ? (
        <p className="text-sm text-muted" data-chip-empty>
          {props.emptyText}
        </p>
      ) : (
        <ul
          ref={listRef}
          aria-label={props.label}
          className={layout === "wrap" ? "flex flex-wrap gap-2" : "flex flex-col gap-2"}
          data-chip-list={layout}
        >
          {items.map((item, index) => {
            const key = getKey(item);
            const label = getLabel(item);
            return (
              <li
                key={key}
                data-chip={key}
                data-dragging={dragging === key ? "" : undefined}
                onKeyDown={(event) => onKeyDown(event, index, key)}
                className={`chip ${layout === "stack" ? "chip--stack" : ""}`}
              >
                <button
                  type="button"
                  id={handleId(key)}
                  className="chip__handle"
                  aria-label={`Mover «${label}», posición ${index + 1} de ${items.length}. Arrastra o usa Alt + flechas.`}
                  onPointerDown={(event) => onPointerDown(event, key)}
                >
                  <svg viewBox="0 0 10 16" aria-hidden="true" focusable="false">
                    {[3, 8, 13].map((cy) => (
                      <g key={cy}>
                        <circle cx="3" cy={cy} r="1.3" />
                        <circle cx="7" cy={cy} r="1.3" />
                      </g>
                    ))}
                  </svg>
                </button>
                <span className="chip__content">{props.renderContent(item, index)}</span>
                <button type="button" className="chip__remove" aria-label={`Quitar «${label}»`} onClick={() => remove(index)}>
                  <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
                    <path d="M3 3l6 6M9 3l-6 6" />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </>
  );
}
