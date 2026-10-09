"use client";

import "./toast.css";

/*
 * Toast mínimo con barrita de tiempo (correcciones E2 del dueño):
 * - #3: al tocar "+ Agregar" con el cupo de piezas lleno.
 * - #6: avisos de aprobar/corregir (p. ej. sugerencias de servicios descartadas).
 * - #9: confirmaciones del menú de compartir ("Link copiado…").
 *
 * Imperativo y sin host: un solo toast a la vez (el nuevo reemplaza al anterior), se autodestruye con la
 * barrita y también se cierra al tocarlo. `role="status"` para lectores de pantalla.
 */

const DEFAULT_MS = 4000;

export function showToast(message: string, durationMs: number = DEFAULT_MS): void {
  if (typeof document === "undefined") return;
  document.querySelector("[data-toast]")?.remove();

  const el = document.createElement("div");
  el.setAttribute("data-toast", "");
  el.setAttribute("role", "status");

  const text = document.createElement("span");
  text.textContent = message;
  const bar = document.createElement("span");
  bar.setAttribute("data-toast-bar", "");
  bar.setAttribute("aria-hidden", "true");
  el.append(text, bar);
  document.body.append(el);

  // Dos frames: uno para pintar, otro para arrancar la animación de la barrita.
  requestAnimationFrame(() => {
    el.classList.add("is-visible");
    bar.style.transitionDuration = `${durationMs}ms`;
    requestAnimationFrame(() => bar.classList.add("is-done"));
  });

  const kill = () => {
    clearTimeout(timer);
    el.classList.remove("is-visible");
    window.setTimeout(() => el.remove(), 300);
  };
  const timer = window.setTimeout(kill, durationMs);
  el.addEventListener("click", kill, { once: true });
}
