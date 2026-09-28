"use client";

import { useEffect, useRef, useState } from "react";

/*
 * RF-05: copiar el link con un toque, con un check de confirmación.
 * Usa el portapapeles moderno cuando el sitio es seguro (https o localhost); si no
 * (p. ej. abriste la app por la red local con http), prueba el método clásico, y si
 * tampoco se puede, avisa que se copie a mano: el link siempre está visible al lado.
 */

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (window.isSecureContext && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // sigue con el respaldo
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.top = "0";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  area.remove();
  return copied;
}

type CopyButtonProps = {
  text: string;
  className: string;
  label?: string;
  /** Para lectores de pantalla: qué se copia, p. ej. "el link de Belleza". */
  what?: string;
};

export function CopyButton({ text, className, label = "Copiar link", what = "el link" }: CopyButtonProps) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    const copied = await copyToClipboard(text);
    setState(copied ? "copied" : "failed");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), copied ? 2000 : 4000);
  }

  return (
    <span className="inline-flex">
      <button type="button" onClick={copy} className={className}>
        {state === "copied" ? (
          <>
            <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4">
              <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Copiado
          </>
        ) : state === "failed" ? (
          "Cópialo a mano"
        ) : (
          label
        )}
        {state === "idle" && <span className="sr-only"> {what}</span>}
      </button>
      <span className="sr-only" aria-live="polite">
        {state === "copied" ? `Listo: copiaste ${what}.` : state === "failed" ? "No se pudo copiar: selecciona el link y cópialo a mano." : ""}
      </span>
    </span>
  );
}
