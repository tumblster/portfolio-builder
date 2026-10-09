"use client";

import { useId } from "react";

/*
 * Paso "Servicios" de /crear (spec 11.12): va ANTES de generar. Tarjetas tipo Linktree, con un título y un link o
 * una descripción. Se agregan, se quitan y se reordenan (↑ ↓). Si el segundo campo es un link, el portafolio lo
 * muestra como link. Los servicios son opcionales: si no elige ni escribe ninguno, el portafolio se genera sin
 * ellos (la sección se oculta).
 *
 * Ronda 6 · 13.6: el paso llega con SUGERENCIAS de la IA (máximo 2), sacadas de sus captions y de las marcas que
 * menciona (lib/ai/groq.ts). Se ven como chips, igual que las marcas mencionadas: tocar uno lo suma como servicio
 * confirmado. E2 del dueño: las sugerencias sin tocar no hacen nada (se descartan en silencio al generar, sin
 * avisos) y nunca se publica un servicio que ella no confirmó.
 */

export type ServiceCard = {
  key: string;
  title: string;
  description: string;
  /** Ronda 6 · 13.6: la propuso la IA y la creadora todavía no la tocó. No se publica hasta que la use. */
  suggested?: boolean;
};
/** Los mismos topes que el servidor (LIMITS en lib/portfolio/schema.ts). */
export const SERVICE_TITLE_MAX = 40;
export const SERVICE_TEXT_MAX = 120;
/** LIMITS.maxServices: el servidor no acepta más (antes el paso dejaba llegar a 6 tarjetas y el envío fallaba). */
export const SERVICES_MAX = 4;
/** E2 del dueño: la IA sugiere como máximo 2 servicios (el resto lo escribe ella). */
export const SUGGESTED_SERVICES_MAX = 2;

/** Con qué arranca el paso: las sugerencias de la IA (máximo 2, por tocar) + una cajita vacía para escribir. */
export function initialServiceCards(suggestions: readonly { title: string; description: string }[]): ServiceCard[] {
  const chips = suggestions
    .filter((suggestion) => suggestion.title.trim())
    .slice(0, SUGGESTED_SERVICES_MAX)
    .map(
      (suggestion, index): ServiceCard => ({
        key: `sug-${index + 1}`,
        title: suggestion.title.trim().slice(0, SERVICE_TITLE_MAX),
        description: suggestion.description.trim().slice(0, SERVICE_TEXT_MAX),
        suggested: true,
      }),
    );
  return [...chips, { key: "s-1", title: "", description: "" }];
}

/** Cuántas sugerencias quedan sin tocar. */
export const pendingSuggestions = (cards: readonly ServiceCard[]) => cards.filter((card) => card.suggested).length;

export function ServicesStep({
  cards,
  onChange,
  newKey,
  error,
  brands = [],
}: {
  cards: ServiceCard[];
  onChange: (cards: ServiceCard[]) => void;
  newKey: () => string;
  error: string | null;
  /** 13.6: las @cuentas que menciona en sus captions, como contexto de las sugerencias. */
  brands?: readonly string[];
}) {
  const uid = useId();
  const suggestions = cards.filter((card) => card.suggested);
  const manual = cards.filter((card) => !card.suggested);
  const pending = suggestions.length;
  const update = (key: string, patch: Partial<ServiceCard>) => onChange(cards.map((card) => (card.key === key ? { ...card, ...patch } : card)));
  /** Tocar una sugerencia la suma como servicio confirmado (aparece en las cajitas de abajo). */
  const confirmSuggestion = (key: string) => update(key, { suggested: false });
  const move = (key: string, delta: -1 | 1) => {
    const index = manual.findIndex((card) => card.key === key);
    const to = index + delta;
    if (index < 0 || to < 0 || to >= manual.length) return;
    const nextManual = [...manual];
    [nextManual[index], nextManual[to]] = [nextManual[to], nextManual[index]];
    onChange([...suggestions, ...nextManual]);
  };
  // Quitar la última cajita deja una vacía: siempre hay al menos una para escribir.
  const remove = (key: string) => {
    const nextManual = manual.filter((card) => card.key !== key);
    onChange([...suggestions, ...(nextManual.length > 0 ? nextManual : [{ key: newKey(), title: "", description: "" }])]);
  };
  const shownBrands = brands.slice(0, 4).map((brand) => `@${brand}`);

  return (
    <div data-services-step>
      {pending > 0 && (
        <div className="mb-6 rounded-2xl border border-line bg-cream p-4 sm:p-5" data-services-suggestions>
          <p className="text-sm leading-relaxed text-ink">
            <span className="font-semibold">{pending === 1 ? "1 sugerencia por revisar." : `${pending} sugerencias por revisar.`}</span>{" "}
            Las armamos a partir de sus publicaciones
            {shownBrands.length > 0
              ? ` y de las marcas que menciona (${shownBrands.join(", ")}${brands.length > shownBrands.length ? "…" : ""})`
              : ""}
            . Toca las que quieras sumar.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <li key={suggestion.key}>
                <button
                  type="button"
                  onClick={() => confirmSuggestion(suggestion.key)}
                  className="inline-flex min-h-tap items-center gap-1.5 rounded-full border border-ink/60 bg-paper px-4 text-sm font-semibold text-ink hover:bg-highlight"
                  data-service-suggestion={suggestion.title}
                >
                  <span aria-hidden="true">+</span>
                  {suggestion.title}
                  <span className="sr-only">: agregar como servicio</span>
                </button>
              </li>
            ))}
          </ul>
          {pending > 1 && (
            <button
              type="button"
              onClick={() => onChange(cards.map((card) => (card.suggested ? { ...card, suggested: false } : card)))}
              className="mt-3 inline-flex min-h-tap items-center rounded-full border border-ink bg-paper px-5 text-sm font-semibold text-ink hover:bg-highlight"
              data-services-use-all
            >
              Usar todas
            </button>
          )}
        </div>
      )}
      <ol className="space-y-4">
        {manual.map((card, index) => (
          <li key={card.key} className="rounded-card border border-line bg-paper p-4 sm:p-5" data-service-card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono text-xs text-muted">tarjeta {String(index + 1).padStart(2, "0")}</p>
              <div className="flex flex-wrap items-center gap-1">
                <button type="button" onClick={() => move(card.key, -1)} disabled={index === 0} aria-label={`Subir la tarjeta ${index + 1}`} className="flex min-h-tap min-w-tap items-center justify-center rounded-full text-muted hover:text-ink disabled:opacity-40">
                  <span aria-hidden="true">↑</span>
                </button>
                <button type="button" onClick={() => move(card.key, 1)} disabled={index === manual.length - 1} aria-label={`Bajar la tarjeta ${index + 1}`} className="flex min-h-tap min-w-tap items-center justify-center rounded-full text-muted hover:text-ink disabled:opacity-40">
                  <span aria-hidden="true">↓</span>
                </button>
                <button
                  type="button"
                  onClick={() => remove(card.key)}
                  disabled={manual.length === 1 && !card.title.trim() && !card.description.trim()}
                  className="flex min-h-tap items-center px-2 text-sm text-muted hover:text-ink disabled:opacity-40"
                >
                  Quitar<span className="sr-only"> la tarjeta {index + 1}</span>
                </button>
              </div>
            </div>
            <label htmlFor={`${uid}-${card.key}-t`} className="mt-2 block text-sm font-semibold">
              Título
            </label>
            <input
              id={`${uid}-${card.key}-t`}
              value={card.title}
              maxLength={SERVICE_TITLE_MAX}
              onChange={(event) => update(card.key, { title: event.target.value })}
              placeholder="Videos UGC para anuncios"
              className="mt-1 block min-h-13 w-full rounded-2xl border border-ink/60 bg-paper px-4"
            />
            <label htmlFor={`${uid}-${card.key}-d`} className="mt-3 block text-sm font-semibold">
              Link o descripción <span className="font-normal text-muted">(opcional)</span>
            </label>
            <input
              id={`${uid}-${card.key}-d`}
              value={card.description}
              maxLength={SERVICE_TEXT_MAX}
              onChange={(event) => update(card.key, { description: event.target.value })}
              placeholder="https://… o qué incluye"
              className="mt-1 block min-h-13 w-full rounded-2xl border border-ink/60 bg-paper px-4"
            />
          </li>
        ))}
      </ol>
      {error && (
        <p role="alert" className="mt-3 text-sm font-semibold text-accent-ink" data-services-error>
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={() => onChange([...cards, { key: newKey(), title: "", description: "" }])}
        disabled={cards.length >= SERVICES_MAX}
        className="mt-4 inline-flex min-h-tap items-center rounded-full border border-ink/60 bg-paper px-5 text-sm font-semibold disabled:opacity-40"
      >
        {cards.length >= SERVICES_MAX ? `Máximo ${SERVICES_MAX} tarjetas` : "Agregar tarjeta"}
      </button>
    </div>
  );
}
