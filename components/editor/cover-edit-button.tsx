"use client";

import { useRef, useState } from "react";
import type { StoredImage } from "@/lib/portfolio/schema";
import { uploadImage } from "./image-picker";
import "./cover-edit.css";

/*
 * Lápiz del banner del hero (ajuste 7): un círculo blanco en la esquina superior derecha del banner, dentro de la vista
 * previa del editor. Abre el selector de fotos, la comprime y la sube (igual que la foto de perfil) y el banner cambia
 * al instante; se guarda con "Guardar cambios". Solo existe en el editor: la marca nunca lo ve.
 */
export function CoverEditButton({
  hasCover,
  onUploaded,
  onPending,
}: {
  hasCover: boolean;
  onUploaded: (image: StoredImage) => void;
  onPending: (delta: 1 | -1) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState("");

  async function upload(file: File) {
    setStatus("working");
    onPending(1);
    try {
      onUploaded(await uploadImage(file));
      setStatus("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No pudimos subir la foto. Intenta de nuevo.");
      setStatus("error");
    } finally {
      onPending(-1);
    }
  }

  const label = hasCover ? "Cambiar la foto del banner" : "Subir una foto para el banner";
  return (
    <span className="pf-cover-edit" data-cover-edit>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void upload(file);
        }}
      />
      <button
        type="button"
        className="pf-cover-edit__button"
        aria-label={status === "working" ? "Subiendo la foto del banner…" : label}
        title={label}
        disabled={status === "working"}
        onClick={() => input.current?.click()}
      >
        {status === "working" ? (
          <span className="pf-cover-edit__spinner" aria-hidden="true" />
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" />
            <path d="m13.5 6.5 4 4" />
          </svg>
        )}
      </button>
      {status === "error" && (
        <span role="alert" className="pf-cover-edit__error">
          {message}
        </span>
      )}
    </span>
  );
}
