import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireCreator } from "@/lib/auth";
import { ConfigError, InvalidInputError, errorResponse, readJsonBody } from "@/lib/errors";
import { ImportError } from "@/lib/import/errors";
import type { ImportErrorCode, ImportEvent } from "@/lib/import/events";
import { assertImportConfigured, importFromInstagram } from "@/lib/import/instagram-import";
import { parseInstagramUsername } from "@/lib/instagram/username";

/** Scrapeo (hasta ~2 min) + fotos + IA. En la práctica tarda 30–60 s. */
export const maxDuration = 180;

const HEARTBEAT_MS = 10_000;

const bodySchema = z.object({
  instagram: z.string({ error: "Pega el link o el usuario de Instagram." }).max(300),
});

/**
 * Crea un portafolio desde un perfil de Instagram. Cuerpo: { instagram: "link o @usuario" }.
 * Responde un stream NDJSON con el progreso (ver lib/import/events.ts).
 */
export async function POST(request: NextRequest) {
  const denied = requireCreator(request);
  if (denied) return denied;

  let username: string;
  try {
    const body = bodySchema.parse(await readJsonBody(request));
    const parsed = parseInstagramUsername(body.instagram);
    if (!parsed.ok) throw new InvalidInputError(parsed.error);
    assertImportConfigured(); // si falta una key, error claro antes de gastar en Apify
    username = parsed.username;
  } catch (error) {
    return errorResponse(error);
  }

  // v2 · M2: aquí ya no se crea el portafolio (solo un borrador). Se crea en /api/import/confirm,
  // una petición normal donde la invalidación de caché de los links nuevos funciona sin trucos.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ImportEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // Quien pidió cerró la pestaña: la importación termina igual y el borrador queda guardado.
        }
      };

      // Latido mientras Apify o Groq trabajan (hasta ~1 min sin otros eventos).
      const heartbeat = setInterval(() => send({ type: "ping" }), HEARTBEAT_MS);
      try {
        const outcome = await importFromInstagram(username, (step) => send({ type: "step", step }));
        if (outcome.kind === "draft") {
          send({ type: "draft", draft: outcome.draft });
        } else {
          send({ type: "manual", reason: outcome.reason, message: outcome.message, prefill: outcome.prefill });
        }
      } catch (error) {
        send({ type: "error", ...describe(error) });
      } finally {
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // ya estaba cerrado
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function describe(error: unknown): { code: ImportErrorCode; message: string } {
  if (error instanceof ImportError) return { code: error.code, message: error.message };
  if (error instanceof ConfigError) return { code: "config", message: error.message };
  console.error("[import]", error);
  return {
    code: "server_error",
    message: "Algo falló al armar el portafolio. Intenta de nuevo; si sigue fallando, llénalo a mano.",
  };
}
