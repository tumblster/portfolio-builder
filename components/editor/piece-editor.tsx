"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import type { NicheDef } from "@/lib/portfolio/niches";
import { LIMITS, parseVideoLink, type StoredImage } from "@/lib/portfolio/schema";
import { errorText, fieldLabel, textInput } from "../ui";
import type { FieldErrors, PieceDraft } from "./form-model";
import { ImagePicker } from "./image-picker";

type PieceEditorProps = {
  piece: PieceDraft;
  index: number;
  total: number;
  /** Nichos del portafolio (los que la pieza puede usar). */
  niches: readonly NicheDef[];
  errors: FieldErrors;
  onChange: (patch: Partial<PieceDraft>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onPending: (delta: 1 | -1) => void;
};

type CoverState = { status: "idle" } | { status: "loading" } | { status: "note" | "error"; message: string };

const COVER_DELAY_MS = 700;

export function PieceEditor({ piece, index, total, niches, errors, onChange, onMove, onRemove, onPending }: PieceEditorProps) {
  const [cover, setCover] = useState<CoverState>({ status: "idle" });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastRequested = useRef<string | null>(null);
  const id = (field: string) => `pieza-${piece.key}-${field}`;
  const error = (field: string) => errors[`pieces.${index}.${field}`];
  const number = index + 1;

  async function findCover(value: string, keepCurrentImage: boolean) {
    const video = parseVideoLink(value);
    if (!video) {
      setCover({ status: "idle" });
      return;
    }
    if (video.platform === "instagram") {
      setCover({ status: "note", message: "Instagram no comparte la portada de sus videos: si quieres, súbela." });
      return;
    }
    if (keepCurrentImage || lastRequested.current === video.url) return;
    lastRequested.current = video.url;
    setCover({ status: "loading" });
    onPending(1);
    try {
      const response = await fetch("/api/video-cover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: video.url }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error?.message ?? "No encontramos la portada. Puedes subir una a mano.");
      onChange({ image: data.image as StoredImage, imageSource: "auto" });
      setCover({ status: "idle" });
    } catch (failure) {
      lastRequested.current = null; // permite reintentar con el mismo link
      setCover({ status: "error", message: failure instanceof Error ? failure.message : "No encontramos la portada." });
    } finally {
      onPending(-1);
    }
  }

  function changeVideo(value: string) {
    onChange({ videoUrl: value });
    clearTimeout(timer.current);
    const keepCurrentImage = piece.imageSource === "upload"; // una portada subida a mano no se pisa
    timer.current = setTimeout(() => void findCover(value, keepCurrentImage), COVER_DELAY_MS);
  }

  const video = piece.videoUrl.trim() ? parseVideoLink(piece.videoUrl) : null;
  const imageLabel = piece.image ? "Cambiar imagen" : video ? "Subir portada" : "Subir imagen";

  return (
    <fieldset className="panel p-4 sm:p-5">
      <legend className="sr-only">Pieza {number}</legend>
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-xs text-muted">pieza {String(number).padStart(2, "0")}</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label={`Subir la pieza ${number}`}
            className="flex size-tap items-center justify-center rounded-full text-muted transition hover:text-white disabled:opacity-30"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            aria-label={`Bajar la pieza ${number}`}
            className="flex size-tap items-center justify-center rounded-full text-muted transition hover:text-white disabled:opacity-30"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="flex min-h-tap items-center px-2 text-sm text-muted transition hover:text-white"
          >
            Quitar
          </button>
        </div>
      </div>

      <label htmlFor={id("title")} className={`${fieldLabel} mt-2`}>
        Título
      </label>
      <input
        id={id("title")}
        value={piece.title}
        onChange={(event) => onChange({ title: event.target.value })}
        maxLength={LIMITS.pieceTitle}
        placeholder="Rutina de noche con sérum"
        aria-invalid={error("title") ? true : undefined}
        aria-describedby={error("title") ? id("title-error") : undefined}
        className={`${textInput} mt-2`}
      />
      {error("title") && (
        <p id={id("title-error")} className={`${errorText} mt-2`}>
          {error("title")}
        </p>
      )}

      <div className="mt-4 flex items-start gap-4">
        <div className="relative aspect-[4/5] w-20 shrink-0 overflow-hidden rounded-lg bg-ink ring-1 ring-line">
          {piece.image && <Image src={piece.image.url} alt="" fill sizes="80px" className="object-cover" />}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <ImagePicker
            label={imageLabel}
            onUploaded={(image) => onChange({ image, imageSource: "upload" })}
            onPending={onPending}
            describedBy={error("image") ? id("image-error") : undefined}
          />
          {piece.image && (
            <button
              type="button"
              onClick={() => onChange({ image: null, imageSource: null })}
              className="flex min-h-tap items-center text-sm text-muted transition hover:text-white"
            >
              Quitar imagen
            </button>
          )}
        </div>
      </div>
      {error("image") && (
        <p id={id("image-error")} data-error-focus tabIndex={-1} className={`${errorText} mt-2 outline-none`}>
          {error("image")}
        </p>
      )}

      <label htmlFor={id("video")} className={`${fieldLabel} mt-4`}>
        Link de video (opcional)
      </label>
      <input
        id={id("video")}
        value={piece.videoUrl}
        onChange={(event) => changeVideo(event.target.value)}
        placeholder="Link de TikTok, Instagram o YouTube"
        inputMode="url"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        aria-invalid={error("videoUrl") ? true : undefined}
        aria-describedby={id("video-note")}
        className={`${textInput} mt-2`}
      />
      <div id={id("video-note")} aria-live="polite" className="mt-2 text-sm">
        {error("videoUrl") && <p className={errorText}>{error("videoUrl")}</p>}
        {cover.status === "loading" && <p className="text-muted">Buscando la portada…</p>}
        {cover.status === "note" && <p className="text-muted">{cover.message}</p>}
        {cover.status === "error" && <p className="text-amber">{cover.message}</p>}
      </div>

      <label htmlFor={id("niche")} className={`${fieldLabel} mt-4`}>
        Nicho (opcional)
      </label>
      <select
        id={id("niche")}
        value={piece.niche ?? ""}
        onChange={(event) => onChange({ niche: event.target.value || null })}
        aria-invalid={error("niche") ? true : undefined}
        aria-describedby={error("niche") ? id("niche-error") : undefined}
        className={`${textInput} mt-2`}
      >
        <option value="">Sin nicho (solo en Todo)</option>
        {niches.map((niche) => (
          <option key={niche.slug} value={niche.slug}>
            {niche.label}
          </option>
        ))}
        {/* Un nicho que ya no existe (no debería pasar): se muestra para poder cambiarlo. */}
        {piece.niche && !niches.some((niche) => niche.slug === piece.niche) && (
          <option value={piece.niche}>{piece.niche} (no disponible)</option>
        )}
      </select>
      {error("niche") && (
        <p id={id("niche-error")} className={`${errorText} mt-2`}>
          {error("niche")}
        </p>
      )}
    </fieldset>
  );
}
