import "server-only";
import { randomUUID } from "node:crypto";
import { assertGroqConfigured, writePortfolioCopy } from "@/lib/ai/groq";
import { ConfigError } from "@/lib/errors";
import { assertApifyConfigured, scrapeInstagramProfile, type ApifyProfile } from "@/lib/instagram/apify";
import { copyInstagramImage, mapWithConcurrency } from "@/lib/instagram/images";
import { httpUrlOrNull, pickTopPosts, titleFromCaption, toInstagramPost, toSnapshot } from "@/lib/instagram/snapshot";
import {
  LIMITS,
  type GeneratedContent,
  type InstagramPost,
  type Piece,
  type StoredImage,
} from "@/lib/portfolio/schema";
import { ImportError } from "./errors";
import { saveDraft } from "./draft";
import type { DraftPreview, ImportStep, ManualPrefill } from "./events";

/*
 * Flujo principal: link de Instagram → portafolio multinicho con link.
 *   1. scrape  Apify lee el perfil (foto, bio, últimos ~12 posts).
 *   2. images  Se copian la foto y las imágenes de los posts (sus URLs caducan).
 *   3. ai      Groq escribe la propuesta de valor, detecta hasta 3 nichos, titula y
 *              etiqueta cada pieza y sugiere formas de colaborar.
 *   4. save    Se guarda con las 6 publicaciones con más interacción.
 * Si la IA falla, el portafolio usa los nichos de la v1 (Belleza, Lifestyle, Viajes) sin piezas
 * etiquetadas: se ve solo en "Todo" hasta que se edite.
 * Perfil privado o con menos de 3 publicaciones → formulario manual prellenado.
 */

const IMAGE_CONCURRENCY = 6;

export type ImportOutcome =
  | { kind: "draft"; draft: DraftPreview }
  | { kind: "manual"; reason: "private_profile" | "not_enough_posts"; message: string; prefill: ManualPrefill };

/** Falla antes de gastar nada si falta alguna key. */
export function assertImportConfigured(): void {
  assertApifyConfigured();
  assertGroqConfigured();
}

export async function importFromInstagram(
  username: string,
  onStep: (step: ImportStep) => void,
): Promise<ImportOutcome> {
  onStep("scrape");
  const scraped = await scrapeInstagramProfile(username);
  if (scraped.status === "not_found") {
    throw new ImportError("not_found", `No encontramos @${username} en Instagram. Revisa que el usuario esté bien escrito.`);
  }
  if (scraped.status === "unavailable") {
    throw new ImportError(
      "unavailable",
      `No pudimos leer @${username}: puede que la cuenta sea privada o que no exista. Revisa el usuario o llénalo a mano.`,
    );
  }
  const profile = scraped.profile;
  const handle = profile.username.toLowerCase();
  const scrapedAt = new Date().toISOString();
  const photoUrl = profile.profilePicUrlHD ?? profile.profilePicUrl;

  onStep("images");
  if (profile.private) {
    const photo = await copyInstagramImage(photoUrl);
    return {
      kind: "manual",
      reason: "private_profile",
      message: `@${handle} tiene la cuenta privada, así que no podemos ver sus publicaciones. Complétalo a mano: ya dejamos su nombre, foto y bio.`,
      prefill: toPrefill(profile, photo, []),
    };
  }

  const rawPosts = profile.latestPosts.slice(0, LIMITS.instagramPosts);
  const [photo, ...postImages] = await mapWithConcurrency(
    [photoUrl, ...rawPosts.map((post) => post.displayUrl)],
    IMAGE_CONCURRENCY,
    copyInstagramImage,
  );
  const posts = rawPosts.flatMap((raw, index) => toInstagramPost(raw, postImages[index]) ?? []);
  const selected = pickTopPosts(posts, LIMITS.maxPieces);

  if (selected.length < LIMITS.minPieces) {
    return {
      kind: "manual",
      reason: "not_enough_posts",
      message: notEnoughPostsMessage(handle, posts.length, selected.length),
      prefill: toPrefill(profile, photo, selected),
    };
  }

  const warnings: string[] = [];
  const lostImages = rawPosts.filter((raw, index) => raw.displayUrl && !postImages[index]).length;
  if (lostImages > 0) {
    warnings.push(
      `No pudimos copiar ${lostImages} ${lostImages === 1 ? "foto" : "fotos"} de Instagram; el portafolio usa las demás.`,
    );
  }

  onStep("ai");
  const snapshot = toSnapshot(profile, photo, posts, scrapedAt);
  let generated: GeneratedContent | null = null;
  try {
    const copy = await writePortfolioCopy({
      name: snapshot.fullName || handle,
      username: handle,
      biography: snapshot.biography,
      category: snapshot.businessCategory,
      // Spec 11.4: todas las publicaciones importadas (no solo las elegidas), en la misma llamada: así las que el
      // creador sume desde "De tu perfil" llegan con su título y su nicho, no a "Todo".
      posts,
    });
    generated = {
      provider: "groq",
      model: copy.model,
      generatedAt: new Date().toISOString(),
      valueProp: copy.valueProp,
      pieces: posts.flatMap((post) => {
        const suggestion = copy.pieces.get(post.id);
        return suggestion ? [{ sourcePostId: post.id, ...suggestion }] : [];
      }),
      niches: copy.niches,
      services: copy.services,
    };
  } catch (error) {
    // El scrapeo ya se pagó: se crea igual, con títulos sacados del texto de cada post.
    console.error("[import] la IA no pudo escribir los textos:", error);
    warnings.push(
      error instanceof ConfigError
        ? `La IA no pudo escribir los textos: ${error.message}`
        : "La IA no respondió, así que la propuesta de valor quedó vacía y los títulos salen del texto de cada post.",
    );
  }

  // v2 · M2: no se crea todavía. El creador confirma nichos, plantilla y paleta (./draft.ts).
  const draft = await saveDraft({ username: handle, snapshot, generated, pieces: toPieces(selected, generated), warnings });
  return { kind: "draft", draft };
}

function toPieces(selected: InstagramPost[], generated: GeneratedContent | null): Piece[] {
  const suggestions = new Map(generated?.pieces.map((piece) => [piece.sourcePostId, piece]));
  return selected.map((post) => {
    const suggestion = suggestions.get(post.id);
    return {
      id: randomUUID(),
      origin: "instagram",
      title: suggestion?.title ?? titleFromCaption(post.caption, post.type),
      niche: suggestion?.niche ?? null,
      image: post.image,
      video: post.type === "video" ? { platform: "instagram", url: post.url } : null,
      sourcePostId: post.id,
    };
  });
}

function toPrefill(profile: ApifyProfile, photo: StoredImage | null, posts: InstagramPost[]): ManualPrefill {
  const handle = profile.username.toLowerCase();
  const website = httpUrlOrNull(profile.externalUrl);
  return {
    username: handle,
    name: profile.fullName?.trim().slice(0, LIMITS.name) || handle,
    bio: (profile.biography ?? "").trim().slice(0, LIMITS.bio),
    photo,
    contact: { instagram: handle, ...(website ? { website } : {}) },
    pieces: posts.flatMap((post) =>
      post.image
        ? [{ title: titleFromCaption(post.caption, post.type), image: post.image, videoUrl: post.type === "video" ? post.url : null }]
        : [],
    ),
  };
}

function notEnoughPostsMessage(handle: string, found: number, withImage: number): string {
  const needed = `el portafolio necesita al menos ${LIMITS.minPieces}`;
  if (found < LIMITS.minPieces) {
    const what = found === 0 ? "no tiene publicaciones" : `tiene solo ${found} ${found === 1 ? "publicación" : "publicaciones"}`;
    return `@${handle} ${what} y ${needed}. Complétalo a mano: ya dejamos su nombre, foto, bio y lo que encontramos.`;
  }
  return `Solo pudimos copiar ${withImage} fotos de @${handle} y ${needed}. Intenta de nuevo o complétalo a mano con lo que ya encontramos.`;
}
