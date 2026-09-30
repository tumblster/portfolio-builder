"use client";

import { startTransition, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { PalettePicker, TemplateList, recommendedPalette } from "@/components/design/design-pickers";
import { PreviewViews, type PreviewData, type PreviewView } from "@/components/design/template-preview";
import { NichePicker, PiecePicker, type NicheChip, type PieceChip } from "@/components/import/confirm-pickers";
import "@/components/import/review.css";
import { ChispaLoader } from "@/components/mascot/chispa-loader";
import {
  CONFIRM_TIMEOUT_MESSAGE,
  confirmRequestTimeout,
  nextConfirmRetry,
} from "@/lib/import/confirm-retry";
import type { DraftPreview, ImportResult } from "@/lib/import/events";
import { resolvePalette } from "@/lib/palette/palettes";
import { DEFAULT_DESIGN, TEMPLATE_INFO, type PaletteId, type TemplateId } from "@/lib/portfolio/design";
import { nicheFromLabel } from "@/lib/portfolio/niches";
import { SUPPORT_FORM_URL } from "@/lib/site";
import { Avatar } from "./avatar";
import { errorText, pillButton, primaryButton, textLink } from "./brand-ui";

/*
 * Antes de generar (v2 · M2): el creador corrige lo que sugirió la IA y elige cómo se ve.
 *   1. Nichos y piezas (ronda 30/09 · 7.1): dos selectores con chips (components/import/confirm-pickers.tsx). Lo
 *      que eligió la IA llega precargado; se quita, se agrega (también piezas de su perfil) y se ordena. Esto manda
 *      sobre la IA: arma las píldoras, los links /p/<slug>/<nicho> y el orden de las piezas. Sin vista previa en
 *      la pantalla: un botón flotante "Preview" abre un modal con la vista previa (Sobre mí y Media kit).
 *   2. Plantilla: lista compacta + vista previa grande y fiel, con sus datos reales (r2, C1).
 *   3. Paleta: la de su foto (recomendada) o una de las curadas, con la misma vista previa (C4).
 * Arriba, la fila de métricas (7.2): Seguidores, Interacciones promedio y ER, con su base.
 * Generar llama a /api/import/confirm con esas decisiones; mientras tanto, Chispa acompaña (C5).
 *
 * Generar nunca se queda en "Reintentando…" para siempre (7.4 a, lib/import/confirm-retry.ts): los 409 se
 * reintentan con tope y plazo global, cada petición se corta si se cuelga, y el servidor marca el borrador como
 * fallido cuando la generación se cae (7.4 b). Pasado el plazo o ante un fallo, hay un error claro y terminal.
 *
 * Rendimiento (C3): cambiar de paso o de plantilla va en startTransition, la vista previa está memoizada.
 */

const STEPS = ["Nichos y piezas", "Plantilla", "Paleta"] as const;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** El espacio de la barra de progreso no cambia mientras la pantalla vive: no hay nada a qué suscribirse. */
const noSubscribe = () => () => {};

/** Hora actual. Fuera del componente: solo se usa dentro del manejador de "Generar", nunca al dibujar. */
const clock = () => Date.now();

/** r3 · 9: si generar lleva esto sin terminar, se ofrece el formulario de soporte (el error llega antes de 60 s). */
const SLOW_AFTER_MS = 30_000;

/** Link al formulario de soporte: pestaña nueva, flecha decorativa y aviso para lectores de pantalla. */
function SupportLink({ children }: { children: string }) {
  return (
    <a href={SUPPORT_FORM_URL} target="_blank" rel="noopener noreferrer" className={textLink}>
      {children} <span aria-hidden="true">→</span>
      <span className="sr-only"> (se abre en una pestaña nueva)</span>
    </a>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="size-5" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

type Props = {
  draft: DraftPreview;
  onGenerated: (result: ImportResult) => void;
  onStartOver: () => void;
  onUnauthorized: () => void;
};

export function ImportReview({ draft, onGenerated, onStartOver, onUnauthorized }: Props) {
  const uid = useId();
  const counter = useRef(0);
  const newKey = () => `n-${(counter.current += 1)}`;
  const [step, setStep] = useState(0);
  // Chips de nichos: lo que sugirió la IA, en su orden.
  const [niches, setNiches] = useState<NicheChip[]>(() =>
    draft.suggestedNiches.map((niche) => ({ key: `ai-${niche.slug}`, label: niche.label })),
  );
  // Chips de piezas: las que eligió la IA, con el nicho que les puso (si sigue entre los nichos).
  const [pieces, setPieces] = useState<PieceChip[]>(() =>
    draft.pieces.map((piece) => ({
      id: piece.id,
      nicheKey: piece.niche && draft.suggestedNiches.some((niche) => niche.slug === piece.niche) ? `ai-${piece.niche}` : null,
    })),
  );
  const [nicheError, setNicheError] = useState<string | null>(null);
  const [pieceError, setPieceError] = useState<string | null>(null);
  const [template, setTemplate] = useState<TemplateId>(DEFAULT_DESIGN.template);
  const [palette, setPalette] = useState<PaletteId>(() => recommendedPalette(draft.photo));
  const [formError, setFormError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [retrying, setRetrying] = useState(false);
  // r3 · 9 + 7.4: generar tarda de más o falló → vía de escape al formulario de soporte.
  const [slow, setSlow] = useState(false);
  const [failed, setFailed] = useState(false);
  // Tras un fallo de generación, el próximo "Generar" le pide al servidor otro intento a propósito (7.4 b).
  const retryNext = useRef(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  // Switch "Sobre mí | Media kit" de la vista previa: uno solo para los pasos y el modal (ajuste 9).
  const [previewView, setPreviewView] = useState<PreviewView>("about");
  // Espacio de la barra de progreso en el navbar de /crear (ajuste 6). La revisión solo existe en el navegador.
  // Con useSyncExternalStore: null en el servidor y el elemento real ya en el navegador (sin desajuste al hidratar).
  const progressSlot = useSyncExternalStore(
    noSubscribe,
    () => document.getElementById("crear-progress"),
    () => null,
  );
  useEffect(() => {
    if (!generating) return;
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [generating]);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const focusHeading = useRef(false);
  // Si la pantalla se desmonta (Empezar de nuevo) mientras espera un reintento, no se sigue.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Si un nicho se quita, sus piezas pasan a "Todo".
  const nicheKeys = niches.map((niche) => niche.key).join("|");
  const livePieces = useMemo(
    () => pieces.map((piece) => (piece.nicheKey && !nicheKeys.split("|").includes(piece.nicheKey) ? { ...piece, nicheKey: null } : piece)),
    [pieces, nicheKeys],
  );
  const pool = useMemo(() => [...draft.pieces, ...draft.profilePosts], [draft.pieces, draft.profilePosts]);
  const colors = resolvePalette(palette, draft.photo);

  // Datos reales de la creadora para las vistas previas. Estable entre renders (están memoizadas).
  const nicheLabels = niches.map((niche) => niche.label).join("\n");
  const thumbKey = livePieces.map((piece) => piece.id).join("|");
  const preview = useMemo<PreviewData>(() => {
    const byId = new Map(pool.map((piece) => [piece.id, piece]));
    return {
      name: draft.name,
      handle: `@${draft.username}`,
      niches: nicheLabels ? nicheLabels.split("\n") : [],
      thumbs: thumbKey ? thumbKey.split("|").map((id) => byId.get(id)?.image?.url ?? null) : [],
      metrics: draft.metrics.map((metric) => ({ label: metric.label, display: metric.display })),
    };
  }, [draft.name, draft.username, draft.metrics, nicheLabels, thumbKey, pool]);

  // El foco va al título del paso nuevo cuando ya está en pantalla (después del commit de la transición).
  useEffect(() => {
    if (!focusHeading.current) return;
    focusHeading.current = false;
    stepHeading.current?.focus();
  }, [step]);

  function goTo(next: number) {
    setFormError(null);
    focusHeading.current = true;
    startTransition(() => setStep(next));
  }

  function chooseTemplate(next: TemplateId) {
    startTransition(() => setTemplate(next));
  }

  /** Revisa nichos y piezas antes de seguir. Devuelve true si están bien. */
  function validateSelection(): boolean {
    const slugs = new Set<string>();
    for (const niche of niches) {
      const parsed = nicheFromLabel(niche.label);
      if (!parsed || slugs.has(parsed.slug)) {
        setNicheError(`Revisa «${niche.label}»: quítalo y agrégalo de nuevo.`);
        return false;
      }
      slugs.add(parsed.slug);
    }
    if (livePieces.length < draft.pieceLimits.min) {
      setPieceError(`Elige al menos ${draft.pieceLimits.min} piezas: súmalas desde «De tu perfil».`);
      return false;
    }
    setNicheError(null);
    setPieceError(null);
    return true;
  }

  async function generate() {
    if (!validateSelection()) {
      goTo(0);
      return;
    }
    const retry = retryNext.current;
    setGenerating(true);
    setRetrying(false);
    setSlow(false);
    setFailed(false);
    setFormError(null);
    const slugOf = (key: string | null) => {
      const niche = key ? niches.find((candidate) => candidate.key === key) : null;
      return niche ? (nicheFromLabel(niche.label)?.slug ?? null) : null;
    };
    const body = JSON.stringify({
      draftId: draft.draftId,
      niches: niches.map((niche) => ({ label: niche.label })),
      selection: livePieces.map((piece) => ({ id: piece.id, niche: slugOf(piece.nicheKey) })),
      design: { template, palette },
      ...(retry ? { retry: true } : {}),
    });
    // Error terminal (7.4 a): claro, con salida al soporte, y el próximo "Generar" pide otro intento.
    const fail = (message: string) => {
      retryNext.current = true;
      setFailed(true);
      setFormError(message);
    };
    const startedAt = clock();
    try {
      for (let attempt = 0; ; attempt += 1) {
        const timeout = confirmRequestTimeout(startedAt, clock());
        if (timeout <= 0) return fail(CONFIRM_TIMEOUT_MESSAGE);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        let response: Response;
        try {
          response = await fetch("/api/import/confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            signal: controller.signal,
          });
        } catch (error) {
          // Petición colgada: se corta al llegar al plazo y se dice claro (nada de esperar para siempre).
          if (controller.signal.aborted) return mounted.current ? fail(CONFIRM_TIMEOUT_MESSAGE) : undefined;
          throw error;
        } finally {
          clearTimeout(timer);
        }
        if (!mounted.current) return;
        if (response.status === 401) return onUnauthorized();
        const data = await response.json().catch(() => null);
        if (response.ok && data) {
          retryNext.current = false;
          return onGenerated(data as ImportResult);
        }

        if (response.status === 409) {
          const delay = nextConfirmRetry(attempt, startedAt, clock(), Date.parse(data?.error?.retryAt ?? ""));
          if (delay === null) return fail(CONFIRM_TIMEOUT_MESSAGE);
          setRetrying(true);
          await sleep(delay);
          if (!mounted.current) return;
          continue;
        }
        // El servidor marcó el borrador como fallido (7.4 b): terminal, sin reintentos automáticos.
        if (data?.error?.code === "generation_failed") return fail(data.error.message ?? CONFIRM_TIMEOUT_MESSAGE);

        const issue = data?.error?.issues?.[0];
        const path = typeof issue?.path === "string" ? issue.path : "";
        if (path.startsWith("niches")) {
          setNicheError(issue.message);
          goTo(0);
        } else if (path.startsWith("selection")) {
          setPieceError(issue.message);
          goTo(0);
        } else {
          if (response.status === 404 || response.status === 410) setExpired(true);
          if (response.status >= 500 || response.status === 404 || response.status === 410) setFailed(true);
          setFormError(issue?.message ?? data?.error?.message ?? "No pudimos generar el portafolio. Intenta de nuevo.");
        }
        return;
      }
    } catch {
      if (mounted.current) setFormError("Se cortó la conexión. Revisa tu internet e intenta de nuevo: no se pierde nada.");
    } finally {
      if (mounted.current) {
        setGenerating(false);
        setRetrying(false);
      }
    }
  }


  return (
    <div className="panel p-5 sm:p-7" data-testid="import-review">
      {/* Quién se importó */}
      <div className="flex items-center gap-4">
        <Avatar photo={draft.photo} name={draft.name} />
        <div className="min-w-0">
          <p className="truncate text-lg">{draft.name}</p>
          <p className="truncate text-sm text-muted">@{draft.username}</p>
        </div>
      </div>
      {/* Fila de métricas (7.2): Seguidores, Interacciones promedio y ER, con su base dicha tal cual. */}
      {draft.metrics.length > 0 && (
        <div className="mt-5" data-metrics-row>
          <dl className="grid grid-cols-3 gap-2 sm:gap-3">
            {draft.metrics.map((metric) => (
              <div key={metric.kind} className="min-w-0 rounded-2xl border border-line bg-paper px-3 py-2.5" data-metric={metric.kind}>
                <dt className="text-xs leading-snug text-muted [overflow-wrap:anywhere]">{metric.label}</dt>
                <dd className="mt-0.5 text-lg font-semibold tracking-[-0.02em] sm:text-xl">{metric.display}</dd>
              </div>
            ))}
          </dl>
        </div>
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
              onClick={() => (index <= step || validateSelection() ? goTo(index) : undefined)}
              aria-current={index === step ? "step" : undefined}
              data-step-pill
              className={`min-h-tap w-full rounded-full border-2 px-2 py-2 text-[0.8125rem] leading-tight font-semibold [overflow-wrap:anywhere] transition sm:px-3 sm:text-sm ${
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
              Confirma sus nichos y sus piezas
            </h2>
            <div className="mt-6 space-y-9">
              <NichePicker
                niches={niches}
                onChange={setNiches}
                suggested={draft.suggestedNiches.map((niche) => niche.label)}
                error={nicheError}
                onError={setNicheError}
                newKey={newKey}
              />
              <PiecePicker
                pieces={livePieces}
                onChange={setPieces}
                pool={pool}
                niches={niches}
                limits={draft.pieceLimits}
                error={pieceError}
                onError={setPieceError}
              />
            </div>
          </section>
        )}

        {step === 1 && (
          <section aria-labelledby={`${uid}-h`}>
            <h2 id={`${uid}-h`} ref={stepHeading} tabIndex={-1} className="title-2 outline-none">
              Elige la plantilla
            </h2>
            <p className="mt-2 mb-5 text-sm text-muted">Mismos datos, otra piel. Se puede cambiar después sin perder nada.</p>
            <div className="grid gap-5 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:items-start md:gap-8">
              <TemplateList value={template} onChange={chooseTemplate} name={`${uid}-plantilla`} />
              <PreviewViews
                template={template}
                palette={colors}
                data={preview}
                caption={`${TEMPLATE_INFO[template].name} · ${colors.name}`}
                view={previewView}
                onViewChange={setPreviewView}
              />
            </div>
          </section>
        )}

        {step === 2 && (
          <section aria-labelledby={`${uid}-h`}>
            <h2 id={`${uid}-h`} ref={stepHeading} tabIndex={-1} className="title-2 outline-none">
              Elige la paleta
            </h2>
            <p className="mt-2 mb-5 text-sm text-muted">Todas cuidan que los textos se lean bien. También se puede cambiar después.</p>
            <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_20rem] md:items-start md:gap-8">
              <PalettePicker value={palette} onChange={setPalette} photo={draft.photo} name={`${uid}-paleta`} />
              <PreviewViews
                template={template}
                palette={colors}
                data={preview}
                caption={`${TEMPLATE_INFO[template].name} · ${colors.name}`}
                view={previewView}
                onViewChange={setPreviewView}
              />
            </div>
          </section>
        )}
      </div>

      {/* Mientras se genera (también durante los reintentos): Chispa y el estado, sin errores técnicos. */}
      <div aria-live="polite">
        {generating && (
          <div className="mt-6 flex items-center gap-4 rounded-card border-2 border-ink bg-highlight p-4 sm:p-5" data-generating>
            <ChispaLoader />
            <div>
              <p className="text-lg font-semibold">Armando tu portafolio…</p>
              {retrying && <p className="mt-1 text-sm text-muted">Reintentando…</p>}
              {/* No corta los reintentos: es solo una salida visible si tarda de más. */}
              {slow && (
                <p className="mt-2 text-sm" data-generating-slow>
                  ¿Tarda demasiado? <SupportLink>Cuéntanos qué pasó</SupportLink>
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {formError && (
        <div role="alert" className="mt-6" data-generate-error>
          <p className={errorText}>{formError}</p>
          {failed && (
            <p className="mt-2 text-sm" data-generating-failed>
              Algo no funcionó. <SupportLink>Reporta el problema</SupportLink>
            </p>
          )}
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
            onClick={() => (step === 0 && !validateSelection() ? undefined : goTo(step + 1))}
            className={`${primaryButton} flex-1 sm:flex-none sm:px-8`}
          >
            {step === 1 ? "Elegir paleta" : "Elegir plantilla"}
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

      {progressSlot && createPortal(<StepProgress step={step} />, progressSlot)}

      {/* 7.1: sin vista previa en la pantalla; un botón flotante la abre en un modal (patrón Beacons). */}
      {step === 0 && (
        <button type="button" className="preview-fab" onClick={() => setPreviewOpen(true)} data-preview-fab>
          <EyeIcon />
          Preview
        </button>
      )}
      {previewOpen && (
        <PreviewModal
          onClose={() => setPreviewOpen(false)}
          template={template}
          palette={colors}
          data={preview}
          caption={`${TEMPLATE_INFO[template].name} · ${colors.name}`}
          view={previewView}
          onViewChange={setPreviewView}
        />
      )}
    </div>
  );
}

/** Barra de progreso de los pasos 1-2-3 en el navbar (ajuste 6). */
function StepProgress({ step }: { step: number }) {
  return (
    <div
      className="crear-progress"
      role="progressbar"
      aria-label="Progreso"
      aria-valuemin={1}
      aria-valuemax={STEPS.length}
      aria-valuenow={step + 1}
      aria-valuetext={`Paso ${step + 1} de ${STEPS.length}: ${STEPS[step]}`}
      data-crear-progress={step + 1}
    >
      <ol aria-hidden="true" className="crear-progress__steps">
        {STEPS.map((label, index) => (
          <li key={label} data-state={index < step ? "done" : index === step ? "current" : "next"}>
            <span className="crear-progress__bar" />
            <span className="crear-progress__label">
              <b>{index + 1}</b> {label}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Modal de vista previa (7.1): la misma vista previa con su switch "Sobre mí | Media kit", en un diálogo. */
function PreviewModal(props: {
  onClose: () => void;
  template: TemplateId;
  palette: ReturnType<typeof resolvePalette>;
  data: PreviewData;
  caption: string;
  view: PreviewView;
  onViewChange: (view: PreviewView) => void;
}) {
  const uid = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const { onClose } = props;
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    node.showModal();
    const close = () => onClose();
    node.addEventListener("close", close);
    return () => {
      node.removeEventListener("close", close);
      if (node.open) node.close();
    };
  }, [onClose]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={`${uid}-title`}
      className="preview-modal"
      data-preview-modal
      onClick={(event) => event.target === event.currentTarget && dialog.current?.close()}
    >
      <div className="preview-modal__body">
        <div className="flex items-center justify-between gap-3">
          <h2 id={`${uid}-title`} className="text-lg font-semibold">
            Vista previa
          </h2>
          <button type="button" onClick={() => dialog.current?.close()} className={`${pillButton} px-4`}>
            Cerrar
          </button>
        </div>
        <div className="mt-4">
          <PreviewViews
            template={props.template}
            palette={props.palette}
            data={props.data}
            caption={props.caption}
            view={props.view}
            onViewChange={props.onViewChange}
          />
        </div>
      </div>
    </dialog>
  );
}
