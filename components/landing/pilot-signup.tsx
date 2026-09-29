"use client";

import { useState, type FormEvent } from "react";

/*
 * Captura de correo del programa piloto (cierre de la landing). Va sobre el bloque de color: textos en crema
 * (11,9:1) y campo blanco con tinta. Los mensajes se anuncian a lectores de pantalla.
 */
export function PilotSignup() {
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setStatus("sending");
    try {
      const response = await fetch("/api/piloto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), website: form.get("website") || undefined }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setStatus("error");
        setMessage(data?.error?.issues?.[0]?.message ?? data?.error?.message ?? "No pudimos anotarte. Intenta de nuevo.");
        return;
      }
      setStatus("done");
      setMessage(
        data?.alreadySignedUp
          ? "Ya estabas en la lista. Te escribimos cuando abramos tu acceso."
          : "¡Listo! Te escribimos cuando abramos tu acceso.",
      );
    } catch {
      setStatus("error");
      setMessage("Se cortó la conexión. Intenta de nuevo.");
    }
  }

  if (status === "done") {
    return (
      <p role="status" className="mx-auto mt-10 max-w-md text-lg font-medium" data-pilot-done>
        {message}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mx-auto mt-10 max-w-md text-left" data-pilot-form>
      <label htmlFor="piloto-email" className="text-sm font-medium">
        Tu correo
      </label>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row">
        <input
          id="piloto-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="tu@correo.com"
          aria-invalid={status === "error" || undefined}
          aria-describedby="piloto-ayuda"
          className="h-12 min-w-0 flex-1 rounded-full bg-paper px-5 text-[0.9375rem] text-ink placeholder:text-muted"
        />
        <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
        <button
          type="submit"
          disabled={status === "sending"}
          className="inline-flex h-12 items-center justify-center rounded-full bg-cream px-6 text-[0.9375rem] font-medium text-ink transition-colors hover:bg-paper disabled:opacity-70"
        >
          {status === "sending" ? "Enviando…" : "Quiero unirme"}
        </button>
      </div>
      <p id="piloto-ayuda" role={status === "error" ? "alert" : undefined} className="mt-3 text-sm text-sand">
        {status === "error" ? `⚠ ${message}` : "Solo lo usamos para avisarte cuando abramos tu acceso."}
      </p>
    </form>
  );
}
