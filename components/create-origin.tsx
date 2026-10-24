"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { MANUAL_PREFILL_KEY } from "@/lib/import/events";
import "./flow-motion.css";

/*
 * Parte 2 · 1: la puerta de entrada de /crear. Tres tarjetas grandes y tappables (toda la tarjeta es el link):
 * Instagram y Canva entran a su flujo de importación de siempre; "Desde cero" abre el editor manual vacío (igual
 * que "Prefiero llenarlo manual": limpia cualquier prellenado anterior).
 */

type OriginId = "instagram" | "canva" | "manual";

const ORIGINS: readonly { id: OriginId; href: string; title: string; description: string }[] = [
  { id: "instagram", href: "/crear?origen=instagram", title: "Desde Instagram", description: "Traemos tus mejores publicaciones." },
  { id: "canva", href: "/crear?origen=canva", title: "Desde Canva", description: "Convertimos tu sitio de Canva." },
  { id: "manual", href: "/crear/manual", title: "Desde cero", description: "Lo llenas tú, paso a paso." },
];

function clearPrefill() {
  try {
    sessionStorage.removeItem(MANUAL_PREFILL_KEY);
  } catch {
    // nada que limpiar
  }
}

/** Íconos decorativos (el texto de la tarjeta es lo que se lee). */
function OriginIcon({ id }: { id: OriginId }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" focusable="false">
      {id === "instagram" ? (
        <>
          <rect x="3.5" y="3.5" width="17" height="17" rx="5" {...common} />
          <circle cx="12" cy="12" r="4" {...common} />
          <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" />
        </>
      ) : id === "canva" ? (
        <>
          <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" {...common} />
          <path d="M3.5 9.5h17M9.5 9.5v10" {...common} />
        </>
      ) : (
        <path d="M5 19l1-4L15.5 5.5a2.1 2.1 0 0 1 3 3L9 18l-4 1zM13.5 7.5l3 3" {...common} />
      )}
    </svg>
  );
}

export function CreateOrigin() {
  return (
    <ul className="origin-grid mt-12 grid gap-4 md:grid-cols-3" data-create-origin>
      {ORIGINS.map((origin, index) => (
        <li key={origin.id} style={{ "--i": index } as CSSProperties}>
          <Link
            href={origin.href}
            onClick={origin.id === "manual" ? clearPrefill : undefined}
            className="origin-card"
            data-origin={origin.id}
          >
            <span className="origin-card__top" aria-hidden="true">
              <span className="origin-card__icon">
                <OriginIcon id={origin.id} />
              </span>
              <span className="origin-card__arrow">→</span>
            </span>
            <span className="block">
              <span className="block text-xl font-semibold tracking-[-0.01em]">{origin.title}</span>
              <span className="mt-2 block text-sm text-muted">{origin.description}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
