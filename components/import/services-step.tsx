"use client";

import { useId } from "react";

/*
 * Paso "Servicios" de /crear (spec 11.12): va ANTES de generar y es obligatorio (mínimo 1 tarjeta). Nada de servicios
 * inventados por la IA: tarjetas propias, tipo Linktree, con un título y un link o una descripción. Se agregan, se
 * quitan y se reordenan (↑ ↓). Si el segundo campo es un link, el portafolio lo muestra como link.
 */

export type ServiceCard = { key: string; title: string; description: string };
export const SERVICE_TITLE_MAX = 40;
export const SERVICE_TEXT_MAX = 120;
export const SERVICES_MAX = 6;

export function ServicesStep({
  cards,
  onChange,
  newKey,
  error,
}: {
  cards: ServiceCard[];
  onChange: (cards: ServiceCard[]) => void;
  newKey: () => string;
  error: string | null;
}) {
  const uid = useId();
  const update = (key: string, patch: Partial<ServiceCard>) => onChange(cards.map((card) => (card.key === key ? { ...card, ...patch } : card)));
  const move = (index: number, delta: -1 | 1) => {
    const to = index + delta;
    if (to < 0 || to >= cards.length) return;
    const next = [...cards];
    [next[index], next[to]] = [next[to], next[index]];
    onChange(next);
  };
  return (
    <div data-services-step>
      <ol className="space-y-4">
        {cards.map((card, index) => (
          <li key={card.key} className="rounded-card border border-line bg-paper p-4 sm:p-5" data-service-card>
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-xs text-muted">tarjeta {String(index + 1).padStart(2, "0")}</p>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Subir la tarjeta ${index + 1}`} className="flex min-h-tap min-w-tap items-center justify-center rounded-full text-muted hover:text-ink disabled:opacity-40">
                  <span aria-hidden="true">↑</span>
                </button>
                <button type="button" onClick={() => move(index, 1)} disabled={index === cards.length - 1} aria-label={`Bajar la tarjeta ${index + 1}`} className="flex min-h-tap min-w-tap items-center justify-center rounded-full text-muted hover:text-ink disabled:opacity-40">
                  <span aria-hidden="true">↓</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChange(cards.filter((item) => item.key !== card.key))}
                  disabled={cards.length === 1}
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
