import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireCreator } from "@/lib/auth";
import { ConfigError, InvalidInputError, errorResponse, readJsonBody } from "@/lib/errors";
import { parseCanvaSiteUrl } from "@/lib/import/canva";
import { importFromCanva } from "@/lib/import/canva-import";
import { ImportError } from "@/lib/import/errors";
import type { ImportErrorCode, ImportEvent } from "@/lib/import/events";

/** Descarga del sitio + copia de la foto y las portadas. En la práctica tarda 10–40 s. */
export const maxDuration = 120;

const HEARTBEAT_MS = 10_000;

const bodySchema = z.object({
  canva: z
    .string({ error: "Pega el link de tu sitio de Canva." })
    .trim()
    .min(1, { error: "Pega el link de tu sitio de Canva." })
    .max(500, { error: "Ese link es demasiado largo. Pega el link público de tu sitio de Canva."
}),
});

/**
 * Importa un portafolio desde un sitio publicado de Canva. Cuerpo: { canva: "link del sitio" }.
 * Responde un stream NDJSON con el progreso (ver lib/import/events.ts). Termina con un
evento "manual"
 * (reason "canva_import") que trae el prefill para el formulario, o con "error".
 */
export async function POST(request: NextRequest) {

 const denied = requireCreator(request);
 if (denied) return denied;

 let siteUrl: string;
 try {
   const body = bodySchema.parse(await readJsonBody(request));
   const parsed = parseCanvaSiteUrl(body.canva);
   if (!parsed.ok) throw new InvalidInputError(parsed.error);
   siteUrl = parsed.url;
 } catch (error) {
   return errorResponse(error);
 }

 const encoder = new TextEncoder();
 const stream = new ReadableStream<Uint8Array>({
  async start(controller) {
   const send = (event: ImportEvent) => {
     try {
       controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
     } catch {
       // Quien pidió cerró la pestaña: no hay a quién avisarle.
     }
   };

     // Latido mientras se descarga el sitio y se copian las imágenes.
     const heartbeat = setInterval(() => send({ type: "ping" }), HEARTBEAT_MS);
     try {
       const outcome = await importFromCanva(siteUrl, (step) => send({ type: "step", step }));
       send({ type: "manual", reason: outcome.reason, message: outcome.message, prefill:
outcome.prefill });
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
  console.error("[import/canva]", error);
  return {
    code: "server_error",
    message: "Algo falló al leer tu sitio de Canva. Intenta de nuevo; si sigue fallando, llena tu portafolio a mano.",
  };
}
