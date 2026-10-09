"use client";

import { useId } from "react";

/*
 * Paso "Servicios" de /crear (spec 11.12): va ANTES de generar y es obligatorio (mínimo 1 tarjeta). Tarjetas tipo
 * Linktree, con un título y un link o una descripción. Se agregan, se quitan y se reordenan (↑ ↓). Si el segundo
 * campo es un link, el portafolio lo muestra como link.
 *
 * Ronda 6 · 13.6: el paso llega con SUGERENCIAS de la IA, sacadas de sus captions y de las marcas que menciona
 * (lib/ai/groq.ts). Cada sugerencia se ve como tal (borde punteado, "Sugerencia") y la creadora decide: «Usar»,
 * editarla (al tocar su texto queda confirmada) o «Quitar»; «Usar todas» confirma las que quedan. E2 del dueño:
 * las sugerencias sin revisar no bloquean: se descartan al generar (con toast) y solo viajan las tarjetas
 * confirmadas: nunca se publica un servicio que ella no confirmó.
 */

export type ServiceCard = {
  key: string;
  title: string;
  description: string;
  /** Ronda 6 · 13.6: la propuso la IA y la creadora todavía no la revisó. No se publica hasta que la use o la edite. */
  suggested?: boolean;
};
/** Los mismos topes que el servidor (LIMITS en lib/portfolio/schema.ts). */
export const SERVICE_TITLE_MAX = 40;
export const SERVICE_TEXT_MAX = 120;
/** LIMITS.maxServices: el servidor no acepta más (antes el paso dejaba llegar a 6 tarjetas y el envío fallaba). */
export const SERVICES_MAX = 4;

/** Tarjetas con las que arranca el paso: las sugerencias de la IA (por revisar) o, si no hay, una vacía. */
export function initialServiceCards(suggestions: readonly { title: string; description: string }[]): ServiceCard[] {
  const cards = suggestions
    .filter((suggestion) => suggestion.title.trim())
    .slice(0, SERVICES_MAX)
    .map(
      (suggestion, index): ServiceCard => ({
        key: `sug-${index + 1}`,
        title: suggestion.title.trim().slice(0, SERVICE_TITLE_MAX),
        description: suggestion.description.trim().slice(0, SERVICE_TEXT_MAX),
        suggested: true,
      }),
    );
  return cards.length > 0 ? cards : [{ key: "s-1", title: "", description: "" }];
}

/** Cuántas sugerencias quedan sin revisar. */
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
  const pending = pendingSuggestions(cards);
  const update = (key: string, patch: Partial<ServiceCard>) => onChange(cards.map((card) => (card.key === key ? { ...card, ...patch } : card)));
  const move = (index: number, delta: -1 | 1) => {
    const to = index + delta;
    if (to < 0 || to >= cards.length) return;
    const next = [...cards];
    [next[index], next[to]] = [next[to], next[index]];
    onChange(next);
  };
  // Quitar la última tarjeta deja una vacía: siempre hay al menos una para escribir.
  const remove = (key: string) => {
    const next = cards.filter((card) => card.key !== key);
    onChange(next.length > 0 ? next : [{ key: newKey(), title: "", description: "" }]);
  };
  const shownBrands = brands.slice(0, 4).map((brand) => `@${brand}`);

  return (
    <div data-services-step>
      {pending > 0 && (
        <div className="mb-5 rounded-2xl border border-line bg-cream p-4 sm:p-5" data-services-suggestions>
          <p className="text-sm leading-relaxed text-ink">
            <span className="font-semibold">{pending === 1 ? "1 sugerencia por revisar." : `${pending} sugerencias por revisar.`}</span>{" "}
            Las armamos a partir de sus publicaciones
            {shownBrands.length > 0
              ? ` y de las marcas que menciona (${shownBrands.join(", ")}${brands.length > shownBrands.length ? "…" : ""})`
              : ""}
            . Úsalas, edítalas o quítalas: solo se publica lo que confirmes.
          </p>
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
        {cards.map((card, index) => (
          <li
            key={card.key}
            className={`rounded-card border p-4 sm:p-5 ${card.suggested ? "border-dashed border-ink/50 bg-cream" : "border-line bg-paper"}`}
            data-service-card
            data-service-suggested={card.suggested ? "" : undefined}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 font-mono text-xs text-muted">
                tarjeta {String(index + 1).padStart(2, "0")}
                {card.suggested && (
                  <span className="rounded-full border border-accent-ink px-2 py-0.5 font-sans text-xs font-semibold text-accent-ink">
                    Sugerencia
                  </span>
                )}
              </p>
              <div className="flex flex-wrap items-center gap-1">
                {card.suggested && (
                  <button
                    type="button"
                    onClick={() => update(card.key, { suggested: false })}
                    className="inline-flex min-h-tap items-center rounded-full bg-ink px-4 text-sm font-semibold text-cream"
                    data-service-use
                  >
                    Usar<span className="sr-only"> la tarjeta {index + 1}</span>
                  </button>
                )}
                <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Subir la tarjeta ${index + 1}`} className="flex min-h-tap min-w-tap items-center justify-center rounded-full text-muted hover:text-ink disabled:opacity-40">
                  <span aria-hidden="true">↑</span>
                </button>
                <button type="button" onClick={() => move(index, 1)} disabled={index === cards.length - 1} aria-label={`Bajar la tarjeta ${index + 1}`} className="flex min-h-tap min-w-tap items-center justify-center rounded-full text-muted hover:text-ink disabled:opacity-40">
                  <span aria-hidden="true">↓</span>
                </button>
                <button
                  type="button"
                  onClick={() => remove(card.key)}
                  disabled={cards.length === 1 && !card.suggested}
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
              onChange={(event) => update(card.key, { title: event.target.value, suggested: false })}
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
              onChange={(event) => update(card.key, { description: event.target.value, suggested: false })}
              placeholder="https://… o qué incluye"
              className="mt-1 block min-h-13 w-full rounded-2xl border border-ink/60 bg-paper px-4"
            />
            {card.suggested && <p className="mt-3 text-xs text-muted">Si la editas, queda confirmada.</p>}
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
