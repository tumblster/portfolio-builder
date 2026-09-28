"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { errorText, fieldLabel, pillButton, primaryButton, textInput } from "./ui";

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
    <form onSubmit={submit} noValidate className="panel mt-10 p-5 sm:p-6">
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
          className={`${pillButton} shrink-0 px-4`}
        >
          {visible ? "Ocultar" : "Ver"}
        </button>
      </div>
      {error && (
        <p id="clave-error" role="alert" className={`${errorText} mt-2`}>
          {error}
        </p>
      )}
      <button type="submit" disabled={sending} className={`${primaryButton} mt-4 w-full`}>
        {sending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
