"use client";

import { useEffect, useId, useRef, useState } from "react";

/*
 * Ronda 15 · C5: "Trabaja conmigo" ya no abre la app de correo. Abre un panel con lo que la persona elige:
 * - WhatsApp primero, si el portafolio lo trae;
 * - el correo visible en texto, "Copiar correo" (confirma con "Copiado") y, solo si lo elige, "Abrir en tu correo".
 * Se cierra con "Cerrar", Escape o un toque fuera del cuadro; el foco vuelve al botón.
 */

const COPIED_MS = 2000;

export function CanvaContactButton({
  label,
  email,
  whatsapp,
  className,
}: {
  label: string;
  email: string | null;
  /** Solo dígitos, con código de país. */
  whatsapp: string | null;
  className: string;
}) {
  const titleId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const emailText = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const node = dialog.current;
    if (node && !node.open) node.showModal();
  }, [open]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  /** Sin portapapeles: el correo queda seleccionado para copiarlo a mano. */
  function selectEmail() {
    const node = emailText.current;
    const selection = window.getSelection();
    if (!node || !selection) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  async function copy() {
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
    } catch {
      selectEmail();
    }
  }

  function onClosed() {
    setOpen(false);
    setCopied(false);
    trigger.current?.focus();
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={className}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        data-cv-contact-button
      >
        {label}
      </button>
      {open && (
        <dialog
          ref={dialog}
          className="cv-contact-panel"
          aria-labelledby={titleId}
          onClose={onClosed}
          onClick={(event) => event.target === event.currentTarget && dialog.current?.close()}
          data-cv-contact-panel
        >
          <div className="cv-contact-panel__body">
            <p id={titleId} className="cv-contact-panel__title">
              {label}
            </p>
            {whatsapp && (
              <a
                className="cv-btn cv-btn--solid"
                href={`https://wa.me/${whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                WhatsApp
              </a>
            )}
            {email && (
              <>
                <p ref={emailText} className="cv-contact-panel__email">
                  {email}
                </p>
                <button
                  type="button"
                  className={`cv-btn ${whatsapp ? "cv-btn--ghost" : "cv-btn--solid"}`}
                  onClick={copy}
                  data-cv-copy-email
                >
                  {copied ? "Copiado" : "Copiar correo"}
                </button>
                <a className="cv-contact-panel__link" href={`mailto:${email}`}>
                  Abrir en tu correo
                </a>
              </>
            )}
            <button type="button" className="cv-contact-panel__close" onClick={() => dialog.current?.close()}>
              Cerrar
            </button>
          </div>
          <p aria-live="polite" className="cv-visually-hidden">
            {copied ? "Copiado" : ""}
          </p>
        </dialog>
      )}
    </>
  );
}
