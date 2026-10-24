import "server-only";

import sharp from "sharp";

/*
 * Ronda 14B · 3: clasificación por CONTENIDO de las imágenes de prueba y de fotos, para diseños cuyos títulos no son
 * legibles por máquina. Groq vision (Llama 4 Scout), JSON estricto y, ante cualquier falla o duda, null.
 *
 * Ronda 15 · E2: una lámina sin título se clasifica COMO CONJUNTO (sus imágenes, hasta 5, y los textos de la misma
 * lámina, en una sola llamada). La categoría es de la sección entera. Si no hay veredicto, el import cae a la
 * clasificación imagen por imagen.
 */

const MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const TIMEOUT_MS = 15_000;
const ZONE_TIMEOUT_MS = 25_000;
const ZONE_MAX_IMAGES = 5;
const ZONE_TEXT_MAX = 80;

export type ProofKind = "metrics" | "testimonial" | "photo" | "logo" | "other";

const KINDS: readonly ProofKind[] = ["metrics", "testimonial", "photo", "logo", "other"];

/** A4: ¿hay con qué revisar el contenido? (sin llave, el import avisa que ubicó todo por su lugar en el diseño). */
export const visionConfigured = () => Boolean(process.env.GROQ_API_KEY?.trim());

const CATEGORIES =
  '"metrics" = capturas de estadísticas o analítica de una red social o app (cifras, gráficos, alcance, vistas, seguidores, interacción); ' +
  '"testimonial" = capturas de mensajes, chats, correos, reseñas o cartas de una marca o cliente dirigidas a la creadora; ' +
  '"photo" = fotografías de una persona, un producto o un lugar, sin interfaz de app; ' +
  '"logo" = logos o insignias de marcas; ' +
  '"other" = cualquier otra cosa, o si dudas. ';

const PROMPT =
  "Clasifica esta imagen del portafolio de una creadora de contenido. Elige UNA categoría: " +
  CATEGORIES +
  'Responde SOLO con este JSON: {"kind": "metrics"} (con la categoría elegida).';

function zonePrompt(texts: string[]): string {
  const context = texts
    .map((text) => text.replace(/\s+/g, " ").trim().slice(0, ZONE_TEXT_MAX))
    .filter(Boolean)
    .map((text) => `«${text}»`)
    .join(", ");
  return (
    "Estas imágenes están juntas en UNA misma sección del portafolio de una creadora de contenido" +
    (context ? `, junto a estos textos: ${context}` : "") +
    ". Clasifica la SECCIÓN completa con UNA categoría: " +
    CATEGORIES +
    'Responde SOLO con este JSON: {"kind": "metrics"} (con la categoría elegida).'
  );
}

async function toJpegDataUrl(bytes: Buffer, side: number): Promise<string> {
  const small = await sharp(bytes)
    .resize(side, side, { fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 80 })
    .toBuffer();
  return "data:image/jpeg;base64," + small.toString("base64");
}

async function ask(key: string, content: unknown[], timeout: number): Promise<ProofKind | null> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(timeout),
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      max_tokens: 20,
      messages: [{ role: "user", content }],
    }),
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content ?? "";
  const match = /"kind"\s*:\s*"([a-z]+)"/.exec(text);
  const kind = match?.[1] as ProofKind | undefined;
  return kind && KINDS.includes(kind) ? kind : null;
}

/** La categoría de UNA imagen, o null si no hay veredicto. */
export async function classifyProofImage(bytes: Buffer): Promise<ProofKind | null> {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) return null;
  try {
    const url = await toJpegDataUrl(bytes, 768);
    return await ask(key, [{ type: "text", text: PROMPT }, { type: "image_url", image_url: { url } }], TIMEOUT_MS);
  } catch {
    return null;
  }
}

/** E2: la categoría de una sección COMPLETA (hasta 5 imágenes y sus textos vecinos), o null. */
export async function classifyProofZone(images: Buffer[], texts: string[]): Promise<ProofKind | null> {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key || images.length === 0) return null;
  try {
    const urls = await Promise.all(images.slice(0, ZONE_MAX_IMAGES).map((bytes) => toJpegDataUrl(bytes, 512)));
    return await ask(
      key,
      [{ type: "text", text: zonePrompt(texts) }, ...urls.map((url) => ({ type: "image_url", image_url: { url } }))],
      ZONE_TIMEOUT_MS,
    );
  } catch {
    return null;
  }
}
