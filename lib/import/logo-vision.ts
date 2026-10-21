import "server-only";

import sharp from "sharp";

/*
 * Clasificación por CONTENIDO de los candidatos a logo (auditoría de la
 * franja de marcas): la pregunta no es la forma ni el tamaño de la imagen,
 * es si ES un logo. Una captura de estadísticas es, en píxeles, indistinguible
 * de un logo con texto (fondo blanco, colores planos), así que la decide un
 * modelo de visión barato (Groq, Llama 4 Scout) solo sobre los candidatos que
 * ya pasaron el test de píxeles. Sin llave, sin red o sin respuesta clara
 * devuelve null y manda el veredicto de píxeles: ante la duda, no se descarta.
 */

const MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const TIMEOUT_MS = 15_000;

const PROMPT =
  "¿Esta imagen es el logo de una marca? Un logo es el gráfico de identidad de una marca o negocio, con o sin texto. " +
  "NO es un logo: una captura de pantalla de una app o red social, una pantalla de estadísticas o métricas, una foto, una textura o un fondo. " +
  'Responde SOLO con este JSON: {"logo": true} o {"logo": false}.';

/** true = es logo · false = no es logo · null = sin veredicto (conservar). */
export async function visionSaysLogo(bytes: Buffer): Promise<boolean | null> {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) return null;
  try {
    const small = await sharp(bytes)
      .resize(512, 512, { fit: "inside" })
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
    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    const match = text.match(/"logo"\s*:\s*(true|false)/);
    return match ? match[1] === "true" : null;
  } catch {
    return null;
  }
}
