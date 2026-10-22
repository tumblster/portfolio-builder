import Image from "next/image";  
import type { CSSProperties } from "react";  
import type { CanvaData, StoredImage } from "@/lib/portfolio/schema";  
import { fontPlan } from "@/lib/portfolio/font-map";  
import type { ResolvedPiece } from "@/lib/portfolio/resolve";  
import { nativeVideoFor } from "@/lib/portfolio/embed";  
import { CanvaMetricsSlider } from "./canva-metrics-slider";  
import { CanvaPhoneVideo } from "./canva-phone-video";  
import { CanvaSectorMenu } from "./canva-sector-button";  
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
 * dibuja con SU estética: bandas de fondo con sus colores, el hero espejo (foto  
 * del lado que ella la puso, sin marco si así lo hizo) y sus fuentes (font-map  
 * las resuelve a Google Fonts). Nada de la paleta ni de los elementos de las  
 * plantillas del sitio.  
 *  
 * Ronda 13: el ORDEN de las secciones es fijo (estructura editorial del  
 * producto) y ya no depende de cómo venían sus bandas:  
 *   Hero → Franja de marcas → Videos por sector → Resultados → Bio →  
 *   Formas de colaborar → Tarifas → Contacto (cierre).  
 * Las que no tienen datos se saltan. Los colores de banda se asignan en ese  
 * orden. Los sectores se eligen desde el botón flotante "Ver categorías"  
 * (canva-sector-button.tsx); ya no hay título del selector ni menú en la barra.  
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
    .map((view) => `.pf[data-pf-filter="$view"][data-pf-show]:not([data-pf-show~="${view}"]){display:none}`)  
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
  const italic = plan.headingsItalic ? "" : undefined;

  // Ids nuevos colgados del id de la sección de videos (view.id solo conoce sus  
  // propias claves): siguen siendo únicos entre la página y la vista previa.  
  const scopedId = (key: string) => `$id("trabajo")-${key}`;  
  const videosTarget = scopedId("videos");  
  const sectorTarget = (slug: string) => scopedId(`sector-${slug}`);

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
  // El hero ya consumió la primera banda: el resto de secciones sigue el orden fijo.  
  if (bands.length > 0) bandIndex = 1;  
  const paragraphs = bio  
    ? bio  
        .split(/\n{2,}/)  
        .map((paragraph) => paragraph.trim())  
        .filter(Boolean)  
    : [];  
  const groups = filterable  
    .map((niche) => ({ niche, pieces: pieces.filter((piece) => piece.niche === niche.slug) }))  
    .filter((group) => group.pieces.length > 0);  
  const ungrouped = pieces.filter((piece) => !piece.niche || !filterableSlugs.includes(piece.niche));  
  const showStrip = canva.logos.length >= 2;  
  // Con un solo sector no hay nada que elegir.  
  const showSectorMenu = groups.length >= 2;

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
        {/* ── 1 · Hero espejo: foto del lado de su Canva, título enfrente ── */}  
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

        {/* ── 2 · Franja de marcas: carrusel infinito, cada logo en su caja óptica ── */}  
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

        {/* ── 3 · Videos por sector, en mockups de teléfono ─────────────── */}  
        <section  
          id={videosTarget}  
          className="cv-work"  
          style={bandStyle(nextBand())}  
          aria-labelledby={id("trabajo")}  
        >  
          <H2 id={id("trabajo")} className="cv-visually-hidden">  
            Contenido  
          </H2>  
          <div className="cv-work__groups">  
            {groups.map(({ niche, pieces: group }) => (  
              <div  
                key={niche.slug}  
                id={sectorTarget(niche.slug)}  
                className="cv-group"  
                data-pf-show={`todo ${niche.slug}`}  
              >  
                <H3 className="cv-group__title" data-cv-italic={italic}>  
                  {niche.label}  
                </H3>  
                <PhoneGrid  
                  pieces={group}  
                  canva={canva}  
                  filterableSlugs={filterableSlugs}  
                  Heading={H3}  
                  groupLabel={niche.label}  
                />  
              </div>  
            ))}  
            {/* A4: lo que no tiene sector CIERRA la sección, no la abre. */}  
            {ungrouped.length > 0 && (  
              <div className="cv-group">  
                <PhoneGrid  
                  pieces={ungrouped}  
                  canva={canva}  
                  filterableSlugs={filterableSlugs}  
                  Heading={H3}  
                  groupLabel={null}  
                />  
              </div>  
            )}  
          </div>  
          {showSectorMenu && (  
            <CanvaSectorMenu  
              filter={filter}  
              allTargetId={videosTarget}  
              sectors={groups.map(({ niche }) => ({  
                slug: niche.slug,  
                label: niche.label,  
                targetId: sectorTarget(niche.slug),  
              }))}  
            />  
          )}  
        </section>

        {/* ── 4 · Resultados: todas sus capturas de métricas en slider ──── */}  
        {canva.metricsImages.length > 0 && (  
          <section className="cv-metrics" style={bandStyle(nextBand())} aria-labelledby={scopedId("resultados")}>  
            <H2 id={scopedId("resultados")} className="cv-section-title" data-cv-italic={italic}>  
              Resultados  
            </H2>  
            <CanvaMetricsSlider images={canva.metricsImages} name={name} />  
          </section>  
        )}

        {/* ── 5 · Bio con su foto de apoyo ──────────────────────────────── */}  
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

        {/* ── 6 · Formas de colaborar (título + descripción, sin precio) ── */}  
        {services.length > 0 && (  
          <section className="cv-services" style={bandStyle(nextBand())} aria-labelledby={id("servicios")}>  
            <H2 id={id("servicios")} className="cv-section-title" data-cv-italic={italic}>  
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

        {/* ── 7 · Tarifas: su tarifario como imagen completa ───────────── */}  
        {canva.rateCard && (  
          <section className="cv-rates" style={bandStyle(nextBand())} aria-labelledby={scopedId("tarifas")}>  
            <H2 id={scopedId("tarifas")} className="cv-section-title" data-cv-italic={italic}>  
              Tarifas  
            </H2>  
            <figure className="cv-rates__figure">  
              <Image  
                src={canva.rateCard.url}  
                alt={`Tarifas de ${name}`}  
                width={canva.rateCard.width ?? 900}  
                height={canva.rateCard.height ?? 1200}  
                className="cv-rates__img"  
                sizes="(min-width: 1024px) 560px, 92vw"  
              />  
            </figure>  
          </section>  
        )}

        {/* ── 8 · Contacto: cierre con un solo CTA ──────────────────────── */}  
        {hasContact && (  
          <section  
            id={id("contacto")}  
            className="cv-contact"  
            style={bandStyle(nextBand())}  
            aria-labelledby={id("contacto-titulo")}  
          >  
            <div className="cv-contact__inner">  
              {portfolio.photo && (  
                <figure className="cv-contact__photo">  
                  <Image src={portfolio.photo.url} alt="" fill sizes="96px" />  
                </figure>  
              )}  
              <H2 id={id("contacto-titulo")} className="cv-contact__title" data-cv-italic={italic}>  
                ¿Trabajamos juntos?  
              </H2>  
              <p className="cv-contact__text">Cuéntame de tu proyecto y conversemos.</p>  
              <div className="cv-contact__cta">  
                {view.hire ? (  
                  <HireLink view={view} className="cv-btn cv-btn--solid" />  
                ) : email ? (  
                  <a className="cv-btn cv-btn--solid" href={email.href}>  
                    {email.label}  
                  </a>  
                ) : channels.length > 0 ? (  
                  <ul className="cv-links">  
                    {channels.map((link) => (  
                      <li key={link.kind}>  
                        <ContactPill link={link} className="cv-link" />  
                      </li>  
                    ))}  
                  </ul>  
                ) : null}  
              </div>  
            </div>  
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

/** A3: los títulos derivados del import ("Video", "Video 3", el nombre del  
 * sector o "Sector 2") son andamiaje de datos, no copy: nunca se publican. */  
function isDerivedTitle(title: string, groupLabel: string | null): boolean {  
  const text = title.trim();  
  if (/^video( \d+)?$/i.test(text)) return true;  
  if (groupLabel) {  
    if (text === groupLabel) return true;  
    if (text.startsWith(`${groupLabel} `) && /^\d+$/.test(text.slice(groupLabel.length + 1))) return true;  
  }  
  return false;  
}

/** Grilla de teléfonos; cada pieza conserva su data-pf-show para el filtro. */  
function PhoneGrid({  
  pieces,  
  canva,  
  filterableSlugs,  
  Heading,  
  groupLabel,  
}: {  
  pieces: ResolvedPiece[];  
  canva: CanvaData;  
  filterableSlugs: readonly string[];  
  Heading: "h3" | "h4";  
  groupLabel: string | null;  
}) {  
  return (  
    <ul className="cv-phones">  
      {pieces.map((piece) => {  
        const meta = piece.video?.platform === "canva" ? null : pieceMeta(piece).meta;  
        return (  
          <li key={piece.id} className="cv-piece" data-pf-piece={piece.id} data-pf-show={pieceShow(piece, filterableSlugs)}>  
            <PhoneCard piece={piece} logo={piece.video ? canva.pieceLogos[piece.video.url] ?? null : null} />  
            {!isDerivedTitle(piece.title, groupLabel) && <Heading className="cv-piece__title">{piece.title}</Heading>}  
            {meta && <p className="cv-piece__meta">{meta}</p>}  
          </li>  
        );  
      })}  
    </ul>  
  );  
}

/** El teléfono: marco negro, el contenido adentro y el logo encima. Con video  
 * nativo de Canva (A1), el video mismo es la pantalla: frame real y play ahí  
 * dentro, sin badge ni salida a Canva. Un video de Canva sin fuente nativa  
 * nunca se convierte en link ni muestra la plataforma (cero fugas). */  
function PhoneCard({ piece, logo }: { piece: ResolvedPiece; logo: StoredImage | null }) {  
  const { platform } = pieceMeta(piece);  
  const native = piece.video ? nativeVideoFor(piece.video) : null;  
  const isCanva = piece.video?.platform === "canva";  
  return (  
    <div className="cv-phone">  
      <span className="cv-phone__notch" aria-hidden="true" />  
      {native ? (  
        <div className="cv-phone__screen">  
          <CanvaPhoneVideo src={native.src} title={piece.title} poster={piece.image?.url ?? null} />  
        </div>  
      ) : isCanva ? (  
        <div className="cv-phone__screen">  
          {piece.image ? (  
            <Image src={piece.image.url} alt="" fill sizes="(min-width: 768px) 228px, 46vw" loading="lazy" />  
          ) : null}  
        </div>  
      ) : (  
        <PieceLink piece={piece} className="cv-phone__screen">  
          {piece.image ? (  
            <Image src={piece.image.url} alt="" fill sizes="(min-width: 768px) 228px, 46vw" loading="lazy" />  
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
      )}  
      {logo && (  
        <span className="cv-phone__logo">  
          <Image src={logo.url} alt="" width={logo.width ?? 160} height={logo.height ?? 160} />  
        </span>  
      )}  
    </div>  
  );  
}
