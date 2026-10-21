import Image from "next/image";
import type { CSSProperties } from "react";
import type { CanvaData, StoredImage } from "@/lib/portfolio/schema";
import { fontPlan } from "@/lib/portfolio/font-map";
import type { ResolvedPiece } from "@/lib/portfolio/resolve";
import { SectorButton } from "./canva-sector-button";
import { NicheScope } from "./niche-filter";
import { PlatformIcon, PlayIcon } from "./icons";
import { VideoFacade } from "./video-facade";
import {
  ContactPill,
  copyrightYear,
  HireLink,
  KitLink,
  PieceLink,
  pieceMeta,
  pieceShow,
  portfolioView,
  ServiceText,
  type TemplateProps,
} from "./template-kit";
import "./canva-template.css";

/*
 * Importador de Canva v2 · la variante CLONADA de la página pública.
 *
 * Si el portafolio trae el diseño de su Canva (manual.canva), el Contenido se
 * dibuja como su sitio: bandas de fondo con SUS colores en orden, el hero
 * espejo (foto del lado que ella la puso, sin marco si así lo hizo), SUS
 * fuentes (font-map las resuelve a Google Fonts), los videos en mockups de
 * teléfono con el logo de la marca encima, la franja de marcas, su bio con su
 * foto de apoyo y su tarifario en Contacto. Nada de la paleta ni de los
 * elementos de las plantillas del sitio: sin eyebrow, sin píldoras de nav.
 *
 * El filtro por nicho funciona como en las demás plantillas: NicheScope marca
 * data-pf-filter y cada pieza dice en qué vistas sale (data-pf-show); las
 * reglas de ocultamiento se inyectan abajo, iguales a las de TemplateFrame.
 */

type CanvaTemplateProps = TemplateProps & { canva: CanvaData };

/** Luminancia relativa y contraste (WCAG) para la guardia de accesibilidad. */
function luminance(hex: string): number {
  const raw = hex.replace("#", "");
  const channel = (at: number) => {
    const value = parseInt(raw.slice(at, at + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * La tinta de una banda: la de su Canva si contrasta; si no, blanco o casi
 * negro (lo que contraste más). Es la ÚNICA intervención sobre su diseño:
 * reglas de accesibilidad, sin tocar colores de fondo ni la estética.
 */
function readablePair(band: string, ink: string | null): { ink: string; onInk: string } {
  const base = ink ?? "#191919";
  if (contrastRatio(base, band) >= 3.2) return { ink: base, onInk: band };
  const white = "#FFFFFF";
  const black = "#111111";
  const best = contrastRatio(white, band) >= contrastRatio(black, band) ? white : black;
  const onInk = contrastRatio(band, best) >= 3.2 ? band : best === white ? black : white;
  return { ink: best, onInk };
}

/** Reglas del filtro por nicho + fondo de la página, como las de TemplateFrame. */
function canvaRules(views: readonly string[], background: string | null): string {
  const filter = views
    .map((view) => `.pf[data-pf-filter="${view}"] [data-pf-show]:not([data-pf-show~="${view}"]){display:none}`)
    .join("");
  return background
    ? `${filter}html:root:has([data-site="portfolio"]){background-color:${background}}`
    : filter;
}

export function CanvaTemplate({ portfolio, variant, filter, coverEdit, canva }: CanvaTemplateProps) {
  const { name, tagline, bio, services, pieces } = portfolio;
  const view = portfolioView(portfolio, variant);
  const { filterable, filterableSlugs, email, channels, hasContact, handle, id } = view;
  const { Root, H1, H2, H3 } = view.headings;
  const theme = canva.theme;
  const plan = fontPlan(theme.fonts);

  // Bandas en orden; si una sección no tiene banda propia, repite la última.
  const bands = theme.bands.length > 0 ? theme.bands : theme.heroBg ? [theme.heroBg] : [];
  let bandIndex = 0;
  const nextBand = (): string | null => {
    if (bands.length === 0) return null;
    const color = bands[Math.min(bandIndex, bands.length - 1)];
    bandIndex += 1;
    return color;
  };
  const bandStyle = (color: string | null): CSSProperties => {
    if (!color) return {};
    const pair = readablePair(color, theme.inkColor);
    return {
      backgroundColor: color,
      "--cv-ink": pair.ink,
      "--cv-on-ink": pair.onInk,
    } as CSSProperties;
  };

  const heroBg = theme.heroBg ?? bands[0] ?? null;
  // El hero ya consumió la primera banda: el resto de secciones sigue el orden.
  if (bands.length > 0) bandIndex = 1;
  const paragraphs = bio
    ? bio
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
    : [];
  const ungrouped = pieces.filter((piece) => !piece.niche || !filterableSlugs.includes(piece.niche));
  const showStrip = canva.logos.length >= 2;

  const scopeStyle = {
    "--cv-ink": theme.inkColor ?? "#191919",
    "--cv-accent": theme.accentColor ?? theme.inkColor ?? "#191919",
    ...(plan.stacks.display ? { "--cv-font-display": plan.stacks.display } : {}),
    ...(plan.stacks.headings ? { "--cv-font-headings": plan.stacks.headings } : {}),
    ...(plan.stacks.body ? { "--cv-font-body": plan.stacks.body } : {}),
  } as CSSProperties;

  return (
    <NicheScope
      {...filter}
      nicheSlugs={filterableSlugs}
      className="pf pf--canva"
      template="canva"
      variant={variant}
      style={scopeStyle}
    >
      {plan.stylesheets.map((href) => (
        <link key={href} rel="stylesheet" href={href} />
      ))}
      <style
        dangerouslySetInnerHTML={{
          __html: canvaRules(["todo", ...filterableSlugs], variant === "page" ? heroBg : null),
        }}
      />

      <Root>
        {/* ── Hero espejo: foto del lado de su Canva, título enfrente ─────── */}
        <section
          className="cv-hero"
          style={bandStyle(heroBg)}
          data-photo-side={theme.heroSide}
          aria-labelledby={id("nombre")}
        >
          <div className="cv-hero__inner">
            <figure
              className={theme.heroFramed ? "cv-hero__media cv-hero__media--framed" : "cv-hero__media"}
            >
              {portfolio.photo ? (
                <Image
                  src={portfolio.photo.url}
                  alt={`Foto de ${name}`}
                  fill
                  sizes="(min-width: 1024px) 560px, 88vw"
                  preload={view.isPage}
                />
              ) : null}
              {coverEdit}
            </figure>
            <div className="cv-hero__copy">
              <H1 id={id("nombre")} className="cv-hero__name">
                {name}
              </H1>
              {tagline && <p className="cv-hero__tagline">{tagline}</p>}
              {handle && <p className="cv-hero__handle">{handle}</p>}
              <div className="cv-actions">
                <HireLink view={view} className="cv-btn cv-btn--solid" />
                <KitLink
                  view={view}
                  className={`cv-btn ${view.hire ? "cv-btn--ghost" : "cv-btn--solid"}`}
                />
              </div>
            </div>
          </div>
        </section>

        {/* ── Franja de marcas: carrusel infinito de logos sin fondo ────── */}
        {showStrip && (
          <section className="cv-strip" style={bandStyle(nextBand())} aria-label="Marcas con las que ha trabajado">
            <p className="cv-strip__label">Marcas con las que ha trabajado</p>
            <div className="cv-strip__viewport">
              <ul className="cv-strip__track">
                {[...canva.logos, ...canva.logos].map((logo, index) => (
                  <li
                    key={`${logo.url}-${index}`}
                    className="cv-strip__item"
                    aria-hidden={index >= canva.logos.length || undefined}
                  >
                    <Image
                      src={logo.url}
                      alt=""
                      width={logo.width ?? 240}
                      height={logo.height ?? 240}
                      className="cv-strip__logo"
                    />
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* ── Piezas por sector, en mockups de teléfono ─────────────────── */}
        <section className="cv-work" style={bandStyle(nextBand())} aria-labelledby={id("trabajo")}>
          <div className="cv-work__head">
            <div className="cv-work__head-copy">
              {canva.headings.sectors ? (
                <H2 id={id("trabajo")} className="cv-work__title">
                  {canva.headings.sectors}
                </H2>
              ) : (
                <H2 id={id("trabajo")} className="cv-visually-hidden">
                  Contenido
                </H2>
              )}
              {/* En la página, los sectores viven en el menú de la barra; en la
                  vista previa del editor, los botones quedan acá. */}
              {variant === "preview" && filterable.length > 0 && (
                <div className="cv-selector__buttons">
                  <SectorButton filter={filter} slug={null} label="Todo" />
                  {filterable.map((niche) => (
                    <SectorButton key={niche.slug} filter={filter} slug={niche.slug} label={niche.label} />
                  ))}
                </div>
              )}
            </div>
            {canva.selectorPhoto && (
              <figure className="cv-work__photo">
                <Image src={canva.selectorPhoto.url} alt="" fill sizes="(min-width: 1024px) 300px, 70vw" />
              </figure>
            )}
          </div>
          {ungrouped.length > 0 && (
            <PhoneGrid pieces={ungrouped} canva={canva} filterableSlugs={filterableSlugs} Heading={H3} />
          )}
          {filterable.map((niche) => {
            const group = pieces.filter((piece) => piece.niche === niche.slug);
            if (group.length === 0) return null;
            return (
              <div key={niche.slug} className="cv-group" data-pf-show={`todo ${niche.slug}`}>
                <H3 className="cv-group__title" data-cv-italic={plan.headingsItalic ? "" : undefined}>
                  {niche.label}
                </H3>
                <PhoneGrid pieces={group} canva={canva} filterableSlugs={filterableSlugs} Heading={H3} />
              </div>
            );
          })}
        </section>

        {/* ── Bio con su foto de apoyo ──────────────────────────────────── */}
        {paragraphs.length > 0 && (
          <section className="cv-bio" style={bandStyle(nextBand())} aria-labelledby={id("bio")}>
            <div className="cv-bio__inner">
              <div className="cv-bio__copy">
                {canva.headings.bio && (
                  <H2 id={id("bio")} className="cv-bio__title">
                    {canva.headings.bio}
                  </H2>
                )}
                {paragraphs.map((paragraph, index) => (
                  <p key={index} className="cv-bio__text">
                    {paragraph}
                  </p>
                ))}
              </div>
              {canva.supportPhoto && (
                <figure className="cv-bio__photo">
                  <Image
                    src={canva.supportPhoto.url}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 460px, 84vw"
                  />
                </figure>
              )}
            </div>
          </section>
        )}

        {/* ── Servicios (si los cargó en el formulario) ─────────────────── */}
        {services.length > 0 && (
          <section className="cv-services" style={bandStyle(nextBand())} aria-labelledby={id("servicios")}>
            <H2 id={id("servicios")} className="cv-section-title" data-cv-italic={plan.headingsItalic ? "" : undefined}>
              Formas de colaborar
            </H2>
            <ul className="cv-services__grid">
              {services.map((service, index) => (
                <li key={`${index}-${service.title}`} className="cv-service">
                  <H3 className="cv-service__title">{service.title}</H3>
                  <ServiceText text={service.description} className="cv-service__text" />
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Contacto + su tarifario ───────────────────────────────────── */}
        {hasContact && (
          <section
            id={id("contacto")}
            className="cv-contact"
            style={bandStyle(nextBand())}
            aria-labelledby={id("contacto-titulo")}
          >
            <H2
              id={id("contacto-titulo")}
              className="cv-contact__title"
              data-cv-italic={plan.headingsItalic ? "" : undefined}
            >
              {canva.headings.contact ?? "Contacto"}
            </H2>
            {email && (
              <a className="cv-mail" href={email.href}>
                {email.label}
              </a>
            )}
            {channels.length > 0 && (
              <ul className="cv-links">
                {channels.map((link) => (
                  <li key={link.kind}>
                    <ContactPill link={link} className="cv-link" />
                  </li>
                ))}
              </ul>
            )}
            {canva.rateCard && (
              <div className="cv-ratecard">
                <H3 className="cv-ratecard__title">Tarifas</H3>
                <figure className="cv-ratecard__figure">
                  <Image
                    src={canva.rateCard.url}
                    alt={`Tarifas de ${name}`}
                    width={canva.rateCard.width ?? 900}
                    height={canva.rateCard.height ?? 1200}
                    className="cv-ratecard__img"
                    sizes="(min-width: 1024px) 560px, 88vw"
                  />
                </figure>
              </div>
            )}
          </section>
        )}
      </Root>

      <footer className="cv-footer">
        <p>
          © {copyrightYear()} {name}
        </p>
      </footer>
    </NicheScope>
  );
}

/** Grilla de teléfonos; cada pieza conserva su data-pf-show para el filtro. */
function PhoneGrid({
  pieces,
  canva,
  filterableSlugs,
  Heading,
}: {
  pieces: ResolvedPiece[];
  canva: CanvaData;
  filterableSlugs: readonly string[];
  Heading: "h3" | "h4";
}) {
  return (
    <ul className="cv-phones">
      {pieces.map((piece) => (
        <li key={piece.id} className="cv-piece" data-pf-piece={piece.id} data-pf-show={pieceShow(piece, filterableSlugs)}>
          <PhoneCard piece={piece} logo={piece.video ? canva.pieceLogos[piece.video.url] ?? null : null} />
          <Heading className="cv-piece__title">{piece.title}</Heading>
          {pieceMeta(piece).meta && <p className="cv-piece__meta">{pieceMeta(piece).meta}</p>}
        </li>
      ))}
    </ul>
  );
}

/** El teléfono: marco negro, la portada (o la fachada) adentro y el logo encima. */
function PhoneCard({ piece, logo }: { piece: ResolvedPiece; logo: StoredImage | null }) {
  const { platform } = pieceMeta(piece);
  return (
    <div className="cv-phone">
      <span className="cv-phone__notch" aria-hidden="true" />
      <PieceLink piece={piece} className="cv-phone__screen">
        {piece.image ? (
          <Image src={piece.image.url} alt="" fill sizes="(min-width: 768px) 240px, 62vw" loading="lazy" />
        ) : piece.video ? (
          <VideoFacade video={piece.video} />
        ) : (
          <span className="cv-phone__placeholder">{platform ? `Video de ${platform}` : ""}</span>
        )}
        {piece.video && piece.image && (
          <span className="cv-phone__play" aria-hidden="true">
            <PlayIcon size={22} />
          </span>
        )}
        {piece.link && (
          <span className="cv-phone__badge">
            <PlatformIcon platform={piece.link.platform} size={13} />
            {platform}
          </span>
        )}
      </PieceLink>
      {logo && (
        <span className="cv-phone__logo">
          <Image src={logo.url} alt="" width={logo.width ?? 160} height={logo.height ?? 160} />
        </span>
      )}
    </div>
  );
}
