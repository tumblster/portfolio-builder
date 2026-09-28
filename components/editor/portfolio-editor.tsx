"use client";

import { useRouter } from "next/navigation";
import { useDeferredValue, useMemo, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { MANUAL_PREFILL_KEY, type ManualPrefill } from "@/lib/import/events";
import { NICHES, NICHE_LABELS, type Niche } from "@/lib/portfolio/niches";
import { LIMITS } from "@/lib/portfolio/schema";
import { Avatar } from "../avatar";
import { PublicPortfolio } from "../public-portfolio";
import { errorText, fieldLabel, pillButton, primaryButton, textInput } from "../ui";
import {
  CONTACT_KEYS,
  emptyForm,
  emptyPiece,
  formFromPortfolio,
  formFromPrefill,
  issuesToErrors,
  toCreatePayload,
  toPreview,
  toUpdatePayload,
  validateForm,
  type Baseline,
  type ContactKey,
  type FieldErrors,
  type FormState,
  type PieceDraft,
} from "./form-model";
import { ImagePicker } from "./image-picker";
import { PieceEditor } from "./piece-editor";

/*
 * Formulario del portafolio (RF-01, RF-02) con vista previa en vivo.
 * Crear: fallback "Prefiero llenarlo manual", con lo que haya dejado la importación.
 * Editar: cualquier portafolio, también los importados de Instagram.
 * Móvil: pestañas Formulario / Vista previa. Escritorio: formulario a la izquierda, vista a la derecha.
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
  const [previewNiche, setPreviewNiche] = useState<Niche | null>(null);
  const isEdit = baseline !== null;

  // Tras el primer intento de guardar, los errores se recalculan mientras se corrige.
  const clientErrors = useMemo(() => (submitted ? validateForm(form, baseline) : {}), [submitted, form, baseline]);
  const errors: FieldErrors = { ...serverErrors, ...clientErrors };

  // La vista previa se actualiza en cada tecla sin trabar lo que se escribe (RF-01: < 1 s).
  const deferredForm = useDeferredValue(form);
  const preview = useMemo(() => toPreview(deferredForm), [deferredForm]);

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
  function addPiece() {
    setForm((current) =>
      current.pieces.length >= LIMITS.maxPieces ? current : { ...current, pieces: [...current.pieces, emptyPiece()] },
    );
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
    setBaseline({
      slug: baseline.slug,
      revision: data.portfolio.revision,
      form: formFromPortfolio(data.resolved),
      manual: data.portfolio.manual,
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
        className="sticky top-0 z-20 -mx-5 mb-6 flex gap-2 border-b border-line bg-ink px-5 py-2 sm:-mx-8 sm:px-8 lg:hidden"
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
              tab === value ? "bg-violet text-white" : "text-muted hover:text-white"
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
          <section aria-labelledby="seccion-datos" className="space-y-5">
            <h2 id="seccion-datos" className="text-3xl">
              datos.
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
                      className="flex min-h-tap items-center px-2 text-sm text-muted transition hover:text-white"
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
            <h2 id="seccion-piezas" className="text-3xl">
              piezas.
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

          <section aria-labelledby="seccion-contacto" className="mt-12 space-y-5">
            <h2 id="seccion-contacto" className="text-3xl">
              contacto.
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

          <div
            data-sticky-actions
            className="sticky bottom-0 z-10 -mx-5 mt-10 border-t border-line bg-ink px-5 py-3 sm:-mx-8 sm:px-8 lg:mx-0 lg:rounded-card lg:border lg:px-5"
          >
            <div aria-live="polite" className="min-h-5 text-sm">
              {status.kind === "error" && <p className="text-fuchsia">{status.message}</p>}
              {status.kind === "saved" && <p className="text-lilac">Cambios guardados. El portafolio ya los muestra.</p>}
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
          {/* RF-04: la misma página en su versión general o en la de cada nicho, al instante. */}
          <div role="group" aria-label="Versión del portafolio" className="mt-3 flex flex-wrap gap-2">
            {[null, ...NICHES].map((niche) => {
              const active = previewNiche === niche;
              return (
                <button
                  key={niche ?? "general"}
                  type="button"
                  aria-pressed={active}
                  data-niche={niche ?? undefined}
                  onClick={() => setPreviewNiche(niche)}
                  className={`flex min-h-tap items-center rounded-full border px-4 text-sm transition ${
                    active
                      ? "border-accent bg-accent/15 text-accent-soft"
                      : "border-line text-muted hover:border-white hover:bg-white hover:text-ink"
                  }`}
                >
                  {niche ? NICHE_LABELS[niche] : "General"}
                </button>
              );
            })}
          </div>
          <div className="mt-3 overflow-hidden rounded-card border border-line lg:max-h-[calc(100dvh-9rem)] lg:overflow-y-auto">
            <PublicPortfolio portfolio={preview} variant="preview" niche={previewNiche} />
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
