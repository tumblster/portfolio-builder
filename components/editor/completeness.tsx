"use client";

import { LIMITS } from "@/lib/portfolio/schema";
import type { FormState } from "./form-model";
import "../flow-motion.css";

/*
 * Spec 12.8 (gamificación, activación): "Tu portafolio está al X %" con lo que falta: foto, servicios, piezas y
 * contacto. Se calcula en vivo con lo que hay en el formulario.
 *
 * Parte 2 · 4:
 * - Queda visible al hacer scroll (sticky en su columna). En celular va bajo las pestañas Formulario / Vista previa.
 *   Los chips van en una sola fila (con scroll lateral si no caben): la tarjeta nunca cambia de alto.
 * - Cada chip lleva a su sección: scroll suave que la deja justo debajo de la tarjeta, un destello breve y el foco.
 */

const FLASH_MS = 1200;
const GAP_BELOW_CARD = 16;

const FOCUSABLE = "button, input, select, textarea, a[href]";

/**
 * Lleva a una sección del editor sin que la tape la tarjeta de progreso. `targetId` puede ser el título (h2) de una
 * sección o un bloque con id. `focusSelector` elige qué enfocar dentro (si no, el título o el primer control).
 */
export function jumpToSection(targetId: string, focusSelector?: string) {
  const target = document.getElementById(targetId);
  if (!target) return;
  const isHeading = target.tagName === "H2";
  const block = isHeading ? (target.closest("section") ?? target) : target;
  const card = document.querySelector<HTMLElement>("[data-completeness]");
  const offset = card
    ? (parseFloat(getComputedStyle(card).top) || 0) + card.offsetHeight + GAP_BELOW_CARD
    : GAP_BELOW_CARD;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({
    top: window.scrollY + block.getBoundingClientRect().top - offset,
    behavior: reduce ? "auto" : "smooth",
  });
  block.classList.remove("section-flash");
  void block.offsetWidth; // reinicia la animación si se toca dos veces seguidas
  block.classList.add("section-flash");
  window.setTimeout(() => block.classList.remove("section-flash"), FLASH_MS);
  const focusTarget =
    (focusSelector ? block.querySelector<HTMLElement>(focusSelector) : null) ??
    (isHeading ? target : block.querySelector<HTMLElement>(FOCUSABLE)) ??
    target;
  if (!focusTarget.matches(FOCUSABLE) && !focusTarget.hasAttribute("tabindex")) focusTarget.setAttribute("tabindex", "-1");
  focusTarget.focus({ preventScroll: true });
}

export function Completeness({ form }: { form: FormState }) {
  const checks = [
    { label: "Foto", done: Boolean(form.photo), target: "campo-foto" },
    { label: "Servicios", done: form.services.some((service) => service.title.trim()), target: "seccion-servicios" },
    {
      label: `${LIMITS.minPieces}+ piezas`,
      done: form.pieces.filter((piece) => piece.image || piece.videoUrl.trim()).length >= LIMITS.minPieces,
      target: "seccion-piezas",
    },
    {
      label: "Contacto",
      done: Boolean(form.contact.whatsapp?.trim() || form.contact.email?.trim()),
      target: "seccion-contacto",
    },
  ];
  const percent = Math.round((100 * checks.filter((check) => check.done).length) / checks.length);
  return (
    <section
      aria-labelledby="completitud"
      className="sticky top-[4.25rem] z-10 mb-8 rounded-card border border-line bg-paper p-4 shadow-sm sm:p-6 lg:top-4"
      data-completeness={percent}
    >
      <h2 id="completitud" className="text-base font-semibold">
        Tu portafolio está al {percent} %
      </h2>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-sand"
        role="progressbar"
        aria-labelledby="completitud"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <span
          className="block h-full rounded-full bg-ink transition-[width] duration-300 ease-out motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
      <ul className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1 text-sm [scrollbar-width:none]">
        {checks.map((check) => (
          <li key={check.label} className="shrink-0">
            <button
              type="button"
              onClick={() => jumpToSection(check.target)}
              data-completeness-target={check.target}
              className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-4 whitespace-nowrap transition-[border-color,background-color,transform] duration-150 ease-out hover:bg-sand active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 ${
                check.done ? "border-ink" : "border-line text-muted"
              }`}
            >
              <span aria-hidden="true">{check.done ? "✓" : "○"}</span>
              {check.label}
              <span className="sr-only">{check.done ? ": listo" : ": falta"}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
