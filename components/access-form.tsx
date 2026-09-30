"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

/*
 * Formulario de la clave de acceso. Desde r2 (B8) se ve con el sistema de la landing: campo en píldora con borde
 * fino, botón "Ver" secundario y el primario con borde 3D en el acento (landing-btn-3d, B9). La lógica no cambió.
 */
const fieldLabel = "block text-sm font-medium text-ink";
const textInput =
  "h-14 w-full min-w-0 rounded-full border border-ink/60 bg-paper px-6 text-base text-ink placeholder:text-muted focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-accent read-only:bg-sand aria-[invalid=true]:border-accent-ink";
const secondaryButton =
  "inline-flex h-14 items-center justify-center rounded-full border border-ink/60 bg-paper px-5 text-[0.9375rem] font-medium text-ink transition-colors hover:border-ink";
const primaryButton =
  "landing-btn-3d inline-flex h-14 items-center justify-center rounded-full bg-ink px-6 text-[0.9375rem] font-medium text-cream transition-colors hover:bg-[#2a2e24] disabled:cursor-not-allowed disabled:opacity-60";
const errorText = "text-sm font-semibold text-accent-ink";

export function AccessForm({ next }: { next: string }) {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [visible, setVisible] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!key.trim()) {
      setError("Escribe la clave.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      if (response.ok) {
        router.replace(next);
        router.refresh();
        return;
      }
      const data = await response.json().catch(() => null);
      setError(data?.error?.message ?? "No pudimos validar la clave. Intenta de nuevo.");
    } catch {
      setError("Sin conexión. Revisa tu internet e intenta de nuevo.");
    }
    setSending(false);
  }

  return (
    <form onSubmit={submit} noValidate className="mt-10 rounded-[1.75rem] border border-line bg-paper p-6 sm:p-8">
      <label htmlFor="clave" className={fieldLabel}>
        Clave de acceso
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id="clave"
          type={visible ? "text" : "password"}
          value={key}
          onChange={(event) => {
            setKey(event.target.value);
            if (error) setError(null);
          }}
          autoComplete="current-password"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          readOnly={sending}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "clave-error" : undefined}
          className={textInput}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-pressed={visible}
          className={`${secondaryButton} shrink-0`}
        >
          {visible ? "Ocultar" : "Ver"}
        </button>
      </div>
      {error && (
        <p id="clave-error" role="alert" className={`${errorText} mt-2`}>
          {error}
        </p>
      )}
      <button type="submit" disabled={sending} className={`${primaryButton} mt-5 w-full`}>
        {sending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
