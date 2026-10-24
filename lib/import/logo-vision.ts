import "server-only";

import sharp from "sharp";

/*
 * Clasificación por CONTENIDO de los candidatos a logo. La pregunta no es la forma ni el tamaño: es si ES un logo.
 * Groq vision (Llama 4 Scout) solo sobre candidatos que ya pasaron los píxeles.
 *
 * Ronda 15 · A2 / E3: el veredicto es una clase, no un sí/no:
 * - "logo": logo o insignia de una marca, de cualquier color o forma (también redondo o sobre fondo de color);
 * - "person": aparece una persona (veto duro: jamás entra a la franja);
 * - "screenshot", "photo", "other": vetan.
 * Sin llave, sin red o sin respuesta clara: null (manda el test de píxeles reforzado del import).
 */

const MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const TIMEOUT_MS = 15_000;

export type LogoKind = "logo" | "person" | "screenshot" | "photo" | "other";

const KINDS: readonly LogoKind[] = ["logo", "person", "screenshot", "photo", "other"];

const PROMPT =
  "Clasifica esta imagen, que podría ir en una franja de logos de marcas. Elige UNA categoría: " +
  '"logo" = el logo o la insignia de una marca o negocio, con o sin texto, de cualquier color o forma (también redondo o sobre un fondo de color); ' +
  '"person" = aparece una persona o parte de ella (cara, manos, cuerpo), aunque también haya un producto o un logo; ' +
  '"screenshot" = una captura de pantalla de una app o red social, una pantalla de estadísticas o un chat; ' +
  '"photo" = una foto de un producto, un lugar o un objeto, sin personas; ' +
  '"other" = una textura, un fondo, un ícono decorativo, o si dudas. ' +
  'Responde SOLO con este JSON: {"kind": "logo"} (con la categoría elegida).';

/** La clase de la imagen, o null si no hay veredicto. */
export async function classifyLogoCandidate(bytes: Buffer): Promise<LogoKind | null> {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) return null;
  try {
    // Fondo blanco antes del JPEG: un logo transparente no se vuelve un cuadro negro.
    const small = await sharp(bytes)
      .resize(512, 512, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 80 })
      .toBuffer();
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_tokens: 20,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${small.toString("base64")}` } },
            ],
          },
        ],
      }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content ?? "";
    const match = /"kind"\s*:\s*"([a-z]+)"/.exec(text);
    const kind = match?.[1] as LogoKind | undefined;
    return kind && KINDS.includes(kind) ? kind : null;
  } catch {
    return null;
  }
}

/** Compatibilidad: true = es logo · false = no es logo · null = sin veredicto. */
export async function visionSaysLogo(bytes: Buffer): Promise<boolean | null> {
  const kind = await classifyLogoCandidate(bytes);
  return kind === null ? null : kind === "logo";
}
