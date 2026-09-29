"use client";

import Image from "next/image";
import { useId, useRef, useState } from "react";
import { PalettePicker, TemplatePicker, TemplateMockup, recommendedPalette } from "@/components/design/design-pickers";
import type { DraftPreview, ImportResult } from "@/lib/import/events";
import { resolvePalette } from "@/lib/palette/palettes";
import { DEFAULT_DESIGN, TEMPLATE_INFO, type PaletteId, type TemplateId } from "@/lib/portfolio/design";
import { describeEngagementRate } from "@/lib/portfolio/engagement";
import { MAX_NICHES, NICHE_LABEL_MAX, nicheFromLabel } from "@/lib/portfolio/niches";
import { Avatar } from "./avatar";
import { compactSelect, errorText, pillButton, primaryButton, textInput } from "./ui";

/*
 * Antes de generar (v2 · M2): el creador corrige lo que sugirió la IA y elige cómo se ve.
 *   1. Nichos: chips pre-marcados con lo que sugirió la IA; se desmarcan, se renombran o se
 *      agregan (hasta 3), y cada pieza se puede mover de nicho. Esto manda sobre la IA: arma las
 *      píldoras y los links /p/<slug>/<nicho>.
 *   2. Plantilla: galería de mockups estáticos.
 *   3. Paleta: la de su foto (recomendada) o una de las curadas.
 * Generar llama a /api/import/confirm con esas decisiones.
 */

type NicheRow = { key: string; label: string; on: boolean };
const STEPS = ["Nichos", "Plantilla", "Paleta"] as const;

type Props = {
  draft: DraftPreview;
  onGenerated: (result: ImportResult) => void;
  onStartOver: () => void;
  onUnauthorized: () => void;
};

export function ImportReview({ draft, onGenerated, onStartOver, onUnauthorized }: Props) {
  const uid = useId();
  const counter = useRef(0);
  const [step, setStep] = useState(0);
  const [rows, setRows] = useState<NicheRow[]>(() =>
    draft.suggestedNiches.map((niche) => ({ key: `s-${niche.slug}`, label: niche.label, on: true })),
  );
  // Nicho de cada pieza, por la fila (no por el slug: renombrar cambia el slug).
  const [pieceRows, setPieceRows] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(draft.pieces.map((piece) => [piece.id, piece.niche ? `s-${piece.niche}` : null])),
  );
  const [template, setTemplate] = useState<TemplateId>(DEFAULT_DESIGN.template);
  const [palette, setPalette] = useState<PaletteId>(() => recommendedPalette(draft.photo));
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [generating, setGenerating] = useState(false);
  const stepHeading = useRef<HTMLHeadingElement>(null);

  const active = rows.filter((row) => row.on);
  const canAdd = active.length < MAX_NICHES;
  const colors = resolvePalette(palette, draft.photo);
  const er = draft.engagementRate ? describeEngagementRate(draft.engagementRate) : null;
  const rowOf = (pieceId: string) => {
    const key = pieceRows[pieceId];
    return key && active.some((row) => row.key === key) ? key : null;
  };

  function goTo(next: number) {
    setStep(next);
    setFormError(null);
    requestAnimationFrame(() => stepHeading.current?.focus());
  }

  /** Revisa los nichos antes de seguir. Devuelve true si están bien. */
  function validateNiches(): boolean {
    const errors: Record<string, string> = {};
    const seen = new Map<string, string>();
    for (const row of active) {
      const niche = nicheFromLabel(row.label);
      if (!row.label.trim()) errors[row.key] = "Escribe el nombre del nicho o desmárcalo.";
      else if (!niche) errors[row.key] = 'Ese nombre no sirve para un link: usa letras o números (y no "Todo").';
      else if (seen.has(niche.slug)) errors[row.key] = "Ya hay un nicho con ese nombre.";
      else seen.set(niche.slug, row.key);
    }
    setRowErrors(errors);
    const first = Object.keys(errors)[0];
    if (first) document.getElementById(`${uid}-${first}`)?.focus();
    return !first;
  }

  function updateRow(key: string, patch: Partial<NicheRow>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    if (rowErrors[key]) {
      setRowErrors((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  }

  function addRow() {
    if (!canAdd) return;
    counter.current += 1;
    const key = `n-${counter.current}`;
    setRows((current) => [...current, { key, label: "", on: true }]);
    requestAnimationFrame(() => document.getElementById(`${uid}-${key}`)?.focus());
  }

  async function generate() {
    if (!validateNiches()) {
      goTo(0);
      return;
    }
    setGenerating(true);
    setFormError(null);
    const slugOf = (key: string | null) => {
      const row = key ? active.find((candidate) => candidate.key === key) : null;
      return row ? (nicheFromLabel(row.label)?.slug ?? null) : null;
    };
    try {
      const response = await fetch("/api/import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId: draft.draftId,
          niches: active.map((row) => ({ label: row.label })),
          pieceNiches: Object.fromEntries(draft.pieces.map((piece) => [piece.id, slugOf(rowOf(piece.id))])),
          design: { template, palette },
        }),
      });
      if (response.status === 401) return onUnauthorized();
      const data = await response.json().catch(() => null);
      if (response.ok && data) return onGenerated(data as ImportResult);

      const issue = data?.error?.issues?.[0];
      const match = typeof issue?.path === "string" ? /^niches\.(\d+)\./.exec(issue.path) : null;
      if (match) {
        const row = active[Number(match[1])];
        if (row) setRowErrors({ [row.key]: issue.message });
        goTo(0);
      } else {
        if (response.status === 404 || response.status === 410) setExpired(true);
        setFormError(issue?.message ?? data?.error?.message ?? "No pudimos generar el portafolio. Intenta de nuevo.");
      }
    } catch {
      setFormError("Se cortó la conexión. Revisa tu internet e intenta de nuevo: no se pierde nada.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="panel p-5 sm:p-7" data-testid="import-review">
      {/* Quién se importó + su métrica principal */}
      <div className="flex items-center gap-4">
        <Avatar photo={draft.photo} name={draft.name} />
        <div className="min-w-0">
          <p className="truncate text-lg">{draft.name}</p>
          <p className="truncate text-sm text-muted">@{draft.username}</p>
        </div>
      </div>
      {er && (
        <p className="mt-4 text-sm text-muted">
          <span className="text-base text-ink">
            {er.label}: <strong className="font-medium">{er.value}</strong>
          </span>{" "}
          · {er.basis}
        </p>
      )}
      {draft.warnings.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm text-accent-ink">
          {draft.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      {/* Pasos */}
      <ol className="mt-6 flex gap-2" aria-label="Pasos antes de generar">
        {STEPS.map((label, index) => (
          <li key={label} className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => (index <= step || validateNiches() ? goTo(index) : undefined)}
              aria-current={index === step ? "step" : undefined}
              className={`w-full rounded-full border-2 px-2 py-2 text-[0.8125rem] font-semibold transition sm:px-3 sm:text-sm ${
                index === step ? "border-ink bg-highlight text-ink" : "border-line text-muted hover:text-ink"
              }`}
            >
              <span className="hidden font-mono text-xs sm:inline">{index + 1} </span>
              {label}
            </button>
          </li>
        ))}
      </ol>

      <div className="mt-7">
        {step === 0 && (
          <section aria-labelledby={`${uid}-h`}>
            <h2 id={`${uid}-h`} ref={stepHeading} tabIndex={-1} className="title-2 outline-none">
              Confirma sus nichos
            </h2>
            <p className="mt-2 text-sm text-muted">
              {rows.length > 0
                ? "La IA sugirió estos. Desmarca los que no van, cámbiales el nombre o agrega otro: con esto se arman las píldoras y un link por nicho."
                : "La IA no encontró nichos claros. Agrega hasta 3 si quieres píldoras y links por nicho; si no, todo va en un solo portafolio."}
            </p>

            <ul className="mt-5 space-y-3">
              {rows.map((row) => {
                const slug = nicheFromLabel(row.label)?.slug;
                const error = rowErrors[row.key];
                return (
                  <li key={row.key} className="flex items-start gap-3" data-niche-row={row.key}>
                    <label className="mt-2.5 flex size-6 shrink-0 cursor-pointer items-center justify-center">
                      <input
                        type="checkbox"
                        checked={row.on}
                        disabled={!row.on && !canAdd}
                        onChange={(event) => updateRow(row.key, { on: event.target.checked })}
                        className="size-5 accent-[var(--color-accent)]"
                        aria-label={`Usar el nicho ${row.label || "nuevo"}`}
                      />
                    </label>
                    <div className="min-w-0 flex-1">
                      <input
                        id={`${uid}-${row.key}`}
                        value={row.label}
                        onChange={(event) => updateRow(row.key, { label: event.target.value })}
                        maxLength={NICHE_LABEL_MAX}
                        disabled={!row.on}
                        placeholder="Nombre del nicho"
                        aria-label="Nombre del nicho"
                        aria-invalid={error ? true : undefined}
                        aria-describedby={`${uid}-${row.key}-hint`}
                        className={`${textInput} disabled:opacity-60`}
                      />
                      <p id={`${uid}-${row.key}-hint`} className={error ? `${errorText} mt-1.5` : "mt-1.5 font-mono text-xs text-muted"}>
                        {error ?? (row.on ? (slug ? `/p/…/${slug}` : " ") : "No se usará")}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <button type="button" onClick={addRow} disabled={!canAdd} className={`${pillButton} mt-4`}>
              {canAdd ? "Agregar nicho" : `Máximo ${MAX_NICHES} nichos`}
            </button>

            <h3 className="mt-8 font-sans text-base">Sus piezas</h3>
            <p className="mt-1 text-sm text-muted">Cada pieza aparece en &quot;Todo&quot; y en la píldora de su nicho.</p>
            <ul className="mt-3 border-t border-line">
              {draft.pieces.map((piece) => (
                <li key={piece.id} className="flex items-center gap-3 border-b border-line py-3">
                  {piece.image ? (
                    <Image src={piece.image.url} alt="" width={48} height={48} className="size-12 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span aria-hidden="true" className="size-12 shrink-0 rounded-lg bg-sand" />
                  )}
                  <label htmlFor={`${uid}-p-${piece.id}`} className="line-clamp-2 min-w-0 flex-1 text-sm break-words">
                    {piece.title}
                  </label>
                  <select
                    id={`${uid}-p-${piece.id}`}
                    value={rowOf(piece.id) ?? ""}
                    onChange={(event) => setPieceRows((current) => ({ ...current, [piece.id]: event.target.value || null }))}
                    className={`${compactSelect} w-36 shrink-0 sm:w-44`}
                  >
                    <option value="">Solo en Todo</option>
                    {active.map((row) => (
                      <option key={row.key} value={row.key}>
                        {row.label.trim() || "(sin nombre)"}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </section>
        )}

        {step === 1 && (
          <section aria-labelledby={`${uid}-h`}>
            <h2 id={`${uid}-h`} ref={stepHeading} tabIndex={-1} className="title-2 outline-none">
              Elige la plantilla
            </h2>
            <p className="mt-2 mb-5 text-sm text-muted">Mismos datos, otra piel. Se puede cambiar después sin perder nada.</p>
            <TemplatePicker value={template} onChange={setTemplate} palette={colors} name={`${uid}-plantilla`} />
          </section>
        )}

        {step === 2 && (
          <section aria-labelledby={`${uid}-h`}>
            <h2 id={`${uid}-h`} ref={stepHeading} tabIndex={-1} className="title-2 outline-none">
              Elige la paleta
            </h2>
            <p className="mt-2 mb-5 text-sm text-muted">Todas cuidan que los textos se lean bien. También se puede cambiar después.</p>
            <div className="grid gap-5 sm:grid-cols-[1fr_11rem] sm:items-start">
              <PalettePicker value={palette} onChange={setPalette} photo={draft.photo} name={`${uid}-paleta`} />
              <figure className="mx-auto w-40 sm:w-full">
                <TemplateMockup template={template} palette={colors} className="block h-auto w-full" />
                <figcaption className="mt-2 text-center text-sm text-muted">
                  {TEMPLATE_INFO[template].name} · {colors.name}
                </figcaption>
              </figure>
            </div>
          </section>
        )}
      </div>

      {formError && (
        <div role="alert" className="mt-6">
          <p className={errorText}>{formError}</p>
          {expired && (
            <button type="button" onClick={onStartOver} className={`${pillButton} mt-3`}>
              Volver a importar
            </button>
          )}
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-3">
        {step > 0 && (
          <button type="button" onClick={() => goTo(step - 1)} className={pillButton} disabled={generating}>
            Atrás
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={() => (step === 0 && !validateNiches() ? undefined : goTo(step + 1))}
            className={`${primaryButton} flex-1 sm:flex-none sm:px-8`}
          >
            Siguiente: {STEPS[step + 1].toLowerCase()}
          </button>
        ) : (
          <button type="button" onClick={generate} disabled={generating} className={`${primaryButton} flex-1 sm:flex-none sm:px-8`}>
            {generating ? "Generando…" : "Generar portafolio"}
          </button>
        )}
        <button type="button" onClick={onStartOver} className="min-h-tap px-2 text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
          Empezar de nuevo
        </button>
      </div>
      <p className="sr-only" aria-live="polite">
        {generating ? "Generando el portafolio…" : ""}
      </p>
    </div>
  );
}
