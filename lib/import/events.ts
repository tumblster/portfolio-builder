import type { NicheDef } from "@/lib/portfolio/niches";
import type { ResolvedPortfolio } from "@/lib/portfolio/resolve";
import type { EngagementRate, StoredImage } from "@/lib/portfolio/schema";

/*
 * Contrato entre POST /api/import y la pantalla de importación.
 * La respuesta es un stream NDJSON: un evento JSON por línea.
 *   {"type":"step","step":"scrape"}   … un evento por paso
 *   {"type":"done", …}                 portafolio creado
 *   {"type":"manual", …}               perfil privado o con menos de 3 posts
 *   {"type":"error", …}                algo falló
 *   {"type":"ping"}                    latido, se ignora
 */

export const IMPORT_STEPS = ["scrape", "images", "ai"] as const;
export type ImportStep = (typeof IMPORT_STEPS)[number];

export type ImportErrorCode =
  | "not_found" // el usuario no existe
  | "unavailable" // Instagram no devolvió datos (privado o inexistente)
  | "timeout"
  | "scrape_failed"
  | "provider_limit" // sin saldo o tope de gasto alcanzado en Apify
  | "config" // falta o está mal una variable de entorno
  | "server_error";

/** Lo que el formulario manual recibe ya lleno cuando no se pudo armar el portafolio solo. */
export type ManualPrefill = {
  username: string;
  name: string;
  bio: string;
  photo: StoredImage | null;
  contact: { instagram: string; website?: string };
  pieces: { title: string; image: StoredImage; videoUrl: string | null }[];
};

export type ImportEvent =
  /** Latido cada 10 s mientras se espera a Apify o a Groq: evita que una red móvil corte la conexión por inactividad. */
  | { type: "ping" }
  | { type: "step"; step: ImportStep }
  /** v2 · M2: la importación terminó y espera la confirmación del creador (nichos, plantilla, paleta). */
  | { type: "draft"; draft: DraftPreview }
  | { type: "manual"; reason: "private_profile" | "not_enough_posts"; message: string; prefill: ManualPrefill }
  | { type: "error"; code: ImportErrorCode; message: string };

/** Llave en sessionStorage para pasar los datos al formulario manual. */
export const MANUAL_PREFILL_KEY = "supercreador:prefill-manual";

/** Lo que el creador revisa antes de generar (paso "nichos → plantilla → paleta"). */
export type DraftPreview = {
  draftId: string;
  username: string;
  name: string;
  photo: StoredImage | null;
  /** Nichos que sugirió la IA, cada uno con al menos una pieza: los chips pre-marcados. */
  suggestedNiches: NicheDef[];
  pieces: { id: string; title: string; image: StoredImage | null; niche: string | null; isVideo: boolean }[];
  engagementRate: EngagementRate | null;
  aiWritten: boolean;
  warnings: string[];
};

/** Respuesta de /api/import/confirm: el portafolio ya generado (modal "Portafolio listo"). */
export type ImportResult = {
  url: string;
  slug: string;
  username: string;
  revision: number;
  resolved: ResolvedPortfolio;
  warnings: string[];
};
