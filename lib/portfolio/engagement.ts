import { formatPercent } from "@/lib/format";
import type { EngagementRate, InstagramSnapshot } from "./schema";

/*
 * Engagement Rate (v2 · M2): la métrica principal del portafolio.
 *
 *   ER = (me gusta + comentarios + compartidos + guardados) ÷ vistas
 *
 * Es un dato del modelo, no un texto de la plantilla: se calcula al importar, se guarda en
 * `insights.engagementRate` (valor + base del cálculo) y cualquier vista lo puede mostrar junto al
 * nombre (hoy las 4 plantillas y el modal; mañana el pool de creadoras).
 *
 * Honestidad sobre la base: Instagram no publica compartidos ni guardados, así que con lo que
 * trae la importación el ER usa me gusta + comentarios, y lo dice. Si faltan vistas (sin reels),
 * se calcula sobre seguidores y también lo dice. Sin datos suficientes, no hay ER: nada se estima.
 */

const MIN_REELS = 2;
const MIN_POSTS = 3;
const MIN_FOLLOWERS = 100;

export function computeEngagementRate(snapshot: InstagramSnapshot | null): EngagementRate | null {
  if (!snapshot) return null;
  const withLikes = snapshot.posts.filter((post) => post.likesCount !== null && post.likesCount >= 0);
  const interactions = (post: (typeof withLikes)[number]) => (post.likesCount ?? 0) + (post.commentsCount ?? 0);

  const reels = withLikes.filter((post) => post.type === "video" && (post.viewsCount ?? 0) > 0);
  if (reels.length >= MIN_REELS) {
    const views = reels.reduce((sum, post) => sum + (post.viewsCount ?? 0), 0);
    const rate = reels.reduce((sum, post) => sum + interactions(post), 0) / views;
    if (rate > 0 && Number.isFinite(rate)) {
      return { rate: Math.min(rate, 1), basis: "views", interactions: ["likes", "comments"], sample: reels.length, sampleKind: "reels" };
    }
  }

  const followers = snapshot.followersCount ?? 0;
  if (followers >= MIN_FOLLOWERS && withLikes.length >= MIN_POSTS) {
    const average = withLikes.reduce((sum, post) => sum + interactions(post), 0) / withLikes.length;
    const rate = average / followers;
    if (rate > 0 && Number.isFinite(rate)) {
      return { rate: Math.min(rate, 1), basis: "followers", interactions: ["likes", "comments"], sample: withLikes.length, sampleKind: "posts" };
    }
  }
  return null;
}

const INTERACTION_LABEL: Record<EngagementRate["interactions"][number], string> = {
  likes: "me gusta",
  comments: "comentarios",
  shares: "compartidos",
  saves: "guardados",
};

/** Textos para mostrar el ER: el valor, su nombre y la base del cálculo, dicha tal cual. */
export function describeEngagementRate(er: EngagementRate) {
  const parts = er.interactions.map((kind) => INTERACTION_LABEL[kind]);
  const numerator = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} + ${parts.at(-1)}` : parts[0];
  const over = er.basis === "views" ? "vistas" : "seguidores";
  const sample = `${er.sample} ${er.sampleKind === "reels" ? "reels" : "publicaciones"}`;
  return {
    value: formatPercent(er.rate * 100),
    label: "Engagement Rate",
    /** "sobre vistas" / "sobre seguidores" (para chips). */
    short: `sobre ${over}`,
    /** "(me gusta + comentarios) ÷ vistas · 4 reels" */
    basis: `(${numerator}) ÷ ${over} · ${sample}`,
  };
}
