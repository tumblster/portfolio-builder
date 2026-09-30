"use client";

import { useId, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { foldText } from "@/lib/portfolio/niche-taxonomy";

/*
 * Campo con autocompletado para agregar chips (ronda 30/09 · 7.1). Patrón combobox de WAI-ARIA:
 * - lo escrito se busca sin mayúsculas ni tildes y se resalta dentro de cada sugerencia;
 * - Enter (o un clic) sobre una sugerencia la agrega SIN cerrar la lista, para encadenar varias;
 * - Backspace con el campo vacío quita el último chip; Escape cierra; el foco nunca sale del campo.
 * - Opcional: "Agregar «lo escrito»" para lo que no está en la lista (onCreate).
 */

export type ComboOption = { id: string; label: string; thumb?: ReactNode };

type Props = {
  inputRef: RefObject<HTMLInputElement | null>;
  labelId: string;
  options: ComboOption[];
  onSelect: (option: ComboOption) => void;
  onCreate?: (text: string) => void;
  onBackspaceEmpty: () => void;
  placeholder: string;
  /** Si hay tope y se alcanzó: el campo se desactiva y se explica por qué. */
  disabled?: boolean;
  describedBy?: string;
  maxShown?: number;
  /** Opción fija al final de la lista, siempre visible (p. ej. "Otro"); se elige como cualquier otra. */
  pinnedOption?: ComboOption;
};

/** Parte el texto en [antes, coincidencia, después] (las tildes no cambian el largo: se compara plegado). */
function splitMatch(label: string, query: string): [string, string, string] | null {
  const q = foldText(query);
  if (!q) return null;
  const at = foldText(label).indexOf(q);
  if (at < 0) return null;
  return [label.slice(0, at), label.slice(at, at + q.length), label.slice(at + q.length)];
}

export function Combobox({
  inputRef,
  labelId,
  options,
  onSelect,
  onCreate,
  onBackspaceEmpty,
  placeholder,
  disabled,
  describedBy,
  maxShown = 8,
  pinnedOption,
}: Props) {
  const uid = useId();
  const listId = `${uid}-list`;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const q = foldText(query);
  const found = options.filter((option) => !q || foldText(option.label).includes(q)).slice(0, maxShown);
  const matches = pinnedOption ? [...found, pinnedOption] : found;
  const canCreate = Boolean(onCreate && q && !options.some((option) => foldText(option.label) === q) && found.length === 0);
  const total = matches.length + (canCreate ? 1 : 0);
  const current = total === 0 ? -1 : Math.min(active, total - 1);
  const optionId = (index: number) => `${uid}-opt-${index}`;
  const expanded = open && total > 0 && !disabled;

  function choose(index: number) {
    if (index < matches.length) onSelect(matches[index]);
    else if (canCreate) onCreate?.(query.trim());
    // Se queda abierta para encadenar: el campo se limpia y la posición activa se mantiene.
    setQuery("");
    setOpen(true);
    inputRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      if (total > 0) setActive((current < 0 ? 0 : current + (event.key === "ArrowDown" ? 1 : total - 1)) % total);
    } else if (event.key === "Enter") {
      if (expanded && current >= 0) {
        event.preventDefault();
        choose(current);
      }
    } else if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
      }
    } else if (event.key === "Backspace" && query === "") {
      onBackspaceEmpty();
    }
  }

  return (
    <div className="combo" data-open={expanded ? "" : undefined}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={expanded && current >= 0 ? optionId(current) : undefined}
        autoComplete="off"
        spellCheck={false}
        value={query}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className="combo__input"
      />
      <ul id={listId} role="listbox" aria-labelledby={labelId} className="combo__list" hidden={!expanded}>
        {matches.map((option, index) => {
          const parts = option === pinnedOption ? null : splitMatch(option.label, query);
          return (
            <li
              key={option.id}
              id={optionId(index)}
              role="option"
              aria-selected={index === current}
              className="combo__option"
              // mousedown (no click): el campo no pierde el foco y la lista no se cierra.
              onMouseDown={(event) => {
                event.preventDefault();
                choose(index);
              }}
              onMouseMove={() => setActive(index)}
            >
              {option.thumb}
              <span className="min-w-0 flex-1 break-words">
                {parts ? (
                  <>
                    {parts[0]}
                    <mark className="combo__match">{parts[1]}</mark>
                    {parts[2]}
                  </>
                ) : (
                  option.label
                )}
              </span>
            </li>
          );
        })}
        {canCreate && (
          <li
            id={optionId(matches.length)}
            role="option"
            aria-selected={current === matches.length}
            className="combo__option combo__option--create"
            onMouseDown={(event) => {
              event.preventDefault();
              choose(matches.length);
            }}
            onMouseMove={() => setActive(matches.length)}
          >
            <span className="min-w-0 flex-1 break-words">
              Agregar «<strong>{query.trim()}</strong>»
            </span>
          </li>
        )}
      </ul>
    </div>
  );
}
