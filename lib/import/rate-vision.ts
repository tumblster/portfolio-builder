import "server-only";

import sharp from "sharp";  
import { canvaRatesSchema, type CanvaRate } from "@/lib/portfolio/schema";

/*  
 * Ronda 14 · D: lee el tarifario de la creadora (la imagen `rateCard` de su Canva) y devuelve sus servicios con su  
 * precio TAL COMO ESTÁN ESCRITOS. Mismo patrón que logo-vision.ts: Groq vision (Llama 4 Scout), respuesta JSON  
 * estricta y, ante cualquier falla o duda, null (se muestra la imagen como siempre).  
 *  
 * Garantías contra inventar:  
 * - El precio es texto visible ("S/ 500", "$100"): no se convierte, no se calcula, no se normaliza la moneda.  
 * - Todo o nada: si un solo ítem viene incompleto, sin cifra en el precio o mal formado, se descarta la lectura entera  
 *   (una lista parcial se vería completa y mentiría por omisión).  
 * - Respuesta cortada por tokens, JSON roto, más de 8 servicios o lista vacía → null.  
 */

const MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";  
const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";  
const TIMEOUT_MS = 25_000;

const PROMPT =  
  "Esta imagen es el tarifario de una creadora de contenido. Copia sus servicios y precios EXACTAMENTE como están escritos en la imagen. " +  
  "Para cada servicio: name (el nombre tal cual), price (el precio como texto visible, con su símbolo de moneda tal cual, por ejemplo \"S/ 500\" o \"$100\"; no conviertas ni calcules nada) " +  
  "e includes (lo que la imagen dice que incluye ese servicio, cada ítem tal cual; lista vacía si no dice nada). " +  
  "No agregues nada que no esté escrito. Si un servicio no tiene precio visible, no lo incluyas. " +  
  'Si no puedes leer la imagen con seguridad o no es un tarifario, responde {"items": []}. ' +  
  'Responde SOLO con este JSON: {"items": [{"name": "...", "price": "...", "includes": ["..."]}]}';

type Choice = { finish_reason?: string; message?: { content?: string } };

const clean = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");

/** Las tarifas del tarifario, o null si no se pudieron leer con confianza. */  
export async function readRateCard(bytes: Buffer): Promise<CanvaRate[] | null> {  
  const key = process.env.GROQ_API_KEY?.trim();  
  if (!key) return null;  
  try {  
    // Más resolución que para un logo: aquí se leen cifras y textos chicos.  
    const image = await sharp(bytes)  
      .resize(1280, 1280, { fit: "inside", withoutEnlargement: true })  
      .flatten({ background: "#ffffff" })  
      .jpeg({ quality: 85 })  
      .toBuffer();  
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
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image.toString("base64")}` } },  
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
