import "server-only";

import sharp from "sharp";

/*  
 * Ronda 14B · 3: clasificación por CONTENIDO de las imágenes de las zonas de prueba (Métricas, Testimonios) y de  
 * Fotos, para diseños cuyos títulos no son legibles por máquina (van dibujados o dentro de imágenes). Mismo patrón  
 * que logo-vision.ts: Groq vision (Llama 4 Scout), JSON estricto y, ante cualquier falla o duda, null. Con null manda  
 * la geometría de láminas y nada se descarta.  
 */

const MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";  
const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";  
const TIMEOUT_MS = 15_000;

export type ProofKind = "metrics" | "testimonial" | "photo" | "logo" | "other";

const KINDS: readonly ProofKind[] = ["metrics", "testimonial", "photo", "logo", "other"];

const PROMPT =  
  "Clasifica esta imagen del portafolio de una creadora de contenido. Elige UNA categoría: " +  
  '"metrics" = captura de estadísticas o analítica de una red social o app (cifras, gráficos, alcance, vistas, seguidores, interacción), incluida la vista de estadísticas de una publicación; ' +  
  '"testimonial" = captura de un mensaje, chat, correo, reseña o carta de una marca o cliente dirigida a la creadora; ' +  
  '"photo" = fotografía de una persona, un producto o un lugar, sin interfaz de app; ' +  
  '"logo" = el logo de una marca; ' +  
  '"other" = cualquier otra cosa, o si dudas. ' +  
  'Responde SOLO con este JSON: {"kind": "metrics"} (con la categoría elegida).';

/** La categoría de la imagen, o null si no hay veredicto (sin llave, sin red, respuesta no clara). */  
export async function classifyProofImage(bytes: Buffer): Promise<ProofKind | null> {  
  const key = process.env.GROQ_API_KEY?.trim();  
  if (!key) return null;  
  try {  
    const small = await sharp(bytes)  
      .resize(768, 768, { fit: "inside", withoutEnlargement: true })  
      .flatten({ background: "#ffffff" })  
      .jpeg({ quality: 80 })  
      .toBuffer();  
    const response = await fetch(ENDPOINT, {  
      method: "POST",  
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },  
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
              { type: "image_url", image_url: { url: "data:image/jpeg;base64," + small.toString("base64") } },  
            ],  
          },  
        ],  
      }),  
    });  
    if (!response.ok) return null;  
    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };  
    const text = data.choices?.[0]?.message?.content ?? "";  
    const match = /"kind"\s*:\s*"([a-z]+)"/.exec(text);  
    const kind = match?.[1] as ProofKind | undefined;  
    return kind && KINDS.includes(kind) ? kind : null;  
  } catch {  
    return null;  
  }  
}
