import "server-only";
import { z } from "zod";
import { ConfigError } from "@/lib/errors";
import { ImportError, isTimeoutError } from "@/lib/import/errors";
import { instagramProfileUrl } from "./username";

/*
 * Scrapeo del perfil con el actor oficial apify/instagram-scraper en modo "details":
 * una sola corrida devuelve foto, bio, contadores y los últimos ~12 posts.
 * Cobra por resultado: un perfil = 1 resultado (≈ US$0,003 en el plan gratis).
 *
 * Se usa el endpoint síncrono: espera a que termine la corrida y devuelve los datos.
 * Nunca se reintenta solo: cada intento es una corrida nueva que se cobra.
 */

const ENDPOINT = "https://api.apify.com/v2/actors/apify~instagram-scraper/run-sync-get-dataset-items";
const RUN_TIMEOUT_SECONDS = 90;
/** Tope de gasto por corrida. Un perfil cuesta ~US$0,003; esto solo frena una corrida desbocada. */
const MAX_CHARGE_USD = 0.5;

function readToken(): string {
  const token = process.env.APIFY_TOKEN?.trim();
  if (!token) {
    throw new ConfigError("Falta APIFY_TOKEN. Agrégalo en .env.local (en tu compu) o en las variables de entorno de Vercel.");
  }
  return token;
}

/** Verifica la configuración antes de gastar nada. */
export function assertApifyConfigured(): void {
  readToken();
}

// ── Lo que devuelve el actor (solo los campos que usamos; todo opcional) ──
const count = z.number().nullish();

const apifyPostSchema = z.object({
  id: z.union([z.string().min(1), z.number()]).transform(String),
  type: z.string().nullish(), // "Image" | "Video" | "Sidecar"
  productType: z.string().nullish(), // "clips" = reel
  shortCode: z.string().nullish(),
  url: z.string().nullish(),
  caption: z.string().nullish(),
  hashtags: z.array(z.string()).nullish(),
  displayUrl: z.string().nullish(),
  likesCount: count, // -1 si la creadora oculta los likes
  commentsCount: count,
  videoViewCount: count,
  videoPlayCount: count,
  timestamp: z.string().nullish(),
  isPinned: z.boolean().nullish(),
});
export type ApifyPost = z.infer<typeof apifyPostSchema>;

const apifyProfileSchema = z.object({
  username: z.string().min(1),
  fullName: z.string().nullish(),
  biography: z.string().nullish(),
  externalUrl: z.string().nullish(),
  followersCount: count,
  followsCount: count,
  postsCount: count,
  verified: z.boolean().nullish(),
  isBusinessAccount: z.boolean().nullish(),
  businessCategoryName: z.string().nullish(),
  private: z.boolean().nullish(),
  profilePicUrl: z.string().nullish(),
  profilePicUrlHD: z.string().nullish(),
  latestPosts: z.array(z.unknown()).nullish(),
});
export type ApifyProfile = Omit<z.infer<typeof apifyProfileSchema>, "latestPosts"> & { latestPosts: ApifyPost[] };

export type ScrapeResult =
  | { status: "ok"; profile: ApifyProfile }
  | { status: "not_found" }
  | { status: "unavailable" };

export async function scrapeInstagramProfile(username: string): Promise<ScrapeResult> {
  const url = new URL(ENDPOINT);
  url.searchParams.set("timeout", String(RUN_TIMEOUT_SECONDS));
  url.searchParams.set("maxTotalChargeUsd", String(MAX_CHARGE_USD));
  url.searchParams.set("format", "json");
  url.searchParams.set("clean", "true");

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${readToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ directUrls: [instagramProfileUrl(username)], resultsType: "details" }),
      signal: AbortSignal.timeout((RUN_TIMEOUT_SECONDS + 30) * 1000),
      cache: "no-store",
    });
  } catch (error) {
    if (isTimeoutError(error)) throw timeoutError();
    console.error("[apify] no se pudo conectar:", error);
    throw new ImportError("scrape_failed", "No pudimos conectarnos con el servicio que lee Instagram. Intenta de nuevo en un momento.");
  }

  if (!response.ok) throw await toApifyError(response);

  const items: unknown = await response.json().catch(() => null);
  if (!Array.isArray(items)) {
    throw new ImportError("scrape_failed", "El servicio que lee Instagram respondió algo inesperado. Intenta de nuevo.");
  }
  return interpretItems(items);
}

function interpretItems(items: unknown[]): ScrapeResult {
  for (const item of items) {
    if (!isRecord(item) || typeof item.error === "string") continue;
    const parsed = apifyProfileSchema.safeParse(item);
    if (parsed.success) {
      const latestPosts = (parsed.data.latestPosts ?? []).flatMap((post) => {
        const result = apifyPostSchema.safeParse(post);
        return result.success ? [result.data] : [];
      });
      return { status: "ok", profile: { ...parsed.data, latestPosts } };
    }
  }

  // Sin perfil: el actor deja un item con { error, errorDescription }.
  const failure = items.find((item) => isRecord(item) && typeof item.error === "string");
  if (isRecord(failure)) {
    const text = `${failure.error} ${failure.errorDescription ?? ""}`.toLowerCase();
    if (/not.?found|does not exist|no existe/.test(text)) return { status: "not_found" };
    console.warn("[apify] perfil sin datos:", failure.error, failure.errorDescription);
  }
  return { status: "unavailable" };
}

async function toApifyError(response: Response): Promise<Error> {
  const body: unknown = await response.json().catch(() => null);
  const error = isRecord(body) && isRecord(body.error) ? body.error : {};
  const type = typeof error.type === "string" ? error.type : "";
  const message = typeof error.message === "string" ? error.message : "";
  console.error(`[apify] HTTP ${response.status} ${type}: ${message}`);

  if (response.status === 401 || ["invalid-token", "token-not-provided", "user-or-token-not-found"].includes(type)) {
    return new ConfigError("APIFY_TOKEN no es válido. Cópialo de nuevo desde console.apify.com → Settings → API & Integrations.");
  }
  if (type === "max-total-charge-usd-below-minimum") {
    return new ConfigError(`Apify pide un tope de gasto por corrida mayor al configurado: ${message}`);
  }
  if (response.status === 402 || ["not-enough-usage-to-run-paid-actor", "limit-reached", "monthly-usage-limit-too-low"].includes(type)) {
    return new ImportError(
      "provider_limit",
      "Apify no tiene saldo o se alcanzó el tope de gasto del mes. Revísalo en console.apify.com → Billing.",
    );
  }
  if (response.status === 408 || type === "run-timeout-exceeded") return timeoutError();
  if (response.status === 429 || type === "rate-limit-exceeded") {
    return new ImportError("scrape_failed", "Apify está recibiendo demasiadas solicitudes. Espera un minuto e intenta de nuevo.");
  }
  return new ImportError(
    "scrape_failed",
    "No pudimos leer el perfil en este momento. Intenta de nuevo en unos minutos o llénalo a mano.",
  );
}

const timeoutError = () =>
  new ImportError("timeout", "Instagram tardó demasiado en responder. Intenta de nuevo en un minuto o llénalo a mano.");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
