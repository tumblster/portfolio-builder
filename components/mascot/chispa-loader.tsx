"use client";

import { useEffect, useState } from "react";
import { Chispa, EXPRESSIONS } from "./chispa";

/*
 * Carga con Chispa (v2 · M4-rev r2, C5): las 6 expresiones reales ciclan cada ~800 ms con un fundido y un "pop"
 * de escala, estilo cartoon (chispa.css). Decorativa: el texto de estado va al lado, en una región aria-live.
 * Con "reducir movimiento" se queda quieta en la sonriente.
 */
const CYCLE_MS = 800;

export function ChispaLoader() {
  const [index, setIndex] = useState(0); // EXPRESSIONS[0] = sonriente
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setIndex((current) => (current + 1) % EXPRESSIONS.length), CYCLE_MS);
    return () => clearInterval(timer);
  }, []);
  return (
    <span className="chispa-loader" aria-hidden="true" data-chispa-loader>
      {EXPRESSIONS.map((expression, position) => (
        <span key={expression} data-face={expression} data-active={position === index ? "" : undefined}>
          <Chispa expression={expression} />
        </span>
      ))}
    </span>
  );
}
