import "server-only";

import sharp from "sharp";
import { canvaRatesSchema, type CanvaRate } from "@/lib/portfolio/schema";

/*
 * Ronda 14 · D: lee el tarifario de la creadora y devuelve sus servicios con su precio TAL COMO ESTÁN ESCRITOS.
 * Garantías contra inventar: el precio es texto visible (no se convierte ni se calcula); todo o nada (un ítem mal
 * formado descarta la lectura entera); respuesta cortada, JSON roto, más de 8 servicios o lista vacía → sin tarifas.
 *
 * Ronda 15 · B2: la imagen va a la mayor resolución útil (hasta 2048 px de lado, sin agrandar) y, ante una falla o
 * una lista vacía, se reintenta UNA vez. `readRateCardDetailed` dice por qué no se pudo (el import lo avisa: A4).
 */

const MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const TIMEOUT_MS = 30_000;
const MAX_SIDE = 2048;
/** Si el JPEG en base64 pasa de esto, se baja a FALLBACK_SIDE (el API limita el tamaño de la imagen). */
const MAX_BASE64_CHARS = 3_500_000;
const FALLBACK_SIDE = 1600;
const ATTEMPTS = 2;

const PROMPT =
  "Esta imagen es el tarifario de una creadora de contenido. Copia sus servicios y precios EXACTAMENTE como están escritos en la imagen. " +
  'Para cada servicio: name (el nombre tal cual), price (el precio como texto visible, con su símbolo de moneda tal cual, por ejemplo "S/ 500" o "$100"; no conviertas ni calcules nada) ' +
  "e includes (lo que la imagen dice que incluye ese servicio, cada ítem tal cual; lista vacía si no dice nada). " +
  "No agregues nada que no esté escrito. Si un servicio no tiene precio visible, no lo incluyas. " +
  'Si no puedes leer la imagen con seguridad o no es un tarifario, responde {"items": []}. ' +
  'Responde SOLO con este JSON: {"items": [{"name": "...", "price": "...", "includes": ["..."]}]}';

type Choice = { finish_reason?: string; message?: { content?: string } };

export type RateReadResult =
  | { ok: true; rates: CanvaRate[] }
  | { ok: false; reason: "no_key" | "image_error" | "unreadable" };

const clean = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");

async function prepareImage(bytes: Buffer): Promise<string> {
  const encode = async (side: number) =>
    (
      await sharp(bytes)
        .resize(side, side, { fit: "inside", withoutEnlargement: true })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: 88 })
        .toBuffer()
    ).toString("base64");
  const full = await encode(MAX_SIDE);
  return full.length <= MAX_BASE64_CHARS ? full : encode(FALLBACK_SIDE);
}

async function requestRates(key: string, base64: string): Promise<CanvaRate[] | null> {
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_tokens: 1200,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}` } },
            ],
          },
        ],
      }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { choices?: Choice[] };
    const choice = data.choices?.[0];
    if (!choice || choice.finish_reason === "length") return null;
    return parseRates(choice.message?.content ?? "");
  } catch {
    return null;
  }
}

/** B2: las tarifas o el motivo por el que no se pudieron leer. Nunca lanza. */
export async function readRateCardDetailed(bytes: Buffer): Promise<RateReadResult> {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) return { ok: false, reason: "no_key" };
  let base64: string;
  try {
    base64 = await prepareImage(bytes);
  } catch {
    return { ok: false, reason: "image_error" };
  }
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const rates = await requestRates(key, base64);
    if (rates) return { ok: true, rates };
  }
  return { ok: false, reason: "unreadable" };
}

/** Compatibilidad: las tarifas, o null si no se pudieron leer con confianza. */
export async function readRateCard(bytes: Buffer): Promise<CanvaRate[] | null> {
  const result = await readRateCardDetailed(bytes);
  return result.ok ? result.rates : null;
}

function parseRates(text: string): CanvaRate[] | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items) || items.length === 0) return null;

  const seen = new Set<string>();
  const rates: CanvaRate[] = [];
  for (const entry of items) {
    if (!entry || typeof entry !== "object") return null;
    const item = entry as { name?: unknown; price?: unknown; includes?: unknown };
    const name = clean(item.name);
    const price = clean(item.price);
    if (!name || !price || !/\d/.test(price)) return null;
    if (item.includes !== undefined && !Array.isArray(item.includes)) return null;
    const includes = Array.isArray(item.includes) ? item.includes.map(clean).filter(Boolean) : [];
    const key = `${name.toLowerCase()}|${price}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rates.push({ name, price, includes });
  }
  const parsed = canvaRatesSchema.safeParse(rates);
  return parsed.success ? parsed.data : null;
}
