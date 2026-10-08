"use client";

import { useId, type Dispatch, type SetStateAction } from "react";
import { CASE_METRIC_KEYS, CASE_METRIC_LABEL, type ImportedPost } from "@/lib/portfolio/case-studies";
import {
  BRAND_NAME_MAX,
  CAMPAIGN_MAX,
  CASE_STUDIES_MAX,
  metricNumber,
  metricsText,
  type CaseStudyDraft,
} from "@/lib/portfolio/media-kit-drafts";
import { errorText, fieldLabel, pillButton, textInput } from "../ui";
import { ImagePicker } from "./image-picker";

/*
 * Case studies en el editor (ronda 6 · 13.20). La creadora marca publicaciones importadas (sus últimos 12
 * contenidos) como casos de estudio y completa marca, campaña, miniatura y cifras.
 *
 * Nada se inventa: cada caso es una publicación real, y sus cifras arrancan con lo que mostró Instagram al importar.
 * Todo es editable (13.20); junto a cada cifra queda a la vista el dato real y un botón para volver a él. Una cifra
 * vacía no se muestra en el Media kit.
 */

type Props = {
  imported: readonly ImportedPost[];
  cases: CaseStudyDraft[];
  setCases: Dispatch<SetStateAction<CaseStudyDraft[]>>;
  /** Nombres de sus Brand partners: sugerencias para el campo "Marca". */
  brandNames: readonly string[];
  errors: Record<string, string>;
  onPending: (delta: 1 | -1) => void;
};

const number = new Intl.NumberFormat("es");

export function CaseStudiesField({ imported, cases, setCases, brandNames, errors, onPending }: Props) {
  const uid = useId();
  const byId = new Map(imported.map((post) => [post.id, post]));
  const marked = new Set(cases.map((item) => item.postId));
  const full = cases.length >= CASE_STUDIES_MAX;

  const update = (postId: string, patch: Partial<CaseStudyDraft>) =>
    setCases((current) => current.map((item) => (item.postId === postId ? { ...item, ...patch } : item)));

  const toggle = (post: ImportedPost) =>
    setCases((current) =>
      current.some((item) => item.postId === post.id)
        ? current.filter((item) => item.postId !== post.id)
        : current.length >= CASE_STUDIES_MAX
          ? current
          : [...current, { postId: post.id, brand: "", campaign: "", image: null, metrics: metricsText(post.metrics) }],
    );

  return (
    <div data-case-studies>
      <p className="text-sm text-muted">
        Toca una publicación para marcarla como caso de estudio (hasta {CASE_STUDIES_MAX}). Arranca con sus cifras
        reales de Instagram.
      </p>
      <ul className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {imported.map((post) => {
          const on = marked.has(post.id);
          return (
            <li key={post.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => toggle(post)}
                disabled={!on && full}
                className={`relative block aspect-[4/5] w-full overflow-hidden rounded-2xl border-2 bg-sand transition disabled:opacity-40 ${
                  on ? "border-ink" : "border-transparent hover:border-line"
                }`}
                data-case-pick={post.id}
              >
                {post.image && (
                  // eslint-disable-next-line @next/next/no-img-element -- miniatura que ya sirve /media
                  <img src={post.image.url} alt="" loading="lazy" className="size-full object-cover" />
                )}
                <span className="sr-only">
                  {on ? "Quitar de casos de estudio" : "Marcar como caso de estudio"}: {post.title}
                </span>
                {on && (
                  <span
                    aria-hidden="true"
                    className="absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-full bg-ink text-sm text-cream"
                  >
                    ✓
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <datalist id={`${uid}-marcas`}>
        {brandNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      {cases.length > 0 && (
        <ol className="mt-6 space-y-4">
          {cases.map((item, index) => {
            const post = byId.get(item.postId);
            if (!post) return null;
            const thumb = item.image ?? post.image;
            const id = (field: string) => `${uid}-${item.postId}-${field}`;
            const error = (field: string) => errors[`caseStudies.${index}.${field}`];
            return (
              <li key={item.postId} className="panel p-4 sm:p-5" data-case-study={item.postId}>
                <div className="flex gap-4">
                  <span className="block aspect-[4/5] w-20 shrink-0 overflow-hidden rounded-xl bg-sand">
                    {thumb && (
                      // eslint-disable-next-line @next/next/no-img-element -- miniatura que ya sirve /media
                      <img src={thumb.url} alt="" className="size-full object-cover" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs text-muted">caso {String(index + 1).padStart(2, "0")}</p>
                    <p className="mt-1 text-sm [overflow-wrap:anywhere]">{post.title}</p>
                    <a
                      href={post.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex min-h-tap items-center text-sm text-ink underline-offset-4 hover:underline"
                    >
                      Ver publicación<span className="sr-only"> (se abre en otra pestaña)</span>
                    </a>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor={id("marca")} className={fieldLabel}>
                      Marca
                    </label>
                    <input
                      id={id("marca")}
                      value={item.brand}
                      list={`${uid}-marcas`}
                      maxLength={BRAND_NAME_MAX}
                      onChange={(event) => update(item.postId, { brand: event.target.value })}
                      aria-invalid={error("brand") ? true : undefined}
                      aria-describedby={error("brand") ? `${id("marca")}-error` : undefined}
                      className={`${textInput} mt-2`}
                    />
                    {error("brand") && (
                      <p id={`${id("marca")}-error`} className={`${errorText} mt-2`}>
                        {error("brand")}
                      </p>
                    )}
                  </div>
                  <div>
                    <label htmlFor={id("campana")} className={fieldLabel}>
                      Campaña <span className="font-normal text-muted">(opcional)</span>
                    </label>
                    <input
                      id={id("campana")}
                      value={item.campaign}
                      maxLength={CAMPAIGN_MAX}
                      onChange={(event) => update(item.postId, { campaign: event.target.value })}
                      placeholder="Lanzamiento de verano"
                      aria-invalid={error("campaign") ? true : undefined}
                      className={`${textInput} mt-2`}
                    />
                    {error("campaign") && <p className={`${errorText} mt-2`}>{error("campaign")}</p>}
                  </div>
                </div>

                <p className={`${fieldLabel} mt-5`}>Miniatura</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <ImagePicker
                    label="Cambiar miniatura"
                    onUploaded={(image) => update(item.postId, { image })}
                    onPending={onPending}
                  />
                  {item.image && (
                    <button
                      type="button"
                      onClick={() => update(item.postId, { image: null })}
                      className="flex min-h-tap items-center px-2 text-sm text-muted transition hover:text-ink"
                    >
                      Usar la de la publicación
                    </button>
                  )}
                </div>

                <fieldset className="mt-5">
                  <legend className={fieldLabel}>Métricas</legend>
                  <div className="mt-2 grid gap-3 sm:grid-cols-3">
                    {CASE_METRIC_KEYS.map((key) => {
                      const real = post.metrics[key];
                      const current = metricNumber(item.metrics[key]);
                      const metricError = error(`metrics.${key}`);
                      return (
                        <div key={key}>
                          <label htmlFor={id(key)} className="text-sm font-semibold">
                            {CASE_METRIC_LABEL[key]}
                          </label>
                          <input
                            id={id(key)}
                            value={item.metrics[key]}
                            inputMode="numeric"
                            onChange={(event) =>
                              update(item.postId, { metrics: { ...item.metrics, [key]: event.target.value.replace(/[^\d.]/g, "") } })
                            }
                            placeholder="Sin mostrar"
                            aria-invalid={metricError ? true : undefined}
                            aria-describedby={`${id(key)}-real`}
                            className={`${textInput} mt-1`}
                          />
                          <p id={`${id(key)}-real`} className="mt-1 text-xs text-muted">
                            {real === null ? "Instagram no lo muestra." : `Dato real: ${number.format(real)}`}
                          </p>
                          {real !== null && current !== real && (
                            <button
                              type="button"
                              onClick={() => update(item.postId, { metrics: { ...item.metrics, [key]: String(real) } })}
                              className="flex min-h-tap items-center text-xs font-semibold text-ink underline-offset-4 hover:underline"
                            >
                              Usar el dato real
                            </button>
                          )}
                          {metricError && <p className={`${errorText} mt-1`}>{metricError}</p>}
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-xs text-muted">Deja una cifra vacía para no mostrarla.</p>
                </fieldset>

                <button type="button" onClick={() => toggle(post)} className={`${pillButton} mt-5`}>
                  Quitar caso<span className="sr-only"> {index + 1}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
