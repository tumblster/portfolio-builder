import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import { paletteStyle, resolvePalette, type Palette } from "@/lib/palette/palettes";
import { contactLinks, type ContactLink } from "@/lib/portfolio/contact-links";
import type { TemplateId } from "@/lib/portfolio/design";
import { describeEngagementRate } from "@/lib/portfolio/engagement";
import { nichesWithPieces, type NicheDef } from "@/lib/portfolio/niches";
import type { ResolvedPiece, ResolvedPortfolio } from "@/lib/portfolio/resolve";
import type { StoredImage } from "@/lib/portfolio/schema";
import type { ProfileStatKind } from "@/lib/portfolio/stats";
import { ContactIcon, PLATFORM_LABEL } from "./icons";
import { NicheScope } from "./niche-filter";

/*
 * Lo que comparten las 4 plantillas (v2 · M2): los datos ya preparados para dibujar, el marco
 * (filtro de nichos + paleta) y piezas chicas. Cada plantilla decide solo su maquetación.
 * Componentes de servidor: lo único que llega al navegador es el filtro y las flechas.
 */

export type NicheFilter =
  | { mode: "route"; basePath: string }
  | { mode: "controlled"; value: string | null; onChange: (niche: string | null) => void };

export type TemplateProps = {
  portfolio: ResolvedPortfolio;
  /** "preview": dentro del editor (sin <main>, titulares un nivel más abajo, nada fijo a la pantalla). */
  variant: "page" | "preview";
  filter: NicheFilter;
};

export const STAT_LABEL: Record<ProfileStatKind, string> = {
  followers: "Seguidores en Instagram",
  avgViews: "Vistas promedio por reel",
  avgLikes: "Me gusta promedio por post",
};

/** Una foto grande solo si tiene resolución para verse nítida; si no, la primera pieza con imagen. */
const COVER_MIN_WIDTH = 600;

export function heroCover(portfolio: ResolvedPortfolio): { image: StoredImage; alt: string } | null {
  const { photo, name, pieces } = portfolio;
  if (photo && (photo.width ?? 0) >= COVER_MIN_WIDTH) return { image: photo, alt: `Foto de ${name}` };
  const piece = pieces.find((candidate) => candidate.image);
  return piece?.image ? { image: piece.image, alt: piece.title } : null;
}

/** Todo lo que una plantilla necesita, ya calculado. */
export function portfolioView(portfolio: ResolvedPortfolio, variant: TemplateProps["variant"]) {
  const filterable = nichesWithPieces(portfolio.niches, portfolio.pieces);
  const links = contactLinks(portfolio.contact);
  const email = links.find((link) => link.kind === "email") ?? null;
  const { contact } = portfolio;
  return {
    filterable,
    filterableSlugs: filterable.map((niche) => niche.slug),
    links,
    email,
    channels: links.filter((link) => link !== email),
    hasContact: links.length > 0,
    cover: heroCover(portfolio),
    handle: contact.instagram ? `@${contact.instagram}` : contact.tiktok ? `@${contact.tiktok}` : null,
    firstName: portfolio.name.trim().split(/\s+/)[0] ?? portfolio.name,
    er: portfolio.engagementRate ? describeEngagementRate(portfolio.engagementRate) : null,
    palette: resolvePalette(portfolio.design.palette, portfolio.photo),
    isPage: variant === "page",
    id: (part: string) => `pf-${variant}-${part}`,
    headings:
      variant === "page"
        ? ({ Root: "main", H1: "h1", H2: "h2", H3: "h3" } as const)
        : ({ Root: "div", H1: "h2", H2: "h3", H3: "h4" } as const),
  };
}
export type PortfolioView = ReturnType<typeof portfolioView>;

/** Color de fondo de la página (y de la barra del navegador): Editorial es oscura. */
export function pageBackground(template: TemplateId, palette: Palette): string {
  return template === "editorial" ? palette.deep : palette.bg;
}

/**
 * Regla CSS del filtro: con data-pf-filter="belleza", se oculta todo lo marcado con data-pf-show
 * que no incluya "belleza". Los slugs ya vienen validados ([a-z0-9-]) y los colores son #rrggbb
 * generados por lib/palette: son seguros dentro de <style>.
 */
function frameRules(views: readonly string[], background: string | null): string {
  const filter = views
    .map((view) => `.pf[data-pf-filter="${view}"] [data-pf-show]:not([data-pf-show~="${view}"]){display:none}`)
    .join("");
  return background ? `${filter}html:root:has([data-site="portfolio"]){background-color:${background}}` : filter;
}

/** Marco de toda plantilla: filtro de nichos, paleta y fondo de la página. */
export function TemplateFrame({
  view,
  template,
  variant,
  filter,
  children,
}: {
  view: PortfolioView;
  template: TemplateId;
  variant: TemplateProps["variant"];
  filter: NicheFilter;
  children: ReactNode;
}) {
  const background = variant === "page" ? pageBackground(template, view.palette) : null;
  return (
    <NicheScope
      {...filter}
      nicheSlugs={view.filterableSlugs}
      className="pf"
      template={template}
      variant={variant}
      style={paletteStyle(view.palette) as CSSProperties}
    >
      <style dangerouslySetInnerHTML={{ __html: frameRules(["todo", ...view.filterableSlugs], background) }} />
      {children}
    </NicheScope>
  );
}

/** Nicho(s) en los que se ve una pieza. */
export const pieceShow = (piece: ResolvedPiece, filterableSlugs: readonly string[]) =>
  piece.niche && filterableSlugs.includes(piece.niche) ? `todo ${piece.niche}` : "todo";

export const Star = () => (
  <span className="pf-eyebrow__star" aria-hidden="true">
    ✦
  </span>
);

/** " · Belleza" junto a un texto, solo en la vista de ese nicho (lo decide la regla del filtro). */
export function NicheSuffix({ niches }: { niches: readonly NicheDef[] }) {
  return niches.map((niche) => (
    <span key={niche.slug} data-pf-show={niche.slug}>
      {` · ${niche.label}`}
    </span>
  ));
}

export function Avatar({ photo, name, size, className }: { photo: StoredImage | null; name: string; size: number; className?: string }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) };
  return (
    <span className={className ? `pf-avatar ${className}` : "pf-avatar"} style={style} aria-hidden="true">
      {photo ? <Image src={photo.url} alt="" width={size} height={size} sizes={`${size}px`} /> : name.trim().charAt(0).toLocaleUpperCase("es")}
    </span>
  );
}

/** Texto bajo una pieza: "12,4 mil vistas" o "Ver en TikTok". */
export function pieceMeta(piece: ResolvedPiece): { platform: string | null; meta: string | null } {
  const platform = piece.link ? PLATFORM_LABEL[piece.link.platform] : null;
  return { platform, meta: piece.metrics.display ?? (platform ? `Ver en ${platform}` : null) };
}

/** La pieza lleva a su original (otra pestaña); sin link, solo se muestra. */
export function PieceLink({ piece, className, children }: { piece: ResolvedPiece; className: string; children: ReactNode }) {
  if (!piece.link) return <div className={className}>{children}</div>;
  return (
    <a className={className} href={piece.link.url} target="_blank" rel="noopener noreferrer">
      {children}
      <span className="sr-only"> (se abre en otra pestaña)</span>
    </a>
  );
}

export function ContactPill({ link, className, iconSize = 18 }: { link: ContactLink; className: string; iconSize?: number }) {
  return (
    <a className={className} href={link.href} {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      <ContactIcon kind={link.kind} size={iconSize} />
      <span>{link.label}</span>
      {link.external && <span className="sr-only"> (se abre en otra pestaña)</span>}
    </a>
  );
}

export const copyrightYear = () => new Date().getFullYear();
