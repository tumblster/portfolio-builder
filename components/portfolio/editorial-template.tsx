import Image from "next/image";
import { ArrowIcon, PlayIcon } from "./icons";
import { NichePills } from "./niche-filter";
import {
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
 * Plantilla Editorial (la cuarta, propuesta desde el ritmo tipográfico de Portvio y Nairo): página
 * oscura del color profundo de la paleta, el nombre en mayúsculas a tamaño display, el Engagement
 * Rate enorme al lado de la propuesta de valor y el trabajo como una lista numerada de revista
 * (número, título grande, cifra, miniatura). Un solo acento, usado solo para detalles.
 */
export function EditorialTemplate({ portfolio, variant, filter, coverEdit }: TemplateProps) {
  const { name, bio, valueProp, stats, services, pieces } = portfolio;
  const view = portfolioView(portfolio, variant);
  const { filterable, filterableSlugs, email, channels, hasContact, cover, er, id } = view;
  const { Root, H1, H2, H3 } = view.headings;
  const count = (n: number) => `(${String(n).padStart(2, "0")})`;

  return (
    <TemplateFrame view={view} template="editorial" variant={variant} filter={filter}>
      <div className="pf-body">
        <header className="ed-top">
          <a className="ed-top__name" href={`#${id("inicio")}`}>
            {name}
          </a>
          {view.showNicheNav && filterable.length > 0 && <NichePills {...filter} niches={filterable} name={name} />}
          {hasContact && (
            <a className="ed-top__cta" href={`#${id("contacto")}`}>
              Contacto
            </a>
          )}
        </header>

        <Root id={id("inicio")}>
          <section className="ed-hero" aria-labelledby={id("nombre")}>
            <p className="ed-kicker">
              <span className="ed-dot" aria-hidden="true" />
              Creadora UGC
              <NicheSuffix niches={filterable} />
            </p>
            <H1 id={id("nombre")} className="ed-display">
              {name}
            </H1>
            <div className="ed-hero__row">
              <div className="ed-hero__copy">
                {valueProp && <p className="ed-lead">{valueProp}</p>}
                {bio && <p className="ed-bio">{bio}</p>}
              </div>
              {er && (
                <p className="ed-er" data-pf-stat="engagementRate">
                  <span className="ed-er__value">{er.value}</span>
                  <span className="ed-er__label">
                    {er.label}
                    <span className="ed-er__basis">{er.basis}</span>
                  </span>
                </p>
              )}
              {(cover || coverEdit) && (
                <div className="ed-hero__photo">
                  {cover && <Image src={cover.image.url} alt={cover.alt} fill sizes="(min-width: 1024px) 320px, 40vw" preload={view.isPage} />}
                  {coverEdit}
                </div>
              )}
            </div>
            {stats.length > 0 && (
              <dl className="ed-stats">
                {stats.map((stat) => (
                  <div key={stat.kind} className="ed-stat" data-pf-stat={stat.kind}>
                    <dt>{STAT_LABEL[stat.kind]}</dt>
                    <dd>{stat.display}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          <section id={id("trabajo")} className="ed-section pf-reveal" aria-labelledby={id("trabajo-titulo")}>
            <div className="ed-section__head">
              <H2 id={id("trabajo-titulo")} className="ed-h2">
                Trabajo
                <NicheSuffix niches={filterable} />
              </H2>
              <span className="ed-count" aria-hidden="true">
                {count(pieces.length)}
              </span>
            </div>
            <ol className="ed-list">
              {pieces.map((piece, index) => {
                const { platform, meta } = pieceMeta(piece);
                return (
                  <li key={piece.id} className="ed-row" data-pf-piece={piece.id} data-pf-show={pieceShow(piece, filterableSlugs)}>
                    <PieceLink piece={piece} className="ed-row__link">
                      <span className="ed-row__num" aria-hidden="true">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div className="ed-row__text">
                        <H3 className="ed-row__title">{piece.title}</H3>
                        {meta && (
                          <p className="ed-row__meta">
                            {meta}
                            {platform && piece.metrics.display ? ` · ${platform}` : ""}
                          </p>
                        )}
                      </div>
                      <div className="ed-row__media" data-reel-media>
                        {piece.image ? (
                          <Image src={piece.image.url} alt="" fill sizes="(min-width: 768px) 120px, 72px" loading="lazy" />
                        ) : (
                          <span className="ed-row__placeholder" aria-hidden="true" />
                        )}
                        {piece.video && (
                          <span className="ed-row__play" aria-hidden="true">
                            <PlayIcon size={14} />
                          </span>
                        )}
                      </div>
                    </PieceLink>
                  </li>
                );
              })}
            </ol>
          </section>

          {services.length > 0 && (
            <section className="ed-section pf-reveal" aria-labelledby={id("servicios")}>
              <div className="ed-section__head">
                <H2 id={id("servicios")} className="ed-h2">
                  Servicios
                </H2>
                <span className="ed-count" aria-hidden="true">
                  {count(services.length)}
                </span>
              </div>
              <ol className="ed-services">
                {services.map((service, index) => (
                  <li key={`${index}-${service.title}`} className="ed-service">
                    <span className="ed-row__num" aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <H3 className="ed-service__title">{service.title}</H3>
                      {service.description && <p className="ed-service__text">{service.description}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {hasContact && (
            <section id={id("contacto")} className="ed-contact pf-reveal" aria-labelledby={id("contacto-titulo")}>
              <H2 id={id("contacto-titulo")} className="ed-kicker">
                <span className="ed-dot" aria-hidden="true" />
                ¿Trabajamos juntos?
              </H2>
              {email ? (
                <a className="ed-mail" href={email.href}>
                  {email.label}
                  <ArrowIcon direction="right" size={28} />
                </a>
              ) : (
                <p className="ed-mail ed-mail--plain">Escríbeme</p>
              )}
              {channels.length > 0 && (
                <ul className="ed-links">
                  {channels.map((link) => (
                    <li key={link.kind}>
                      <ContactPill link={link} className="ed-link" iconSize={16} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </Root>

        <footer className="ed-footer">
          <p>
            © {copyrightYear()} {name}
          </p>
          <p>Hecho con Supercreador</p>
        </footer>
      </div>
    </TemplateFrame>
  );
}
