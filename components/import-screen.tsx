"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { IMPORT_STEPS, MANUAL_PREFILL_KEY, type ImportEvent, type ImportStep } from "@/lib/import/events";
import { readNdjson } from "@/lib/import/ndjson";
import { parseInstagramUsername } from "@/lib/instagram/username";
import { nichesWithPieces } from "@/lib/portfolio/niches";
import { Avatar } from "./avatar";
import { CopyButton } from "./copy-button";
import { PrefillSummary } from "./prefill-summary";
import { errorText, fieldLabel, pillButton, primaryButton, textInput } from "./ui";

/*
 * Flujo principal: pegar el perfil de Instagram → portafolio con link.
 * Estados: vacío (formulario), cargando (pasos reales que manda el servidor),
 * error, éxito, y "a mano" si el perfil es privado o tiene menos de 3 publicaciones.
 * El atajo "Prefiero llenarlo manual" está siempre a la vista antes de importar.
 *
 * v2: el éxito es un modal ("Portafolio listo") encima del formulario, con el link, copiar,
 * abrir, editar y crear otro. Al cerrarlo queda una línea para volver a abrirlo.
 */

type DoneEvent = Extract<ImportEvent, { type: "done" }>;
type ManualEvent = Extract<ImportEvent, { type: "manual" }>;

type State =
  | { phase: "idle" }
  | { phase: "running"; step: ImportStep; startedAt: number }
  | { phase: "error"; message: string }
  | { phase: "done"; result: DoneEvent; dialogOpen: boolean }
  | { phase: "manual"; result: ManualEvent };

const STEP_LABELS: Record<ImportStep, string> = {
  scrape: "Leemos el perfil de Instagram",
  images: "Copiamos sus fotos",
  ai: "La IA detecta sus nichos y escribe los textos",
  save: "Generamos el link",
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
      else if (event.type === "done") return { kind: "state", state: { phase: "done", result: event, dialogOpen: true } };
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
  const inputRef = useRef<HTMLInputElement>(null);
  const outcomeRef = useRef<HTMLDivElement>(null);
  const focusInputOnIdle = useRef(false);
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
      {state.phase === "manual" ? (
        <div ref={outcomeRef} tabIndex={-1} className="outline-none">
          <ManualNotice result={state.result} onContinue={() => continueManually(state.result)} onStartOver={startOver} />
        </div>
      ) : (
        <>
          {state.phase === "done" && (
            <div className="panel mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
              <p className="min-w-0 flex-1">
                <span aria-hidden="true" className="text-lilac">
                  ✓{" "}
                </span>
                Portafolio de {state.result.resolved.name} listo
              </p>
              <button
                type="button"
                onClick={() => setDialogOpen(true)}
                className="min-h-tap text-lilac underline decoration-lilac/40 underline-offset-4 hover:decoration-lilac"
              >
                Ver link
              </button>
            </div>
          )}

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
            <ReadyDialog result={state.result} onClose={() => setDialogOpen(false)} onStartOver={startOver} />
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
            <span className={`min-w-0 ${status === "active" || status === "done" ? "text-white" : "text-muted"}`}>
              {STEP_LABELS[step]}
            </span>
            <span className="ml-auto shrink-0 font-mono text-xs">
              {status === "done" && <span className="text-lilac">listo</span>}
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
    <span className="text-lilac tabular-nums">
      {String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}
    </span>
  );
}

/**
 * "Portafolio listo" (v2 · M1): modal centrado con el link, copiar, abrir, editar y crear otro.
 * Es un <dialog> nativo: atrapa el foco, se cierra con Esc, con la X o tocando fuera, y al
 * cerrarse devuelve el foco a donde estaba.
 */
function ReadyDialog({ result, onClose, onStartOver }: { result: DoneEvent; onClose: () => void; onStartOver: () => void }) {
  const { resolved, url, username, warnings } = result;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const nicheLinks = nichesWithPieces(resolved.niches, resolved.pieces).map((niche) => ({ ...niche, url: `${url}/${niche.slug}` }));

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    titleRef.current?.focus();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="portafolio-listo"
      data-modal=""
      onClose={() => {
        if (!dialogRef.current?.open) onClose();
      }}
      onClick={(event) => {
        // Toque en el fondo oscuro (fuera de la tarjeta): cierra.
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(100%-2rem,34rem)] overflow-y-auto overscroll-contain rounded-card border border-line bg-ink p-0 text-white shadow-[0_30px_80px_-20px_rgb(0_0_0/0.7)] backdrop:bg-[rgb(10_10_36/0.78)] backdrop:backdrop-blur-sm"
    >
      <div className="relative p-5 sm:p-7">
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label="Cerrar"
          className="absolute top-3 right-3 flex size-11 items-center justify-center rounded-full text-muted transition hover:bg-white/10 hover:text-white"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4">
            <path d="M3.5 3.5l9 9m0-9l-9 9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>

        <h2 id="portafolio-listo" ref={titleRef} tabIndex={-1} className="pr-12 text-4xl outline-none sm:text-5xl">
          portafolio listo.
        </h2>

        <div className="mt-6 flex items-center gap-4">
          <Avatar photo={resolved.photo} name={resolved.name} />
          <div className="min-w-0">
            <p className="truncate text-lg">{resolved.name}</p>
            <p className="truncate text-sm text-muted">@{username}</p>
          </div>
        </div>

        <div className="mt-6">
          <p className={fieldLabel}>Link del portafolio</p>
          <p className="mt-1 font-mono text-sm break-all text-lilac select-all" data-testid="portfolio-url">
            {url}
          </p>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <CopyButton text={url} className={primaryButton} what="el link del portafolio" />
          <a href={url} target="_blank" rel="noopener noreferrer" className={pillButton}>
            Abrir portafolio<span className="sr-only"> (se abre en otra pestaña)</span>
          </a>
          <Link href={`/editar/${result.slug}`} className={pillButton}>
            Editar
          </Link>
          <button type="button" onClick={onStartOver} className={pillButton}>
            Crear otro
          </button>
        </div>

        {nicheLinks.length > 0 && (
          <div className="mt-7">
            <h3 className="font-sans text-sm text-muted">Links por nicho</h3>
            <ul className="mt-2 border-t border-line">
              {nicheLinks.map((niche) => (
                <li key={niche.slug} className="flex min-h-tap items-center gap-3 border-b border-line py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block">{niche.label}</span>
                    <span className="block truncate font-mono text-xs text-muted">/{niche.slug}</span>
                  </span>
                  <CopyButton
                    text={niche.url}
                    label="Copiar"
                    what={`el link de ${niche.label}`}
                    className={`${pillButton} min-h-10 px-4`}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}

        {warnings.length > 0 && (
          <ul className="mt-5 space-y-1 text-sm text-amber">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}
      </div>
    </dialog>
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
      <h2 id="a-mano" className="text-4xl">
        {result.reason === "private_profile" ? "cuenta privada." : "faltan publicaciones."}
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
