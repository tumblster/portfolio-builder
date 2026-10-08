import { formatCompact } from "@/lib/format";
import type { CaseStudy, InstagramPost, InstagramSnapshot, StoredImage, VideoLink } from "./schema";

/*
 * Case studies del Media kit (ronda 6 · 13.20). Sin dependencias del servidor: lo usan resolve.ts, el editor y el
 * Media kit.
 *
 * Un caso de estudio es una publicación importada de su Instagram que la creadora marcó, con marca, campaña,
 * miniatura y cifras. Las cifras arrancan con los datos reales de esa publicación (realMetrics); nada se estima.
 */

export type CaseMetricKey = "views" | "likes" | "comments";
export const CASE_METRIC_KEYS: readonly CaseMetricKey[] = ["views", "likes", "comments"];
export const CASE_METRIC_LABEL: Record<CaseMetricKey, string> = { views: "Vistas", likes: "Me gusta", comments: "Comentarios" };
export type CaseStudyMetrics = Record<CaseMetricKey, number | null>;

/** Una publicación importada, lista para marcarla como caso en el editor. */
export type ImportedPost = {
  id: string;
  title: string;
  image: StoredImage | null;
  url: string;
  kind: InstagramPost["type"];
  /** Las cifras reales que mostró Instagram al importar (null = no la mostró). */
  metrics: CaseStudyMetrics;
};

/** Un caso listo para dibujar. */
export type ResolvedCaseStudy = {
  postId: string;
  brand: string;
  campaign: string;
  /** La que se muestra: la propia o, si no hay, la de la publicación. */
  image: StoredImage | null;
  /** La que subió la creadora (null = usa la de la publicación). Para el editor. */
  customImage: StoredImage | null;
  link: VideoLink;
  kind: InstagramPost["type"];
  metrics: CaseStudyMetrics;
};

const known = (value: number | null) => (value !== null && value >= 0 ? value : null);

/** Las cifras reales de una publicación. Las vistas solo existen en los videos. */
export function realMetrics(post: InstagramPost): CaseStudyMetrics {
  return {
    views: post.type === "video" ? known(post.viewsCount) : null,
    likes: known(post.likesCount),
    comments: known(post.commentsCount),
  };
}

const KIND_TITLE: Record<InstagramPost["type"], string> = { video: "Reel", image: "Foto", carousel: "Carrusel" };

/** Primera línea del caption, corta: para reconocer la publicación en el editor. */
function captionSnippet(caption: string): string {
  const line = caption
    .split("\n")
    .map((part) => part.trim())
    .find(Boolean);
  if (!line) return "";
  return line.length > 60 ? `${line.slice(0, 59).trimEnd()}…` : line;
}

/** Las publicaciones importadas (los últimos 12 contenidos), para marcar casos en el editor. */
export function importedPosts(snapshot: InstagramSnapshot | null): ImportedPost[] {
  if (!snapshot) return [];
  return snapshot.posts.map((post) => ({
    id: post.id,
    title: captionSnippet(post.caption) || KIND_TITLE[post.type],
    image: post.image,
    url: post.url,
    kind: post.type,
    metrics: realMetrics(post),
  }));
}

/** Los casos guardados con su publicación. Un caso cuya publicación ya no está en la captura no se muestra. */
export function resolveCaseStudies(cases: readonly CaseStudy[], snapshot: InstagramSnapshot | null): ResolvedCaseStudy[] {
  const posts = new Map((snapshot?.posts ?? []).map((post) => [post.id, post]));
  return cases.flatMap((item): ResolvedCaseStudy[] => {
    const post = posts.get(item.postId);
    if (!post) return [];
    return [
      {
        postId: item.postId,
        brand: item.brand,
        campaign: item.campaign,
        image: item.image ?? post.image,
        customImage: item.image,
        link: { platform: "instagram", url: post.url },
        kind: post.type,
        metrics: { views: item.metrics.views, likes: item.metrics.likes, comments: item.metrics.comments },
      },
    ];
  });
}

const UNITS: Record<CaseMetricKey, [string, string]> = {
  views: ["vista", "vistas"],
  likes: ["me gusta", "me gusta"],
  comments: ["comentario", "comentarios"],
};

/** "15,4 mil vistas", "820 me gusta", "41 comentarios": solo las cifras con valor (ni null ni 0). */
export function caseMetricLabels(metrics: CaseStudyMetrics): string[] {
  return CASE_METRIC_KEYS.flatMap((key) => {
    const value = metrics[key];
    if (value === null || value === 0) return [];
    return [`${formatCompact(value)} ${value === 1 ? UNITS[key][0] : UNITS[key][1]}`];
  });
}
