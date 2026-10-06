import Image from "next/image";
import { ArrowIcon, PlayIcon } from "./icons";
import { NichePills } from "./niche-filter";
import {
  Avatar,
  ContactPill,
  copyrightYear,
  HireLink,
  KitLink,
  NicheSuffix,
  PieceLink,
  pieceMeta,
  pieceShow,
  portfolioView,
  ServiceText,
  STAT_LABEL,
  TemplateFrame,
  type TemplateProps,
} from "./template-kit";

/*
 * Plantilla Minimal: restricción editorial de la referencia Kima, con implementación propia.
 * En escritorio, una columna fija a la izquierda (quién es, disponibilidad, CTAs, cifras con el
 * Engagement Rate primero, servicios numerados, contacto) y a la derecha un mosaico del trabajo
 * que se mueve con el scroll. En el celular, lo mismo en una sola columna.
 * Divisores finos, un solo acento, fotos en grises que toman color al pasar el mouse.
 * Ronda 6 · 13.9: "Trabaja conmigo" (sólido, con flecha) y "Ver media kit" (contorno).
 */
export function MinimalTemplate({ portfolio, variant, filter }: TemplateProps) {
  const { name, bio, valueProp, stats, services, pieces, photo } = portfolio;
  const view = portfolioView(portfolio, variant);
  const { filterable, filterableSlugs, email, channels, hasContact, er, id } = view;
  const { Root, H1, H2, H3 } = view.headings;
  const intro = valueProp || bio;

  return (
    <TemplateFrame view={view} template="minimal" variant={variant} filter={filter}>
      <div className="pf-body">
        <Root id={id("inicio")} className="min-layout">
          <aside className="min-side" aria-label={`Sobre ${name}`}>
            <Avatar photo={photo} name={name} size={56} className="min-avatar" />
            <H1 className="min-name">{name}</H1>
            {intro && <p className="min-intro">{intro}</p>}
            {valueProp && bio && <p className="min-bio">{bio}</p>}
            <p className="min-status">
              <span className="min-status__dot" aria-hidden="true" />
              Disponible para colaborar.
            </p>
            <div className="min-actions">
              <HireLink view={view} className="min-cta">
                <ArrowIcon direction="right" size={16} />
              </HireLink>
              <KitLink view={view} className={view.hire ? "min-cta min-cta--ghost" : "min-cta"} />
            </div>

            {(er || stats.length > 0) && (
              <dl className="min-stats">
                {er && (
                  <div className="min-stat min-stat--er" data-pf-stat="engagementRate">
                    <dt>{er.label}</dt>
                    <dd>{er.value}</dd>
                    <dd className="min-stat__basis">{er.basis}</dd>
                  </div>
                )}
                {stats.map((stat) => (
                  <div key={stat.kind} className="min-stat" data-pf-stat={stat.kind}>
                    <dt>{STAT_LABEL[stat.kind]}</dt>
                    <dd>{stat.display}</dd>
                  </div>
                ))}
              </dl>
            )}

            {services.length > 0 && (
              <section className="min-block" aria-labelledby={id("servicios")}>
                <H2 id={id("servicios")} className="min-label">
                  Servicios
                </H2>
                <ol className="min-services">
                  {services.map((service, index) => (
                    <li key={`${index}-${service.title}`} className="min-service">
                      <span className="min-service__num" aria-hidden="true">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <H3 className="min-service__title">{service.title}</H3>
                        <ServiceText text={service.description} className="min-service__text" />
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {hasContact && (
              <section id={id("contacto")} className="min-block" aria-labelledby={id("contacto-titulo")}>
                <H2 id={id("contacto-titulo")} className="min-label">
                  Contacto
                </H2>
                <ul className="min-contact">
                  {[...(email ? [email] : []), ...channels].map((link) => (
                    <li key={link.kind}>
                      <ContactPill link={link} className="min-contact__link" iconSize={16} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <footer className="min-footer">
              <p>
                © {copyrightYear()} {name} · Hecho con Supercreador
              </p>
            </footer>
          </aside>

          <section id={id("trabajo")} className="min-main" aria-labelledby={id("trabajo-titulo")}>
            <div className="min-main__head">
              <H2 id={id("trabajo-titulo")} className="min-label">
                Contenido destacado
                <NicheSuffix niches={filterable} />
              </H2>
              {view.showNicheNav && filterable.length > 0 && <NichePills {...filter} niches={filterable} name={name} />}
            </div>
            <ul className="min-grid">
              {pieces.map((piece) => {
                const { meta } = pieceMeta(piece);
                const ratio = piece.image?.width && piece.image.height ? `${piece.image.width} / ${piece.image.height}` : "4 / 5";
                return (
                  <li key={piece.id} className="min-item" data-pf-piece={piece.id} data-pf-show={pieceShow(piece, filterableSlugs)}>
                    <PieceLink piece={piece} className="min-item__link">
                      <div className="min-item__media" style={{ aspectRatio: ratio }} data-reel-media>
                        {piece.image ? (
                          <Image src={piece.image.url} alt="" fill sizes="(min-width: 1024px) 30vw, 50vw" loading="lazy" />
                        ) : (
                          <span className="min-item__placeholder" aria-hidden="true" />
                        )}
                        {piece.video && (
                          <span className="min-item__play" aria-hidden="true">
                            <PlayIcon size={16} />
                          </span>
                        )}
                      </div>
                      <H3 className="min-item__title">{piece.title}</H3>
                      {meta && <p className="min-item__meta">{meta}</p>}
                    </PieceLink>
                  </li>
                );
              })}
            </ul>
          </section>
        </Root>
      </div>
    </TemplateFrame>
  );
}
