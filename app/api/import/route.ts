import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireCreator } from "@/lib/auth";
import { ConfigError, InvalidInputError, errorResponse, readJsonBody } from "@/lib/errors";
import { ImportError } from "@/lib/import/errors";
import type { ImportErrorCode, ImportEvent } from "@/lib/import/events";
import { assertImportConfigured, importFromInstagram } from "@/lib/import/instagram-import";
import { parseInstagramUsername } from "@/lib/instagram/username";
import { resolvePortfolio } from "@/lib/portfolio/resolve";
import { publicPath, publicPaths, slugify } from "@/lib/portfolio/slug";
import { absoluteUrl } from "@/lib/request";

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

  // El portafolio se crea dentro del stream, cuando la respuesta ya empezó, y ahí
  // Next ya no aplica invalidaciones de caché. Si alguien abrió antes el link que
  // va a tener (y quedó un 404 en caché), se purga ahora: /p/usuario y /p/usuario-2,
  // con sus versiones por nicho.
  const base = slugify(username);
  for (const slug of [base, `${base}-2`]) for (const path of publicPaths(slug)) revalidatePath(path);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ImportEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // Quien pidió cerró la pestaña: la importación termina igual y queda guardada.
        }
      };

      // Latido mientras Apify o Groq trabajan (hasta ~1 min sin otros eventos).
      const heartbeat = setInterval(() => send({ type: "ping" }), HEARTBEAT_MS);
      try {
        const outcome = await importFromInstagram(username, (step) => send({ type: "step", step }));
        if (outcome.kind === "created") {
          const { portfolio } = outcome;
          send({
            type: "done",
            url: absoluteUrl(request, publicPath(portfolio.slug)),
            slug: portfolio.slug,
            username,
            aiWritten: outcome.aiWritten,
            resolved: resolvePortfolio(portfolio),
            warnings: outcome.warnings,
          });
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
