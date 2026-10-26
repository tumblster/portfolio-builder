import Image from "next/image";
import type { CSSProperties } from "react";
import type { CanvaData, CanvaRate, StoredImage, VideoLink } from "@/lib/portfolio/schema";
import { fontPlan } from "@/lib/portfolio/font-map";
import type { ResolvedPiece } from "@/lib/portfolio/resolve";
import { nativeVideoFor } from "@/lib/portfolio/embed";
import { CanvaBackdropVideo } from "./canva-backdrop-video";
import { CanvaContactButton } from "./canva-contact-button";
import { CanvaImageSlider } from "./canva-image-slider";
import { CanvaRatesSimulator } from "./canva-rates-simulator";
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
 * parser los midió. La ESTRUCTURA es del producto.
 *
 * Orden canónico, saltando lo que no tenga datos:
 *   Hero → Franja de marcas → Videos → Métricas → Testimonios → Razón ("¿Por qué yo?") → Fotos →
 *   Formas de colaborar → Tarifas → Contacto (cierre) → Pie.
 *
 * Ronda 15:
 * - C1: la franja corre infinita sin hueco. La pista repite el conjunto las veces necesarias para cubrir 2 veces el
 *   ancho visible más grande y la animación traslada EXACTAMENTE el ancho de un conjunto (calculado aquí en px, por
 *   breakpoint). Cada logo se escala a un área comparable con su caja de contenido real: alto de 40 a 64 px y ancho
 *   máximo de 200 px.
 * - C2: Métricas en escenario desktop (captura activa completa al centro, vecinas asomando). Todos los sliders
 *   muestran la imagen completa.
 * - C3: con video de cierre, el cierre NO muestra la foto circular (la foto es el reemplazo del video).
 * - C4: el pie suma una fila de íconos enlazados (Instagram, TikTok, correo, sitio web), solo los que existan.
 * - C5: "Trabaja conmigo" abre un panel (WhatsApp primero si existe, el correo visible, "Copiar correo" y, solo si la
 *   persona lo elige, "Abrir en tu correo"). Nada abre una app sin elegirla.
 * - B5: una pieza de Canva sin logo asociado y con un título corto propio (su etiqueta de marca) lo muestra como chip
 *   sobre la tarjeta, en lugar de repetirlo debajo.
 *
 * Ronda de corrección:
 * - F5: los logos cuadrados de la franja llevan la clase --square (radio suave en el CSS).
 * - S3 / S5: con tarifas estructuradas, Tarifas muestra el simulador (mismos datos que las tarjetas); sin estructura,
 *   las tarjetas de siempre; sin tarifas, la imagen del tarifario.
 * - V1: con video de cierre, la plantilla calcula la opacidad del velo en celular (--cv-veil-m): la menor (desde 0.5)
 *   con la que la tinta conserva el contraste de la guardia (3.2) aun en el peor cuadro posible del video (uno del
 *   mismo color que la tinta). Desktop queda en 0.86.
 */

type CanvaTemplateProps = TemplateProps & { canva: CanvaData };

/** Un grupo destaca su primera pieza solo si llena dos filas completas (sin huecos en ningún ancho). */
const FEATURE_MIN_PIECES = 5;
const CARD_SIZES = "(min-width: 1024px) 282px, (min-width: 861px) 31vw, 46vw";
const FEATURED_SIZES = "(min-width: 1024px) 588px, (min-width: 861px) 62vw, 92vw";
const HERO_COVER_MAX_RATIO = 1.1;
const HERO_COVER_MIN_WIDTH = 720;
const HERO_COVER_MIN_HEIGHT = 780;
const HERO_MOBILE_MIN_RATIO = 0.8;
/** Fotos: hasta 6 en grilla editorial; más, en slider. */
const GALLERY_GRID_MAX = 6;
/** C5: el texto del botón de contacto (el mismo de siempre). */
const HIRE_LABEL = "Trabaja conmigo";

/** C1: área visual común de los logos de la franja y sus límites. */
const STRIP_AREA = 5600;
const STRIP_MIN_H = 40;
const STRIP_MAX_H = 64;
const STRIP_MAX_W = 200;
/** Separación entre logos (la misma del CSS): desktop y celular. */
const STRIP_GAP = 48;
const STRIP_GAP_MOBILE = 32;
/** Ancho visible máximo que se cubre dos veces (pantallas grandes incluidas). */
const STRIP_VIEW_MAX = 2560;
const STRIP_MAX_COPIES = 48;
/** Velocidad constante: px por segundo (más logos = más tiempo, misma velocidad). */
const STRIP_SPEED = 40;
const STRIP_MIN_SECONDS = 12;
/** F5: un logo es cuadrado si su proporción está a ±12 % de 1. */
const STRIP_SQUARE_TOLERANCE = 0.12;

/** B5: una etiqueta de marca es corta. */
const BRAND_LABEL_MAX_WORDS = 4;
const BRAND_LABEL_MAX_CHARS = 40;

/** Guardia de contraste (la misma de las bandas). */
const CONTRAST_MIN = 3.2;
/** V1: opacidad del velo del cierre: desktop (la vigente) y el piso en celular. */
const VEIL_DESKTOP = 0.86;
const VEIL_MOBILE_MIN = 0.5;
const VEIL_STEP = 0.02;

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
 * La tinta de una banda: la de su Canva si contrasta; si no, blanco o casi negro (lo que contraste más). Es la ÚNICA
 * intervención sobre su diseño: reglas de accesibilidad, sin tocar colores de fondo ni la estética.
 */
function readablePair(band: string, ink: string | null): { ink: string; onInk: string } {
  const base = ink ?? "#191919";
  if (contrastRatio(base, band) >= CONTRAST_MIN) return { ink: base, onInk: band };
  const white = "#FFFFFF";
  const black = "#111111";
  const best = contrastRatio(white, band) >= contrastRatio(black, band) ? white : black;
  const onInk = contrastRatio(band, best) >= CONTRAST_MIN ? band : best === white ? black : white;
  return { ink: best, onInk };
}

/** Mezcla de dos colores como la compone el navegador (velo de opacidad `weightA` sobre `b`). */
function mixHex(a: string, b: string, weightA: number): string {
  const channel = (hex: string, at: number) => parseInt(hex.replace("#", "").slice(at, at + 2), 16);
  const mix = (at: number) =>
    Math.round(channel(a, at) * weightA + channel(b, at) * (1 - weightA))
      .toString(16)
      .padStart(2, "0");
  return ("#" + mix(0) + mix(2) + mix(4)).toUpperCase();
}

/**
 * V1: la menor opacidad del velo (desde VEIL_MOBILE_MIN) con la que la tinta sigue pasando la guardia aun si el
 * cuadro del video detrás tuviera el mismo color que la tinta (el peor caso). Si ninguna alcanza, la vigente.
 */
function closingVeil(band: string, ink: string): number {
  for (let opacity = VEIL_MOBILE_MIN; opacity < VEIL_DESKTOP; opacity += VEIL_STEP) {
    if (contrastRatio(ink, mixHex(band, ink, opacity)) >= CONTRAST_MIN) return Math.round(opacity * 100) / 100;
  }
  return VEIL_DESKTOP;
}

/** S3: las tarifas traen estructura (al menos un servicio tipado): se simulan. */
function isStructuredRates(rates: readonly CanvaRate[]): boolean {
  return rates.some((rate) => rate.kind === "service");
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

type StripItem = { logo: StoredImage; width: number; height: number; square: boolean };

/**
 * C1: el tamaño de cada logo (área comparable, alto 40–64, ancho ≤ 200, según su caja de contenido real: los logos
 * sin fondo ya llegan recortados al importar) y cuántas veces se repite el conjunto para no dejar nunca un hueco.
 * F5: marca los cuadrados (radio suave en el CSS).
 */
function stripPlan(logos: readonly StoredImage[]) {
  const items: StripItem[] = logos.map((logo) => {
    const ratio = logo.width && logo.height ? logo.width / logo.height : 1;
    let height = Math.min(STRIP_MAX_H, Math.max(STRIP_MIN_H, Math.sqrt(STRIP_AREA / ratio)));
    let width = height * ratio;
    if (width > STRIP_MAX_W) {
      width = STRIP_MAX_W;
      height = Math.max(STRIP_MIN_H, Math.min(height, STRIP_MAX_W / ratio));
    }
    return {
      logo,
      width: Math.round(width),
      height: Math.round(height),
      square: Math.abs(ratio - 1) <= STRIP_SQUARE_TOLERANCE,
    };
  });
  const setWidth = (gap: number) => items.reduce((total, item) => total + item.width + gap, 0);
  const set = setWidth(STRIP_GAP);
  const setMobile = setWidth(STRIP_GAP_MOBILE);
  // El conjunto más angosto (celular) decide cuántas copias hacen falta: así también alcanza en desktop.
  const copies = Math.min(
    STRIP_MAX_COPIES,
    Math.max(2, Math.ceil((2 * STRIP_VIEW_MAX) / Math.max(1, setMobile)) + 1),
  );
  const seconds = (width: number) => `${Math.max(STRIP_MIN_SECONDS, width / STRIP_SPEED).toFixed(1)}s`;
  const style = {
    "--cv-strip-set": `${set}px`,
    "--cv-strip-set-m": `${setMobile}px`,
    "--cv-strip-dur": seconds(set),
    "--cv-strip-dur-m": seconds(setMobile),
  } as CSSProperties;
  return { items, copies, style };
}

type SocialKind = "instagram" | "tiktok" | "email" | "website";
type Social = { kind: SocialKind; href: string; label: string };

/** C4: íconos simples del sistema, en la tinta del tema. */
function SocialIcon({ kind }: { kind: SocialKind }) {
  if (kind === "instagram" || kind === "tiktok") return <PlatformIcon platform={kind} size={20} />;
  if (kind === "email") {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
        <rect x="3" y="5" width="18" height="14" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M4 7l8 6 8-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 12h18M12 3c2.6 2.6 3.9 5.6 3.9 9s-1.3 6.4-3.9 9c-2.6-2.6-3.9-5.6-3.9-9S9.4 5.6 12 3z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

export function CanvaTemplate({ portfolio, variant, filter, coverEdit, canva }: CanvaTemplateProps) {
  const { name, tagline, bio, services, pieces } = portfolio;
  const view = portfolioView(portfolio, variant);
  const { filterable, filterableSlugs, channels, hasContact, handle, id } = view;
  const { Root, H1, H2, H3 } = view.headings;
  const theme = canva.theme;
  const plan = fontPlan(theme.fonts);
  const italic = plan.headingsItalic ? "" : undefined;

  const scopedId = (key: string) => `${id("trabajo")}-${key}`;
  const videosTarget = scopedId("videos");
  const sectorTarget = (slug: string) => scopedId(`sector-${slug}`);

  // C5 / C4: datos de contacto que el portafolio ya trae.
  const contact = portfolio.contact as Partial<Record<"instagram" | "tiktok" | "email" | "website" | "whatsapp", string>>;
  const directEmail = contact.email?.trim() || null;
  const directWhatsapp = contact.whatsapp?.replace(/\D/g, "") || null;
  const hasDirect = Boolean(directEmail || directWhatsapp);
  const socials: Social[] = [
    contact.instagram
      ? { kind: "instagram" as const, href: `https://www.instagram.com/${contact.instagram}`, label: `Instagram de ${name}` }
      : null,
    contact.tiktok
      ? { kind: "tiktok" as const, href: `https://www.tiktok.com/@${contact.tiktok}`, label: `TikTok de ${name}` }
      : null,
    directEmail ? { kind: "email" as const, href: `mailto:${directEmail}`, label: `Correo de ${name}` } : null,
    contact.website ? { kind: "website" as const, href: contact.website, label: `Sitio web de ${name}` } : null,
  ].filter((social): social is Social => social !== null);

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

  const bands = theme.bands.length > 0 ? theme.bands : theme.heroBg ? [theme.heroBg] : [];
  let bandIndex = 0;
  const nextBand = (): string | null => {
    if (bands.length === 0) return null;
    const color = bands[Math.min(bandIndex, bands.length - 1)];
    bandIndex += 1;
    return color;
  };
  /** El color base de una banda (su textura manda) y su par de tintas legibles. */
  const bandParts = (color: string | null) => {
    const base = textureBase ?? color;
    return base ? { base, pair: readablePair(base, theme.inkColor) } : null;
  };
  const bandStyle = (color: string | null): CSSProperties => {
    const parts = bandParts(color);
    if (!parts) return {};
    return {
      backgroundColor: parts.base,
      ...(texture
        ? { backgroundImage: `url("${texture.url}")`, backgroundSize: "cover", backgroundPosition: "center" }
        : {}),
      "--cv-band": parts.base,
      "--cv-ink": parts.pair.ink,
      "--cv-on-ink": parts.pair.onInk,
    } as CSSProperties;
  };

  const heroBg = theme.heroBg ?? bands[0] ?? null;
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
  const strip = stripPlan(canva.logos);
  const showSectorMenu = groups.length >= 2;
  const bioGallery: StoredImage[] =
    canva.bioPhotos && canva.bioPhotos.length > 0 ? canva.bioPhotos : canva.supportPhoto ? [canva.supportPhoto] : [];
  const gallery = canva.galleryPhotos ?? [];
  const testimonials = canva.testimonialImages ?? [];
  const rates = canva.rates ?? [];
  const closingLink: VideoLink | null = canva.closingVideo ? { platform: "canva", url: canva.closingVideo.url } : null;
  const closing = closingLink ? nativeVideoFor(closingLink) : null;

  /** V1: el cierre con video suma la opacidad del velo en celular (desktop no cambia). */
  const closingStyle = (color: string | null): CSSProperties => {
    const style = bandStyle(color);
    const parts = bandParts(color);
    return closing && parts
      ? ({ ...style, "--cv-veil-m": closingVeil(parts.base, parts.pair.ink).toFixed(2) } as CSSProperties)
      : style;
  };

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

  const contactButton = (className: string) => (
    <CanvaContactButton label={HIRE_LABEL} email={directEmail} whatsapp={directWhatsapp} className={className} />
  );

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
                {hasDirect ? (
                  contactButton("cv-btn cv-btn--solid")
                ) : (
                  <HireLink view={view} className="cv-btn cv-btn--solid" />
                )}
                <KitLink
                  view={view}
                  className={`cv-btn ${hasDirect || view.hire ? "cv-btn--ghost" : "cv-btn--solid"}`}
                />
              </div>
            </div>
          </div>
        </section>

        {/* ── Franja de marcas: carrusel infinito sin huecos (C1) ────────── */}
        {showStrip && (
          <section className="cv-strip" style={bandStyle(nextBand())} aria-label="Marcas con las que ha trabajado">
            <p className="cv-strip__label">Marcas con las que ha trabajado</p>
            <div className="cv-strip__viewport">
              <ul className="cv-strip__track" style={strip.style}>
                {Array.from({ length: strip.copies }, (_, copy) =>
                  strip.items.map((item, index) => (
                    <li key={`${copy}-${index}`} className="cv-strip__item" aria-hidden={copy > 0 || undefined}>
                      <Image
                        src={item.logo.url}
                        alt=""
                        width={item.width}
                        height={item.height}
                        className={item.square ? "cv-strip__logo cv-strip__logo--square" : "cv-strip__logo"}
                        style={{ width: item.width, height: item.height }}
                        loading="lazy"
                      />
                    </li>
                  )),
                )}
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

        {/* ── Métricas: escenario desktop (C2), slider en celular ───────── */}
        {canva.metricsImages.length > 0 && (
          <section className="cv-metrics" style={bandStyle(nextBand())} aria-labelledby={scopedId("metricas")}>
            <H2 id={scopedId("metricas")} className="cv-section-title" data-cv-italic={italic}>
              Métricas
            </H2>
            <CanvaImageSlider
              images={canva.metricsImages}
              label={`Métricas de ${name}`}
              stage
              sizes="(min-width: 1024px) 672px, (min-width: 768px) 480px, 92vw"
            />
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
                  <CanvaImageSlider images={bioGallery} label={`Foto de ${name}`} sizes="(min-width: 861px) 584px, 92vw" />
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
                <CanvaImageSlider images={gallery} label={`Fotos de ${name}`} sizes="(min-width: 861px) 560px, 92vw" />
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

        {/* ── Tarifas: simulador (S3) si hay estructura; tarjetas si hay dato plano; si no, su imagen ── */}
        {(rates.length > 0 || canva.rateCard) && (
          <section className="cv-rates" style={bandStyle(nextBand())} aria-labelledby={scopedId("tarifas")}>
            <H2 id={scopedId("tarifas")} className="cv-section-title" data-cv-italic={italic}>
              Tarifas
            </H2>
            {rates.length > 0 ? (
              isStructuredRates(rates) ? (
                <CanvaRatesSimulator rates={rates} />
              ) : (
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
              )
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

        {/* ── Contacto: cierre con un solo CTA; con video, sin la foto (C3) y con el velo de V1 ── */}
        {hasContact && (
          <section
            id={id("contacto")}
            className={closing ? "cv-contact cv-contact--video" : "cv-contact"}
            style={closingStyle(nextBand())}
            aria-labelledby={id("contacto-titulo")}
          >
            {closing && <CanvaBackdropVideo src={closing.src} poster={canva.closingVideo?.poster?.url ?? null} />}
            <div className="cv-contact__inner">
              {photo && !closing && (
                <figure className="cv-contact__photo">
                  <Image src={photo.url} alt="" fill sizes="96px" />
                </figure>
              )}
              <H2 id={id("contacto-titulo")} className="cv-contact__title" data-cv-italic={italic}>
                ¿Trabajamos juntos?
              </H2>
              <p className="cv-contact__text">Cuéntame de tu proyecto y conversemos.</p>
              <div className="cv-contact__cta">
                {hasDirect ? (
                  contactButton("cv-btn cv-btn--solid")
                ) : view.hire ? (
                  <HireLink view={view} className="cv-btn cv-btn--solid" />
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

      {/* ── Pie: redes (C4) y copyright ──────────────────────────────── */}
      <footer className="cv-footer">
        {socials.length > 0 && (
          <ul className="cv-socials">
            {socials.map((social) => (
              <li key={social.kind}>
                <a
                  className="cv-social"
                  href={social.href}
                  aria-label={social.label}
                  {...(social.kind === "email" ? {} : { target: "_blank", rel: "noopener noreferrer" })}
                >
                  <SocialIcon kind={social.kind} />
                </a>
              </li>
            ))}
          </ul>
        )}
        <p className="cv-footer__copy">
          © {copyrightYear()} {name}
        </p>
      </footer>
    </NicheScope>
  );
}

/** A3: los títulos derivados del import ("Video", "Video 3", el nombre del sector o "Sector 2") nunca se publican. */
function isDerivedTitle(title: string, groupLabel: string | null): boolean {
  const text = title.trim();
  if (/^video( \d+)?$/i.test(text)) return true;
  if (groupLabel) {
    if (text === groupLabel) return true;
    if (text.startsWith(`${groupLabel} `) && /^\d+$/.test(text.slice(groupLabel.length + 1))) return true;
  }
  return false;
}

/** B5: un título propio y corto de una pieza de Canva es su etiqueta de marca. */
function isBrandLabel(title: string, groupLabel: string | null): boolean {
  const text = title.trim();
  if (!text || isDerivedTitle(text, groupLabel)) return false;
  return text.length <= BRAND_LABEL_MAX_CHARS && text.split(/\s+/).length <= BRAND_LABEL_MAX_WORDS;
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
        const logo = piece.video ? (canva.pieceLogos[piece.video.url] ?? null) : null;
        const brandLabel =
          !logo && piece.video?.platform === "canva" && isBrandLabel(piece.title, groupLabel) ? piece.title.trim() : null;
        return (
          <li
            key={piece.id}
            className={featured ? "cv-cards__item cv-cards__item--featured" : "cv-cards__item"}
            data-pf-piece={piece.id}
            data-pf-show={pieceShow(piece, filterableSlugs)}
          >
            <PieceCard piece={piece} featured={featured} logo={logo} brandLabel={brandLabel} />
            {!brandLabel && !isDerivedTitle(piece.title, groupLabel) && (
              <Heading className="cv-piece__title">{piece.title}</Heading>
            )}
            {meta && <p className="cv-piece__meta">{meta}</p>}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * La tarjeta: sin marco de dispositivo. Con video nativo de su sitio, el video mismo es la tarjeta. El chip de marca
 * sale SOLO si el dato lo asocia a esta pieza: el logo (pieceLogos) o, sin logo, su etiqueta escrita (B5). Un video de
 * Canva sin fuente nativa nunca se convierte en link ni muestra la plataforma.
 */
function PieceCard({
  piece,
  logo,
  brandLabel,
  featured,
}: {
  piece: ResolvedPiece;
  logo: StoredImage | null;
  brandLabel: string | null;
  featured: boolean;
}) {
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
      {logo ? (
        <span className="cv-card__brand">
          <Image src={logo.url} alt="" width={logo.width ?? 160} height={logo.height ?? 160} />
        </span>
      ) : brandLabel ? (
        <span className="cv-card__brand cv-card__brand--text">{brandLabel}</span>
      ) : null}
    </div>
  );
}
