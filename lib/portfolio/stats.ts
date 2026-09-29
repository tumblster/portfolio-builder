import { formatCompact, formatPercent } from "@/lib/format";
import type { InstagramPost, InstagramSnapshot } from "./schema";

/*
 * Prueba social cuantificada (stats del encabezado y métricas por pieza).
 * Todo sale de lo que Instagram mostró al importar: nada se estima ni se inventa.
 * Si un dato no alcanza para ser representativo, esa cifra no se muestra.
 */

export type ProfileStatKind = "followers" | "avgViews" | "engagement" | "avgLikes";
export type ProfileStat = { kind: ProfileStatKind; value: number; display: string };

export type PieceMetrics = {
  views: number | null;
  likes: number | null;
  /** Lo que se muestra bajo la pieza: "12,4 mil vistas" o "3,2 mil me gusta". */
  display: string | null;
};

export const NO_METRICS: PieceMetrics = { views: null, likes: null, display: null };

const MIN_POSTS_FOR_AVERAGE = 3;
const MIN_VIDEOS_FOR_AVERAGE = 2;
const MIN_FOLLOWERS_FOR_ENGAGEMENT = 100;

const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

export function profileStats(snapshot: InstagramSnapshot | null): ProfileStat[] {
  if (!snapshot) return [];
  const stats: ProfileStat[] = [];
  const followers = snapshot.followersCount;
  if (followers !== null && followers > 0) {
    stats.push({ kind: "followers", value: followers, display: formatCompact(followers) });
  }

  const views = snapshot.posts.filter((post) => post.type === "video" && (post.viewsCount ?? 0) > 0).map((post) => post.viewsCount ?? 0);
  if (views.length >= MIN_VIDEOS_FOR_AVERAGE) {
    const value = average(views);
    stats.push({ kind: "avgViews", value, display: formatCompact(value) });
  }

  const withLikes = snapshot.posts.filter((post) => post.likesCount !== null);
  if (withLikes.length >= MIN_POSTS_FOR_AVERAGE) {
    const interactions = average(withLikes.map((post) => (post.likesCount ?? 0) + (post.commentsCount ?? 0)));
    if (followers !== null && followers >= MIN_FOLLOWERS_FOR_ENGAGEMENT) {
      const value = (interactions / followers) * 100;
      if (value > 0 && value < 100) stats.push({ kind: "engagement", value, display: formatPercent(value) });
    }
    const likes = average(withLikes.map((post) => post.likesCount ?? 0));
    if (likes > 0) stats.push({ kind: "avgLikes", value: likes, display: formatCompact(likes) });
  }
  return stats;
}

/** Vistas (videos) o, si no hay, me gusta del post de Instagram del que salió la pieza. */
export function pieceMetrics(post: InstagramPost | undefined): PieceMetrics {
  if (!post) return NO_METRICS;
  const views = post.viewsCount !== null && post.viewsCount > 0 ? post.viewsCount : null;
  const likes = post.likesCount !== null && post.likesCount > 0 ? post.likesCount : null;
  const display = views !== null ? `${formatCompact(views)} vistas` : likes !== null ? `${formatCompact(likes)} me gusta` : null;
  return { views, likes, display };
}
