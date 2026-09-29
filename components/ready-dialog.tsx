"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { PalettePicker, TemplatePicker } from "@/components/design/design-pickers";
import type { ImportResult } from "@/lib/import/events";
import { resolvePalette } from "@/lib/palette/palettes";
import { TEMPLATE_INFO, type Design } from "@/lib/portfolio/design";
import { describeEngagementRate } from "@/lib/portfolio/engagement";
import { nichesWithPieces } from "@/lib/portfolio/niches";
import type { ResolvedPortfolio } from "@/lib/portfolio/resolve";
import { Avatar } from "./avatar";
import { CopyButton } from "./copy-button";
import { errorText, fieldLabel, pillButton, primaryButton } from "./ui";

/**
 * "Portafolio listo" (v2 · M1; diseño editable desde el M2): modal centrado con el link, copiar, abrir, editar y crear otro.
 * Es un <dialog> nativo: atrapa el foco, se cierra con Esc, con la X o tocando fuera, y al
 * cerrarse devuelve el foco a donde estaba.
 */
export function ReadyDialog({
  result,
  onClose,
  onStartOver,
  onResultChange,
}: {
  result: ImportResult;
  onClose: () => void;
  onStartOver: () => void;
  /** Tras cambiar el diseño: el portafolio guardado (nueva revisión). */
  onResultChange: (result: ImportResult) => void;
}) {
  const { resolved, url, username, warnings } = result;
  const er = resolved.engagementRate ? describeEngagementRate(resolved.engagementRate) : null;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const nicheLinks = nichesWithPieces(resolved.niches, resolved.pieces).map((niche) => ({ ...niche, url: `${url}/${niche.slug}` }));

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    titleRef.current?.focus();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="portafolio-listo"
      data-modal=""
      onClose={() => {
        if (!dialogRef.current?.open) onClose();
      }}
      onClick={(event) => {
        // Toque en el fondo oscuro (fuera de la tarjeta): cierra.
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(100%-2rem,34rem)] overflow-y-auto overscroll-contain rounded-card border border-line bg-sand p-0 text-ink shadow-[0_30px_80px_-20px_rgb(0_0_0/0.7)] backdrop:bg-[rgb(10_10_36/0.78)] backdrop:backdrop-blur-sm"
    >
      <div className="relative p-5 sm:p-7">
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label="Cerrar"
          className="absolute top-3 right-3 flex size-11 items-center justify-center rounded-full text-muted transition hover:bg-ink/5 hover:text-ink"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4">
            <path d="M3.5 3.5l9 9m0-9l-9 9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>

        <h2 id="portafolio-listo" ref={titleRef} tabIndex={-1} className="title-2 pr-12 outline-none">
          Portafolio listo
        </h2>

        <div className="mt-6 flex items-center gap-4">
          <Avatar photo={resolved.photo} name={resolved.name} />
          <div className="min-w-0">
            <p className="truncate text-lg">{resolved.name}</p>
            <p className="truncate text-sm text-muted">@{username}</p>
            {er && (
              <p className="text-sm text-muted" data-testid="ready-er">
                <span className="text-ink">{er.value}</span> {er.label} · {er.short}
              </p>
            )}
          </div>
        </div>

        <div className="mt-6">
          <p className={fieldLabel}>Link del portafolio</p>
          <p className="mt-1 font-mono text-sm break-all text-success select-all" data-testid="portfolio-url">
            {url}
          </p>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <CopyButton text={url} className={primaryButton} what="el link del portafolio" />
          <a href={url} target="_blank" rel="noopener noreferrer" className={pillButton}>
            Abrir portafolio<span className="sr-only"> (se abre en otra pestaña)</span>
          </a>
          <Link href={`/editar/${result.slug}`} className={pillButton}>
            Editar
          </Link>
          <button type="button" onClick={onStartOver} className={pillButton}>
            Crear otro
          </button>
        </div>

        {nicheLinks.length > 0 && (
          <div className="mt-7">
            <h3 className="font-sans text-sm text-muted">Links por nicho</h3>
            <ul className="mt-2 border-t border-line">
              {nicheLinks.map((niche) => (
                <li key={niche.slug} className="flex min-h-tap items-center gap-3 border-b border-line py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block">{niche.label}</span>
                    <span className="block truncate font-mono text-xs text-muted">/{niche.slug}</span>
                  </span>
                  <CopyButton
                    text={niche.url}
                    label="Copiar"
                    what={`el link de ${niche.label}`}
                    className={`${pillButton} min-h-10 px-4`}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}

        <DesignSection result={result} onResultChange={onResultChange} />

        {warnings.length > 0 && (
          <ul className="mt-5 space-y-1 text-sm text-accent-ink">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}
      </div>
    </dialog>
  );
}

/**
 * Cambiar plantilla o paleta desde el resultado (v2 · M2). Solo manda `design`: ningún otro dato
 * del portafolio se toca. Al guardar, la página pública ya se ve con el diseño nuevo.
 */
function DesignSection({ result, onResultChange }: { result: ImportResult; onResultChange: (result: ImportResult) => void }) {
  const router = useRouter();
  const uid = useId();
  const saved = result.resolved.design;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Design>(saved);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const colors = resolvePalette(draft.palette, result.resolved.photo);
  const changed = draft.template !== saved.template || draft.palette !== saved.palette;

  async function save() {
    setStatus("saving");
    setMessage(null);
    try {
      const response = await fetch(`/api/portfolios/${result.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: result.revision, design: draft }),
      });
      if (response.status === 401) return router.replace("/acceso");
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setStatus("error");
        setMessage(data?.error?.message ?? "No pudimos guardar el diseño. Intenta de nuevo.");
        return;
      }
      const resolved: ResolvedPortfolio = data.resolved;
      onResultChange({ ...result, revision: data.portfolio.revision, resolved });
      setStatus("saved");
      setOpen(false);
    } catch {
      setStatus("error");
      setMessage("Se cortó la conexión. Intenta de nuevo.");
    }
  }

  const current = resolvePalette(saved.palette, result.resolved.photo);
  return (
    <div className="mt-7 border-t border-line pt-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="min-w-0 flex-1">
          <span className="block text-sm text-muted">Diseño</span>
          <span data-testid="ready-design">
            {TEMPLATE_INFO[saved.template].name} · {current.name}
          </span>
          {status === "saved" && (
            <span className="ml-2 text-sm text-success" role="status">
              ✓ Guardado
            </span>
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            setOpen((value) => !value);
            setDraft(saved);
            setStatus("idle");
          }}
          aria-expanded={open}
          aria-controls={`${uid}-diseno`}
          className={`${pillButton} min-h-10 px-4`}
        >
          {open ? "Cerrar" : "Cambiar plantilla o paleta"}
        </button>
      </div>
      {open && (
        <div id={`${uid}-diseno`} className="mt-4 space-y-5">
          <div>
            <p className={fieldLabel}>Plantilla</p>
            <div className="mt-2">
              <TemplatePicker
                value={draft.template}
                onChange={(template) => setDraft((value) => ({ ...value, template }))}
                palette={colors}
                name={`${uid}-plantilla`}
                compact
              />
            </div>
          </div>
          <div>
            <p className={fieldLabel}>Paleta</p>
            <div className="mt-2">
              <PalettePicker
                value={draft.palette}
                onChange={(palette) => setDraft((value) => ({ ...value, palette }))}
                photo={result.resolved.photo}
                name={`${uid}-paleta`}
              />
            </div>
          </div>
          {message && (
            <p role="alert" className={errorText}>
              {message}
            </p>
          )}
          <button type="button" onClick={save} disabled={!changed || status === "saving"} className={`${primaryButton} w-full`}>
            {status === "saving" ? "Guardando…" : changed ? "Guardar diseño" : "Sin cambios"}
          </button>
        </div>
      )}
    </div>
  );
}
