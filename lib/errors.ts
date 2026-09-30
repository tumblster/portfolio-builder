import "server-only";
import { ZodError } from "zod";

/** Error con código HTTP y un mensaje que se puede mostrar tal cual en la interfaz. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** Datos extra que viajan en `error` junto al mensaje (p. ej. `retryAt`). */
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidInputError extends HttpError {
  constructor(message: string, status = 400) {
    super(status, "invalid_input", message);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = "No existe un portafolio con ese link.") {
    super(404, "not_found", message);
  }
}

export class ConflictError extends HttpError {
  constructor(
    message = "Este portafolio cambió mientras lo editabas. Recarga para ver la versión más reciente.",
    details: Record<string, unknown> = {},
  ) {
    super(409, "conflict", message, details);
  }
}

/** Falta configuración del servidor: variables de entorno o almacenamiento. */
export class ConfigError extends HttpError {
  constructor(message: string) {
    super(500, "config", message);
  }
}

/** JSON que nunca se guarda en caché (son datos privados del creador). */
export function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(data, { ...init, headers });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ZodError) {
    return jsonResponse(
      {
        error: {
          code: "invalid_input",
          message: "Revisa los datos marcados.",
          issues: error.issues.map((issue) => ({
            path: issue.path.map(String).join("."),
            message: issue.message,
          })),
        },
      },
      { status: 400 },
    );
  }
  if (error instanceof HttpError) {
    return jsonResponse({ error: { ...error.details, code: error.code, message: error.message } }, { status: error.status });
  }
  console.error(error);
  return jsonResponse(
    { error: { code: "server_error", message: "Algo falló en el servidor. Intenta de nuevo en unos segundos." } },
    { status: 500 },
  );
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new InvalidInputError("El cuerpo de la petición tiene que ser JSON válido.");
  }
}
