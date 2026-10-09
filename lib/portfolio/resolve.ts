import { resolveCaseStudies, type ResolvedCaseStudy } from "./case-studies";
import { DEFAULT_DESIGN, type Design } from "./design";
import { computeEngagementRate } from "./engagement";
import type { Gender } from "./gender";
import { creatorMetrics, type CreatorMetric } from "./metrics";
import { resolveNiches, type NicheDef } from "./niches";
import type {
  BrandPartner,
  Contact,
  EngagementRate,
  InstagramPost,
  Piece,
  Portfolio,
  Service,
  StoredImage,
  VideoLink,
} from "./schema";
import { pieceMetrics, profileStats, type PieceMetrics, type ProfileStat } from "./stats";

/** A dónde lleva una pieza: su video original o el post de Instagram del que salió. */
export type PieceLink = VideoLink;

export type ResolvedPiece = Piece & {
  link: PieceLink | null;
  metrics: PieceMetrics;
  /**
   * Ronda 6 · 13.3: qué era en Instagram (foto, video o carrusel); null o ausente si se agregó a mano. Con esto el
   * portafolio público abre los carruseles en el overlay (cadena de embeds) en vez de mandar a Instagram.
   */
  kind?: InstagramPost["type"] | null;
};

/** Lo que se muestra: un valor final por campo, sin importar de qué fuente salió. */
export type ResolvedPortfolio = {
  slug: string;
  name: string;
  /** E2 del dueño: lo que sigue al separador del nombre de IG; va bajo el nombre en el hero. */
  tagline: string;
  bio: string;
  photo: StoredImage | null;
  /** Foto propia del banner del hero (ajuste 7), o null. */
  cover: StoredImage | null;
  /** Spec 11.9: si está archivado (su link muestra "no disponible temporalmente"). */
  archivedAt: string | null;
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
  /**
   * Ronda 6 · 13.8 / 13.11: el género que eligió (adapta los textos de WhatsApp); null = neutro. Opcional en el tipo
   * para no romper vistas previas que armen este objeto a mano.
   */
  gender?: Gender | null;
  /**
   * Ronda 6 · 13.19: las marcas que la creadora confirmó (solo esas). Opcional en el tipo por la misma razón que
   * `gender`; ausente = ninguna.
   */
  brandPartners?: BrandPartner[];
  /** Ronda 6 · 13.20: sus case studies, con su publicación. Ausente = ninguno. */
  caseStudies?: ResolvedCaseStudy[];
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
      kind: post?.type ?? null,
    };
  });

  const engagementRate = doc.insights ? doc.insights.engagementRate : computeEngagementRate(ig);
  return {
    slug: doc.slug,
    name: manual.name ?? (ig?.fullName || ig?.username || ""),
    /** E2 del dueño: lo que sigue al separador del nombre de IG; va bajo el nombre en el hero. */
    tagline: manual.tagline ?? "",
    bio: manual.bio ?? ig?.biography ?? "",
    photo: manual.photo !== undefined ? manual.photo : (ig?.profilePhoto ?? null),
    cover: manual.cover ?? null,
    archivedAt: doc.archivedAt ?? null,
    valueProp: manual.valueProp ?? doc.generated?.valueProp ?? "",
    contact,
    niches: resolveNiches(doc),
    // Spec 11.12: solo los servicios que el creador escribió; nunca los que propuso la IA.
    services: manual.services ?? [],
    stats: profileStats(ig),
    engagementRate,
    metrics: creatorMetrics(ig, engagementRate),
    design: doc.design ?? DEFAULT_DESIGN,
    gender: manual.gender ?? null,
    // 13.19: solo lo confirmado (es dato manual: la IA nunca lo propone por su cuenta).
    brandPartners: manual.brandPartners ?? [],
    // 13.20: cada caso con su publicación; uno cuya publicación ya no está, no se muestra.
    caseStudies: resolveCaseStudies(manual.caseStudies ?? [], ig),
    pieces,
  };
}
