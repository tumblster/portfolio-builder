"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { errorText, fieldLabel, primaryButton, textInput } from "@/components/brand-ui";
import { GENDERS, GENDER_LABEL, isGender, type Gender } from "@/lib/portfolio/gender";

/*
 * Onboarding mínimo (ronda 6 · 13.15; 13.23 · 1): al EMPEZAR, antes de importar, se piden solo dos cosas:
 *  - el correo, que ES la cuenta (12.1): ahí le llegan los links para editar y para entrar a "Mis portafolios";
 *  - el género (13.11), con las 4 opciones exactas: Hombre, Mujer, Otro, Prefiero no decirlo. Solo adapta los textos
 *    de WhatsApp (13.8); nunca se infiere por la foto ni por el nombre.
 * Nada más. Se pregunta una vez por sesión (sessionStorage; si no hay, en memoria) y viaja al generar
 * (components/import-review.tsx → /api/import/confirm): "Portafolio listo" ya no pide el correo.
 */

export type Onboarding = { email: string; gender: Gender };

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const KEY = "supercreador:onboarding";
const EVENT = "supercreador:onboarding";
/** Respaldo si el navegador no deja usar sessionStorage (modo privado estricto): dura lo que la pestaña. */
let memory: string | null = null;

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readRaw(): string | null {
  try {
    return window.sessionStorage.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
}

function writeRaw(value: string | null) {
  memory = value;
  try {
    if (value === null) window.sessionStorage.removeItem(KEY);
    else window.sessionStorage.setItem(KEY, value);
  } catch {
    // Sin sessionStorage: queda en memoria.
  }
  window.dispatchEvent(new Event(EVENT));
}

function parse(raw: string | null): Onboarding | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<Onboarding>;
    return typeof data.email === "string" && EMAIL.test(data.email) && isGender(data.gender)
      ? { email: data.email, gender: data.gender }
      : null;
  } catch {
    return null;
  }
}

/** El onboarding de esta sesión (null hasta completarlo), con cómo guardarlo y cómo cambiarlo. */
export function useOnboarding() {
  // Con useSyncExternalStore: null al renderizar en el servidor y el dato real ya en el navegador (sin desajustes).
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  const onboarding = useMemo(() => parse(raw), [raw]);
  return {
    onboarding,
    saveOnboarding: (value: Onboarding) => writeRaw(JSON.stringify(value)),
    clearOnboarding: () => writeRaw(null),
  };
}

export function OnboardingStep({ onDone }: { onDone: (value: Onboarding) => void }) {
  const uid = useId();
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);
  const [errors, setErrors] = useState<{ email?: string; gender?: string }>({});
  const emailRef = useRef<HTMLInputElement>(null);
  const firstGenderRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  // Al aparecer, el foco va al título del paso (lectores de pantalla oyen dónde están).
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = email.trim().toLowerCase();
    const next: { email?: string; gender?: string } = {};
    if (!EMAIL.test(value)) next.email = "Escribe un correo válido, por ejemplo tu@correo.com.";
    if (!gender) next.gender = "Elige una opción (puede ser «Prefiero no decirlo»).";
    setErrors(next);
    if (next.email) return emailRef.current?.focus();
    if (!gender) return firstGenderRef.current?.focus();
    onDone({ email: value, gender });
  }

  return (
    <form onSubmit={submit} noValidate className="panel p-5 sm:p-7" aria-labelledby={`${uid}-title`} data-onboarding>
      <p className="eyebrow">Tu cuenta</p>
      <h2 id={`${uid}-title`} ref={titleRef} tabIndex={-1} className="title-2 mt-3 outline-none">
        Antes de empezar
      </h2>
      <p className="mt-3 text-muted">Solo dos datos. Sin contraseña: tu correo es tu cuenta.</p>

      <label htmlFor={`${uid}-email`} className={`${fieldLabel} mt-6`}>
        Tu correo
      </label>
      <p id={`${uid}-email-help`} className="mt-1 text-sm text-muted">
        Ahí te llega el link para editar tu portafolio y entrar a «Mis portafolios».
      </p>
      <input
        ref={emailRef}
        id={`${uid}-email`}
        type="email"
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        value={email}
        onChange={(event) => {
          setEmail(event.target.value);
          if (errors.email) setErrors((current) => ({ ...current, email: undefined }));
        }}
        aria-invalid={errors.email ? true : undefined}
        aria-describedby={`${uid}-email-help${errors.email ? ` ${uid}-email-error` : ""}`}
        placeholder="tu@correo.com"
        className={`${textInput} mt-2`}
        data-onboarding-email
      />
      {errors.email && (
        <p id={`${uid}-email-error`} className={`${errorText} mt-2`}>
          {errors.email}
        </p>
      )}

      <fieldset className="mt-7" aria-describedby={`${uid}-gender-help${errors.gender ? ` ${uid}-gender-error` : ""}`}>
        <legend className={fieldLabel}>¿Cómo te identificas?</legend>
        <p id={`${uid}-gender-help`} className="mt-1 text-sm text-muted">
          Solo cambia el texto de WhatsApp («supercreadora» o «supercreador»). Nunca lo adivinamos.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {GENDERS.map((value, index) => (
            <label
              key={value}
              className="inline-flex min-h-tap cursor-pointer items-center rounded-full border border-ink/60 bg-paper px-4 text-sm font-semibold text-ink transition-colors hover:border-ink has-[:checked]:border-ink has-[:checked]:bg-highlight has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"
              data-gender-option={value}
            >
              <input
                ref={index === 0 ? firstGenderRef : undefined}
                type="radio"
                name={`${uid}-gender`}
                value={value}
                checked={gender === value}
                onChange={() => {
                  setGender(value);
                  if (errors.gender) setErrors((current) => ({ ...current, gender: undefined }));
                }}
                className="sr-only"
              />
              {GENDER_LABEL[value]}
            </label>
          ))}
        </div>
        {errors.gender && (
          <p id={`${uid}-gender-error`} className={`${errorText} mt-2`}>
            {errors.gender}
          </p>
        )}
      </fieldset>

      <button type="submit" className={`${primaryButton} mt-8 w-full sm:w-auto sm:px-10`}>
        Continuar
      </button>
    </form>
  );
}
