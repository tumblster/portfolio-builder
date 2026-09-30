import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { HttpError } from "@/lib/errors";
import { appendSheetRow, sheetsConfig } from "@/lib/google/sheets";
import { getStorage } from "@/lib/storage";

/*
 * Lista de espera del programa piloto. El cierre de la landing pide un correo.
 * Ronda 30/09 · 8.4: los correos van a un Google Sheet (decisión del dueño: Sheets, $0, sin base de datos en
 * Vercel). Cada correo nuevo es una fila: fecha (UTC), correo, origen.
 *  - Con el Sheet configurado (lib/google/sheets.ts) → sink "sheet".
 *  - Sin configurar → MODO MOCK, marcado como tal: la fila queda en pilot-sheet-mock/<hash>.json (Blob o .data/)
 *    con mock: true, la respuesta dice sink: "mock" y la cabecera X-Pilot-Sink: mock. Nada se pierde: al
 *    configurar el Sheet se copian a mano.
 * Anotarse dos veces no duplica la fila: se marca pilot-signups/<hash>.json después de escribirla.
 */

export type PilotSink = "sheet" | "mock";
export const pilotSignupSchema = z.object({
  email: z
    .string({ error: "Escribe tu correo." })
    .trim()
    .toLowerCase()
    .max(254, { error: "Ese correo es demasiado largo." })
    .pipe(z.email({ error: "Revisa tu correo: parece que le falta algo." })),
  /** Trampa para bots: las personas no ven este campo. */
  website: z.string().max(200).optional(),
});

export const pilotSink = (): PilotSink => (sheetsConfig() ? "sheet" : "mock");

export async function savePilotSignup(email: string): Promise<{ created: boolean; sink: PilotSink }> {
  const storage = getStorage();
  const id = createHash("sha256").update(email).digest("hex").slice(0, 32);
  const marker = `pilot-signups/${id}.json`;
  const config = sheetsConfig();
  const sink: PilotSink = config ? "sheet" : "mock";
  if (await storage.readJson(marker)) return { created: false, sink };

  const row = { at: new Date().toISOString(), email, source: "landing" };
  if (config) {
    try {
      await appendSheetRow(config, [row.at, row.email, row.source]);
    } catch (error) {
      console.error(JSON.stringify({ scope: "pilot.sheet", event: "append.failed", at: row.at, error: String(error) }));
      throw new HttpError(502, "pilot_sheet_failed", "No pudimos guardar tu correo. Intenta de nuevo en un momento.");
    }
  } else {
    await storage.createJson(`pilot-sheet-mock/${id}.json`, {
      ...row,
      mock: true,
      note: "MODO MOCK: falta configurar Google Sheets (DEPLOY.md, «Correos del piloto»). Copia esta fila al Sheet.",
    });
  }
  const created = await storage.createJson(marker, { email, createdAt: row.at, source: "landing", sink });
  return { created, sink };
}
