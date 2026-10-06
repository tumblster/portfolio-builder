import { formatCompact } from "@/lib/format";
import { describeEngagementRate } from "./engagement";
import type { EngagementRate, InstagramSnapshot } from "./schema";

/*
 * Métricas de la creadora (ronda 30/09 · 7.2): Seguidores, Interacciones promedio y Engagement Rate.
 * Son la fila de métricas del studio y del Media Kit (en "Sobre mí" no hay métricas: 7.3).
 * Todo sale de lo que Instagram mostró al importar, con su base dicha tal cual; nada se estima.
 * Sin sus propias dependencias de servidor: se usa en el servidor y en el navegador.
 */

export type CreatorMetric = {
  kind: "followers" | "avgInteractions" | "engagementRate";
  label: string;
  /** Lo que se muestra: "48,2 mil", "1,3 mil", "6,2 %". */
  display: string;
  /** Base del cálculo, honesta: "(me gusta + comentarios) promedio · 12 publicaciones". null = no hace falta. */
  basis: string | null;
};

const MIN_POSTS_FOR_AVERAGE = 3;

export function creatorMetrics(snapshot: InstagramSnapshot | null, engagementRate: EngagementRate | null): CreatorMetric[] {
  const metrics: CreatorMetric[] = [];
  const followers = snapshot?.followersCount ?? null;
  if (followers !== null && followers > 0) {
    metrics.push({ kind: "followers", label: "Seguidores", display: formatCompact(followers), basis: "en Instagram" });
  }
  // Interacciones promedio por publicación: me gusta + comentarios (Instagram no publica compartidos ni guardados).
  const withLikes = snapshot?.posts.filter((post) => post.likesCount !== null && post.likesCount >= 0) ?? [];
  if (withLikes.length >= MIN_POSTS_FOR_AVERAGE) {
    const total = withLikes.reduce((sum, post) => sum + (post.likesCount ?? 0) + (post.commentsCount ?? 0), 0);
    const average = total / withLikes.length;
    if (average > 0) {
      metrics.push({
        kind: "avgInteractions",
        label: "Interacciones promedio",
        display: formatCompact(average),
        basis: `(me gusta + comentarios) por publicación · ${withLikes.length} publicaciones`,
      });
    }
  }
  if (engagementRate) {
    const er = describeEngagementRate(engagementRate);
    metrics.push({ kind: "engagementRate", label: er.label, display: er.value, basis: er.basis });
  }
  return metrics;
}
