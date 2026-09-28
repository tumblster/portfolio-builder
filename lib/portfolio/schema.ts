import { z } from "zod";
import { NICHES } from "./niches";
import { slugSchema } from "./slug";

/*
 * Modelo de datos de un portafolio. Se guarda un JSON por portafolio.
 *
 * Guarda tres fuentes por separado, sin mezclarlas:
 *   instagram  → lo que se scrapeó del perfil con Apify. No se edita.
 *   generated  → lo que redactó la IA con Groq: propuesta de valor y, por cada
 *                post elegido, un título y un nicho sugeridos. No se edita.
 *   manual     → lo que se escribe a mano. Siempre gana.
 *
 * La página pública muestra: manual → si no hay, IA → si no hay, Instagram
 * (ver resolvePortfolio en resolve.ts). Así, regenerar con IA o volver a
 * scrapear nunca borra una corrección hecha a mano.
 *
 * `pieces` es la selección final que se muestra (3 a 6, en orden). Cada pieza
 * recuerda si vino de Instagram o se agregó a mano, y puede llevar un nicho.
 *
 * Este archivo no depende del servidor: el formulario también lo puede usar.
 */

export const SCHEMA_VERSION = 1;

export const LIMITS = {
  name: 80,
  bio: 220,
  valueProp: 160,
  pieceTitle: 80,
  minPieces: 3,
  maxPieces: 6,
  instagramPosts: 12,
} as const;

const utcDate = z.iso.datetime(); // ISO 8601 en UTC, p. ej. 2026-09-28T15:04:05.000Z

// ── Nichos ──────────────────────────────────────────────────────────
export { NICHES, NICHE_LABELS, type Niche } from "./niches";
export const nicheSchema = z.enum(NICHES, { error: "Nicho inválido: usa belleza, lifestyle o viajes." });

// ── Imágenes ────────────────────────────────────────────────────────
/** Nombre que el servidor le da a cada imagen guardada: <uuid>.webp */
export const MEDIA_FILE_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/;

/**
 * Imagen guardada en NUESTRO almacenamiento. Nunca se guardan URLs de
 * Instagram: caducan a los pocos días. Tampoco URLs externas arbitrarias.
 */
export const storedImageSchema = z.object({
  url: z.string().refine(
    (url) => url.startsWith("/media/") && MEDIA_FILE_PATTERN.test(url.slice("/media/".length)),
    { error: "La imagen tiene que subirse primero (POST /api/media)." },
  ),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  alt: z.string().trim().max(200).optional(),
});
export type StoredImage = z.infer<typeof storedImageSchema>;

// ── Videos (RF-02: TikTok, Instagram, YouTube) ─────────────────────
export const VIDEO_PLATFORMS = ["tiktok", "instagram", "youtube"] as const;
export const videoLinkSchema = z.object({
  platform: z.enum(VIDEO_PLATFORMS),
  url: z.url({ protocol: /^https$/ }),
});
export type VideoLink = z.infer<typeof videoLinkSchema>;

/** Reconoce un link de video de TikTok, Instagram (post o reel) o YouTube. Si no lo es, devuelve null. */
export function parseVideoLink(raw: string): VideoLink | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  url.protocol = "https:";
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, "");
  const path = url.pathname;

  if ((host === "tiktok.com" || host.endsWith(".tiktok.com")) && path.length > 1) {
    return { platform: "tiktok", url: url.toString() };
  }
  if (host === "instagram.com" && /^\/(p|reel|reels|tv)\/[\w-]+/.test(path)) {
    return { platform: "instagram", url: url.toString() };
  }
  const isYouTubeVideo =
    (host === "youtu.be" && path.length > 1) ||
    ((host === "youtube.com" || host.endsWith(".youtube.com")) &&
      (url.searchParams.has("v") || /^\/(shorts|live|embed)\/[\w-]+/.test(path)));
  if (isYouTubeVideo) return { platform: "youtube", url: url.toString() };

  return null;
}

// ── Contacto y redes ────────────────────────────────────────────────
// Texto vacío ("") = "no mostrar", aunque Instagram tenga ese dato.

/** Campo opcional que se normaliza y luego se valida; "" siempre es válido. */
function contactField(normalize: (value: string) => string, isValid: (value: string) => boolean, error: string) {
  return z
    .string()
    .trim()
    .max(300)
    .transform(normalize)
    .refine((value) => value === "" || isValid(value), { error })
    .optional();
}

/** Acepta "@usuario", "usuario" o el link del perfil, y guarda solo "usuario". */
function handleFrom(hostPattern: RegExp) {
  return (value: string) => {
    const fromUrl = value.match(hostPattern);
    return (fromUrl ? fromUrl[1] : value).replace(/^@/, "").replace(/\/+$/, "");
  };
}

const withProtocol = (value: string) =>
  value === "" || /^https?:\/\//i.test(value) ? value : `https://${value}`;

const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".");
  } catch {
    return false;
  }
};

export const contactSchema = z.object({
  email: contactField(
    (v) => v.toLowerCase(),
    (v) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v),
    "El correo no es válido.",
  ),
  whatsapp: contactField(
    (v) => v.replace(/[\s().-]/g, ""),
    (v) => /^\+?\d{8,15}$/.test(v),
    "Escribe el WhatsApp con código de país, por ejemplo +51 987 654 321.",
  ),
  instagram: contactField(
    handleFrom(/instagram\.com\/([A-Za-z0-9._]+)/i),
    (v) => /^[A-Za-z0-9._]{1,30}$/.test(v),
    "Escribe solo el usuario de Instagram, por ejemplo valen.ugc",
  ),
  tiktok: contactField(
    handleFrom(/tiktok\.com\/@?([A-Za-z0-9._]+)/i),
    (v) => /^[A-Za-z0-9._]{2,24}$/.test(v),
    "Escribe solo el usuario de TikTok, por ejemplo valen.ugc",
  ),
  youtube: contactField(
    (v) => (v.startsWith("@") ? `https://www.youtube.com/${v}` : withProtocol(v)),
    (v) => isHttpUrl(v) && /(^|\.)youtube\.com$|^youtu\.be$/i.test(new URL(v).hostname),
    "Pega el link de tu canal de YouTube o escribe tu @usuario.",
  ),
  website: contactField(withProtocol, isHttpUrl, "El link no es válido."),
});
export type Contact = z.infer<typeof contactSchema>;

// ── Piezas del portafolio ───────────────────────────────────────────
export const PIECE_ORIGINS = ["instagram", "manual"] as const;

export const pieceSchema = z
  .object({
    id: z.string().min(1).max(64),
    origin: z.enum(PIECE_ORIGINS),
    title: z.string().trim().min(1).max(LIMITS.pieceTitle),
    niche: nicheSchema.nullable(), // etiqueta opcional: sube primero en la versión de su nicho
    image: storedImageSchema.nullable(), // foto, o portada si es video
    video: videoLinkSchema.nullable(),
    sourcePostId: z.string().max(64).optional(), // id del post de Instagram, si vino de ahí
  })
  .refine((piece) => piece.image !== null || piece.video !== null, {
    error: "Cada pieza necesita una imagen o un link de video.",
  });
export type Piece = z.infer<typeof pieceSchema>;

/** Pieza tal como llega del formulario. `id` solo viene al editar una que ya existía. */
export const pieceInputSchema = z
  .object({
    id: z.string().trim().max(64).optional(),
    title: z
      .string({ error: "Ponle un título a la pieza." })
      .trim()
      .min(1, { error: "Ponle un título a la pieza." })
      .max(LIMITS.pieceTitle, { error: `El título admite hasta ${LIMITS.pieceTitle} caracteres.` }),
    niche: nicheSchema.nullable().default(null),
    image: storedImageSchema.nullable().default(null),
    videoUrl: z.string().trim().max(500).nullable().default(null),
  })
  .transform((piece, ctx) => {
    const video = piece.videoUrl ? parseVideoLink(piece.videoUrl) : null;
    if (piece.videoUrl && !video) {
      ctx.addIssue({
        code: "custom",
        message: "Pega un link de video de TikTok, Instagram o YouTube.",
        path: ["videoUrl"],
      });
      return z.NEVER;
    }
    if (!piece.image && !video) {
      ctx.addIssue({ code: "custom", message: "Agrega una imagen o un link de video.", path: ["image"] });
      return z.NEVER;
    }
    return { id: piece.id, title: piece.title, niche: piece.niche, image: piece.image, video };
  });
export type PieceInput = z.output<typeof pieceInputSchema>;

const piecesInputSchema = z
  .array(pieceInputSchema)
  .min(LIMITS.minPieces, { error: `Agrega al menos ${LIMITS.minPieces} piezas.` })
  .max(LIMITS.maxPieces, { error: `Puedes mostrar hasta ${LIMITS.maxPieces} piezas.` });

// ── Datos scrapeados de Instagram (Apify · apify/instagram-scraper) ─
const count = z.number().int().nonnegative().nullable(); // null = Instagram no lo muestra

export const instagramPostSchema = z.object({
  id: z.string(),
  shortCode: z.string(),
  url: z.url(),
  type: z.enum(["image", "video", "carousel"]),
  caption: z.string().max(2200),
  hashtags: z.array(z.string()).max(60),
  takenAt: utcDate.nullable(),
  likesCount: count,
  commentsCount: count,
  viewsCount: count,
  isPinned: z.boolean(),
  image: storedImageSchema.nullable(), // copia propia de la imagen o portada del post
});
export type InstagramPost = z.infer<typeof instagramPostSchema>;

export const instagramSnapshotSchema = z.object({
  source: z.literal("apify/instagram-scraper"),
  scrapedAt: utcDate,
  username: z.string().min(1),
  profileUrl: z.url(),
  fullName: z.string(),
  biography: z.string(),
  externalUrl: z.url().nullable(),
  followersCount: count,
  followsCount: count,
  postsCount: count,
  isVerified: z.boolean(),
  isBusinessAccount: z.boolean(),
  businessCategory: z.string().nullable(),
  profilePhoto: storedImageSchema.nullable(), // copia propia de la foto de perfil
  posts: z.array(instagramPostSchema).max(LIMITS.instagramPosts),
});
export type InstagramSnapshot = z.infer<typeof instagramSnapshotSchema>;

// ── Contenido generado por IA (Groq) ────────────────────────────────
export const generatedPieceSchema = z.object({
  sourcePostId: z.string().min(1).max(64),
  title: z.string().trim().min(1).max(LIMITS.pieceTitle),
  niche: nicheSchema.nullable(),
});
export type GeneratedPiece = z.infer<typeof generatedPieceSchema>;

export const generatedContentSchema = z.object({
  provider: z.literal("groq"),
  model: z.string().min(1).max(100),
  generatedAt: utcDate,
  valueProp: z.string().trim().min(1).max(LIMITS.valueProp),
  /** Sugerencias de la IA por post. Se copian a `pieces`, que es lo que se edita. */
  pieces: z.array(generatedPieceSchema).max(LIMITS.instagramPosts).default([]),
});
export type GeneratedContent = z.infer<typeof generatedContentSchema>;

// ── Datos escritos a mano (siempre ganan) ───────────────────────────
export const manualDataSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: "El nombre no puede quedar vacío." })
    .max(LIMITS.name, { error: `El nombre admite hasta ${LIMITS.name} caracteres.` })
    .optional(),
  bio: z
    .string()
    .trim()
    .max(LIMITS.bio, { error: `La bio admite hasta ${LIMITS.bio} caracteres.` })
    .optional(),
  photo: storedImageSchema.nullable().optional(), // null = sin foto
  valueProp: z
    .string()
    .trim()
    .max(LIMITS.valueProp, { error: `La propuesta de valor admite hasta ${LIMITS.valueProp} caracteres.` })
    .optional(),
  contact: contactSchema.optional(),
});
export type ManualData = z.infer<typeof manualDataSchema>;

// ── Documento completo ──────────────────────────────────────────────
export const PORTFOLIO_SOURCES = ["instagram", "manual"] as const;

export const portfolioSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    slug: slugSchema,
    revision: z.number().int().positive(), // sube en cada guardado; evita pisar cambios ajenos
    createdAt: utcDate,
    updatedAt: utcDate,
    source: z.enum(PORTFOLIO_SOURCES), // cómo se creó
    instagram: instagramSnapshotSchema.nullable(),
    generated: generatedContentSchema.nullable(),
    manual: manualDataSchema,
    pieces: z.array(pieceSchema).min(LIMITS.minPieces).max(LIMITS.maxPieces),
  })
  .refine((doc) => Boolean(doc.manual.name || doc.instagram?.fullName || doc.instagram?.username), {
    error: "El portafolio necesita un nombre.",
    path: ["manual", "name"],
  });
export type Portfolio = z.infer<typeof portfolioSchema>;

// ── Entradas de la API ──────────────────────────────────────────────
/** Crear a mano (fallback "prefiero llenarlo manual", RF-01). */
export const createPortfolioInputSchema = z.object({
  name: z
    .string({ error: "Escribe el nombre de tu clienta." })
    .trim()
    .min(1, { error: "Escribe el nombre de tu clienta." })
    .max(LIMITS.name, { error: `El nombre admite hasta ${LIMITS.name} caracteres.` }),
  bio: z
    .string()
    .trim()
    .max(LIMITS.bio, { error: `La bio admite hasta ${LIMITS.bio} caracteres.` })
    .default(""),
  photo: storedImageSchema.nullable().default(null),
  valueProp: z
    .string()
    .trim()
    .max(LIMITS.valueProp, { error: `La propuesta de valor admite hasta ${LIMITS.valueProp} caracteres.` })
    .default(""),
  contact: contactSchema.default({}),
  pieces: piecesInputSchema,
});
export type CreatePortfolioInput = z.output<typeof createPortfolioInputSchema>;

/**
 * Editar. `revision` es la versión que se estaba editando.
 * Cada sección que se envía (`manual`, `pieces`) reemplaza a la guardada.
 */
export const updatePortfolioInputSchema = z
  .object({
    revision: z.number({ error: "Falta la revisión (revision) que estás editando." }).int().positive(),
    manual: manualDataSchema.optional(),
    pieces: piecesInputSchema.optional(),
  })
  .refine((input) => input.manual !== undefined || input.pieces !== undefined, {
    error: "No hay cambios para guardar.",
  });
export type UpdatePortfolioInput = z.output<typeof updatePortfolioInputSchema>;
