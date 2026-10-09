"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  IMPORT_STEPS,
  MANUAL_PREFILL_KEY,
  type DraftPreview,
  type ImportEvent,
  type ImportResult,
  type ImportStep,
} from "@/lib/import/events";
import { readNdjson } from "@/lib/import/ndjson";
import { parseInstagramUsername } from "@/lib/instagram/username";
import { ImportReview } from "./import-review";
import { OnboardingStep, useOnboarding } from "./import/onboarding-step";
import { PrefillSummary } from "./prefill-summary";
import { ReadyDialog } from "./ready-dialog";
import { errorText, fieldLabel, pillButton, primaryButton, textInput } from "./brand-ui";

/*
 * Flujo principal: pegar el perfil de Instagram → portafolio con link.
 * Estados: vacío (formulario), cargando (pasos reales que manda el servidor),
 * error, éxito, y "a mano" si el perfil es privado o tiene menos de 3 publicaciones.
 * El atajo "Prefiero llenarlo manual" está siempre a la vista antes de importar.
 *
 * v2 · M1: el éxito es un modal ("Portafolio listo") encima del formulario, con el link, copiar,
 * abrir, editar y crear otro. Al cerrarlo queda una línea para volver a abrirlo.
 * v2 · M2: nada se genera a ciegas. Al terminar la importación se confirma lo que sugirió la IA
 * (nichos) y se eligen plantilla y paleta (import-review.tsx); recién ahí se genera.
 * Ronda 6 · 13.15 / 13.23 · 1: lo PRIMERO es el onboarding mínimo (correo + género, components/import/onboarding-step.tsx).
 * Se pide una vez por sesión, se muestra arriba del formulario ("<correo> · Cambiar") y viaja al generar.
 */

type ManualEvent = Extract<ImportEvent, { type: "manual" }>;

type State =
  | { phase: "idle" }
  | { phase: "running"; step: ImportStep; startedAt: number }
  | { phase: "error"; message: string }
  | { phase: "review"; draft: DraftPreview }
  | { phase: "done"; result: ImportResult; dialogOpen: boolean }
  | { phase: "manual"; result: ManualEvent };

const STEP_LABELS: Record<ImportStep, string> = {
  scrape: "Leemos el perfil de Instagram",
  images: "Copiamos sus fotos",
  ai: "La IA detecta sus nichos y escribe los textos",
};

const CONNECTION_LOST = "Se cortó la conexión antes de terminar. Revisa tu internet e intenta de nuevo.";

type RunResult =
  | { kind: "state"; state: State }
  | { kind: "field-error"; message: string }
  | { kind: "unauthorized" };

async function runImport(instagram: string, onStep: (step: ImportStep) => void): Promise<RunResult> {
  let response: Response;
  try {
    response = await fetch("/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instagram }),
    });
  } catch {
    return { kind: "state", state: { phase: "error", message: CONNECTION_LOST } };
  }

  if (response.status === 401) return { kind: "unauthorized" };
  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => null);
    const message: string = data?.error?.message ?? "No pudimos empezar. Intenta de nuevo en unos segundos.";
    return response.status === 400
      ? { kind: "field-error", message }
      : { kind: "state", state: { phase: "error", message } };
  }

  try {
    for await (const event of readNdjson<ImportEvent>(response.body)) {
      if (event.type === "ping") continue; // latido: la conexión sigue viva
      if (event.type === "step") onStep(event.step);
      else if (event.type === "draft") return { kind: "state", state: { phase: "review", draft: event.draft } };
      else if (event.type === "manual") return { kind: "state", state: { phase: "manual", result: event } };
      else return { kind: "state", state: { phase: "error", message: event.message } };
    }
  } catch {
    // El stream se cortó a la mitad.
  }
  return { kind: "state", state: { phase: "error", message: CONNECTION_LOST } };
}

export function ImportScreen() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [state, setState] = useState<State>({ phase: "idle" });
  const { onboarding, saveOnboarding, clearOnboarding } = useOnboarding();
  const inputRef = useRef<HTMLInputElement>(null);
  const outcomeRef = useRef<HTMLDivElement>(null);
  const focusInputOnIdle = useRef(false);
  const focusAfterOnboarding = useRef(false);
  const running = state.phase === "running";

  // Si no se pudo armar solo, el foco (y la vista) van al aviso; al volver a empezar, al campo.
  // (El modal de éxito maneja su propio foco.)
  useEffect(() => {
    if (state.phase === "manual") outcomeRef.current?.focus();
    if (state.phase === "idle" && focusInputOnIdle.current) {
      focusInputOnIdle.current = false;
      inputRef.current?.focus();
    }
  }, [state.phase]);

  // 13.15: terminado el onboarding, el foco va al campo de Instagram.
  useEffect(() => {
    if (!onboarding || !focusAfterOnboarding.current) return;
    focusAfterOnboarding.current = false;
    inputRef.current?.focus();
  }, [onboarding]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (running) return;
    const parsed = parseInstagramUsername(input);
    if (!parsed.ok) {
      setFieldError(parsed.error);
      inputRef.current?.focus();
      return;
    }
    setFieldError(null);
    setState({ phase: "running", step: "scrape", startedAt: Date.now() });

    const result = await runImport(input, (step) =>
      setState((current) => (current.phase === "running" ? { ...current, step } : current)),
    );
    if (result.kind === "unauthorized") {
      router.replace("/acceso");
      return;
    }
    if (result.kind === "field-error") {
      setState({ phase: "idle" });
      setFieldError(result.message);
      inputRef.current?.focus();
      return;
    }
    setState(result.state);
  }

  function startOver() {
    focusInputOnIdle.current = true;
    setInput("");
    setFieldError(null);
    setState({ phase: "idle" });
  }

  function continueManually(result: ManualEvent) {
    try {
      sessionStorage.setItem(MANUAL_PREFILL_KEY, JSON.stringify(result.prefill));
    } catch {
      // Sin sessionStorage el formulario empieza vacío; no bloquea.
    }
    router.push("/crear/manual");
  }

  function clearPrefill() {
    try {
      sessionStorage.removeItem(MANUAL_PREFILL_KEY);
    } catch {
      // nada que limpiar
    }
  }

  const setDialogOpen = (dialogOpen: boolean) =>
    setState((current) => (current.phase === "done" ? { ...current, dialogOpen } : current));

  return (
    <div className="mt-10">
      {state.phase === "review" ? (
        <ImportReview
          draft={state.draft}
          owner={onboarding}
          onGenerated={(result) => setState({ phase: "done", result, dialogOpen: true })}
          onStartOver={startOver}
          onUnauthorized={() => router.replace("/acceso")}
        />
      ) : state.phase === "manual" ? (
        <div ref={outcomeRef} tabIndex={-1} className="outline-none">
          <ManualNotice result={state.result} onContinue={() => continueManually(state.result)} onStartOver={startOver} />
        </div>
      ) : !onboarding ? (
        // 13.15 / 13.23 · 1: el correo y el género se piden al inicio, antes de importar.
        <OnboardingStep
          onDone={(value) => {
            focusAfterOnboarding.current = true;
            saveOnboarding(value);
          }}
        />
      ) : (
        <>
          {state.phase === "done" && (
            <div className="panel mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
              <p className="min-w-0 flex-1">
                <span aria-hidden="true" className="text-success">
                  ✓{" "}
                </span>
                Portafolio de {state.result.resolved.name} listo
              </p>
              <button
                type="button"
                onClick={() => setDialogOpen(true)}
                className="min-h-tap text-success underline decoration-accent underline-offset-4 hover:decoration-accent"
              >
                Ver link
              </button>
            </div>
          )}

          <p className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted" data-onboarding-summary>
            <span className="min-w-0 [overflow-wrap:anywhere]">
              <span className="font-semibold text-ink">{onboarding.email}</span>
            </span>
            <button
              type="button"
              onClick={clearOnboarding}
              disabled={running}
              className="min-h-tap px-1 font-semibold text-ink underline decoration-accent underline-offset-4 disabled:opacity-50"
            >
              Cambiar
            </button>
          </p>

          <form onSubmit={submit} noValidate className="panel p-5 sm:p-6">
            <label htmlFor="instagram" className={fieldLabel}>
              Link o usuario de Instagram
            </label>
            <input
              id="instagram"
              ref={inputRef}
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                if (fieldError) setFieldError(null);
              }}
              placeholder="instagram.com/usuario"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="go"
              readOnly={running}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? "instagram-error" : undefined}
              className={`${textInput} mt-2`}
            />
            {fieldError && (
              <p id="instagram-error" className={`${errorText} mt-2`}>
                {fieldError}
              </p>
            )}
            <button type="submit" disabled={running} className={`${primaryButton} mt-4 w-full`}>
              {running ? "Creando portafolio…" : "Crear portafolio"}
            </button>
          </form>

          <div className="mt-4">
            <Link href="/crear/manual" onClick={clearPrefill} className={pillButton}>
              Prefiero llenarlo manual
            </Link>
          </div>

          {state.phase === "error" ? (
            <div role="alert" className="panel mt-10 p-5 sm:p-6">
              <p className="text-lg">{state.message}</p>
              <p className="mt-2 text-sm text-muted">Puedes intentarlo de nuevo con el mismo link o llenarlo a mano.</p>
            </div>
          ) : (
            <Steps state={state} />
          )}
          {running && (
            <p className="mt-4 text-sm text-muted">Suele tomar entre 30 y 60 segundos. No cierres esta pestaña.</p>
          )}

          {state.phase === "done" && state.dialogOpen && (
            <ReadyDialog
              result={state.result}
              onClose={() => setDialogOpen(false)}
              onStartOver={startOver}
              onResultChange={(result) => setState((current) => (current.phase === "done" ? { ...current, result } : current))}
            />
          )}
        </>
      )}

      <p className="sr-only" aria-live="polite">
        {running ? `${STEP_LABELS[state.step]}…` : ""}
      </p>
    </div>
  );
}

function Steps({ state }: { state: State }) {
  const active = state.phase === "running" ? IMPORT_STEPS.indexOf(state.step) : -1;
  return (
    <ol className="mt-10 border-t border-line" aria-label="Cómo se arma el portafolio">
      {IMPORT_STEPS.map((step, index) => {
        const status = active < 0 ? "idle" : index < active ? "done" : index === active ? "active" : "pending";
        return (
          <li
            key={step}
            aria-current={status === "active" ? "step" : undefined}
            className="flex min-h-tap items-center gap-4 border-b border-line py-3"
          >
            <span className="w-6 shrink-0 font-mono text-xs text-muted">{String(index + 1).padStart(2, "0")}</span>
            <span className={`min-w-0 ${status === "active" || status === "done" ? "text-ink" : "text-muted"}`}>
              {STEP_LABELS[step]}
            </span>
            <span className="ml-auto shrink-0 font-mono text-xs">
              {status === "done" && <span className="text-success">listo</span>}
              {status === "active" && state.phase === "running" && <Elapsed since={state.startedAt} />}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Tiempo transcurrido (mm:ss): confirma que la importación sigue viva. */
function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(since);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.floor((now - since) / 1000));
  return (
    <span className="text-success tabular-nums">
      {String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}
    </span>
  );
}

function ManualNotice({
  result,
  onContinue,
  onStartOver,
}: {
  result: ManualEvent;
  onContinue: () => void;
  onStartOver: () => void;
}) {
  return (
    <section role="alert" aria-labelledby="a-mano" className="panel p-5 sm:p-6">
      <h2 id="a-mano" className="title-2">
        {result.reason === "private_profile" ? "Cuenta privada" : "Faltan publicaciones"}
      </h2>
      <p className="mt-4 text-lg">{result.message}</p>
      <PrefillSummary prefill={result.prefill} />
      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" onClick={onContinue} className={primaryButton}>
          Llenarlo a mano con sus datos
        </button>
        <button type="button" onClick={onStartOver} className={pillButton}>
          Probar otro perfil
        </button>
      </div>
    </section>
  );
}
