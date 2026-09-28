import { LIMITS, type InstagramPost, type InstagramSnapshot, type StoredImage } from "@/lib/portfolio/schema";
import type { ApifyPost, ApifyProfile } from "./apify";
import { instagramProfileUrl } from "./username";

/*
 * Funciones puras: pasan lo que devolvió Apify al modelo de datos
 * y eligen qué posts se convierten en piezas del portafolio.
 */

const nonNegative = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;

const toIsoDate = (value: string | null | undefined) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

/** URL http(s) válida o null (p. ej. el link de la bio). */
export const httpUrlOrNull = (value: string | null | undefined) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
};

function postType(post: ApifyPost): InstagramPost["type"] {
  if (post.type === "Video" || post.productType === "clips" || post.productType === "igtv") return "video";
  if (post.type === "Sidecar") return "carousel";
  return "image";
}

/** Permalink del post. Sin link no sirve como pieza, así que devuelve null. */
function postUrl(post: ApifyPost): string | null {
  const direct = httpUrlOrNull(post.url);
  if (direct && /(^|\.)instagram\.com$/i.test(new URL(direct).hostname)) return direct;
  return post.shortCode ? `https://www.instagram.com/p/${post.shortCode}/` : null;
}

export function toInstagramPost(post: ApifyPost, image: StoredImage | null): InstagramPost | null {
  const url = postUrl(post);
  if (!url) return null;
  return {
    id: post.id.slice(0, 64),
    shortCode: post.shortCode ?? "",
    url,
    type: postType(post),
    caption: (post.caption ?? "").slice(0, 2200),
    hashtags: [...new Set((post.hashtags ?? []).map((tag) => tag.trim().slice(0, 100)).filter(Boolean))].slice(0, 60),
    takenAt: toIsoDate(post.timestamp),
    likesCount: nonNegative(post.likesCount), // -1 (likes ocultos) → null
    commentsCount: nonNegative(post.commentsCount),
    viewsCount: nonNegative(post.videoViewCount ?? post.videoPlayCount),
    isPinned: Boolean(post.isPinned),
    image,
  };
}

export function toSnapshot(
  profile: ApifyProfile,
  profilePhoto: StoredImage | null,
  posts: InstagramPost[],
  scrapedAt: string,
): InstagramSnapshot {
  const category = profile.businessCategoryName?.trim();
  return {
    source: "apify/instagram-scraper",
    scrapedAt,
    username: profile.username.toLowerCase(),
    profileUrl: instagramProfileUrl(profile.username.toLowerCase()),
    fullName: profile.fullName?.trim() ?? "",
    biography: profile.biography?.trim() ?? "",
    externalUrl: httpUrlOrNull(profile.externalUrl),
    followersCount: nonNegative(profile.followersCount),
    followsCount: nonNegative(profile.followsCount),
    postsCount: nonNegative(profile.postsCount),
    isVerified: Boolean(profile.verified),
    isBusinessAccount: Boolean(profile.isBusinessAccount),
    businessCategory: category && category !== "None" ? category : null,
    profilePhoto,
    posts: posts.slice(0, LIMITS.instagramPosts),
  };
}

const interaction = (post: InstagramPost) => (post.likesCount ?? 0) + (post.commentsCount ?? 0);

/** Los posts con más interacción (likes + comentarios) que tengan imagen. En empate, el más reciente. */
export function pickTopPosts(posts: InstagramPost[], count: number = LIMITS.maxPieces): InstagramPost[] {
  return posts
    .map((post, order) => ({ post, order }))
    .filter(({ post }) => post.image !== null)
    .sort((a, b) => interaction(b.post) - interaction(a.post) || a.order - b.order)
    .slice(0, count)
    .map(({ post }) => post);
}

// ── Títulos de respaldo (si la IA no responde) ──────────────────────
export const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\uFE0F\u200D\u20E3]/gu;
const FALLBACK_TITLE: Record<InstagramPost["type"], string> = { video: "Reel", carousel: "Carrusel", image: "Foto" };

/** Corta en el último espacio antes del límite y agrega "…". */
export function truncateWords(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.\-–—]+$/, "")}…`;
}

/** Primera frase del texto del post, sin links, hashtags, menciones ni emojis. */
export function titleFromCaption(caption: string, type: InstagramPost["type"]): string {
  const firstPhrase =
    caption
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/[#@][\p{L}\p{N}_.]+/gu, " ")
      .replace(EMOJI, " ")
      .split(/\n|(?<=[.!?…])\s/)
      .map((part) => part.replace(/\s+/g, " ").replace(/^[\s\-–—•·|:;,.]+|[\s\-–—•·|:;,.]+$/g, "").trim())
      .find((part) => part.length >= 3) ?? "";
  if (!firstPhrase) return FALLBACK_TITLE[type];
  // Mayúscula en la primera letra (también si empieza con ¡ o ¿).
  return truncateWords(firstPhrase, 48).replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase("es"));
}
