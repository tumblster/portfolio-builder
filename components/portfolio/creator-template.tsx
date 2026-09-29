import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import { contactLinks, type ContactLink } from "@/lib/portfolio/contact-links";
import { nichesWithPieces, type NicheDef } from "@/lib/portfolio/niches";
import type { ResolvedPiece, ResolvedPortfolio } from "@/lib/portfolio/resolve";
import type { StoredImage } from "@/lib/portfolio/schema";
import type { ProfileStatKind } from "@/lib/portfolio/stats";
import { CarouselControls } from "./carousel-controls";
import { ContactIcon, PLATFORM_LABEL, PlatformIcon, PlayIcon } from "./icons";
import { NichePills, NicheScope } from "./niche-filter";

/*
 * Plantilla Creator (v2 · M1): la página pública del portafolio y su vista previa en el editor.
 * Lenguaje de la referencia Starlet con implementación propia; estilos en app/portfolio.css.
 *
 * Orden: nav píldora (con los nichos) → hero (foto + tarjeta de vidrio, titular, propuesta de
 * valor, botones) → tira de stats → trabajo seleccionado (carrusel oscuro con vistas y
 * plataforma) → formas de colaborar → "Hablemos" monumental → footer mínimo.
 * Nada explica la herramienta: solo se muestra el trabajo de la creadora.
 *
 * Es un componente de servidor. Lo único que llega al navegador es el filtro de nichos y las
 * flechas del carrusel (niche-filter.tsx, carousel-controls.tsx).
 */

export type NicheFilter =
  | { mode: "route"; basePath: string }
  | { mode: "controlled"; value: string | null; onChange: (niche: string | null) => void };

type CreatorTemplateProps = {
  portfolio: ResolvedPortfolio;
  /** "preview": dentro del editor (nav estático, sin <main>, titulares un nivel más abajo). */
  variant: "page" | "preview";
  filter: NicheFilter;
};

const STAT_LABEL: Record<ProfileStatKind, string> = {
  followers: "Seguidores en Instagram",
  avgViews: "Vistas promedio por reel",
  engagement: "Engagement promedio",
  avgLikes: "Me gusta promedio por post",
};

/** Una foto grande solo si tiene resolución para verse nítida; si no, la primera pieza con imagen. */
const COVER_MIN_WIDTH = 600;

function heroCover(portfolio: ResolvedPortfolio): { image: StoredImage; alt: string } | null {
  const { photo, name, pieces } = portfolio;
  if (photo && (photo.width ?? 0) >= COVER_MIN_WIDTH) return { image: photo, alt: `Foto de ${name}` };
  const piece = pieces.find((candidate) => candidate.image);
  return piece?.image ? { image: piece.image, alt: piece.title } : null;
}

/**
 * Regla CSS del filtro: con data-pf-filter="belleza", se oculta todo lo marcado con data-pf-show
 * que no incluya "belleza". Los slugs ya vienen validados ([a-z0-9-]), son seguros aquí.
 */
function filterRules(views: readonly string[]): string {
  return views
    .map((view) => `.pf[data-pf-filter="${view}"] [data-pf-show]:not([data-pf-show~="${view}"]){display:none}`)
    .join("");
}

export function CreatorTemplate({ portfolio, variant, filter }: CreatorTemplateProps) {
  const { name, bio, valueProp, contact, stats, services, pieces } = portfolio;
  const isPage = variant === "page";
  const Root = isPage ? "main" : "div";
  const H1 = isPage ? "h1" : "h2";
  const H2 = isPage ? "h2" : "h3";
  const H3 = isPage ? "h3" : "h4";
  const id = (part: string) => `pf-${variant}-${part}`;

  const filterable = nichesWithPieces(portfolio.niches, pieces);
  const filterableSlugs = filterable.map((niche) => niche.slug);
  const links = contactLinks(contact);
  const email = links.find((link) => link.kind === "email") ?? null;
  const channels = links.filter((link) => link !== email);
  const hasContact = links.length > 0;
  const cover = heroCover(portfolio);
  const handle = contact.instagram ? `@${contact.instagram}` : (contact.tiktok ? `@${contact.tiktok}` : null);
  const firstName = name.trim().split(/\s+/)[0] ?? name;

  return (
    <NicheScope {...filter} nicheSlugs={filterableSlugs} className="pf" variant={variant}>
      <style dangerouslySetInnerHTML={{ __html: filterRules(["todo", ...filterableSlugs]) }} />

      <header className="pf-nav">
        <nav className="pf-nav__bar" aria-label={`Portafolio de ${name}`} data-solo={filterable.length === 0 ? "" : undefined}>
          <a className="pf-nav__brand" href={`#${id("inicio")}`}>
            <Avatar photo={portfolio.photo} name={name} size={32} />
            <span>{firstName}</span>
          </a>
          {filterable.length > 0 && <NichePills {...filter} niches={filterable} name={name} />}
          {hasContact && (
            <a className="pf-nav__cta" href={`#${id("contacto")}`}>
              Hablemos
            </a>
          )}
        </nav>
      </header>

      <div className="pf-body">
        <Root id={id("inicio")}>
          <section className="pf-hero pf-shell" aria-labelledby={id("nombre")}>
            <div className="pf-hero__grid" data-solo={cover ? undefined : ""}>
              {cover && (
                <figure className="pf-hero__media">
                  <div className="pf-hero__photo">
                    <Image
                      src={cover.image.url}
                      alt={cover.alt}
                      fill
                      sizes="(min-width: 1024px) 540px, 62vw"
                      preload={isPage}
                    />
                  </div>
                  <figcaption className="pf-glass">
                    <Avatar photo={portfolio.photo} name={name} size={40} />
                    <span className="pf-glass__who">
                      <strong>{name}</strong>
                      <span>{handle ?? "Creadora de contenido UGC"}</span>
                    </span>
                    <span className="pf-live">Disponible</span>
                  </figcaption>
                </figure>
              )}

              <div className="pf-hero__copy">
                {!cover && <Avatar photo={portfolio.photo} name={name} size={72} className="pf-hero__avatar" />}
                <p className="pf-eyebrow">
                  <Star />
                  Creadora UGC
                  <NicheSuffix niches={filterable} />
                </p>
                <H1 id={id("nombre")} className="pf-h1">
                  Hola, soy {name}.
                </H1>
                {valueProp && <p className="pf-lead">{valueProp}</p>}
                {bio && <p className="pf-bio">{bio}</p>}
                <div className="pf-actions">
                  {hasContact && (
                    <a className="pf-btn pf-btn--solid" href={`#${id("contacto")}`}>
                      Trabajemos juntos
                    </a>
                  )}
                  <a className={`pf-btn ${hasContact ? "pf-btn--ghost" : "pf-btn--solid"}`} href={`#${id("trabajo")}`}>
                    Ver mi trabajo
                  </a>
                </div>
              </div>
            </div>

            {stats.length > 0 && (
              <dl className="pf-stats" style={{ "--pf-stat-count": stats.length } as CSSProperties}>
                {stats.map((stat) => (
                  <div key={stat.kind} className="pf-stat" data-pf-stat={stat.kind}>
                    <dt>{STAT_LABEL[stat.kind]}</dt>
                    <dd>{stat.display}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          <section id={id("trabajo")} className="pf-inset pf-work pf-reveal" aria-labelledby={id("trabajo-titulo")}>
            <div className="pf-section-head">
              <div>
                <p className="pf-eyebrow pf-eyebrow--dark">
                  <Star />
                  Portafolio
                  <NicheSuffix niches={filterable} />
                </p>
                <H2 id={id("trabajo-titulo")} className="pf-h2">
                  Trabajo seleccionado
                </H2>
              </div>
              <CarouselControls targetId={id("carrusel")} />
            </div>
            <div
              id={id("carrusel")}
              className="pf-carousel"
              data-pf-carousel=""
              role="region"
              aria-label="Piezas del portafolio"
              tabIndex={0}
            >
              <ul className="pf-carousel__track">
                {pieces.map((piece) => (
                  <li
                    key={piece.id}
                    className="pf-card"
                    data-pf-piece={piece.id}
                    data-pf-show={piece.niche && filterableSlugs.includes(piece.niche) ? `todo ${piece.niche}` : "todo"}
                  >
                    <PieceCard piece={piece} Heading={H3} />
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {services.length > 0 && (
            <section className="pf-inset pf-services pf-reveal" aria-labelledby={id("servicios")}>
              <div className="pf-section-head">
                <div>
                  <p className="pf-eyebrow pf-eyebrow--dark">
                    <Star />
                    Servicios
                  </p>
                  <H2 id={id("servicios")} className="pf-h2">
                    Formas de colaborar
                  </H2>
                </div>
              </div>
              <ul className="pf-services__grid">
                {services.map((service, index) => (
                  <li key={`${index}-${service.title}`} className="pf-service">
                    <span className="pf-service__icon" aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <H3 className="pf-service__title">{service.title}</H3>
                    {service.description && <p className="pf-service__text">{service.description}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {hasContact && (
            <section id={id("contacto")} className="pf-inset pf-contact pf-reveal" aria-labelledby={id("contacto-titulo")}>
              <H2 id={id("contacto-titulo")} className="pf-hello">
                Hablemos
              </H2>
              <p className="pf-contact__lead">Cuéntame de tu marca y armamos la próxima campaña.</p>
              {email && (
                <a className="pf-mail" href={email.href}>
                  {email.label}
                </a>
              )}
              {channels.length > 0 && (
                <ul className="pf-links">
                  {channels.map((link, index) => (
                    <li key={link.kind}>
                      <ContactPill link={link} solid={index === 0 && !email} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </Root>

        <footer className="pf-footer pf-shell">
          <p>
            © {new Date().getFullYear()} {name}
          </p>
          <p>Hecho con Supercreador</p>
        </footer>
      </div>
    </NicheScope>
  );
}

const Star = () => (
  <span className="pf-eyebrow__star" aria-hidden="true">
    ✦
  </span>
);

/** " · Belleza" junto al eyebrow, solo en la vista de ese nicho (lo decide la regla del filtro). */
function NicheSuffix({ niches }: { niches: readonly NicheDef[] }) {
  return niches.map((niche) => (
    <span key={niche.slug} data-pf-show={niche.slug}>
      {` · ${niche.label}`}
    </span>
  ));
}

function Avatar({ photo, name, size, className }: { photo: StoredImage | null; name: string; size: number; className?: string }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) };
  return (
    <span className={className ? `pf-avatar ${className}` : "pf-avatar"} style={style} aria-hidden="true">
      {photo ? (
        <Image src={photo.url} alt="" width={size} height={size} sizes={`${size}px`} />
      ) : (
        name.trim().charAt(0).toLocaleUpperCase("es")
      )}
    </span>
  );
}

function PieceCard({ piece, Heading }: { piece: ResolvedPiece; Heading: "h3" | "h4" }) {
  const platform = piece.link ? PLATFORM_LABEL[piece.link.platform] : null;
  const meta = piece.metrics.display ?? (platform ? `Ver en ${platform}` : null);

  const content: ReactNode = (
    <>
      <div className="pf-card__media">
        {piece.image ? (
          <Image src={piece.image.url} alt="" fill sizes="(min-width: 768px) 272px, 62vw" loading="lazy" />
        ) : (
          <span className="pf-card__placeholder">{platform ? `Video de ${platform}` : ""}</span>
        )}
        {piece.link && (
          <span className="pf-badge">
            <PlatformIcon platform={piece.link.platform} size={14} />
            {platform}
          </span>
        )}
        {piece.video && (
          <span className="pf-play" aria-hidden="true">
            <PlayIcon size={22} />
          </span>
        )}
      </div>
      <Heading className="pf-card__title">{piece.title}</Heading>
      {meta && <p className="pf-card__meta">{meta}</p>}
    </>
  );

  if (!piece.link) return content;
  return (
    <a className="pf-card__link" href={piece.link.url} target="_blank" rel="noopener noreferrer">
      {content}
      <span className="sr-only"> (se abre en otra pestaña)</span>
    </a>
  );
}

function ContactPill({ link, solid }: { link: ContactLink; solid: boolean }) {
  return (
    <a
      className={solid ? "pf-link pf-link--solid" : "pf-link"}
      href={link.href}
      {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      <ContactIcon kind={link.kind} size={18} />
      {link.label}
      {link.external && <span className="sr-only"> (se abre en otra pestaña)</span>}
    </a>
  );
}
