"use client";

import { useRouter } from "next/navigation";
import {
  useDeferredValue,
  useMemo,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import { MANUAL_PREFILL_KEY, type ManualPrefill } from "@/lib/import/events";
import { PalettePicker, TemplatePicker } from "@/components/design/design-pickers";
import { resolvePalette } from "@/lib/palette/palettes";
import type { BrandPartnerDraft, CaseStudyDraft } from "@/lib/portfolio/media-kit-drafts";
import { nichesWithPieces } from "@/lib/portfolio/niches";
import { LIMITS } from "@/lib/portfolio/schema";
import { Avatar } from "../avatar";
import { BrandPartnersField } from "../brand-partners-field";
import { PublicPortfolio } from "../public-portfolio";
import { CaseStudiesField } from "./case-studies-field";
import { Completeness } from "./completeness";
import { CoverEditButton } from "./cover-edit-button";
import { errorText, fieldLabel, pillButton, primaryButton, textInput } from "../ui";
import {
  CONTACT_KEYS,
  NO_EXTRAS,
  emptyForm,
  emptyPiece,
  extrasFromPortfolio,
  formFromPortfolio,
  formFromPrefill,
  issuesToErrors,
  newPieceKey,
  serviceDraft,
  toCreatePayload,
  toPreview,
  toUpdatePayload,
  validateForm,
  type Baseline,
  type ContactKey,
  type FieldErrors,
  type FormState,
  type PieceDraft,
  type ServiceDraft,
} from "./form-model";
import { ImagePicker } from "./image-picker";
import { PieceEditor } from "./piece-editor";

/*
 * Formulario del portafolio (RF-01, RF-02) con vista previa en vivo.
 * Crear: fallback "Prefiero llenarlo manual", con lo que haya dejado la importación.
 * Editar: cualquier portafolio, también los importados de Instagram.
 * Móvil: pestañas Formulario / Vista previa. Escritorio: formulario a la izquierda, vista a la derecha.
 * v2: la vista previa es la plantilla Creator; se puede mirar por nicho (Todo + los nichos con
 * piezas) y el formulario suma "servicios" (formas de colaborar).
 * Ronda 6 · 13.19 / 13.20 (solo al editar): Brand Partners y Case studies, lo que muestra el Media kit.
 */

export type EditorProps = { mode: "create" } | { mode: "edit"; baseline: Baseline };

// El prellenado vive en sessionStorage: solo existe en el navegador.
const subscribe = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
};
const readPrefill = () => {
  try {
    return sessionStorage.getItem(MANUAL_PREFILL_KEY) ?? "";
  } catch {
    return "";
  }
};
const noPrefill = () => "";

function initialFromPrefill(stored: string): FormState {
  if (!stored) return emptyForm();
  try {
    return formFromPrefill(JSON.parse(stored) as ManualPrefill);
  } catch {
    return emptyForm();
  }
}

export function PortfolioEditor(props: EditorProps) {
  const stored = useSyncExternalStore(subscribe, props.mode === "create" ? readPrefill : noPrefill, () => null);
  if (props.mode === "edit") return <EditorForm initial={props.baseline.form} initialBaseline={props.baseline} />;
  if (stored === null) return <p className="mt-10 text-muted">Cargando el formulario…</p>;
  return <EditorForm initial={initialFromPrefill(stored)} initialBaseline={null} />;
}

const CONTACT_FIELDS: Record<
  ContactKey,
  { label: string; placeholder: string; type?: string; inputMode?: "email" | "tel" | "url" }
> = {
  email: { label: "Correo", placeholder: "hola@ejemplo.com", type: "email", inputMode: "email" },
  whatsapp: { label: "WhatsApp", placeholder: "+51 987 654 321", type: "tel", inputMode: "tel" },
  instagram: { label: "Instagram", placeholder: "@usuario" },
  tiktok: { label: "TikTok", placeholder: "@usuario" },
  youtube: { label: "YouTube", placeholder: "Link del canal o @usuario" },
  website: { label: "Sitio web", placeholder: "misitio.com", inputMode: "url" },
};

type SaveStatus = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

/** Lleva el foco al primer campo con error (o al primer mensaje de error de sección). */
function focusFirstError() {
  requestAnimationFrame(() =>
    document.querySelector<HTMLElement>('[aria-invalid="true"], [data-error-focus]')?.focus(),
  );
}

function EditorForm({ initial, initialBaseline }: { initial: FormState; initialBaseline: Baseline | null }) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [baseline, setBaseline] = useState(initialBaseline);
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const [pending, setPending] = useState(0);
  const [tab, setTab] = useState<"form" | "preview">("form");
  const [previewNiche, setPreviewNiche] = useState<string | null>(null);
  const isEdit = baseline !== null;
  const extras = baseline?.extras ?? NO_EXTRAS;
  const imported = baseline?.imported ?? [];

  // Tras el primer intento de guardar, los errores se recalculan mientras se corrige.
  const clientErrors = useMemo(() => (submitted ? validateForm(form, baseline) : {}), [submitted, form, baseline]);
  const errors: FieldErrors = { ...serverErrors, ...clientErrors };

  // La vista previa se actualiza en cada tecla sin trabar lo que se escribe (RF-01: < 1 s).
  const deferredForm = useDeferredValue(form);
  const preview = useMemo(() => toPreview(deferredForm, extras), [deferredForm, extras]);
  // Solo se puede mirar un nicho que tenga piezas; si se quedó sin ninguna, vuelve a "Todo".
  const previewNiches = nichesWithPieces(preview.niches, preview.pieces);
  const activePreviewNiche = previewNiches.some((niche) => niche.slug === previewNiche) ? previewNiche : null;

  function touched() {
    setServerErrors({});
    setStatus((current) => (current.kind === "saving" ? current : { kind: "idle" }));
  }
  function edit(patch: Partial<FormState>) {
    setForm((current) => ({ ...current, ...patch }));
    touched();
  }
  function editContact(key: ContactKey, value: string) {
    setForm((current) => ({ ...current, contact: { ...current.contact, [key]: value } }));
    touched();
  }
  function editPiece(key: string, patch: Partial<PieceDraft>) {
    setForm((current) => ({
      ...current,
      pieces: current.pieces.map((piece) => (piece.key === key ? { ...piece, ...patch } : piece)),
    }));
    touched();
  }
  function movePiece(index: number, direction: -1 | 1) {
    setForm((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.pieces.length) return current;
      const pieces = [...current.pieces];
      [pieces[index], pieces[target]] = [pieces[target], pieces[index]];
      return { ...current, pieces };
    });
    touched();
  }
  function removePiece(key: string) {
    setForm((current) => ({ ...current, pieces: current.pieces.filter((piece) => piece.key !== key) }));
    touched();
  }
  function setDesign(patch: Partial<FormState["design"]>) {
    setForm((current) => ({ ...current, design: { ...current.design, ...patch } }));
    touched();
  }
  function editService(key: string, patch: Partial<ServiceDraft>) {
    setForm((current) => ({
      ...current,
      services: current.services.map((service) => (service.key === key ? { ...service, ...patch } : service)),
    }));
    touched();
  }
  function removeService(key: string) {
    setForm((current) => ({ ...current, services: current.services.filter((service) => service.key !== key) }));
    touched();
  }
  function addService() {
    setForm((current) =>
      current.services.length >= LIMITS.maxServices
        ? current
        : { ...current, services: [...current.services, serviceDraft()] },
    );
    touched();
  }
  /** Mueve una tarjeta de servicio un lugar arriba (-1) o abajo (+1). */
  function moveService(key: string, delta: -1 | 1) {
    setForm((current) => {
      const from = current.services.findIndex((service) => service.key === key);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= current.services.length) return current;
      const services = [...current.services];
      [services[from], services[to]] = [services[to], services[from]];
      return { ...current, services };
    });
    touched();
  }
  function addPiece() {
    setForm((current) =>
      current.pieces.length >= LIMITS.maxPieces ? current : { ...current, pieces: [...current.pieces, emptyPiece()] },
    );
    touched();
  }
  // 13.19 / 13.20: con forma de setState (el logo de una marca llega después, sobre el estado vigente).
  function setBrandPartners(action: SetStateAction<BrandPartnerDraft[]>) {
    setForm((current) => ({
      ...current,
      brandPartners: typeof action === "function" ? action(current.brandPartners) : action,
    }));
    touched();
  }
  function setCaseStudies(action: SetStateAction<CaseStudyDraft[]>) {
    setForm((current) => ({
      ...current,
      caseStudies: typeof action === "function" ? action(current.caseStudies) : action,
    }));
    touched();
  }
  const trackPending = (delta: 1 | -1) => setPending((count) => Math.max(0, count + delta));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending > 0 || status.kind === "saving") return;
    setSubmitted(true);
    if (Object.keys(validateForm(form, baseline)).length > 0) {
      setStatus({ kind: "error", message: "Revisa los campos marcados." });
      setTab("form");
      focusFirstError();
      return;
    }

    setStatus({ kind: "saving" });
    const request = baseline
      ? { url: `/api/portfolios/${baseline.slug}`, method: "PATCH", body: toUpdatePayload(form, baseline) }
      : { url: "/api/portfolios", method: "POST", body: toCreatePayload(form) };
    let response: Response;
    try {
      response = await fetch(request.url, {
        method: request.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request.body),
      });
    } catch {
      setStatus({ kind: "error", message: "Sin conexión. Revisa tu internet e intenta de nuevo." });
      return;
    }
    if (response.status === 401) {
      router.replace(`/acceso?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      setServerErrors(issuesToErrors(data?.error?.issues));
      setStatus({ kind: "error", message: data?.error?.message ?? "No pudimos guardar. Intenta de nuevo." });
      setTab("form");
      focusFirstError();
      return;
    }

    if (!baseline) {
      try {
        sessionStorage.removeItem(MANUAL_PREFILL_KEY);
      } catch {
        // nada que limpiar
      }
      router.push(`/editar/${data.portfolio.slug}?creado=1`);
      return;
    }
    // Lo importado y las menciones no cambian al guardar: se conservan.
    setBaseline({
      ...baseline,
      revision: data.portfolio.revision,
      form: formFromPortfolio(data.resolved),
      manual: data.portfolio.manual,
      extras: extrasFromPortfolio(data.resolved),
    });
    setStatus({ kind: "saved" });
  }

  const saveLabel =
    status.kind === "saving"
      ? isEdit
        ? "Guardando…"
        : "Generando link…"
      : pending > 0
        ? "Esperando las fotos…"
        : isEdit
          ? "Guardar cambios"
          : "Generar link";

  return (
    <div className="mt-8">
      <div
        role="tablist"
        aria-label="Formulario o vista previa"
        className="sticky top-0 z-20 -mx-5 mb-6 flex gap-2 border-b border-line bg-sand px-5 py-2 sm:-mx-8 sm:px-8 lg:hidden"
      >
        {(["form", "preview"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`tab-${value}`}
            aria-selected={tab === value}
            aria-controls={`panel-${value}`}
            onClick={() => setTab(value)}
            className={`flex min-h-tap flex-1 items-center justify-center rounded-full text-sm transition ${
              tab === value ? "bg-ink text-cream" : "text-muted hover:text-ink"
            }`}
          >
            {value === "form" ? "Formulario" : "Vista previa"}
          </button>
        ))}
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-10">
        <form
          id="panel-form"
          role="tabpanel"
          aria-labelledby="tab-form"
          onSubmit={submit}
          noValidate
          className={tab === "form" ? "block" : "hidden lg:block"}
        >
          {/* Spec 12.8: barra de completitud, en vivo. */}
          <Completeness form={form} />
          <section aria-labelledby="seccion-datos" className="space-y-5">
            <h2 id="seccion-datos" className="title-2">
              Datos
            </h2>

            <Field id="campo-name" label="Nombre de la clienta" error={errors.name}>
              <input
                id="campo-name"
                value={form.name}
                onChange={(event) => edit({ name: event.target.value })}
                maxLength={LIMITS.name}
                autoComplete="off"
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={errors.name ? "campo-name-error" : undefined}
                className={textInput}
              />
            </Field>

            <Field id="campo-tagline" label="Tagline (opcional)">
              <input
                id="campo-tagline"
                value={form.tagline}
                onChange={(event) => edit({ tagline: event.target.value })}
                maxLength={LIMITS.tagline}
                autoComplete="off"
                placeholder="Marca personal para profesionales"
                aria-describedby="campo-tagline-hint"
                className={textInput}
              />
              <p id="campo-tagline-hint" className="mt-2 text-sm text-muted">
                Lo que va después del «|» en su Instagram. Va bajo su nombre en el portafolio.
              </p>
            </Field>

            <Field id="campo-bio" label="Bio (2 líneas)" error={errors.bio}>
              <textarea
                id="campo-bio"
                rows={2}
                value={form.bio}
                onChange={(event) => edit({ bio: event.target.value })}
                maxLength={LIMITS.bio}
                aria-invalid={errors.bio ? true : undefined}
                aria-describedby={errors.bio ? "campo-bio-error" : undefined}
                className={`${textInput} py-3`}
              />
            </Field>

            <div>
              <p className={fieldLabel}>Foto de perfil</p>
              <div className="mt-2 flex items-center gap-4">
                <Avatar photo={form.photo} name={form.name || "?"} />
                <div className="flex flex-wrap items-center gap-2">
                  <ImagePicker
                    label={form.photo ? "Cambiar foto" : "Subir foto"}
                    onUploaded={(photo) => edit({ photo })}
                    onPending={trackPending}
                  />
                  {form.photo && (
                    <button
                      type="button"
                      onClick={() => edit({ photo: null })}
                      className="flex min-h-tap items-center px-2 text-sm text-muted transition hover:text-ink"
                    >
                      Quitar
                    </button>
                  )}
                </div>
              </div>
            </div>

            <Field id="campo-valueProp" label="Propuesta de valor (1 frase)" error={errors.valueProp}>
              <textarea
                id="campo-valueProp"
                rows={2}
                value={form.valueProp}
                onChange={(event) => edit({ valueProp: event.target.value })}
                maxLength={LIMITS.valueProp}
                placeholder="Creo videos de skincare que se sienten reales y venden."
                aria-invalid={errors.valueProp ? true : undefined}
                aria-describedby={errors.valueProp ? "campo-valueProp-error" : undefined}
                className={`${textInput} py-3`}
              />
            </Field>
          </section>

          <section aria-labelledby="seccion-piezas" className="mt-12">
            <h2 id="seccion-piezas" className="title-2">
              Piezas
            </h2>
            <p className="mt-2 text-sm text-muted">
              Entre {LIMITS.minPieces} y {LIMITS.maxPieces}, en el orden en que se muestran. Cada una lleva una imagen o
              un link de video.
            </p>
            <div className="mt-5 space-y-4">
              {form.pieces.map((piece, index) => (
                <PieceEditor
                  key={piece.key}
                  piece={piece}
                  index={index}
                  total={form.pieces.length}
                  niches={form.niches}
                  errors={errors}
                  onChange={(patch) => editPiece(piece.key, patch)}
                  onMove={(direction) => movePiece(index, direction)}
                  onRemove={() => removePiece(piece.key)}
                  onPending={trackPending}
                />
              ))}
            </div>
            {errors.pieces && (
              <p data-error-focus tabIndex={-1} className={`${errorText} mt-4 outline-none`}>
                {errors.pieces}
              </p>
            )}
            <button
              type="button"
              onClick={addPiece}
              disabled={form.pieces.length >= LIMITS.maxPieces}
              className={`${pillButton} mt-4`}
            >
              {form.pieces.length >= LIMITS.maxPieces ? `Máximo ${LIMITS.maxPieces} piezas` : "Agregar pieza"}
            </button>
          </section>

          <section aria-labelledby="seccion-servicios" className="mt-12">
            <h2 id="seccion-servicios" className="title-2">
              Servicios
            </h2>
            <p className="mt-2 text-sm text-muted">
              Tus formas de colaborar con marcas, como tarjetas (hasta {LIMITS.maxServices}): un título y un link o una
              descripción. Ordénalas como quieras. Sin tarjetas, esa sección no aparece.
            </p>
            {form.services.length > 0 && (
              <ol className="mt-5 space-y-4">
                {form.services.map((service, index) => (
                  <ServiceEditor
                    key={service.key}
                    service={service}
                    index={index}
                    errors={errors}
                    onChange={(patch) => editService(service.key, patch)}
                    onRemove={() => removeService(service.key)}
                    onMove={(delta) => moveService(service.key, delta)}
                    total={form.services.length}
                  />
                ))}
              </ol>
            )}
            {errors.services && (
              <p data-error-focus tabIndex={-1} className={`${errorText} mt-4 outline-none`}>
                {errors.services}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={addService}
                disabled={form.services.length >= LIMITS.maxServices}
                className={pillButton}
              >
                {form.services.length >= LIMITS.maxServices ? `Máximo ${LIMITS.maxServices} servicios` : "Agregar servicio"}
              </button>
            </div>
          </section>

          {isEdit && (
            <section aria-labelledby="seccion-marcas" className="mt-12" data-editor-brands>
              <h2 id="seccion-marcas" className="title-2">
                Brand Partners
              </h2>
              <p className="mt-2 text-sm text-muted">
                Las marcas con las que trabajaste. Aparecen en tu Media kit, solo las que agregues aquí (hasta{" "}
                {LIMITS.maxBrandPartners}).
              </p>
              <div className="mt-5">
                <BrandPartnersField
                  partners={form.brandPartners}
                  setPartners={setBrandPartners}
                  detected={baseline?.mentions ?? []}
                  newKey={newPieceKey}
                  onPending={trackPending}
                  error={errors.brandPartners ?? null}
                  errors={errors}
                />
              </div>
            </section>
          )}

          {isEdit && imported.length > 0 && (
            <section aria-labelledby="seccion-casos" className="mt-12" data-editor-cases>
              <h2 id="seccion-casos" className="title-2">
                Case studies
              </h2>
              <p className="mt-2 mb-5 text-sm text-muted">
                Campañas que hiciste con marcas, sobre tus publicaciones importadas. Aparecen en tu Media kit.
              </p>
              <CaseStudiesField
                imported={imported}
                cases={form.caseStudies}
                setCases={setCaseStudies}
                brandNames={form.brandPartners.map((partner) => partner.name.trim()).filter(Boolean)}
                errors={errors}
                onPending={trackPending}
              />
              {errors.caseStudies && (
                <p data-error-focus tabIndex={-1} className={`${errorText} mt-4 outline-none`}>
                  {errors.caseStudies}
                </p>
              )}
            </section>
          )}

          <section aria-labelledby="seccion-contacto" className="mt-12 space-y-5">
            <h2 id="seccion-contacto" className="title-2">
              Contacto
            </h2>
            <p className="-mt-3 text-sm text-muted">Todo opcional. Aparece en el portafolio lo que llenes.</p>
            <div className="grid gap-5 sm:grid-cols-2">
              {CONTACT_KEYS.map((key) => {
                const field = CONTACT_FIELDS[key];
                const error = errors[`contact.${key}`];
                return (
                  <Field key={key} id={`campo-${key}`} label={field.label} error={error}>
                    <input
                      id={`campo-${key}`}
                      type={field.type ?? "text"}
                      inputMode={field.inputMode}
                      value={form.contact[key]}
                      onChange={(event) => editContact(key, event.target.value)}
                      placeholder={field.placeholder}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? `campo-${key}-error` : undefined}
                      className={textInput}
                    />
                  </Field>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="seccion-diseno" className="mt-12" data-testid="editor-design">
            <h2 id="seccion-diseno" className="title-2">
              Diseño
            </h2>
            <p className="mt-2 text-sm text-muted">
              Plantilla y paleta: cambian cómo se ve, nunca los datos. La vista previa se actualiza al instante.
            </p>
            <p className={`${fieldLabel} mt-5`}>Plantilla</p>
            <div className="mt-2">
              <TemplatePicker
                value={form.design.template}
                onChange={(template) => setDesign({ template })}
                palette={resolvePalette(form.design.palette, form.photo)}
                name="editor-plantilla"
              />
            </div>
            <p className={`${fieldLabel} mt-6`}>Paleta</p>
            <div className="mt-2">
              <PalettePicker
                value={form.design.palette}
                onChange={(palette) => setDesign({ palette })}
                photo={form.photo}
                name="editor-paleta"
              />
            </div>
          </section>

          <div
            data-sticky-actions
            className="sticky bottom-0 z-10 -mx-5 mt-10 border-t border-line bg-sand px-5 py-3 sm:-mx-8 sm:px-8 lg:mx-0 lg:rounded-card lg:border lg:px-5"
          >
            <div aria-live="polite" className="min-h-5 text-sm">
              {status.kind === "error" && <p className="text-accent-ink">{status.message}</p>}
              {status.kind === "saved" && <p className="text-success">Cambios guardados. El portafolio ya los muestra.</p>}
              {status.kind !== "error" && status.kind !== "saved" && pending > 0 && (
                <p className="text-muted">Esperando que terminen de subir las fotos.</p>
              )}
            </div>
            <button
              type="submit"
              disabled={pending > 0 || status.kind === "saving"}
              className={`${primaryButton} mt-2 w-full`}
            >
              {saveLabel}
            </button>
          </div>
        </form>

        <aside
          id="panel-preview"
          role="tabpanel"
          aria-labelledby="tab-preview"
          className={`${tab === "preview" ? "block" : "hidden lg:block"} lg:sticky lg:top-6`}
        >
          <p className="font-mono text-xs text-muted">vista previa</p>
          {/* Todo + cada nicho con piezas: lo mismo que filtran las píldoras del portafolio. */}
          {previewNiches.length > 0 && (
            <div role="group" aria-label="Ver el portafolio por nicho" className="mt-3 flex flex-wrap gap-2">
              {[null, ...previewNiches].map((niche) => {
                const active = activePreviewNiche === (niche?.slug ?? null);
                return (
                  <button
                    key={niche?.slug ?? "todo"}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPreviewNiche(niche?.slug ?? null)}
                    className={`flex min-h-tap items-center rounded-full border px-4 text-sm transition ${
                      active
                        ? "border-ink bg-highlight text-accent-ink"
                        : "border-line text-muted hover:border-ink hover:bg-sand hover:text-ink"
                    }`}
                  >
                    {niche?.label ?? "Todo"}
                  </button>
                );
              })}
            </div>
          )}
          <div className="mt-3 overflow-hidden rounded-card border border-line lg:max-h-[calc(100dvh-9rem)] lg:overflow-y-auto">
            <PublicPortfolio
              portfolio={preview}
              variant="preview"
              niche={activePreviewNiche}
              onNicheChange={setPreviewNiche}
              // Ajuste 7: al editar un portafolio generado, el lápiz del banner del hero.
              coverEdit={
                isEdit ? (
                  <CoverEditButton hasCover={form.cover !== null} onUploaded={(cover) => edit({ cover })} onPending={trackPending} />
                ) : undefined
              }
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={fieldLabel}>
        {label}
      </label>
      <div className="mt-2">{children}</div>
      {error && (
        <p id={`${id}-error`} className={`${errorText} mt-2`}>
          {error}
        </p>
      )}
    </div>
  );
}

function ServiceEditor({
  service,
  index,
  errors,
  onChange,
  onRemove,
  onMove,
  total,
}: {
  service: ServiceDraft;
  index: number;
  errors: FieldErrors;
  onChange: (patch: Partial<ServiceDraft>) => void;
  onRemove: () => void;
  onMove: (delta: -1 | 1) => void;
  total: number;
}) {
  const id = (field: string) => `servicio-${service.key}-${field}`;
  const titleError = errors[`services.${index}.title`];
  const descriptionError = errors[`services.${index}.description`];
  return (
    <li className="panel p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs text-muted">tarjeta {String(index + 1).padStart(2, "0")}</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label={`Subir la tarjeta ${index + 1}`}
            className="flex min-h-tap min-w-tap items-center justify-center rounded-full text-muted transition hover:text-ink disabled:opacity-40"
          >
            <span aria-hidden="true">↑</span>
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            aria-label={`Bajar la tarjeta ${index + 1}`}
            className="flex min-h-tap min-w-tap items-center justify-center rounded-full text-muted transition hover:text-ink disabled:opacity-40"
          >
            <span aria-hidden="true">↓</span>
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="flex min-h-tap items-center px-2 text-sm text-muted transition hover:text-ink"
          >
            Quitar<span className="sr-only"> la tarjeta {index + 1}</span>
          </button>
        </div>
      </div>
      <div className="mt-2 space-y-4">
        <Field id={id("title")} label="Título" error={titleError}>
          <input
            id={id("title")}
            value={service.title}
            onChange={(event) => onChange({ title: event.target.value })}
            maxLength={LIMITS.serviceTitle}
            placeholder="Videos UGC para anuncios"
            aria-invalid={titleError ? true : undefined}
            aria-describedby={titleError ? `${id("title")}-error` : undefined}
            className={textInput}
          />
        </Field>
        <Field id={id("description")} label="Link o descripción (opcional)" error={descriptionError}>
          <textarea
            id={id("description")}
            rows={2}
            value={service.description}
            onChange={(event) => onChange({ description: event.target.value })}
            maxLength={LIMITS.serviceDescription}
            placeholder="https://… o cuéntale a la marca qué incluye"
            aria-invalid={descriptionError ? true : undefined}
            aria-describedby={descriptionError ? `${id("description")}-error` : undefined}
            className={`${textInput} py-3`}
          />
        </Field>
      </div>
    </li>
  );
}
