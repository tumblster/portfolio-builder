"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { closeActiveReel } from "@/components/reel/inline-reel";
import type { StoredImage } from "@/lib/portfolio/schema";
import "./image-lightbox.css";

/*
 * Visor de imagen (spec 10.2): tap o clic en la miniatura abre la foto grande en un modal dentro de la página, sin
 * salir del flujo. Cierra con ×, tap fuera o Escape (y el foco vuelve a la miniatura). Es un <dialog> modal: el resto
 * de la página queda inerte mientras está abierto. Al abrirse cierra cualquier reel activo: nunca dos a la vez.
 * Nunca hover: siempre tap/click, también en web.
 */
export function ImageLightbox({
  image,
  title,
  note,
  className,
  children,
}: {
  image: StoredImage;
  title: string;
  /** Aclaración bajo el título (p. ej. en un carrusel: que se ve su portada). */
  note?: string;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const uid = useId();

  useEffect(() => {
    if (!open) return;
    closeActiveReel();
    const node = dialog.current;
    if (node && !node.open) node.showModal();
  }, [open]);

  return (
    <div className={`reel-card ${className ?? ""}`} data-image-viewer>
      {children}
      <button
        type="button"
        className="reel-hit"
        aria-label={`Ver «${title}»`}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      />
      {open && (
        <dialog
          ref={dialog}
          className="lightbox"
          aria-labelledby={`${uid}-title`}
          onClose={() => setOpen(false)}
          // Tap o clic fuera de la foto (en el fondo del diálogo) lo cierra.
          onClick={(event) => event.target === event.currentTarget && dialog.current?.close()}
          data-lightbox
        >
          <figure className="lightbox__figure">
            <Image
              src={image.url}
              alt={title}
              width={image.width ?? 1080}
              height={image.height ?? 1350}
              sizes="(min-width: 768px) 560px, 92vw"
              className="lightbox__img"
            />
            <figcaption id={`${uid}-title`} className="lightbox__caption">
              {title}
              {note && <small>{note}</small>}
            </figcaption>
          </figure>
          <button type="button" className="lightbox__close" aria-label="Cerrar" onClick={() => dialog.current?.close()}>
            <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
              <path d="M3 3l6 6M9 3l-6 6" />
            </svg>
          </button>
        </dialog>
      )}
    </div>
  );
}
