"use client";

import { startTransition, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import { BrandPartnersField } from "@/components/brand-partners-field";
import { PalettePicker, TemplateList, recommendedPalette } from "@/components/design/design-pickers";
import { PreviewViews, type PreviewData, type PreviewView } from "@/components/design/template-preview";
import { NichePicker, PiecePicker, type NicheChip, type PieceChip } from "@/components/import/confirm-pickers";
import type { Onboarding } from "@/components/import/onboarding-step";
import { ServicesStep, initialServiceCards, pendingSuggestions, type ServiceCard } from "@/components/import/services-step";
import type { DraftPiece } from "@/lib/import/events";
import "@/components/import/review.css";
import { ChispaLoader } from "@/components/mascot/chispa-loader";
import { showToast } from "@/components/ui/toast";
import {
  CONFIRM_TIMEOUT_MESSAGE,
  confirmRequestTimeout,
  nextConfirmRetry,
} from "@/lib/import/confirm-retry";
import type { DraftPreview, ImportResult } from "@/lib/import/events";
import { resolvePalette } from "@/lib/palette/palettes";
import { DEFAULT_DESIGN, TEMPLATE_INFO, type PaletteId, type TemplateId } from "@/lib/portfolio/design";
import { partnersPayload, type BrandPartnerDraft } from "@/lib/portfolio/media-kit-drafts";
import { detectBrandMentions, mergeMentions } from "@/lib/portfolio/mentions";
import { nicheFromLabel } from "@/lib/portfolio/niches";
import { SUPPORT_FORM_URL } from "@/lib/site";
import { Avatar } from "./avatar";
import { errorText, pillButton, primaryButton, textLink } from "./brand-ui";

/*
 * Antes de generar (v2 · M2): el creador corrige lo que sugirió la IA y elige cómo se ve.
 *   1. Nichos y piezas (ronda 30/09 · 7.1): dos selectores con chips (components/import/confirm-pickers.tsx). Lo
 *      que eligió la IA llega precargado; se quita, se agrega (también piezas de su perfil o por link) y se ordena.
 *      Esto manda sobre la IA: arma las píldoras, los links /p/<slug>/<nicho> y el orden de las piezas. Sin vista
 *      previa en la pantalla: un botón flotante "Preview" abre un modal con la vista previa (Contenido y Media kit).
 *   2. Servicios (11.12 · ronda 6 13.6): llegan las sugerencias de la IA (de sus captions y las marcas que menciona);
 *      la creadora las usa, edita o quita; las que queden sin revisar se descartan al generar (con aviso). Solo se envía lo confirmado.
 *      Debajo, Brand Partners (13.19, opcional): las @marcas detectadas en sus contenidos y en los links agregados
 *      llegan como candidatas SIN marcar; solo viajan las que ella agrega (y las que carga a mano).
 *   3. Plantilla: lista compacta + vista previa grande y fiel, con sus datos reales (r2, C1).
 *   4. Paleta: la de su foto (recomendada) o una de las curadas, con la misma vista previa (C4).
 * Arriba, la fila de métricas (7.2): Seguidores, Interacciones promedio y ER, con su base.
 * Generar llama a /api/import/confirm con esas decisiones y, desde la ronda 6 (13.15), con el onboarding (correo +
 * género): la cuenta queda guardada, el género en el portafolio y le llega el correo con sus links.
 * Mientras tanto, Chispa acompaña (C5).
 *
 * Generar nunca se queda en "Reintentando…" para siempre (7.4 a, lib/import/confirm-retry.ts): los 409 se
 * reintentan con tope y plazo global, cada petición se corta si se cuelga, y el servidor marca el borrador como
 * fallido cuando la generación se cae (7.4 b). Pasado el plazo o ante un fallo, hay un error claro y terminal.
 *
 * Rendimiento (C3): cambiar de paso o de plantilla va en startTransition, la vista previa está memoizada.
 */

// Spec 11.12: Servicios va antes de generar (y es obligatorio).
const STEPS = ["Nichos y piezas", "Servicios", "Plantilla", "Paleta"] as const;

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
  /** 13.15: el onboarding (correo + género); viaja al generar. null solo en clientes que no lo pidieron. */
  owner: Onboarding | null;
  onGenerated: (result: ImportResult) => void;
  onStartOver: () => void;
  onUnauthorized: () => void;
};

export function ImportReview({ draft, owner, onGenerated, onStartOver, onUnauthorized }: Props) {
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
  // Spec 11.12 · ronda 6 13.6: tarjetas de servicio (mínimo 1 antes de generar). Arrancan con las sugerencias de la
  // IA, por revisar; si no hay (la IA falló o es un borrador anterior), con una vacía.
  const [services, setServices] = useState<ServiceCard[]>(() => initialServiceCards(draft.suggestedServices ?? []));
  const [serviceError, setServiceError] = useState<string | null>(null);
  // Ronda 6 · 13.19: Brand partners confirmados (arranca vacío: ninguna mención se agrega sola).
  const [partners, setPartners] = useState<BrandPartnerDraft[]>([]);
  const [partnerError, setPartnerError] = useState<string | null>(null);
  // Subidas de logo en curso: no se genera a medias.
  const [uploads, setUploads] = useState(0);
  // Spec 11.5: piezas agregadas por link en esta sesión (la más nueva primero).
  const [linkPieces, setLinkPieces] = useState<DraftPiece[]>([]);
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
  // Switch "Contenido | Media kit" de la vista previa: uno solo para los pasos y el modal (ajuste 9).
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
    () =>
      pieces.map((piece) =>
        piece.nicheKey && !nicheKeys.split("|").includes(piece.nicheKey) ? { ...piece, nicheKey: null, pending: true } : piece,
      ),
    [pieces, nicheKeys],
  );
  // 13.4: lo agregado por link va primero en la grilla, así se ve al instante (no queda escondido tras "Ver más").
  const pool = useMemo(() => [...linkPieces, ...draft.pieces, ...draft.profilePosts], [linkPieces, draft.pieces, draft.profilePosts]);
  const colors = resolvePalette(palette, draft.photo);
  // 13.19 (a): marcas candidatas = las de sus últimos 12 contenidos (servidor) + las de los links agregados aquí.
  const detectedBrands = useMemo(
    () => mergeMentions(draft.brandMentions ?? [], detectBrandMentions(linkPieces.map((piece) => piece.title), [draft.username])),
    [draft.brandMentions, draft.username, linkPieces],
  );

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
    // E2 del dueño: cada paso es una "página"; al cambiar, se vuelve arriba del todo.
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
    startTransition(() => setStep(next));
  }

  function chooseTemplate(next: TemplateId) {
    startTransition(() => setTemplate(next));
  }

  function updatePartners(action: SetStateAction<BrandPartnerDraft[]>) {
    setPartners(action);
    setPartnerError(null);
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
      setPieceError(`Elige al menos ${draft.pieceLimits.min} piezas: súmalas desde «Tus últimos 12 contenidos».`);
      return false;
    }
    setNicheError(null);
    setPieceError(null);
    return true;
  }

  /** E2 del dueño: las sugerencias sin revisar NO bloquean: se descartan al generar (toast mediante).
   *  Solo se exige al menos una tarjeta con título. */
  function validateServices(): boolean {
    if (!services.some((card) => card.title.trim())) {
      setServiceError("Agrega al menos un servicio: un título y, si quieres, un link o una descripción.");
      return false;
    }
    setServiceError(null);
    return true;
  }

  async function generate() {
    if (!validateSelection()) {
      goTo(0);
      return;
    }
    if (!validateServices()) {
      goTo(1);
      return;
    }
    const discarded = pendingSuggestions(services);
    if (discarded > 0) {
      showToast(
        discarded === 1 ? "Se descartó 1 sugerencia sin revisar." : `Se descartaron ${discarded} sugerencias sin revisar.`,
      );
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
      // 13.6: solo las tarjetas confirmadas por la creadora (una sugerencia sin revisar nunca sale del navegador).
      services: services
        .filter((card) => !card.suggested && card.title.trim())
        .map((card) => ({ title: card.title.trim(), description: card.description.trim() })),
      // 13.19: solo las marcas que ella agregó (las menciones sin tocar no viajan).
      ...(partners.length > 0 ? { brandPartners: partnersPayload(partners) } : {}),
      // 13.15: el onboarding (correo = cuenta, y el género para los textos de WhatsApp).
      ...(owner ? { owner } : {}),
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
        } else if (path.startsWith("services")) {
          setServiceError(issue.message);
          goTo(1);
        } else if (path.startsWith("brandPartners")) {
          setPartnerError(issue.message);
          goTo(1);
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
              onClick={() => (index <= step || (validateSelection() && (index <= 1 || validateServices())) ? goTo(index) : undefined)}
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
                draftId={draft.draftId}
                onLinkPiece={(piece) => {
                  setLinkPieces((current) => (current.some((item) => item.id === piece.id) ? current : [piece, ...current]));
                  setPieces((current) =>
                    current.some((item) => item.id === piece.id) || current.length >= draft.pieceLimits.max
                      ? current
                      : [...current, { id: piece.id, nicheKey: null, pending: true }],
                  );
                }}
              />
            </div>
          </section>
        )}

        {step === 1 && (
          <section aria-labelledby={`${uid}-h`}>
            <h2 id={`${uid}-h`} ref={stepHeading} tabIndex={-1} className="title-2 outline-none">
              Sus servicios
            </h2>
            <p className="mt-2 mb-5 text-sm text-muted">
              Cómo trabaja con marcas, en tarjetas: un título y un link o una descripción. Al menos una.
            </p>
            <ServicesStep
              cards={services}
              onChange={(cards) => {
                setServices(cards);
                if (serviceError) setServiceError(null);
              }}
              newKey={newKey}
              error={serviceError}
              brands={draft.brandMentions ?? []}
            />
            {/* 13.19: Brand partners (opcional). Solo lo confirmado aparece en su Media kit. */}
            <section aria-labelledby={`${uid}-marcas`} className="mt-12" data-review-brands>
              <h3 id={`${uid}-marcas`} className="title-3">
                Brand Partners
              </h3>
              <p className="mt-2 mb-5 text-sm text-muted">
                Opcional. Las marcas con las que trabajó de verdad: aparecen en su Media kit.
              </p>
              <BrandPartnersField
                partners={partners}
                setPartners={updatePartners}
                detected={detectedBrands}
                newKey={newKey}
                onPending={(delta) => setUploads((count) => Math.max(0, count + delta))}
                error={partnerError}
              />
            </section>
          </section>
        )}

        {step === 2 && (
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

        {step === 3 && (
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
            onClick={() => ((step === 0 && !validateSelection()) || (step === 1 && !validateServices()) ? undefined : goTo(step + 1))}
            className={`${primaryButton} flex-1 sm:flex-none sm:px-8`}
          >
            {step === 0 ? "Agregar servicios" : step === 1 ? "Elegir plantilla" : "Elegir paleta"}
          </button>
        ) : (
          <button
            type="button"
            onClick={generate}
            disabled={generating || uploads > 0}
            className={`${primaryButton} flex-1 sm:flex-none sm:px-8`}
          >
            {generating ? "Generando…" : uploads > 0 ? "Esperando los logos…" : "Generar portafolio"}
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

/**
 * Modal de vista previa (7.1): la misma vista previa con su switch "Contenido | Media kit", en un diálogo.
 *
 * Ronda 6 · 13.5: cambiar de vista NO cierra el modal; solo cambia el contenido. El bug: el efecto que abría el
 * <dialog> dependía de onClose, una función nueva en cada render. Al cambiar de vista se re-ejecutaba, su limpieza
 * llamaba a close() y el evento "close" (que llega después, en otra tarea) desmontaba el modal. Ahora:
 * - se abre UNA vez al montarse (sin dependencias); si ya está abierto (doble montaje de StrictMode), no se toca;
 * - "close" se escucha con el prop onClose de React, que siempre usa el manejador vigente, sin efectos;
 * - la limpieza no llama a close(): al desmontarse, el <dialog> sale del documento y de la capa superior sin
 *   disparar "close".
 * Se cierra solo con "Cerrar", Escape o un tap fuera del cuadro.
 */
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
  useEffect(() => {
    const node = dialog.current;
    if (node && !node.open) node.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={`${uid}-title`}
      className="preview-modal"
      data-preview-modal
      onClose={props.onClose}
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
