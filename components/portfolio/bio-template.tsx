import Image from "next/image";
import { ArrowIcon, PlatformIcon, PlayIcon } from "./icons";
import { NichePills } from "./niche-filter";
import {
  Avatar,
  ContactPill,
  NicheSuffix,
  PieceLink,
  STAT_LABEL,
  TemplateFrame,
  copyrightYear,
  pieceMeta,
  pieceShow,
  portfolioView,
  type TemplateProps,
} from "./template-kit";

/*
 * Plantilla Bio: lenguaje link-in-bio de la referencia Linkpro, con implementación propia.
 * Una columna centrada (~420 px) sobre un degradado que deriva despacio; avatar grande, nombre,
 * Engagement Rate justo debajo, botones de contacto a todo el ancho, el trabajo como tarjetas
 * (miniatura + título + flecha) y los nichos en una barra flotante abajo, siempre a mano.
 */
export function BioTemplate({ portfolio, variant, filter }: TemplateProps) {
  const { name, bio, valueProp, stats, services, pieces, photo } = portfolio;
  const view = portfolioView(portfolio, variant);
  const { filterable, filterableSlugs, links, hasContact, handle, er, id } = view;
  const { Root, H1, H2, H3 } = view.headings;

  return (
    <TemplateFrame view={view} template="bio" variant={variant} filter={filter}>
      <div className="bio-mesh" aria-hidden="true" />
      <div className="pf-body">
        <Root id={id("inicio")} className="bio-col">
          <header className="bio-head">
            <Avatar photo={photo} name={name} size={112} className="bio-avatar" />
            <H1 className="bio-name">{name}</H1>
            {handle && <p className="bio-handle">{handle}</p>}
            {er && (
              <p className="bio-er" data-pf-stat="engagementRate">
                <strong>{er.value}</strong> {er.label}
                <span className="bio-er__basis">{er.basis}</span>
              </p>
            )}
            {valueProp && <p className="bio-lead">{valueProp}</p>}
            {bio && <p className="bio-text">{bio}</p>}
          </header>

          {hasContact && (
            <ul className="bio-links" aria-label="Contacto">
              {links.map((link, index) => (
                <li key={link.kind}>
                  <ContactPill link={link} className={index === 0 ? "bio-link bio-link--solid" : "bio-link"} />
                </li>
              ))}
            </ul>
          )}

          {stats.length > 0 && (
            <dl className="bio-stats">
              {stats.map((stat) => (
                <div key={stat.kind} className="bio-stat" data-pf-stat={stat.kind}>
                  <dt>{STAT_LABEL[stat.kind]}</dt>
                  <dd>{stat.display}</dd>
                </div>
              ))}
            </dl>
          )}

          <section id={id("trabajo")} className="bio-section" aria-labelledby={id("trabajo-titulo")}>
            <H2 id={id("trabajo-titulo")} className="bio-label">
              Mi trabajo
              <NicheSuffix niches={filterable} />
            </H2>
            <ul className="bio-work">
              {pieces.map((piece) => {
                const { platform, meta } = pieceMeta(piece);
                return (
                  <li key={piece.id} className="bio-card" data-pf-piece={piece.id} data-pf-show={pieceShow(piece, filterableSlugs)}>
                    <PieceLink piece={piece} className="bio-card__link">
                      <div className="bio-card__media">
                        {piece.image ? (
                          <Image src={piece.image.url} alt="" fill sizes="88px" loading="lazy" />
                        ) : (
                          <span className="bio-card__placeholder" aria-hidden="true" />
                        )}
                        {piece.video && (
                          <span className="bio-card__play" aria-hidden="true">
                            <PlayIcon size={14} />
                          </span>
                        )}
                      </div>
                      <div className="bio-card__text">
                        <H3 className="bio-card__title">{piece.title}</H3>
                        {meta && (
                          <p className="bio-card__meta">
                            {piece.link && <PlatformIcon platform={piece.link.platform} size={14} />}
                            {meta}
                            {platform && piece.metrics.display ? ` · ${platform}` : ""}
                          </p>
                        )}
                      </div>
                      {piece.link && (
                        <span className="bio-card__arrow" aria-hidden="true">
                          <ArrowIcon direction="right" size={18} />
                        </span>
                      )}
                    </PieceLink>
                  </li>
                );
              })}
            </ul>
          </section>

          {services.length > 0 && (
            <section className="bio-section" aria-labelledby={id("servicios")}>
              <H2 id={id("servicios")} className="bio-label">
                Colaboremos
              </H2>
              <ul className="bio-services">
                {services.map((service, index) => (
                  <li key={`${index}-${service.title}`} className="bio-service">
                    <H3 className="bio-service__title">{service.title}</H3>
                    {service.description && <p className="bio-service__text">{service.description}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <footer className="bio-footer">
            <p>
              © {copyrightYear()} {name}
            </p>
            <p>Hecho con Supercreador</p>
          </footer>
        </Root>
      </div>

      {view.showNicheNav && filterable.length > 0 && (
        <nav className="bio-dock" aria-label={`Nichos de ${name}`}>
          <NichePills {...filter} niches={filterable} name={name} />
        </nav>
      )}
    </TemplateFrame>
  );
}
