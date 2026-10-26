"use client";

import { useId, useState } from "react";
import type { CanvaRate } from "@/lib/portfolio/schema";

/*
 * Ronda de corrección · S3: el simulador de tarifas de la página pública (sección Tarifas).
 * Consume los mismos datos que las tarjetas (`canva.rates`) cuando traen su estructura (S2):
 * - servicio (y su pack, si trae variantes por cantidad) como selección;
 * - extras como interruptores (se suman);
 * - modificadores como selección (porcentaje sobre la base o "a tratar"); uno de una sola opción, como interruptor;
 * - total en vivo con su moneda tal como aparece en el tarifario y el desglose (base + extras + modificadores);
 * - notas sin precio, tal cual.
 * Si algo elegido no tiene precio numérico, el total dice "A tratar" con la nota del tarifario: nunca un número
 * inventado. Un solo servicio plano sin opciones se muestra con su precio, sin controles.
 * Copy cerrado: solo nombres y precios del tarifario, más las etiquetas mínimas de la interfaz.
 */

const NUMBER_TOKEN = /\d[\d.,\s]*\d|\d/;

/** El separador de miles que usa el tarifario ("1.500" → "."; si no, ","). */
function groupSeparator(sample: string): "," | "." {
  const token = NUMBER_TOKEN.exec(sample)?.[0]?.replace(/\s/g, "") ?? "";
  return /^\d{1,3}(\.\d{3})+$/.test(token) || /\.\d{3},\d{1,2}$/.test(token) ? "." : ",";
}

function formatNumber(value: number, group: "," | "."): string {
  const decimal = group === "," ? "." : ",";
  const rounded = Math.round(Math.abs(value) * 100) / 100;
  const [whole, fraction] = (Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2)).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  return fraction ? `${grouped}${decimal}${fraction}` : grouped;
}

/** Un monto con la moneda en el mismo lugar en que la escribe el tarifario ("S/ 500" o "250 mxn"). */
function moneyFor(value: number, sample: string, currency: string | null): string {
  const sign = value < 0 ? "−" : "";
  const number = formatNumber(value, groupSeparator(sample));
  if (!currency) return `${sign}${number}`;
  const at = sample.indexOf(currency);
  const firstDigit = sample.search(/\d/);
  if (at >= 0 && firstDigit >= 0 && at < firstDigit) {
    const gap = /\s/.test(sample.charAt(at + currency.length)) ? " " : "";
    return `${sign}${currency}${gap}${number}`;
  }
  const tight = at > 0 && /\d/.test(sample.charAt(at - 1));
  return `${sign}${number}${tight ? "" : " "}${currency}`;
}

type Line = { key: string; label: string; value: string };

export function CanvaRatesSimulator({ rates }: { rates: CanvaRate[] }) {
  const id = useId();
  const services = rates.filter((rate) => rate.kind === "service");
  const extras = rates.filter((rate) => rate.kind === "extra" && typeof rate.amount === "number");
  const modifiers = rates.filter((rate) => rate.kind === "modifier" && (rate.options?.length ?? 0) > 0);
  const notes = rates.filter((rate) => rate.kind === "note");
  const [serviceAt, setServiceAt] = useState(0);
  const [variantAt, setVariantAt] = useState(0);
  const [extrasOn, setExtrasOn] = useState<boolean[]>(() => extras.map(() => false));
  const [modifierAt, setModifierAt] = useState<number[]>(() => modifiers.map(() => -1));

  if (services.length === 0) return null;

  const service = services[Math.min(serviceAt, services.length - 1)];
  const variants = service.variants ?? [];
  const variant = variants.length > 0 ? variants[Math.min(variantAt, variants.length - 1)] : null;
  const basePrice = variant?.price ?? service.price;
  const baseAmount = variant ? variant.amount : (service.amount ?? null);
  const money = (value: number) => moneyFor(value, basePrice, service.currency ?? null);

  const notesList =
    notes.length > 0 ? (
      <ul className="cv-sim__notes">
        {notes.map((note, index) => (
          <li key={`${index}-${note.name}`} className="cv-sim__note">
            <span className="cv-sim__note-name">{note.name}</span>
            <span>{note.note ?? note.price}</span>
          </li>
        ))}
      </ul>
    ) : null;

  const includesList =
    service.includes.length > 0 ? (
      <ul className="cv-sim__includes">
        {service.includes.map((item, index) => (
          <li key={`${index}-${item}`} className="cv-sim__include">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" className="cv-sim__check">
              <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    ) : null;

  // S3: un solo servicio plano sin opciones = su nombre y su precio (lo mismo que mostraba su tarjeta).
  if (services.length === 1 && variants.length === 0 && extras.length === 0 && modifiers.length === 0) {
    return (
      <div className="cv-sim cv-sim--static">
        <div className="cv-sim__summary">
          <p className="cv-sim__name">{service.name}</p>
          <p className="cv-sim__amount">{service.price}</p>
          {includesList}
        </div>
        {notesList}
      </div>
    );
  }

  // Desglose: base + extras + modificadores.
  const lines: Line[] = [{ key: "base", label: variant ? `${service.name} · ${variant.label}` : service.name, value: basePrice }];
  let pending: string | null = baseAmount === null ? basePrice : null;
  let total = baseAmount ?? 0;
  extras.forEach((extra, index) => {
    if (!extrasOn[index]) return;
    total += extra.amount ?? 0;
    lines.push({ key: `extra-${index}`, label: extra.name, value: extra.price });
  });
  modifiers.forEach((modifier, index) => {
    const option = modifier.options?.[modifierAt[index] ?? -1];
    if (!option) return;
    const label = option.label === modifier.name ? modifier.name : `${modifier.name} · ${option.label}`;
    const key = `modifier-${index}`;
    if (option.percent === null) {
      pending ??= option.price;
      lines.push({ key, label, value: option.price });
      return;
    }
    if (baseAmount === null) {
      lines.push({ key, label, value: option.price });
      return;
    }
    const delta = (baseAmount * option.percent) / 100;
    total += delta;
    lines.push({ key, label: `${label} (${option.price})`, value: `${delta >= 0 ? "+" : ""}${money(delta)}` });
  });
  const totalText = pending === null ? money(total) : "A tratar";

  const setModifier = (index: number, value: number) =>
    setModifierAt((previous) => previous.map((current, at) => (at === index ? value : current)));

  return (
    <div className="cv-sim">
      <div className="cv-sim__controls">
        {services.length > 1 && (
          <fieldset className="cv-sim__group">
            <legend className="cv-sim__legend">Servicio</legend>
            <div className="cv-sim__choices">
              {services.map((item, index) => (
                <label key={`${index}-${item.name}`} className="cv-sim__chip">
                  <input
                    type="radio"
                    name={`${id}-service`}
                    checked={index === serviceAt}
                    onChange={() => {
                      setServiceAt(index);
                      setVariantAt(0);
                    }}
                  />
                  <span className="cv-sim__chip-name">{item.name}</span>
                  {!item.variants && <span className="cv-sim__chip-price">{item.price}</span>}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {variants.length > 0 && (
          <fieldset className="cv-sim__group">
            <legend className="cv-sim__legend">{service.name}</legend>
            <div className="cv-sim__choices">
              {variants.map((item, index) => (
                <label key={`${index}-${item.label}`} className="cv-sim__chip">
                  <input
                    type="radio"
                    name={`${id}-pack`}
                    checked={index === variantAt}
                    onChange={() => setVariantAt(index)}
                  />
                  <span className="cv-sim__chip-name">{item.label}</span>
                  <span className="cv-sim__chip-price">{item.price}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {includesList}

        {extras.length > 0 && (
          <fieldset className="cv-sim__group">
            <legend className="cv-sim__legend">Extras</legend>
            <div className="cv-sim__switches">
              {extras.map((extra, index) => (
                <label key={`${index}-${extra.name}`} className="cv-sim__switch">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={Boolean(extrasOn[index])}
                    onChange={(event) => {
                      const on = event.target.checked;
                      setExtrasOn((previous) => previous.map((current, at) => (at === index ? on : current)));
                    }}
                  />
                  <span className="cv-sim__switch-name">{extra.name}</span>
                  <span className="cv-sim__switch-price">{extra.price}</span>
                  <span className="cv-sim__switch-track" aria-hidden="true" />
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {modifiers.map((modifier, index) => {
          const options = modifier.options ?? [];
          if (options.length === 1) {
            return (
              <div key={`${index}-${modifier.name}`} className="cv-sim__switches">
                <label className="cv-sim__switch">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={modifierAt[index] === 0}
                    onChange={(event) => setModifier(index, event.target.checked ? 0 : -1)}
                  />
                  <span className="cv-sim__switch-name">{modifier.name}</span>
                  <span className="cv-sim__switch-price">{options[0].price}</span>
                  <span className="cv-sim__switch-track" aria-hidden="true" />
                </label>
              </div>
            );
          }
          return (
            <fieldset key={`${index}-${modifier.name}`} className="cv-sim__group">
              <legend className="cv-sim__legend">{modifier.name}</legend>
              <div className="cv-sim__choices">
                <label className="cv-sim__chip">
                  <input
                    type="radio"
                    name={`${id}-modifier-${index}`}
                    checked={(modifierAt[index] ?? -1) === -1}
                    onChange={() => setModifier(index, -1)}
                  />
                  <span className="cv-sim__chip-name">Ninguno</span>
                </label>
                {options.map((option, optionIndex) => (
                  <label key={`${optionIndex}-${option.label}`} className="cv-sim__chip">
                    <input
                      type="radio"
                      name={`${id}-modifier-${index}`}
                      checked={modifierAt[index] === optionIndex}
                      onChange={() => setModifier(index, optionIndex)}
                    />
                    <span className="cv-sim__chip-name">{option.label}</span>
                    <span className="cv-sim__chip-price">{option.price}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}

        {notesList}
      </div>

      <div className="cv-sim__summary">
        <ul className="cv-sim__lines">
          {lines.map((line) => (
            <li key={line.key} className="cv-sim__line">
              <span>{line.label}</span>
              <span className="cv-sim__line-value">{line.value}</span>
            </li>
          ))}
        </ul>
        <p className="cv-sim__total" aria-live="polite">
          <span>Total</span>
          <strong className="cv-sim__amount">{totalText}</strong>
        </p>
        {pending !== null && <p className="cv-sim__pending">{pending}</p>}
      </div>
    </div>
  );
}
