import Image from "next/image";
import type { CSSProperties } from "react";
import type { ResolvedPiece } from "@/lib/portfolio/resolve";
import { CarouselControls } from "./carousel-controls";
import { PlatformIcon, PlayIcon } from "./icons";
import { NichePills } from "./niche-filter";
import {
  Avatar,
  ContactPill,
  NicheSuffix,
  PieceLink,
  STAT_LABEL,
  Star,
  TemplateFrame,
  copyrightYear,
  pieceMeta,
  pieceShow,
  portfolioView,
  type TemplateProps,
} from "./template-kit";

/*
 * Plantilla Creator (la recomendada): lenguaje de la referencia Starlet con implementación propia.
 * Orden: nav píldora (con los nichos) → hero (foto + tarjeta de vidrio, titular, propuesta de
 * valor, botones) → cifras con el Engagement Rate primero → trabajo seleccionado (carrusel oscuro)
 * → formas de colaborar → "Hablemos" monumental → footer mínimo. Estilos en app/portfolio.css.
 */

export function CreatorTemplate({ portfolio, variant, filter }: TemplateProps) {
  const { name, bio, valueProp, stats, services, pieces } = portfolio;
  const view = portfolioView(portfolio, variant);
  const { filterable, filterableSlugs, email, channels, hasContact, cover, handle, firstName, er, isPage, id } = view;
  const { Root, H1, H2, H3 } = view.headings;
  const statCount = stats.length + (er ? 1 : 0);

  return (
    <TemplateFrame view={view} template="creator" variant={variant} filter={filter}>

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

            {statCount > 0 && (
              <dl
                className={er ? "pf-stats pf-stats--er" : "pf-stats"}
                style={{ "--pf-stat-count": stats.length } as CSSProperties}
              >
                {er && (
                  <div className="pf-stat pf-stat--er" data-pf-stat="engagementRate">
                    <dt>{er.label}</dt>
                    <dd>{er.value}</dd>
                    <dd className="pf-stat__basis">{er.basis}</dd>
                  </div>
                )}
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
                    data-pf-show={pieceShow(piece, filterableSlugs)}
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
                      <ContactPill link={link} className={index === 0 && !email ? "pf-link pf-link--solid" : "pf-link"} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </Root>

        <footer className="pf-footer pf-shell">
          <p>
            © {copyrightYear()} {name}
          </p>
          <p>Hecho con Supercreador</p>
        </footer>
      </div>
    </TemplateFrame>
  );
}

function PieceCard({ piece, Heading }: { piece: ResolvedPiece; Heading: "h3" | "h4" }) {
  const { platform, meta } = pieceMeta(piece);
  return (
    <PieceLink piece={piece} className="pf-card__link">
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
    </PieceLink>
  );
}

