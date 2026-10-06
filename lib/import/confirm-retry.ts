/*
 * Política de reintentos de "Generar portafolio" (ronda 30/09 · 7.4 a). Sin dependencias ni alias de import: la usan
 * components/import-review.tsx y la prueba de humo (scripts/smoke.mjs la importa tal cual con Node 22).
 *
 * Un 409 significa "otra petición lo está generando": se reintenta, pero con TOPE de intentos y un PLAZO GLOBAL.
 * Si en ese plazo no terminó, se muestra un error claro y terminal. Nunca un "Reintentando…" infinito:
 * el error llega siempre antes de 60 s desde el clic (aceptación del bugfix).
 */

/** Plazo total desde el clic: pasado esto no se reintenta más y cualquier petición en curso se corta. */
export const CONFIRM_DEADLINE_MS = 50_000;
/** Cada petición, como máximo esto (y nunca más allá del plazo global). */
export const CONFIRM_REQUEST_TIMEOUT_MS = 25_000;
/** Esperas entre intentos: 6 reintentos como máximo (2 + 3 + 5 + 8 + 10 + 10 = 38 s de espera). */
export const CONFIRM_RETRY_DELAYS_MS: readonly number[] = [2_000, 3_000, 5_000, 8_000, 10_000, 10_000];

export const CONFIRM_TIMEOUT_MESSAGE = "Tu portafolio no terminó de generarse. Inténtalo de nuevo.";

/**
 * Espera antes del próximo reintento tras un 409, o null si ya no hay que reintentar (se muestra el error).
 * `retry` = cuántos reintentos van; `retryAt` = cuándo vence el candado según el servidor (ms, o NaN).
 * Si el candado vence antes que la espera normal, se reintenta justo después de que venza.
 */
export function nextConfirmRetry(retry: number, startedAt: number, now: number, retryAt: number): number | null {
  if (retry >= CONFIRM_RETRY_DELAYS_MS.length) return null;
  let delay = CONFIRM_RETRY_DELAYS_MS[retry];
  if (Number.isFinite(retryAt)) {
    const untilExpiry = retryAt + 1_000 - now;
    if (untilExpiry > 0 && untilExpiry < delay) delay = untilExpiry;
  }
  // Un reintento que ya no alcanzaría a responder dentro del plazo no se hace.
  if (now + delay - startedAt > CONFIRM_DEADLINE_MS - 2_000) return null;
  return delay;
}

/** Cuánto puede durar la próxima petición: su tope, sin pasar el plazo global. */
export function confirmRequestTimeout(startedAt: number, now: number): number {
  return Math.max(0, Math.min(CONFIRM_REQUEST_TIMEOUT_MS, startedAt + CONFIRM_DEADLINE_MS - now));
}
