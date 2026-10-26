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
 *
 * Ronda de corrección:
 * - F1: sin llave, sin red o sin respuesta clara: null, y el import NO deja entrar el candidato a la franja. Para no
 *   perder logos reales por un fallo pasajero, cada consulta se reintenta una vez.
 * - F2: nueva clase "poster" (póster, flyer, cartel, portada), que veta igual que "person". Las ilustraciones,
 *   mascotas o avatares dibujados de una marca cuentan como logo; las FOTOS de personas, no.
 * - F3: `auditStripLogo` es la auditoría final de cada logo de la franja (prompt propio, más estricto).
 * - F5: la lectura trae el nombre de la marca si se lee en la imagen (deduplicado por marca).
 */

const MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const TIMEOUT_MS = 15_000;
const ATTEMPTS = 2;
const RETRY_DELAY_MS = 600;
const MAX_TOKENS = 60;
const BRAND_MAX_CHARS = 60;

export type LogoKind = "logo" | "person" | "poster" | "screenshot" | "photo" | "other";

const KINDS: readonly LogoKind[] = ["logo", "person", "poster", "screenshot", "photo", "other"];

/** F5: la clase y, si se lee, el nombre de la marca. */
export type LogoReading = { kind: LogoKind; brand: string | null };

const CATEGORIES =
  '"logo" = el logo o la insignia de una marca o negocio, con o sin texto, de cualquier color o forma (también redondo o sobre un fondo de color); las ilustraciones, mascotas o avatares dibujados de una marca también son "logo"; ' +
  '"person" = una FOTO donde aparece una persona o parte de ella (cara, manos, cuerpo), aunque también haya un producto o un logo; ' +
  '"poster" = un póster, flyer, cartel, portada o anuncio (texto grande sobre una foto o ilustración: un evento, una obra, una película, una promoción); ' +
  '"screenshot" = una captura de pantalla de una app o red social, una pantalla de estadísticas o un chat; ' +
  '"photo" = una foto de un producto, un lugar o un objeto, sin personas; ' +
  '"other" = una textura, un fondo, un ícono decorativo, o si dudas. ';

const ANSWER =
  'Si es "logo", escribe en "brand" el nombre de la marca tal como se lee en la imagen; si no se lee, null. ' +
  'Responde SOLO con este JSON: {"kind": "logo", "brand": "Nombre"} (con la categoría elegida).';

const PROMPT =
  "Clasifica esta imagen, que podría ir en una franja de logos de marcas. Elige UNA categoría: " + CATEGORIES + ANSWER;

const AUDIT_PROMPT =
  "Revisión final: esta imagen ya está en la franja de logos de marcas de un portafolio y solo puede quedarse si es " +
  "EXCLUSIVAMENTE el logo o la insignia de una marca. Elige UNA categoría: " +
  CATEGORIES +
  ANSWER;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function cleanBrand(value: string | undefined): string | null {
  if (!value) return null;
  const brand = value.replace(/\s+/g, " ").trim().slice(0, BRAND_MAX_CHARS);
  if (brand.length < 2) return null;
  if (/^(null|none|unknown|desconocid[ao]|n\/a|logo|marca|brand)$/i.test(brand)) return null;
  return brand;
}

function parseReading(text: string): LogoReading | null {
  const kindMatch = /"kind"\s*:\s*"([a-z]+)"/.exec(text);
  const kind = kindMatch?.[1] as LogoKind | undefined;
  if (!kind || !KINDS.includes(kind)) return null;
  const brandMatch = /"brand"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(text);
  return { kind, brand: kind === "logo" ? cleanBrand(brandMatch?.[1]) : null };
}

async function ask(key: string, base64: string, prompt: string): Promise<LogoReading | null> {
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_tokens: MAX_TOKENS,
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
    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    return parseReading(data.choices?.[0]?.message?.content ?? "");
  } catch {
    return null;
  }
}

async function read(bytes: Buffer, prompt: string): Promise<LogoReading | null> {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) return null;
  let base64: string;
  try {
    // Fondo blanco antes del JPEG: un logo transparente no se vuelve un cuadro negro.
    base64 = (
      await sharp(bytes)
        .resize(512, 512, { fit: "inside", withoutEnlargement: true })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: 80 })
        .toBuffer()
    ).toString("base64");
  } catch {
    return null;
  }
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    if (attempt > 0) await sleep(RETRY_DELAY_MS);
    const reading = await ask(key, base64, prompt);
    if (reading) return reading;
  }
  return null;
}

/** F1 / F5: la clase del candidato y su marca, o null si no hay veredicto claro (no entra a la franja). */
export async function readLogoCandidate(bytes: Buffer): Promise<LogoReading | null> {
  return read(bytes, PROMPT);
}

/** F3: auditoría final de un logo de la franja (sobre su copia final). null = sin auditoría de visión. */
export async function auditStripLogo(bytes: Buffer): Promise<LogoReading | null> {
  return read(bytes, AUDIT_PROMPT);
}

/** Compatibilidad: la clase de la imagen, o null si no hay veredicto. */
export async function classifyLogoCandidate(bytes: Buffer): Promise<LogoKind | null> {
  return (await readLogoCandidate(bytes))?.kind ?? null;
}

/** Compatibilidad: true = es logo · false = no es logo · null = sin veredicto. */
export async function visionSaysLogo(bytes: Buffer): Promise<boolean | null> {
  const kind = await classifyLogoCandidate(bytes);
  return kind === null ? null : kind === "logo";
}
