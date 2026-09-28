import type { Contact, Piece, Portfolio, StoredImage, VideoLink } from "./schema";

/** A dónde lleva una pieza: su video original o el post de Instagram del que salió. */
export type PieceLink = VideoLink;

export type ResolvedPiece = Piece & { link: PieceLink | null };

/** Lo que se muestra: un valor final por campo, sin importar de qué fuente salió. */
export type ResolvedPortfolio = {
  slug: string;
  name: string;
  bio: string;
  photo: StoredImage | null;
  valueProp: string;
  /** Solo los canales con valor. */
  contact: Partial<Record<keyof Contact, string>>;
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

  const postUrls = new Map(ig?.posts.map((post) => [post.id, post.url]));
  const pieces = doc.pieces.map((piece): ResolvedPiece => {
    const postUrl = piece.sourcePostId ? postUrls.get(piece.sourcePostId) : undefined;
    return { ...piece, link: piece.video ?? (postUrl ? { platform: "instagram", url: postUrl } : null) };
  });

  return {
    slug: doc.slug,
    name: manual.name ?? (ig?.fullName || ig?.username || ""),
    bio: manual.bio ?? ig?.biography ?? "",
    photo: manual.photo !== undefined ? manual.photo : (ig?.profilePhoto ?? null),
    valueProp: manual.valueProp ?? doc.generated?.valueProp ?? "",
    contact,
    pieces,
  };
}
