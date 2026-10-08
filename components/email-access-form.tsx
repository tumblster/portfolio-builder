"use client";

import { useId, useState } from "react";
import { fieldLabel, pillButton, textInput } from "./brand-ui";

/*
 * Spec 12.1 · ronda 6 13.14: el correo ES la cuenta. Quien ya tiene portafolio entra con su correo: le llega un link
 * a "Mis portafolios" (sin contraseña, sin Google). La respuesta es siempre la misma, exista o no el correo.
 */
export function EmailAccessForm() {
  const uid = useId();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function send(event: React.FormEvent) {
    event.preventDefault();
    setState("sending");
    try {
      const response = await fetch("/api/account/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      setState(response.ok ? "sent" : "error");
    } catch {
      setState("error");
    }
  }

  return (
    <form onSubmit={send} className="mt-10 border-t border-line pt-6" data-testid="email-access" noValidate>
      <label htmlFor={`${uid}-email`} className={fieldLabel}>
        ¿Ya tienes portafolio? Entra con tu correo
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          id={`${uid}-email`}
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="tu@correo.com"
          className={`${textInput} min-w-0 flex-1 basis-56`}
        />
        <button type="submit" disabled={state === "sending" || !email.trim()} className={pillButton}>
          {state === "sending" ? "Enviando…" : "Enviarme el link"}
        </button>
      </div>
      <p aria-live="polite" className="mt-2 text-sm text-muted">
        {state === "sent" && "Si ese correo tiene portafolios, te llegó un link para entrar a «Mis portafolios» (vale 30 días)."}
        {state === "error" && "No pudimos enviarlo. Revisa el correo e intenta de nuevo."}
      </p>
    </form>
  );
}
