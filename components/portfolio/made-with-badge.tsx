"use client";

import { useEffect, useId, useRef, useState } from "react";
import { SupercreadorMark } from "@/components/brand/supercreador-mark";
import "./made-with-badge.css";

/*
 * Badge flotante "Hecho con Supercreador" (ronda 6 · 13.17; 13.23 · 6: en TODOS los portafolios mientras no haya plan
 * pago). Discreto: una píldora chica abajo a la izquierda, con la marca (la sonrisa) y el texto; no tapa contenido ni
 * compite con los CTAs. Al tocarla se abre una tarjetita con un CTA al producto ("Crea tu portafolio", con ?ref=badge
 * para saber cuántos llegan por aquí). Se cierra con otro toque, tocando fuera o con Escape (el foco vuelve a la
 * píldora). Solo en la página pública: el editor no lo muestra.
 */
export function MadeWithBadge({ href = "/?ref=badge" }: { href?: string }) {
  const uid = useId();
  const panelId = `${uid}-panel`;
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      toggle.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="pf-made" data-pf-made-with>
      <div id={panelId} className="pf-made__panel" hidden={!open} data-pf-made-with-panel>
        <p className="pf-made__text">Este portafolio está hecho con Supercreador, el hub para creadores de contenido.</p>
        <a className="pf-made__cta" href={href}>
          Crea tu portafolio<span aria-hidden="true"> →</span>
        </a>
      </div>
      <button
        ref={toggle}
        type="button"
        className="pf-made__pill"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <SupercreadorMark className="pf-made__mark" />
        Hecho con Supercreador
      </button>
    </div>
  );
}
