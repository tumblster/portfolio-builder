import "server-only";
import type { ImportErrorCode } from "./events";

/** Error de la importación con un mensaje que se puede mostrar tal cual. */
export class ImportError extends Error {
  constructor(
    readonly code: ImportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ImportError";
  }
}

export const isTimeoutError = (error: unknown) =>
  error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
