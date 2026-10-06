"use client";

import { useRef, useState } from "react";
import { compressImage } from "@/lib/compress-image";
import type { StoredImage } from "@/lib/portfolio/schema";
import { errorText, pillButton } from "../ui";

type ImagePickerProps = {
  label: string;
  onUploaded: (image: StoredImage) => void;
  /** Avisa al formulario que hay una subida en curso (+1) o que terminó (-1). */
  onPending: (delta: 1 | -1) => void;
  describedBy?: string;
};

/** Comprime en el navegador y sube a /api/media. Devuelve la imagen guardada o lanza un Error con el mensaje. */
export async function uploadImage(file: File): Promise<StoredImage> {
  const blob = await compressImage(file);
  const body = new FormData();
  body.append("file", blob, "foto.jpg");
  const response = await fetch("/api/media", { method: "POST", body });
  const data = await response.json().catch(() => null);
  if (response.status === 401) throw new Error("Tu sesión expiró. Vuelve a entrar con la clave.");
  if (!response.ok) throw new Error(data?.error?.message ?? "No pudimos subir la foto. Intenta de nuevo.");
  return data.image as StoredImage;
}

/** Botón "Subir foto": comprime en el navegador, sube a /api/media y devuelve la imagen guardada. */
export function ImagePicker({ label, onUploaded, onPending, describedBy }: ImagePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
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

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = ""; // permite volver a elegir la misma foto
          if (file) void upload(file);
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={status === "working"}
        aria-describedby={describedBy}
        className={pillButton}
      >
        {status === "working" ? "Subiendo…" : label}
      </button>
      {status === "error" && (
        <p role="alert" className={`${errorText} mt-2`}>
          {message}
        </p>
      )}
    </div>
  );
}
