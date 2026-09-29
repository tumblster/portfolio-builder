import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getStorage } from "@/lib/storage";

/*
 * Lista de espera del programa piloto (v2 · M4-rev): el cierre de la landing pide un correo. Se guarda un JSON por
 * correo en el Blob store privado (pilot-signups/<hash>.json), así anotarse dos veces no duplica. No se envía
 * nada a nadie: el dueño revisa la lista en el Blob store (ver DEPLOY.md).
 */
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

export async function savePilotSignup(email: string): Promise<{ created: boolean }> {
  const id = createHash("sha256").update(email).digest("hex").slice(0, 32);
  const created = await getStorage().createJson(`pilot-signups/${id}.json`, { email, createdAt: new Date().toISOString(), source: "landing" });
  return { created };
}
