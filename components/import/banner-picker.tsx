"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { uploadImage } from "@/components/editor/image-picker";
import type { StoredImage } from "@/lib/portfolio/schema";
import type { TemplateId } from "@/lib/portfolio/design";

/** Plantillas cuyo hero lleva banner con imagen (obs. Fer, ronda 3 15/10). */
export const TEMPLATES_WITH_BANNER: readonly TemplateId[] = ["creator", "bio"];

const tile =
  "relative flex min-h-tap w-24 flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl border-2 text-xs font-semibold transition";
const tileIdle = "border-line bg-paper text-muted hover:border-ink/40 hover:text-ink";
const tileActive = "border-ink bg-highlight text-ink";

/**
 * Foto del banner antes de generar (paso Plantilla, solo Creator/Bio). Opciones: sin banner (por defecto),
 * su foto de perfil (copia propia ya guardada) o subir una foto. La subida bloquea "Generar" vía onPending,
 * igual que los logos de marcas.
 */
export function BannerPicker({
  photo,
  value,
  onChange,
  onPending,
}: {
  photo: StoredImage | null;
  value: StoredImage | null;
  onChange: (image: StoredImage | null) => void;
  onPending: (delta: 1 | -1) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState("");
  const [uploaded, setUploaded] = useState<StoredImage | null>(null);

  const selected: "none" | "profile" | "custom" =
    value === null ? "none" : photo && value.url === photo.url ? "profile" : "custom";

  async function upload(file: File) {
    setStatus("working");
    setMessage("");
    onPending(1);
    try {
      const image = await uploadImage(file);
      setUploaded(image);
      onChange(image);
      setStatus("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No pudimos subir la foto. Intenta de nuevo.");
      setStatus("error");
    } finally {
      onPending(-1);
    }
  }

  return (
    <div className="mt-8" data-banner-picker>
      <p className="text-sm font-semibold">
        Foto del banner <span className="font-normal text-muted">(opcional)</span>
      </p>
      <p className="mt-1 mb-3 text-sm text-muted">La imagen ancha arriba del portafolio. Se puede cambiar después.</p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-pressed={selected === "none"}
          className={`${tile} h-24 ${selected === "none" ? tileActive : tileIdle} border-dashed`}
        >
          <span aria-hidden="true" className="text-xl leading-none">∅</span>
          Sin banner
        </button>
        {photo && (
          <button
            type="button"
            onClick={() => onChange(photo)}
            aria-pressed={selected === "profile"}
            className={`${tile} h-24 ${selected === "profile" ? tileActive : tileIdle}`}
          >
            <Image src={photo.url} alt="" fill sizes="96px" className="object-cover" />
            <span className="absolute inset-x-0 bottom-0 bg-ink/70 px-1 py-0.5 text-center text-[0.6875rem] text-paper">
              Mi foto
            </span>
          </button>
        )}
        {uploaded && (
          <button
            type="button"
            onClick={() => onChange(uploaded)}
            aria-pressed={selected === "custom"}
            className={`${tile} h-24 ${selected === "custom" ? tileActive : tileIdle}`}
          >
            <Image src={uploaded.url} alt="" fill sizes="96px" className="object-cover" />
            <span className="absolute inset-x-0 bottom-0 bg-ink/70 px-1 py-0.5 text-center text-[0.6875rem] text-paper">
              Subida
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={status === "working"}
          className={`${tile} h-24 ${tileIdle} border-dashed disabled:opacity-60`}
        >
          <span aria-hidden="true" className="text-xl leading-none">+</span>
          {status === "working" ? "Subiendo…" : "Subir foto"}
        </button>
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
      </div>
      {status === "error" && (
        <p role="alert" className="mt-2 text-sm font-semibold text-accent-ink">
          {message}
        </p>
      )}
    </div>
  );
}
