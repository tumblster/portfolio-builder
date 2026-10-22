import Image from "next/image";  
import type { CSSProperties } from "react";  
import type { CanvaData, StoredImage, VideoLink } from "@/lib/portfolio/schema";  
import { fontPlan } from "@/lib/portfolio/font-map";  
import type { ResolvedPiece } from "@/lib/portfolio/resolve";  
import { nativeVideoFor } from "@/lib/portfolio/embed";  
import { CanvaBackdropVideo } from "./canva-backdrop-video";  
import { CanvaImageSlider } from "./canva-image-slider";  
import { CanvaSectorMenu } from "./canva-sector-button";  
import { CanvaVideoCard } from "./canva-video-card";  
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
 * Si el portafolio trae el diseño de su Canva (manual.canva), el Contenido se dibuja con SU LENGUAJE: bandas o  
 * textura de fondo, su tinta, sus fuentes y su tratamiento de titulares, marcos de línea fina y aire, cuando el  
 * parser los midió. La ESTRUCTURA es del producto (la composición libre lámina por lámina no se clona).  
 *  
 * Orden canónico (auditoría contra el manual, 22/10), saltando lo que no tenga datos:  
 *   Hero → Franja de marcas → Videos → Métricas → Testimonios → Razón ("¿Por qué yo?") → Fotos →  
 *   Formas de colaborar → Tarifas → Contacto (cierre).  
 * El trabajo va pegado a la franja; la prueba (franja + métricas + testimonios) va junta tras el trabajo; la  
 * autoridad (Razón) después; las tarifas antes del cierre.  
 *  
 * El filtro por nicho funciona como en las demás plantillas: NicheScope marca  
 * data-pf-filter y cada pieza dice en qué vistas sale (data-pf-show); las  
 * reglas de ocultamiento se inyectan abajo, iguales a las de TemplateFrame.  
 */

type CanvaTemplateProps = TemplateProps & { canva: CanvaData };

/** Un grupo destaca su primera pieza solo si llena dos filas completas (sin huecos en ningún ancho). */  
const FEATURE_MIN_PIECES = 5;  
const CARD_SIZES = "(min-width: 1024px) 282px, (min-width: 861px) 31vw, 46vw";  
const FEATURED_SIZES = "(min-width: 1024px) 588px, (min-width: 861px) 62vw, 92vw";  
/**  
 * A1 · hero: la foto llena el área (recorte) solo si es vertical o casi cuadrada y tan grande como el área en  
 * pantalla; si no, el área adopta la proporción de la foto (cero recorte, cero agrandado).  
 */  
const HERO_COVER_MAX_RATIO = 1.1;  
const HERO_COVER_MIN_WIDTH = 720;  
const HERO_COVER_MIN_HEIGHT = 780;  
/** En celular, una foto muy alta se recorta a 4/5 como mucho (con el encuadre seguro para personas). */  
const HERO_MOBILE_MIN_RATIO = 0.8;  
/** Fotos: hasta 6 en grilla editorial; más, en slider. */  
const GALLERY_GRID_MAX = 6;

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
    .map((view) => `.pf[data-pf-filter="${view}"][data-pf-show]:not([data-pf-show~="${view}"]){display:none}`)  
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
  const scopedId = (key: string) => `${id("trabajo")}-${key}`;  
  const videosTarget = scopedId("videos");  
  const sectorTarget = (slug: string) => scopedId(`sector-${slug}`);

  // C2 · rasgos de lenguaje medidos por el parser (cada uno opcional y combinable).  
  const texture = theme.texture ?? null;  
  const textureBase = texture?.swatch ?? null;  
  const traits = [  
    theme.frames === "line" ? "cv-frames" : null,  
    theme.headingsUpper ? "cv-upper" : null,  
    theme.airy ? "cv-airy" : null,  
    texture ? "cv-textured" : null,  
  ]  
    .filter(Boolean)  
    .join(" ");

  // Bandas en orden; si una sección no tiene banda propia, repite la última. Con textura, la textura es el fondo de  
  // todas las secciones y su color promedio es la base del contraste.  
  const bands = theme.bands.length > 0 ? theme.bands : theme.heroBg ? [theme.heroBg] : [];  
  let bandIndex = 0;  
  const nextBand = (): string | null => {  
    if (bands.length === 0) return null;  
    const color = bands[Math.min(bandIndex, bands.length - 1)];  
    bandIndex += 1;  
    return color;  
  };  
  const bandStyle = (color: string | null): CSSProperties => {  
    const base = textureBase ?? color;  
    if (!base) return {};  
    const pair = readablePair(base, theme.inkColor);  
    return {  
      backgroundColor: base,  
      ...(texture  
        ? { backgroundImage: `url("${texture.url}")`, backgroundSize: "cover", backgroundPosition: "center" }  
        : {}),  
      "--cv-band": base,  
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
  // Razón: toda su galería; los portafolios anteriores a la ronda 14 caen a su foto de apoyo.  
  const bioGallery: StoredImage[] =  
    canva.bioPhotos && canva.bioPhotos.length > 0 ? canva.bioPhotos : canva.supportPhoto ? [canva.supportPhoto] : [];  
  const gallery = canva.galleryPhotos ?? [];  
  const testimonials = canva.testimonialImages ?? [];  
  const rates = canva.rates ?? [];  
  const closingLink: VideoLink | null = canva.closingVideo ? { platform: "canva", url: canva.closingVideo.url } : null;  
  const closing = closingLink ? nativeVideoFor(closingLink) : null;

  // A1 · hero: encuadre seguro y sin agrandar la foto por encima de su resolución.  
  const photo = portfolio.photo;  
  const photoWidth = photo?.width ?? null;  
  const photoHeight = photo?.height ?? null;  
  const photoRatio = photoWidth && photoHeight ? photoWidth / photoHeight : null;  
  const heroFit: "cover" | "ratio" =  
    photoRatio === null ||  
    (photoRatio <= HERO_COVER_MAX_RATIO &&  
      (photoWidth ?? 0) >= HERO_COVER_MIN_WIDTH &&  
      (photoHeight ?? 0) >= HERO_COVER_MIN_HEIGHT)  
      ? "cover"  
      : "ratio";  
  const heroMediaStyle =  
    photoRatio !== null && photoWidth !== null  
      ? ({  
          "--cv-photo-ratio": String(photoRatio),  
          "--cv-photo-ratio-m": String(Math.max(photoRatio, HERO_MOBILE_MIN_RATIO)),  
          "--cv-photo-max": `${photoWidth}px`,  
        } as CSSProperties)  
      : undefined;  
  const heroMediaClass = [  
    "cv-hero__media",  
    theme.heroFramed ? "cv-hero__media--framed" : null,  
    heroFit === "ratio" ? "cv-hero__media--ratio" : null,  
  ]  
    .filter(Boolean)  
    .join(" ");

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
      className={traits ? `pf pf--canva ${traits}` : "pf pf--canva"}  
      template="canva"  
      variant={variant}  
      style={scopeStyle}  
    >  
      {plan.stylesheets.map((href) => (  
        <link key={href} rel="stylesheet" href={href} />  
      ))}  
      <style  
        dangerouslySetInnerHTML={{  
          __html: canvaRules(["todo", ...filterableSlugs], variant === "page" ? (textureBase ?? heroBg) : null),  
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
          <div className={heroFit === "ratio" ? "cv-hero__inner cv-hero__inner--ratio" : "cv-hero__inner"}>  
            <figure className={heroMediaClass} style={heroMediaStyle}>  
              {photo ? (  
                <Image  
                  src={photo.url}  
                  alt={`Foto de ${name}`}  
                  fill  
                  sizes="(min-width: 861px) 52vw, 100vw"  
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

        {/* ── Franja de marcas: carrusel infinito, cada logo en su caja óptica ── */}  
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

        {/* ── Videos por sector, en tarjetas ────────────────────────────── */}  
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
                <CardGrid  
                  pieces={group}  
                  canva={canva}  
                  filterableSlugs={filterableSlugs}  
                  Heading={H3}  
                  groupLabel={niche.label}  
                  featureFirst={group.length >= FEATURE_MIN_PIECES}  
                />  
              </div>  
            ))}  
            {/* A4: lo que no tiene sector CIERRA la sección, no la abre. */}  
            {ungrouped.length > 0 && (  
              <div className="cv-group">  
                <CardGrid  
                  pieces={ungrouped}  
                  canva={canva}  
                  filterableSlugs={filterableSlugs}  
                  Heading={H3}  
                  groupLabel={null}  
                  featureFirst={false}  
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

        {/* ── Métricas: todas sus capturas de analítica en slider ───────── */}  
        {canva.metricsImages.length > 0 && (  
          <section className="cv-metrics" style={bandStyle(nextBand())} aria-labelledby={scopedId("metricas")}>  
            <H2 id={scopedId("metricas")} className="cv-section-title" data-cv-italic={italic}>  
              Métricas  
            </H2>  
            <CanvaImageSlider images={canva.metricsImages} label={`Métricas de ${name}`} fit="contain" />  
          </section>  
        )}

        {/* ── Testimonios: cada captura completa, sin recorte ──────────── */}  
        {testimonials.length > 0 && (  
          <section className="cv-testimonials" style={bandStyle(nextBand())} aria-labelledby={scopedId("testimonios")}>  
            <H2 id={scopedId("testimonios")} className="cv-section-title" data-cv-italic={italic}>  
              Testimonios  
            </H2>  
            <ul className="cv-testimonials__grid">  
              {testimonials.map((image, index) => (  
                <li key={`${image.url}-${index}`} className="cv-testimonial">  
                  <Image  
                    src={image.url}  
                    alt={image.alt ?? `Testimonio para ${name} (${index + 1} de ${testimonials.length})`}  
                    width={image.width ?? 900}  
                    height={image.height ?? 1200}  
                    className="cv-testimonial__img"  
                    sizes="(min-width: 861px) 360px, 92vw"  
                  />  
                </li>  
              ))}  
            </ul>  
          </section>  
        )}

        {/* ── Razón ("¿Por qué yo?"): su texto y su galería completa ────── */}  
        {paragraphs.length > 0 && (  
          <section className="cv-bio" style={bandStyle(nextBand())} aria-labelledby={id("bio")}>  
            <div className={bioGallery.length > 0 ? "cv-bio__inner" : "cv-bio__inner cv-bio__inner--solo"}>  
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
              {bioGallery.length > 0 && (  
                <div className="cv-bio__gallery">  
                  <CanvaImageSlider  
                    images={bioGallery}  
                    label={`Foto de ${name}`}  
                    fit="cover"  
                    sizes="(min-width: 861px) 584px, 92vw"  
                  />  
                </div>  
              )}  
            </div>  
          </section>  
        )}

        {/* ── Fotos: grilla editorial hasta 6; más, en slider ─────────── */}  
        {gallery.length > 0 && (  
          <section className="cv-photos" style={bandStyle(nextBand())} aria-labelledby={scopedId("fotos")}>  
            <H2 id={scopedId("fotos")} className="cv-section-title" data-cv-italic={italic}>  
              Fotos  
            </H2>  
            {gallery.length > GALLERY_GRID_MAX ? (  
              <div className="cv-photos__slider">  
                <CanvaImageSlider  
                  images={gallery}  
                  label={`Fotos de ${name}`}  
                  fit="cover"  
                  sizes="(min-width: 861px) 560px, 92vw"  
                />  
              </div>  
            ) : (  
              <ul className="cv-gallery" data-count={gallery.length}>  
                {gallery.map((image, index) => {  
                  const featured = index === 0 && (gallery.length === 3 || gallery.length === 5);  
                  return (  
                    <li  
                      key={`${image.url}-${index}`}  
                      className={featured ? "cv-gallery__item cv-gallery__item--featured" : "cv-gallery__item"}  
                    >  
                      <Image  
                        src={image.url}  
                        alt={  
                          image.alt ??  
                          (gallery.length > 1 ? `Fotos de ${name} (${index + 1} de ${gallery.length})` : `Fotos de ${name}`)  
                        }  
                        fill  
                        sizes={featured ? "(min-width: 861px) 50vw, 92vw" : "(min-width: 861px) 31vw, 46vw"}  
                        loading="lazy"  
                      />  
                    </li>  
                  );  
                })}  
              </ul>  
            )}  
          </section>  
        )}

        {/* ── Formas de colaborar: tarjetas de servicio ────────────────── */}  
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

        {/* ── Tarifas: tarjetas de precio si hay dato; si no, su imagen ── */}  
        {(rates.length > 0 || canva.rateCard) && (  
          <section className="cv-rates" style={bandStyle(nextBand())} aria-labelledby={scopedId("tarifas")}>  
            <H2 id={scopedId("tarifas")} className="cv-section-title" data-cv-italic={italic}>  
              Tarifas  
            </H2>  
            {rates.length > 0 ? (  
              <ul className="cv-pricing">  
                {rates.map((rate, index) => (  
                  <li key={`${index}-${rate.name}`} className="cv-price">  
                    <H3 className="cv-price__name">{rate.name}</H3>  
                    <p className="cv-price__amount">{rate.price}</p>  
                    {rate.includes.length > 0 && (  
                      <ul className="cv-price__list">  
                        {rate.includes.map((item, itemIndex) => (  
                          <li key={`${itemIndex}-${item}`} className="cv-price__item">  
                            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" className="cv-price__check">  
                              <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />  
                            </svg>  
                            <span>{item}</span>  
                          </li>  
                        ))}  
                      </ul>  
                    )}  
                  </li>  
                ))}  
              </ul>  
            ) : canva.rateCard ? (  
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
            ) : null}  
          </section>  
        )}

        {/* ── Contacto: cierre con un solo CTA (y su video de fondo, si lo trae) ── */}  
        {hasContact && (  
          <section  
            id={id("contacto")}  
            className={closing ? "cv-contact cv-contact--video" : "cv-contact"}  
            style={bandStyle(nextBand())}  
            aria-labelledby={id("contacto-titulo")}  
          >  
            {closing && <CanvaBackdropVideo src={closing.src} poster={canva.closingVideo?.poster?.url ?? null} />}  
            <div className="cv-contact__inner">  
              {photo && (  
                <figure className="cv-contact__photo">  
                  <Image src={photo.url} alt="" fill sizes="96px" />  
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

/** Grilla de tarjetas; cada pieza conserva su data-pf-show para el filtro. */  
function CardGrid({  
  pieces,  
  canva,  
  filterableSlugs,  
  Heading,  
  groupLabel,  
  featureFirst,  
}: {  
  pieces: ResolvedPiece[];  
  canva: CanvaData;  
  filterableSlugs: readonly string[];  
  Heading: "h3" | "h4";  
  groupLabel: string | null;  
  featureFirst: boolean;  
}) {  
  return (  
    <ul className="cv-cards">  
      {pieces.map((piece, index) => {  
        const featured = featureFirst && index === 0;  
        const meta = piece.video?.platform === "canva" ? null : pieceMeta(piece).meta;  
        return (  
          <li  
            key={piece.id}  
            className={featured ? "cv-cards__item cv-cards__item--featured" : "cv-cards__item"}  
            data-pf-piece={piece.id}  
            data-pf-show={pieceShow(piece, filterableSlugs)}  
          >  
            <PieceCard  
              piece={piece}  
              featured={featured}  
              logo={piece.video ? canva.pieceLogos[piece.video.url] ?? null : null}  
            />  
            {!isDerivedTitle(piece.title, groupLabel) && <Heading className="cv-piece__title">{piece.title}</Heading>}  
            {meta && <p className="cv-piece__meta">{meta}</p>}  
          </li>  
        );  
      })}  
    </ul>  
  );  
}

/** La tarjeta: sin marco de dispositivo. Con video nativo de su sitio, el video mismo es la tarjeta (frame real y  
 * play aquí dentro). El chip con el logo de la marca sale SOLO si el dato asocia ese logo a esta pieza. Un video de  
 * Canva sin fuente nativa nunca se convierte en link ni muestra la plataforma (cero fugas). */  
function PieceCard({ piece, logo, featured }: { piece: ResolvedPiece; logo: StoredImage | null; featured: boolean }) {  
  const { platform } = pieceMeta(piece);  
  const native = piece.video ? nativeVideoFor(piece.video) : null;  
  const isCanva = piece.video?.platform === "canva";  
  const sizes = featured ? FEATURED_SIZES : CARD_SIZES;  
  return (  
    <div className="cv-card">  
      {native ? (  
        <CanvaVideoCard src={native.src} title={piece.title} poster={piece.image?.url ?? null} sizes={sizes} />  
      ) : isCanva ? (  
        <div className="cv-card__media">  
          {piece.image ? <Image src={piece.image.url} alt="" fill sizes={sizes} loading="lazy" /> : null}  
        </div>  
      ) : (  
        <PieceLink piece={piece} className="cv-card__media">  
          {piece.image ? (  
            <Image src={piece.image.url} alt="" fill sizes={sizes} loading="lazy" />  
          ) : piece.video ? (  
            <VideoFacade video={piece.video} />  
          ) : (  
            <span className="cv-card__placeholder">{platform ? `Video de ${platform}` : ""}</span>  
          )}  
          {piece.video && piece.image && (  
            <span className="cv-card__play" aria-hidden="true">  
              <PlayIcon size={20} />  
            </span>  
          )}  
          {piece.link && (  
            <span className="cv-card__badge">  
              <PlatformIcon platform={piece.link.platform} size={13} />  
              {platform}  
            </span>  
          )}  
        </PieceLink>  
      )}  
      {logo && (  
        <span className="cv-card__brand">  
          <Image src={logo.url} alt="" width={logo.width ?? 160} height={logo.height ?? 160} />  
        </span>  
      )}  
    </div>  
  );  
}
