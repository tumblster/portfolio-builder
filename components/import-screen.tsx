"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { IMPORT_STEPS, MANUAL_PREFILL_KEY, type ImportEvent, type ImportStep } from "@/lib/import/events";
import { readNdjson } from "@/lib/import/ndjson";
import { parseInstagramUsername } from "@/lib/instagram/username";
import { Avatar } from "./avatar";
import { CopyButton } from "./copy-button";
import { PieceRow } from "./piece-row";
import { PrefillSummary } from "./prefill-summary";
import { errorText, fieldLabel, pillButton, primaryButton, textInput } from "./ui";

/*
 * Flujo principal: pegar el perfil de Instagram → portafolio con link.
 * Estados: vacío (formulario), cargando (pasos reales que manda el servidor),
 * error, éxito, y "a mano" si el perfil es privado o tiene menos de 3 publicaciones.
 * El atajo "Prefiero llenarlo manual" está siempre a la vista antes de importar.
 */

type DoneEvent = Extract<ImportEvent, { type: "done" }>;
type ManualEvent = Extract<ImportEvent, { type: "manual" }>;

type State =
  | { phase: "idle" }
  | { phase: "running"; step: ImportStep; startedAt: number }
  | { phase: "error"; message: string }
  | { phase: "done"; result: DoneEvent }
  | { phase: "manual"; result: ManualEvent };

const STEP_LABELS: Record<ImportStep, string> = {
  scrape: "Leemos el perfil de Instagram",
  images: "Copiamos sus fotos",
  ai: "La IA escribe la propuesta de valor y los títulos",
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
      else if (event.type === "done") return { kind: "state", state: { phase: "done", result: event } };
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

  // Al terminar, el foco (y la vista) van al resultado; al volver a empezar, al campo.
  useEffect(() => {
    if (state.phase === "done" || state.phase === "manual") outcomeRef.current?.focus();
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

  return (
    <div className="mt-10">
      {state.phase === "done" || state.phase === "manual" ? (
        <div ref={outcomeRef} tabIndex={-1} className="outline-none">
          {state.phase === "done" ? (
            <Result result={state.result} onStartOver={startOver} />
          ) : (
            <ManualNotice
              result={state.result}
              onContinue={() => continueManually(state.result)}
              onStartOver={startOver}
            />
          )}
        </div>
      ) : (
        <>
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

function Result({ result, onStartOver }: { result: DoneEvent; onStartOver: () => void }) {
  const { resolved, url, username, aiWritten, warnings } = result;
  return (
    <section aria-labelledby="resultado" className="panel p-5 sm:p-6">
      <h2 id="resultado" className="text-4xl">
        portafolio listo.
      </h2>

      <div className="mt-6 flex items-center gap-4">
        <Avatar photo={resolved.photo} name={resolved.name} />
        <div className="min-w-0">
          <p className="truncate text-lg">{resolved.name}</p>
          <p className="truncate text-sm text-muted">@{username}</p>
        </div>
      </div>

      {resolved.valueProp && <p className="mt-5 font-serif text-2xl leading-snug">{resolved.valueProp}</p>}
      {aiWritten && <p className="mt-2 text-sm text-muted">Propuesta de valor, títulos y nichos sugeridos por la IA.</p>}

      <div className="mt-6">
        <p className={fieldLabel}>Link del portafolio</p>
        <p className="mt-1 font-mono text-sm break-all text-lilac select-all">{url}</p>
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

      {warnings.length > 0 && (
        <ul className="mt-5 space-y-1 text-sm text-amber">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      <h3 className="mt-8 font-sans text-sm text-muted">{resolved.pieces.length} piezas, en este orden</h3>
      <ul className="mt-1">
        {resolved.pieces.map((piece) => (
          <PieceRow
            key={piece.id}
            title={piece.title}
            image={piece.image}
            isVideo={piece.video !== null}
            niche={piece.niche}
          />
        ))}
      </ul>
    </section>
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
