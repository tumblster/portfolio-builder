"use client";

import type { ReactNode } from "react";
import { shareMessage, whatsappUrl, type Gender } from "@/lib/portfolio/gender";

/*
 * 12.4 · 13.8: compartir el portafolio por WhatsApp, con el texto según su género (neutro sin dato). El link completo
 * (con el dominio de este deployment) se arma al tocar. `tag` va como ?ref= (12.9) y `hash` permite abrir directo en
 * una vista (p. ej. #media-kit).
 */

type Props = {
  /** /p/<slug> */
  basePath: string;
  gender: Gender | null;
  hash?: string;
  tag?: string;
  className: string;
  children: ReactNode;
};

export function ShareWhatsApp({ basePath, gender, hash = "", tag = "whatsapp", className, children }: Props) {
  return (
    <a
      className={className}
      href={whatsappUrl(null, shareMessage(gender, ""))}
      onClick={(event) => {
        event.currentTarget.href = whatsappUrl(
          null,
          shareMessage(gender, `${window.location.origin}${basePath}?ref=${encodeURIComponent(tag)}${hash}`),
        );
      }}
      target="_blank"
      rel="noopener noreferrer"
      data-whatsapp=""
    >
      {children}
      <span className="sr-only"> (se abre en otra pestaña)</span>
    </a>
  );
}
