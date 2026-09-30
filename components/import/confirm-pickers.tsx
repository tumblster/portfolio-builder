"use client";

import Image from "next/image";
import { useId, useRef, useState } from "react";
import { ChipList } from "@/components/chips/chip-list";
import { Combobox, type ComboOption } from "@/components/chips/combobox";
import type { DraftPiece } from "@/lib/import/events";
import { MAX_NICHES, nicheFromLabel } from "@/lib/portfolio/niches";
import { NICHE_TAXONOMY, foldText } from "@/lib/portfolio/niche-taxonomy";
import { InlineReel } from "@/components/reel/inline-reel";

/*
 * Pantalla "Confirma sus nichos y sus piezas" (ronda 30/09 · 7.1): dos selectores con chips.
 * - Nichos: chips precargados con lo que sugirió la IA + un campo con autocompletado sobre la taxonomía (y lo que
 *   sugirió la IA). Hasta 3. Se puede agregar uno propio ("Agregar «…»"), validado igual que siempre.
 * - Piezas: chips precargados con las que eligió la IA (con miniatura y su nicho) + autocompletado por título +
 *   "De tu perfil": la grilla de todas sus publicaciones importadas con un + en cada una.
 * En los dos: × para quitar, asa y Alt + flechas para ordenar, Backspace con el campo vacío quita el último. El
 * foco vuelve al campo al quitar. El orden es el de elección: nunca se reordena solo.
 */

export type NicheChip = { key: string; label: string };
export type PieceChip = { id: string; nicheKey: string | null };

export function Thumb({ piece, size = 48 }: { piece: DraftPiece; size?: number }) {
  return piece.image ? (
    <Image
      src={piece.image.url}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-lg object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <span aria-hidden="true" className="shrink-0 rounded-lg bg-sand" style={{ width: size, height: size }} />
  );
}

const move = <T,>(list: T[], from: number, to: number) => {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

export function NichePicker(props: {
  niches: NicheChip[];
  onChange: (niches: NicheChip[]) => void;
  /** Lo que sugirió la IA para este perfil: va primero en las sugerencias. */
  suggested: string[];
  error: string | null;
  onError: (message: string | null) => void;
  newKey: () => string;
}) {
  const { niches, onChange, onError } = props;
  const uid = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const otherRef = useRef<HTMLInputElement>(null);
  // "Otro" (ajuste 4): habilita un cuadro de texto al lado del selector para escribir un nicho propio.
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherText, setOtherText] = useState("");
  const full = niches.length >= MAX_NICHES;
  const taken = new Set(niches.map((niche) => nicheFromLabel(niche.label)?.slug));
  const seen = new Set<string>();
  // Los nichos listados en orden alfabético (ajuste 4): la taxonomía y lo que sugirió la IA, juntos.
  const options: ComboOption[] = [...props.suggested, ...NICHE_TAXONOMY]
    .flatMap((label) => {
      const slug = nicheFromLabel(label)?.slug;
      const folded = foldText(label);
      if (!slug || taken.has(slug) || seen.has(folded)) return [];
      seen.add(folded);
      return [{ id: slug, label }];
    })
    .sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));

  function add(label: string): boolean {
    const niche = nicheFromLabel(label);
    const fail = (message: string) => {
      onError(message);
      return false;
    };
    if (!niche) return fail('Ese nombre no sirve para un link: usa letras o números (y no "Todo").');
    if (taken.has(niche.slug)) return fail(`Ya elegiste «${niche.label}».`);
    if (full) return fail(`Puedes tener hasta ${MAX_NICHES} nichos: quita uno para agregar otro.`);
    onError(null);
    onChange([...niches, { key: props.newKey(), label: niche.label }]);
    return true;
  }

  function openOther() {
    setOtherOpen(true);
    requestAnimationFrame(() => otherRef.current?.focus());
  }
  function closeOther(focusSelector: boolean) {
    setOtherOpen(false);
    setOtherText("");
    if (focusSelector) requestAnimationFrame(() => inputRef.current?.focus());
  }
  function addOther() {
    if (!otherText.trim()) return otherRef.current?.focus();
    if (add(otherText)) closeOther(true);
  }

  return (
    <div data-picker="niches">
      <h3 id={`${uid}-label`} className="text-base font-semibold">
        Nichos{" "}
        <span className="text-sm font-normal text-muted">
          ({niches.length} de {MAX_NICHES})
        </span>
      </h3>
      <p id={`${uid}-help`} className="mt-1 text-sm text-muted">
        Con esto se arman las píldoras y un link por nicho. Escribe para buscar; Enter agrega y puedes seguir.
      </p>
      <div className="mt-3">
        <ChipList
          label="Nichos elegidos"
          items={niches}
          getKey={(niche) => niche.key}
          getLabel={(niche) => niche.label}
          renderContent={(niche) => <span className="px-1">{niche.label}</span>}
          onMove={(from, to) => onChange(move(niches, from, to))}
          onRemove={(index) => {
            onError(null);
            onChange(niches.filter((_, position) => position !== index));
          }}
          onAfterRemove={() => requestAnimationFrame(() => inputRef.current?.focus())}
          layout="wrap"
          idPrefix={`${uid}-niche`}
          emptyText="Sin nichos: todo va en un solo portafolio. Agrega hasta 3 si quieres links por nicho."
        />
      </div>
      <div className={`mt-3 ${otherOpen && !full ? "grid grid-cols-2 items-start gap-2" : ""}`} data-niche-row>
        <Combobox
          inputRef={inputRef}
          labelId={`${uid}-label`}
          describedBy={`${uid}-help${full ? ` ${uid}-full` : ""}`}
          options={options}
          pinnedOption={{ id: "__otro", label: "Otro" }}
          onSelect={(option) => (option.id === "__otro" ? openOther() : add(option.label))}
          onCreate={add}
          onBackspaceEmpty={() => niches.length > 0 && onChange(niches.slice(0, -1))}
          placeholder={full ? "Ya tienes 3 nichos" : "Busca un nicho (ej.: Fitness)"}
          disabled={full}
        />
        {otherOpen && !full && (
          <div className="flex min-w-0 gap-2" data-niche-other>
            <input
              ref={otherRef}
              type="text"
              value={otherText}
              maxLength={24}
              aria-label="Tu nicho (Otro)"
              placeholder="Escribe tu nicho"
              onChange={(event) => setOtherText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addOther();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  closeOther(true);
                }
              }}
              className="combo__input min-w-0 flex-1"
            />
            <button
              type="button"
              onClick={addOther}
              className="inline-flex min-h-13 shrink-0 items-center rounded-2xl border border-ink bg-ink px-3 text-sm font-semibold text-cream"
            >
              Agregar
            </button>
          </div>
        )}
        {full && (
          <p id={`${uid}-full`} className="mt-2 text-sm text-muted">
            Máximo {MAX_NICHES} nichos: quita uno para agregar otro.
          </p>
        )}
      </div>
      {props.error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-accent-ink" data-niche-error>
          {props.error}
        </p>
      )}
    </div>
  );
}

export function PiecePicker(props: {
  pieces: PieceChip[];
  onChange: (pieces: PieceChip[]) => void;
  /** Todas las piezas elegibles, las de la IA primero. */
  pool: DraftPiece[];
  niches: NicheChip[];
  limits: { min: number; max: number };
  error: string | null;
  onError: (message: string | null) => void;
}) {
  const { pieces, onChange, onError, limits } = props;
  const uid = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const byId = new Map(props.pool.map((piece) => [piece.id, piece]));
  const chosen = new Set(pieces.map((piece) => piece.id));
  const full = pieces.length >= limits.max;
  const titleOf = (id: string) => byId.get(id)?.title ?? "Pieza";

  function add(id: string) {
    if (chosen.has(id)) return;
    if (full) return onError(`Puedes elegir hasta ${limits.max} piezas: quita una para sumar otra.`);
    onError(null);
    onChange([...pieces, { id, nicheKey: null }]);
  }

  const options: ComboOption[] = props.pool
    .filter((piece) => !chosen.has(piece.id))
    .map((piece) => ({ id: piece.id, label: piece.title, thumb: <Thumb piece={piece} size={36} /> }));

  return (
    <div data-picker="pieces">
      <h3 id={`${uid}-label`} className="text-base font-semibold">
        Piezas{" "}
        <span className="text-sm font-normal text-muted">
          ({pieces.length} de {limits.max} · mínimo {limits.min})
        </span>
      </h3>
      <p id={`${uid}-help`} className="mt-1 text-sm text-muted">
        Van en este orden en el portafolio. Cambia el nicho de cada una o súmale piezas de su perfil.
      </p>
      <div className="mt-3">
        <ChipList
          label="Piezas elegidas"
          items={pieces}
          getKey={(piece) => piece.id}
          getLabel={(piece) => titleOf(piece.id)}
          renderContent={(chip) => {
            const piece = byId.get(chip.id);
            return (
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2 py-0.5">
                {piece && <Thumb piece={piece} />}
                <span className="line-clamp-2 min-w-[7rem] flex-1 text-sm break-words">{titleOf(chip.id)}</span>
                <select
                  aria-label={`Nicho de «${titleOf(chip.id)}»`}
                  value={chip.nicheKey ?? ""}
                  onChange={(event) =>
                    onChange(pieces.map((item) => (item.id === chip.id ? { ...item, nicheKey: event.target.value || null } : item)))
                  }
                  className="min-h-tap w-full rounded-field border border-ink/60 bg-paper px-3 text-sm sm:w-40"
                >
                  <option value="">Solo en «Todo»</option>
                  {props.niches.map((niche) => (
                    <option key={niche.key} value={niche.key}>
                      {niche.label}
                    </option>
                  ))}
                </select>
              </span>
            );
          }}
          onMove={(from, to) => onChange(move(pieces, from, to))}
          onRemove={(index) => {
            onError(null);
            onChange(pieces.filter((_, position) => position !== index));
          }}
          onAfterRemove={() => requestAnimationFrame(() => inputRef.current?.focus())}
          layout="stack"
          idPrefix={`${uid}-piece`}
          emptyText="Sin piezas todavía: súmalas desde «De tu perfil»."
        />
      </div>
      <div className="mt-3">
        <Combobox
          inputRef={inputRef}
          labelId={`${uid}-label`}
          describedBy={`${uid}-help`}
          options={options}
          onSelect={(option) => add(option.id)}
          onBackspaceEmpty={() => pieces.length > 0 && onChange(pieces.slice(0, -1))}
          placeholder={full ? `Ya tienes ${limits.max} piezas` : "Busca una pieza por su título"}
          disabled={full}
        />
      </div>
      {props.error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-accent-ink" data-piece-error>
          {props.error}
        </p>
      )}

      <h4 className="mt-6 text-sm font-semibold tracking-[0.12em] text-muted uppercase">De tu perfil</h4>
      <ul className="mt-3 grid grid-cols-2 gap-3 min-[26rem]:grid-cols-3 sm:grid-cols-4" data-profile-grid>
        {props.pool.map((piece) => {
          const added = chosen.has(piece.id);
          return (
            <li key={piece.id} className="flex min-w-0 flex-col gap-2 rounded-2xl border border-line bg-paper p-2" data-profile-piece={piece.id}>
              {/* Ajuste 5: si es un reel, se ve ahí mismo (hover en web, tap en móvil, uno a la vez). */}
              {piece.video ? (
                <InlineReel link={piece.video} title={piece.title} className="block aspect-square overflow-hidden rounded-xl bg-sand">
                  <span className="absolute inset-0" data-reel-media>
                    {piece.image && (
                      <Image src={piece.image.url} alt="" fill sizes="(min-width: 640px) 160px, 45vw" className="object-cover" />
                    )}
                  </span>
                  <span className="pointer-events-none absolute bottom-2 left-2 z-[1] inline-flex size-7 items-center justify-center rounded-full bg-paper/95 text-ink shadow" aria-hidden="true">
                    <svg viewBox="0 0 10 10" className="size-3 fill-current">
                      <path d="M3 2v6l5-3z" />
                    </svg>
                  </span>
                </InlineReel>
              ) : (
                <span className="relative block aspect-square overflow-hidden rounded-xl bg-sand">
                  {piece.image && (
                    <Image src={piece.image.url} alt="" fill sizes="(min-width: 640px) 160px, 45vw" className="object-cover" />
                  )}
                </span>
              )}
              <span className="line-clamp-2 min-h-[2.5em] text-xs leading-snug break-words">{piece.title}</span>
              <button
                type="button"
                onClick={() => add(piece.id)}
                disabled={added || full}
                aria-label={added ? `«${piece.title}» ya está en tus piezas` : `Agregar «${piece.title}»`}
                className="inline-flex min-h-tap items-center justify-center gap-1.5 rounded-full border border-ink/60 bg-paper px-3 text-sm font-semibold text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:border-line disabled:text-muted"
              >
                <span aria-hidden="true">{added ? "✓" : "+"}</span>
                {added ? "Agregada" : "Agregar"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
