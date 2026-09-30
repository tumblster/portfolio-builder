import { DEFAULT_DESIGN, type Design } from "./design";
import { computeEngagementRate } from "./engagement";
import { creatorMetrics, type CreatorMetric } from "./metrics";
import { resolveNiches, type NicheDef } from "./niches";
import type { Contact, EngagementRate, Piece, Portfolio, Service, StoredImage, VideoLink } from "./schema";
import { pieceMetrics, profileStats, type PieceMetrics, type ProfileStat } from "./stats";

/** A dónde lleva una pieza: su video original o el post de Instagram del que salió. */
export type PieceLink = VideoLink;

export type ResolvedPiece = Piece & { link: PieceLink | null; metrics: PieceMetrics };

/** Lo que se muestra: un valor final por campo, sin importar de qué fuente salió. */
export type ResolvedPortfolio = {
  slug: string;
  name: string;
  bio: string;
  photo: StoredImage | null;
  /** Foto propia del banner del hero (ajuste 7), o null. */
  cover: StoredImage | null;
  valueProp: string;
  /** Solo los canales con valor. */
  contact: Partial<Record<keyof Contact, string>>;
  /** Todos los nichos del portafolio (cada uno con su link), tengan o no piezas. */
  niches: NicheDef[];
  services: Service[];
  /** Cifras del perfil de Instagram; vacío si se creó a mano. */
  stats: ProfileStat[];
  /** Métrica principal (v2 · M2), con la base de su cálculo; null si no hay datos suficientes. */
  engagementRate: EngagementRate | null;
  /** Seguidores, Interacciones promedio y ER, listos para mostrar (ronda 30/09 · 7.2). Solo en el Media Kit. */
  metrics: CreatorMetric[];
  /** Plantilla y paleta (v2 · M2). */
  design: Design;
  pieces: ResolvedPiece[];
};

/**
 * Regla única para toda la app: manual → IA → Instagram.
 * Un texto vacío escrito a mano ("") significa "no mostrar", aunque
 * Instagram o la IA tengan algo para ese campo.
 */
export function resolvePortfolio(doc: Portfolio): ResolvedPortfolio {
  const ig = doc.instagram;
  const manual = doc.manual;

  const fromInstagram: Contact = {
    instagram: ig?.username,
    website: ig?.externalUrl ?? undefined,
  };
  const contact: ResolvedPortfolio["contact"] = {};
  for (const key of Object.keys({ ...fromInstagram, ...manual.contact }) as (keyof Contact)[]) {
    const value = manual.contact?.[key] ?? fromInstagram[key];
    if (value) contact[key] = value;
  }

  const posts = new Map(ig?.posts.map((post) => [post.id, post]));
  const pieces = doc.pieces.map((piece): ResolvedPiece => {
    const post = piece.sourcePostId ? posts.get(piece.sourcePostId) : undefined;
    return {
      ...piece,
      link: piece.video ?? (post ? { platform: "instagram", url: post.url } : null),
      metrics: pieceMetrics(post),
    };
  });

  const engagementRate = doc.insights ? doc.insights.engagementRate : computeEngagementRate(ig);
  return {
    slug: doc.slug,
    name: manual.name ?? (ig?.fullName || ig?.username || ""),
    bio: manual.bio ?? ig?.biography ?? "",
    photo: manual.photo !== undefined ? manual.photo : (ig?.profilePhoto ?? null),
    cover: manual.cover ?? null,
    valueProp: manual.valueProp ?? doc.generated?.valueProp ?? "",
    contact,
    niches: resolveNiches(doc),
    services: manual.services ?? doc.generated?.services ?? [],
    stats: profileStats(ig),
    engagementRate,
    metrics: creatorMetrics(ig, engagementRate),
    design: doc.design ?? DEFAULT_DESIGN,
    pieces,
  };
}
