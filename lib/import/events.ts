import type { NicheDef } from "@/lib/portfolio/niches";
import type { ResolvedPortfolio } from "@/lib/portfolio/resolve";
import type { CreatorMetric } from "@/lib/portfolio/metrics";
import type { EngagementRate, StoredImage } from "@/lib/portfolio/schema";

export type DraftPiece = {
  id: string;
  title: string;
  image: StoredImage | null;
  niche: string | null;
  isVideo: boolean;
  /** Qué es en Instagram (10.2): el visor lo aclara en los carruseles (se importa su portada). */
  kind: "video" | "image" | "carousel";
  /** Spec 11.5: autor del post agregado por link (oEmbed). */
  author?: string | null;
  /** El post original en Instagram (spec 11.3: "verlo completo" de un carrusel). */
  postUrl: string | null;
  /** Su video, para verlo en línea (ajuste 5); null si es una foto. */
  video: { platform: "tiktok" | "instagram" | "youtube"; url: string } | null;
};

/** Ronda 6 · 13.6: una forma de colaborar que sugirió la IA (la creadora la revisa antes de publicarla). */
export type SuggestedService = { title: string; description: string };

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
  /** Las que eligió la IA, en su orden: los chips iniciales de piezas. */
  pieces: DraftPiece[];
  /** Ronda 30/09 · 7.1: el resto de sus publicaciones con imagen ("De tu perfil"), para sumarlas como chips. */
  profilePosts: DraftPiece[];
  engagementRate: EngagementRate | null;
  /** Seguidores, Interacciones promedio y ER, listos para mostrar (7.2). */
  metrics: CreatorMetric[];
  /** Cuántas piezas puede tener el portafolio (LIMITS): el selector lo respeta sin cargar el esquema completo. */
  pieceLimits: { min: number; max: number };
  /**
   * Ronda 6 · 13.6: las formas de colaborar que propuso la IA a partir de sus captions y de las marcas que menciona.
   * Solo sugerencias: el paso Servicios las muestra como tales y nada se publica sin la confirmación de la creadora.
   * Opcional: los borradores anteriores a esta ronda no lo traen.
   */
  suggestedServices?: SuggestedService[];
  /** Ronda 6 · 13.6: las @cuentas que menciona en sus captions (sin la propia), como contexto de las sugerencias. */
  brandMentions?: string[];
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
  /**
   * Ronda 6 · 13.15: la cuenta del onboarding (el correo) y qué pasó con el correo de sus links: "smtp" (salió),
   * "mock" (sin SMTP: quedó en los registros), "failed" (no salió: se puede reenviar) o null (no se mandó en esta
   * petición, p. ej. un reintento que devolvió el mismo portafolio). Ausente o null en clientes sin onboarding.
   */
  owner?: { email: string; mail: "smtp" | "mock" | "failed" | null } | null;
};
