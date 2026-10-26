import "server-only";

import sharp from "sharp";
import { canvaRatesSchema, type CanvaRate } from "@/lib/portfolio/schema";

/*
 * Ronda 14 · D: lee el tarifario de la creadora y devuelve sus servicios con su precio TAL COMO ESTÁN ESCRITOS.
 * Garantías contra inventar: el precio es texto visible (no se convierte ni se calcula); respuesta cortada, JSON roto,
 * más de 8 renglones o lista vacía → sin tarifas.
 *
 * Ronda 15 · B2: la imagen va a la mayor resolución útil (hasta 2048 px de lado, sin agrandar) y, ante una falla o
 * una lista vacía, se reintenta UNA vez. `readRateCardDetailed` dice por qué no se pudo (el import lo avisa: A4).
 *
 * Ronda de corrección · S1: la lectura es ESTRUCTURADA. Cada renglón es un servicio (con sus variantes de pack si el
 * nombre solo cambia por cantidad), un extra de precio fijo, un modificador porcentual sobre la base o una nota sin
 * precio. El modelo solo copia textos; los montos, la moneda y los porcentajes los saca ESTE archivo del texto visible
 * (un solo número por precio, la moneda tal como aparece). Lo que no tenga precio numérico queda como nota o como
 * opción "a tratar": nunca se inventa un precio. Estructura incompleta → un reintento. Si la lectura estructurada
 * falla tras el reintento, se intenta la lectura plana de siempre (tarjetas) para que ningún portafolio empeore; si
 * también falla, rige el respaldo vigente (la imagen con su aviso).
 */

const MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const TIMEOUT_MS = 30_000;
const MAX_SIDE = 2048;
/** Si el JPEG en base64 pasa de esto, se baja a FALLBACK_SIDE (el API limita el tamaño de la imagen). */
const MAX_BASE64_CHARS = 3_500_000;
const FALLBACK_SIDE = 1600;
const ATTEMPTS = 2;
const STRUCTURED_MAX_TOKENS = 2000;
const LEGACY_MAX_TOKENS = 1200;

/** Códigos de moneda que se reconocen escritos en el precio (tal como aparecen). */
const CURRENCY_CODES = new Set([
  "mxn", "usd", "pen", "cop", "clp", "ars", "eur", "brl", "gtq", "crc",
  "uyu", "pyg", "bob", "dop", "hnl", "nio", "pab", "ves", "cad", "gbp",
]);
const NUMBER_TOKEN = /\d[\d.,\s]*\d|\d/g;

const STRUCTURED_PROMPT =
  "Esta imagen es el tarifario de una creadora de contenido. Copia su estructura EXACTAMENTE como está escrita: no inventes, no conviertas ni calcules nada. " +
  "Clasifica cada renglón en un tipo: " +
  '"service" = un servicio con precio; si el nombre solo cambia por cantidad (por ejemplo 1 foto, 3 fotos, 5 fotos) es UN solo servicio con sus "variants" (cada una con label y price); ' +
  '"extra" = un agregado de precio fijo que se suma a un servicio; ' +
  '"modifier" = un porcentaje que se aplica sobre la tarifa base (por ejemplo contenido RAW o derechos de uso por plazo): cada plazo u opción va en "options" con su label y su price (el porcentaje tal cual, con su signo, o el texto si es a negociar); ' +
  '"note" = un renglón sin precio numérico (por ejemplo algo a tratar): en "text" va lo que dice. ' +
  'price es siempre el texto visible tal cual, con su moneda tal como aparece (por ejemplo "250 mxn", "S/ 500", "$100"). ' +
  'Si el tarifario escribe la moneda en un encabezado o al pie, ponla en "currency" tal como aparece; si no, null. ' +
  'includes = lo que la imagen dice que incluye un servicio, cada ítem tal cual (lista vacía si no dice nada). ' +
  'Si no puedes leer la imagen con seguridad o no es un tarifario, responde {"items": []}. ' +
  'Responde SOLO con este JSON: {"currency": null, "items": [' +
  '{"type": "service", "name": "...", "price": "...", "variants": [{"label": "...", "price": "..."}], "includes": ["..."]}, ' +
  '{"type": "extra", "name": "...", "price": "..."}, ' +
  '{"type": "modifier", "name": "...", "options": [{"label": "...", "price": "..."}]}, ' +
  '{"type": "note", "name": "...", "text": "..."}]}';

const LEGACY_PROMPT =
  "Esta imagen es el tarifario de una creadora de contenido. Copia sus servicios y precios EXACTAMENTE como están escritos en la imagen. " +
  'Para cada servicio: name (el nombre tal cual), price (el precio como texto visible, con su símbolo de moneda tal cual, por ejemplo "S/ 500" o "$100"; no conviertas ni calcules nada) ' +
  "e includes (lo que la imagen dice que incluye ese servicio, cada ítem tal cual; lista vacía si no dice nada). " +
  "No agregues nada que no esté escrito. Si un servicio no tiene precio visible, no lo incluyas. " +
  'Si no puedes leer la imagen con seguridad o no es un tarifario, responde {"items": []}. ' +
  'Responde SOLO con este JSON: {"items": [{"name": "...", "price": "...", "includes": ["..."]}]}';

type Choice = { finish_reason?: string; message?: { content?: string } };
type Parser = (text: string) => CanvaRate[] | null;
type RawItem = Record<string, unknown>;

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

async function requestRates(
  key: string,
  base64: string,
  prompt: string,
  maxTokens: number,
  parse: Parser,
): Promise<CanvaRate[] | null> {
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_tokens: maxTokens,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
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
    return parse(choice.message?.content ?? "");
  } catch {
    return null;
  }
}

/** B2 / S1: las tarifas o el motivo por el que no se pudieron leer. Nunca lanza. */
export async function readRateCardDetailed(bytes: Buffer): Promise<RateReadResult> {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) return { ok: false, reason: "no_key" };
  let base64: string;
  try {
    base64 = await prepareImage(bytes);
  } catch {
    return { ok: false, reason: "image_error" };
  }
  // S1: estructura completa, con un reintento.
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const rates = await requestRates(key, base64, STRUCTURED_PROMPT, STRUCTURED_MAX_TOKENS, parseStructured);
    if (rates) return { ok: true, rates };
  }
  // Lo de siempre (tarjetas), para no empeorar lo que hoy se lee plano.
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const rates = await requestRates(key, base64, LEGACY_PROMPT, LEGACY_MAX_TOKENS, parseLegacy);
    if (rates) return { ok: true, rates };
  }
  return { ok: false, reason: "unreadable" };
}

/** Compatibilidad: las tarifas, o null si no se pudieron leer con confianza. */
export async function readRateCard(bytes: Buffer): Promise<CanvaRate[] | null> {
  const result = await readRateCardDetailed(bytes);
  return result.ok ? result.rates : null;
}

function jsonObject(text: string): RawItem | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const raw: unknown = JSON.parse(text.slice(start, end + 1));
    return raw && typeof raw === "object" ? (raw as RawItem) : null;
  } catch {
    return null;
  }
}

const objectsOf = (value: unknown): RawItem[] =>
  Array.isArray(value) ? value.filter((entry): entry is RawItem => Boolean(entry) && typeof entry === "object") : [];

// ── S1: montos, moneda y porcentajes, leídos del texto visible ──

/** "1,250.00" · "1.250" · "999" → número. null si no es un número limpio. */
function parseNumberToken(token: string): number | null {
  const lastComma = token.lastIndexOf(",");
  const lastDot = token.lastIndexOf(".");
  let normalized = token;
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? "," : ".";
    const group = decimal === "," ? "." : ",";
    normalized = token.split(group).join("").replace(decimal, ".");
  } else if (lastComma >= 0 || lastDot >= 0) {
    const separator = lastComma >= 0 ? "," : ".";
    const parts = token.split(separator);
    const tail = parts[parts.length - 1];
    normalized = parts.length > 2 || tail.length === 3 ? parts.join("") : parts.join(".");
  }
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** El monto de un precio visible: exactamente un número y sin porcentaje. Si no, null (a tratar). */
function amountOf(price: string): number | null {
  if (price.includes("%")) return null;
  const tokens = (price.match(NUMBER_TOKEN) ?? []).map((token) => token.replace(/\s/g, ""));
  return tokens.length === 1 ? parseNumberToken(tokens[0]) : null;
}

/** La moneda tal como aparece en el precio: un código ("mxn") o un símbolo ("S/", "$"). */
function currencyOf(price: string): string | null {
  for (const match of price.matchAll(/\b([A-Za-z]{3})\b/g)) {
    if (CURRENCY_CODES.has(match[1].toLowerCase())) return match[1];
  }
  const symbol = /(US\$|R\$|S\/\.?|Bs\.?|[$€£₡])/.exec(price);
  return symbol?.[1] ?? null;
}

const currencyKey = (currency: string | null) => (currency ? currency.toLowerCase().replace(/[\s.]/g, "") : null);

/** "+50%" → 50 · "-80% sobre la tarifa base" → -80 · "Negociación especial" → null. */
function percentOf(text: string): number | null {
  const match = /([+\-−–])?\s*(\d+(?:[.,]\d+)?)\s*%/.exec(text);
  if (!match) return null;
  const value = Number(match[2].replace(",", "."));
  if (!Number.isFinite(value)) return null;
  const negative = match[1] ? match[1] !== "+" : /descuento|menos/i.test(text);
  return negative ? -value : value;
}

/**
 * S1: la lectura estructurada, validada. Incompleta (sin nombre, servicio sin precio visible, tipo desconocido, ningún
 * servicio con monto, monedas mezcladas o fuera de los límites del esquema) → null y se reintenta.
 */
function parseStructured(text: string): CanvaRate[] | null {
  const raw = jsonObject(text);
  if (!raw) return null;
  const items = objectsOf(raw.items);
  if (items.length === 0) return null;
  const docCurrency = clean(raw.currency).slice(0, 12) || null;
  const currencies = new Set<string>();
  const seen = new Set<string>();
  const rates: CanvaRate[] = [];
  let simulable = 0;

  const money = (price: string) => {
    const amount = amountOf(price);
    const currency = currencyOf(price) ?? docCurrency;
    if (amount !== null) {
      const key = currencyKey(currency);
      if (key) currencies.add(key);
    }
    return { amount, currency };
  };
  const asNote = (name: string, value: string, includes: string[] = []): CanvaRate => ({
    kind: "note",
    name,
    price: value,
    includes,
    note: value,
  });

  for (const item of items) {
    const type = clean(item.type).toLowerCase();
    const name = clean(item.name);
    if (!name) return null;
    const key = `${type}|${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (type === "service") {
      const includes = Array.isArray(item.includes) ? item.includes.map(clean).filter(Boolean) : [];
      const variants = objectsOf(item.variants)
        .map((variant) => ({ label: clean(variant.label), price: clean(variant.price) }))
        .filter((variant) => variant.label && variant.price);
      if (variants.length >= 2) {
        const priced = variants.map((variant) => ({ ...variant, ...money(variant.price) }));
        const first = priced.find((variant) => variant.amount !== null);
        if (first) simulable += 1;
        rates.push({
          kind: "service",
          name,
          price: priced[0].price,
          includes,
          amount: priced[0].amount,
          currency: first?.currency ?? null,
          variants: priced.map((variant) => ({ label: variant.label, price: variant.price, amount: variant.amount })),
        });
        continue;
      }
      const price = clean(item.price) || variants[0]?.price || "";
      if (!price) return null;
      const { amount, currency } = money(price);
      if (amount === null) {
        rates.push(asNote(name, price, includes));
        continue;
      }
      simulable += 1;
      rates.push({ kind: "service", name, price, includes, amount, currency });
      continue;
    }

    if (type === "extra") {
      const price = clean(item.price);
      if (!price) return null;
      const { amount, currency } = money(price);
      if (amount === null) {
        rates.push(asNote(name, price));
        continue;
      }
      rates.push({ kind: "extra", name, price, includes: [], amount, currency });
      continue;
    }

    if (type === "modifier") {
      let options = objectsOf(item.options)
        .map((option) => ({ label: clean(option.label) || name, price: clean(option.price) }))
        .filter((option) => option.price);
      if (options.length === 0) {
        const price = clean(item.price);
        if (!price) return null;
        options = [{ label: name, price }];
      }
      rates.push({
        kind: "modifier",
        name,
        price: options[0].price,
        includes: [],
        options: options.map((option) => ({ label: option.label, price: option.price, percent: percentOf(option.price) })),
      });
      continue;
    }

    if (type === "note") {
      const value = clean(item.text) || clean(item.price);
      rates.push(asNote(name, value || name));
      continue;
    }

    return null;
  }

  if (simulable === 0 || currencies.size > 1) return null;
  const parsed = canvaRatesSchema.safeParse(rates);
  return parsed.success ? parsed.data : null;
}

/** La lectura plana de siempre (Ronda 14 · D): todo o nada. */
function parseLegacy(text: string): CanvaRate[] | null {
  const raw = jsonObject(text);
  if (!raw) return null;
  const items = raw.items;
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
