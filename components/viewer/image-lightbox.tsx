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
 *
 * Spec 11.3 (carruseles, sin descargar nada): con `originalUrl`, si se toca la foto más de 2 veces aparece con un
 * fade-in, abajo y dentro del marco de la foto, "Clic acá para verlo completo", que abre el post original. El
 * contador es por pieza y vuelve a cero al cerrar el visor.
 */
const TAPS_FOR_ORIGINAL = 3; // "más de 2 veces"
export function ImageLightbox({
  image,
  title,
  note,
  originalUrl,
  className,
  children,
}: {
  image: StoredImage;
  title: string;
  /** Aclaración bajo el título (p. ej. en un carrusel: que se ve su portada). */
  note?: string;
  /** Post original (carrusel): tras más de 2 taps en la foto, se ofrece verlo completo allá. */
  originalUrl?: string | null;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [taps, setTaps] = useState(0);
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
        onClick={() => {
          setTaps(0); // el contador se reinicia con cada apertura
          setOpen(true);
        }}
      />
      {open && (
        <dialog
          ref={dialog}
          className="lightbox"
          aria-labelledby={`${uid}-title`}
          onClose={() => {
            setOpen(false);
            setTaps(0);
          }}
          // Tap o clic fuera de la foto (en el fondo del diálogo) lo cierra.
          onClick={(event) => event.target === event.currentTarget && dialog.current?.close()}
          data-lightbox
        >
          <figure className="lightbox__figure">
            <div className="lightbox__frame">
            <Image
              src={image.url}
              alt={title}
              width={image.width ?? 1080}
              height={image.height ?? 1350}
              sizes="(min-width: 768px) 560px, 92vw"
              className="lightbox__img"
              onClick={originalUrl ? () => setTaps((count) => count + 1) : undefined}
              data-lightbox-photo
            />
            {originalUrl && taps >= TAPS_FOR_ORIGINAL && (
              <a
                href={originalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="lightbox__original"
                data-lightbox-original
              >
                Clic acá para verlo completo
                <span className="sr-only"> (abre el post original en Instagram, en otra pestaña)</span>
              </a>
            )}
            </div>
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
