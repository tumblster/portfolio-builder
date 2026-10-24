import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { mapWithConcurrency } from "@/lib/instagram/images";
import { truncateWords } from "@/lib/instagram/snapshot";
import {
  LIMITS,
  canvaDataSchema,
  parseVideoLink,
  type CanvaData,
  type CanvaRate,
  type CanvaTheme,
  type StoredImage,
} from "@/lib/portfolio/schema";
import { copyRemoteImage } from "@/lib/remote-image";
import { slugify } from "@/lib/text/slugify";
import {
  CanvaFormatError,
  isCanvaSiteHost,
  parseCanvaSite,
  readCanvaPortfolio,
  type CanvaAsset,
  type CanvaPortfolio,
  type CanvaProofItem,
  type CanvaProofZone,
  type CanvaSector,
  type CanvaService,
} from "./canva";
import { ImportError, isTimeoutError } from "./errors";
import { prefillNiches, type ImportStep, type ManualPrefill } from "./events";
import { saveImage } from "@/lib/media";
import { classifyLogoCandidate, type LogoKind } from "./logo-vision";
import { classifyProofImage, classifyProofZone, visionConfigured, type ProofKind } from "./proof-vision";
import { readRateCardDetailed } from "./rate-vision";
import { hasVisibleContent, isWhiteBoxedLogo, removeWhiteBackground } from "./remove-bg";

/*
 * Importador de Canva: link público de un sitio de Canva → formulario manual prellenado.
 * 1. scrape  GET al sitio (sin login) y lectura de su JSON interno (./canva.ts).
 * 2. images  Se copian a nuestro almacenamiento la foto principal, las portadas y lo de la variante clonada.
 * Nada se inventa: lo que no está en su sitio, no va. Formato desconocido → ImportError("scrape_failed").
 *
 * Ronda 15 (determinismo):
 * - A1: lo que la geometría resolvió (Métricas, Testimonios y Fotos con título, bio, cierre, sectores) es FINAL. La
 *   visión solo decide el pool SIN zona. Ninguna zona detectada puede quedar vacía por la visión.
 * - A2 / E3: la franja exige píxeles Y visión. La visión veta (persona = fuera sin apelación) y no rescata. Sin
 *   veredicto, decide un test de píxeles reforzado que reconoce la firma de captura. Las insignias o logos con su
 *   fondo completo entran COMO VIENEN (solo se quita el fondo de logos con poca tinta sobre caja blanca).
 * - A3: un veredicto por imagen, cacheado por hash de contenido dentro de la importación (duplicados = el primero).
 * - A4: lo que no se pudo completar (tarifario, clasificación, imágenes sin sección) queda en los avisos.
 * - B3 / B4: deduplicación estricta (mismo contenido o píxeles casi idénticos a la resolución completa de la menor),
 *   extendida a la bio y la galería; la bio no repite la foto principal.
 * - B5: el título de cada pieza es su etiqueta de marca si el diseño la trae.
 * - E1: sus servicios leídos por patrón viajan en el prefill (`services`).
 * - E2: las láminas sin título se clasifican como conjunto (imágenes + textos vecinos) y, si eso falla, imagen por
 *   imagen (con el mismo caché).
 */

const FETCH_TIMEOUT_MS = 25_000;
const MAX_HTML_CHARS = 8_000_000;
const IMAGE_CONCURRENCY = 6;
const LOGO_CONCURRENCY = 4;
const LOGO_TIMEOUT_MS = 15_000;
const MAX_LOGO_BYTES = 6_000_000;
const TEXTURE_MAX_STDEV = 18;
const PROOF_CONCURRENCY = 4;
const PROOF_MIN_VOTES = 2;
const GALLERY_FLOOD_FACTOR = 2;
/** E2: imágenes que se mandan juntas por lámina (tope del modelo). */
const ZONE_SAMPLE_MAX = 5;
/** B4: misma imagen = misma proporción (1 %) y píxeles casi idénticos a la resolución completa de la menor. */
const SAME_RATIO_TOLERANCE = 0.01;
const SAME_PREFILTER_SIDE = 32;
const SAME_PREFILTER_MAX_DIFF = 6;
const SAME_MAX_MEAN_DIFF = 2;
const SAME_PIXEL_TOLERANCE = 64;
const SAME_MAX_OFF_SHARE = 0.0003;
const SAME_MAX_PIXELS = 4_000_000;
/** A2 / E3: firma de píxeles. */
const SIGNAL_SIDE = 128;
const WHITE_LEVEL = 235;
const DARK_LUMA = 160;
const TEXT_ROW_TRANSITIONS = 6;
const SCREENSHOT_WHITE_SHARE = 0.45;
const SCREENSHOT_TEXT_BANDS = 5;
const SCREENSHOT_TALL_RATIO = 1.7;
const SCREENSHOT_TALL_BANDS = 3;
const PHOTO_MIN_COLORS = 900;
const DENSE_SHARE = 0.5;
const CANVA_IMAGE_HOSTS = [/(^|\.)canva\.site$/i];
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

const FORMAT_MESSAGE =
  "No pudimos leer el contenido de tu sitio de Canva: su formato cambió o no es un sitio publicado. Llena tu portafolio a mano o contáctanos desde el formulario de soporte y lo revisamos contigo.";

/** B2: texto EXACTO del aviso cuando el tarifario no se puede leer. */
const RATES_WARNING = "No pudimos leer los precios de tu tarifario: quedó como imagen, puedes cargarlos en el editor.";

/** E1: el prefill de Canva suma sus servicios (el formulario los toma si vienen). */
export type CanvaPrefill = ManualPrefill & { services?: CanvaService[] };

export type CanvaImportOutcome = { kind: "manual"; reason: "canva_import"; message: string; prefill: CanvaPrefill };

// ── A3: caché de la importación (bytes, hashes y veredictos) ──────────
type ImageMeta = { width: number; height: number };

type ImportContext = {
  bytes: Map<string, Promise<Buffer | null>>;
  hashes: Map<string, Promise<string | null>>;
  metas: Map<string, Promise<ImageMeta | null>>;
  /** Veredicto de contenido por HASH: la misma imagen nunca recibe dos. */
  proofVerdicts: Map<string, Promise<ProofKind | null>>;
  logoVerdicts: Map<string, Promise<LogoKind | null>>;
  /** Hashes de imágenes que la visión no pudo revisar (con llave configurada). */
  visionMisses: Set<string>;
};

const createContext = (): ImportContext => ({
  bytes: new Map(),
  hashes: new Map(),
  metas: new Map(),
  proofVerdicts: new Map(),
  logoVerdicts: new Map(),
  visionMisses: new Set(),
});

/** La primera llamada crea la promesa; las demás la comparten (sin esperas entre la consulta y el alta). */
function cached<T>(map: Map<string, Promise<T>>, key: string, make: () => Promise<T>): Promise<T> {
  let value = map.get(key);
  if (!value) {
    value = make();
    map.set(key, value);
  }
  return value;
}

const bytesOf = (ctx: ImportContext, url: string) => cached(ctx.bytes, url, () => downloadCanvaImage(url));

const hashOf = (ctx: ImportContext, url: string) =>
  cached(ctx.hashes, url, async () => {
    const bytes = await bytesOf(ctx, url);
    return bytes ? createHash("sha256").update(bytes).digest("hex") : null;
  });

const metaOf = (ctx: ImportContext, url: string) =>
  cached(ctx.metas, url, async () => {
    try {
      const bytes = await bytesOf(ctx, url);
      if (!bytes) return null;
      const meta = await sharp(bytes).metadata();
      return meta.width && meta.height ? { width: meta.width, height: meta.height } : null;
    } catch {
      return null;
    }
  });

async function proofVerdictOf(ctx: ImportContext, url: string): Promise<ProofKind | null> {
  const hash = await hashOf(ctx, url);
  const bytes = await bytesOf(ctx, url);
  if (!hash || !bytes) return null;
  return cached(ctx.proofVerdicts, hash, async () => {
    const kind = await classifyProofImage(bytes);
    if (kind === null && visionConfigured()) ctx.visionMisses.add(hash);
    return kind;
  });
}

async function logoVerdictOf(ctx: ImportContext, url: string, bytes: Buffer): Promise<LogoKind | null> {
  const hash = await hashOf(ctx, url);
  if (!hash) return null;
  return cached(ctx.logoVerdicts, hash, async () => {
    const kind = await classifyLogoCandidate(bytes);
    if (kind === null && visionConfigured()) ctx.visionMisses.add(hash);
    return kind;
  });
}

export async function importFromCanva(siteUrl: string, onStep: (step: ImportStep) => void): Promise<CanvaImportOutcome> {
  onStep("scrape");
  const page = await fetchCanvaPage(siteUrl);
  let portfolio: CanvaPortfolio;
  try {
    portfolio = readCanvaPortfolio(parseCanvaSite(page.html, page.url));
  } catch (error) {
    if (error instanceof CanvaFormatError) {
      console.error("[import/canva] formato desconocido:", error.message, siteUrl);
      throw new ImportError("scrape_failed", FORMAT_MESSAGE);
    }
    throw error;
  }

  const firstPlan = planPieces(portfolio.sectors, new Set());
  if (firstPlan.length < LIMITS.minPieces) {
    const found =
      firstPlan.length === 0
        ? "no encontramos videos"
        : `encontramos solo ${firstPlan.length} ${firstPlan.length === 1 ? "video" : "videos"}`;
    throw new ImportError(
      "unavailable",
      `En tu sitio de Canva ${found} y tu portafolio necesita al menos ${LIMITS.minPieces}. Revisa que tus videos estén publicados en el sitio, o llena tu portafolio a mano.`,
    );
  }

  onStep("images");
  const ctx = createContext();
  const theme = portfolio.theme;
  const ratesTask: Promise<RatesOutcome> =
    theme && portfolio.rateCard ? readRatesFrom(ctx, portfolio.rateCard.url) : Promise.resolve({ rates: null, failed: false });
  const textureTask: Promise<string | null> =
    theme && portfolio.texture ? textureSwatch(ctx, portfolio.texture.url) : Promise.resolve(null);
  // A1 + E2: prueba y fotos (la geometría manda; la visión solo decide lo que quedó sin zona).
  const proof = await resolveProof(portfolio, Boolean(theme), ctx);
  const candidates = theme ? portfolio.logoCandidates.filter((candidate) => !proof.claimed.has(candidate.asset.url)) : [];
  // A2 / E3: píxeles Y visión.
  const verdicts = await mapWithConcurrency(candidates, LOGO_CONCURRENCY, (candidate) => inspectLogo(ctx, candidate.asset.url));
  const discardedShots = verdicts.filter((verdict) => verdict.discarded).length;
  const accepted = candidates.flatMap((candidate, index) =>
    verdicts[index].logo ? [{ candidate, removeBackground: verdicts[index].removeBackground }] : [],
  );
  const logoUrls = new Set(accepted.map((entry) => entry.candidate.asset.url));
  // E3: la misma imagen no entra dos veces a la franja.
  const uniqueLogoUrls = new Set((await dedupeShots(ctx, accepted.map((entry) => entry.candidate.asset))).map((asset) => asset.url));
  const stripLogos = accepted.filter((entry) => uniqueLogoUrls.has(entry.candidate.asset.url));
  const plan = logoUrls.size > 0 ? planPieces(portfolio.sectors, logoUrls) : firstPlan;
  const bioExtra = portfolio.bioLogoSized.filter((asset) => !logoUrls.has(asset.url));
  const galleryExtra = proof.galleryMaybe.filter((asset) => !logoUrls.has(asset.url));
  // B3: bio y galería sin repetidas (la de mayor resolución).
  const byOrder = (a: CanvaAsset, b: CanvaAsset) => a.order - b.order;
  const bioAssets = theme ? await dedupeShots(ctx, [...portfolio.bioPhotos, ...bioExtra].sort(byOrder)) : [];
  const galleryAssets = theme ? await dedupeShots(ctx, [...proof.gallery, ...galleryExtra].sort(byOrder)) : [];

  const heroUrl = portfolio.heroPhoto?.url ?? null;
  const extras = theme
    ? [
        ...accepted.map((entry) => entry.candidate.asset.url),
        ...proof.metrics.slice(0, LIMITS.maxCanvaMetrics).map((photo) => photo.url),
        portfolio.rateCard?.url,
        portfolio.supportPhoto?.url,
        portfolio.selectorPhoto?.url,
        ...bioAssets.map((photo) => photo.url),
        portfolio.closingVideo?.poster,
        ...galleryAssets.slice(0, LIMITS.maxCanvaGallery + 1).map((photo) => photo.url),
        ...proof.testimonials.slice(0, LIMITS.maxCanvaTestimonials).map((photo) => photo.url),
        portfolio.texture?.url,
      ]
    : [];
  const toCopy = [
    ...new Set([heroUrl, ...plan.map((piece) => piece.poster), ...extras].filter((url): url is string => Boolean(url))),
  ];
  const copied = await mapWithConcurrency(toCopy, IMAGE_CONCURRENCY, (url) => copyRemoteImage(url, CANVA_IMAGE_HOSTS));
  const stored = new Map(toCopy.map((url, index) => [url, copied[index]]));
  // Solo los logos de poca tinta sobre caja blanca se guardan sin fondo (E3: las insignias, como vienen).
  const transparentUrls = [...new Set(accepted.filter((entry) => entry.removeBackground).map((entry) => entry.candidate.asset.url))];
  const transparentLogos = await mapWithConcurrency(transparentUrls, LOGO_CONCURRENCY, (url) => copyLogoTransparent(ctx, url));
  const logoStored = new Map(
    transparentUrls.flatMap((url, index) => {
      const image = transparentLogos[index];
      return image ? [[url, image] as const] : [];
    }),
  );
  let photo = heroUrl ? (stored.get(heroUrl) ?? null) : null;
  let heroSourceUrl = heroUrl;
  let textureBg: string | null = null;
  // Auditoría del hero: una "foto" casi uniforme es la textura de fondo; se busca la primera foto real.
  if (heroUrl && photo && (await isUniformImage(ctx, heroUrl))) {
    textureBg = await averageColor(ctx, heroUrl);
    const noHero = new Set([
      heroUrl,
      ...logoUrls,
      ...proof.metrics.map((asset) => asset.url),
      ...proof.testimonials.map((asset) => asset.url),
      portfolio.rateCard?.url ?? "",
    ]);
    const photoLike = (asset: { url: string; width: number | null; height: number | null }) => {
      if (!/\.jpe?g(?:[?#]|$)/i.test(asset.url)) return false;
      const width = asset.width ?? 0;
      const height = asset.height ?? 0;
      if (width * height < 480_000) return false;
      return width / Math.max(1, height) <= 2.2;
    };
    const assets = [
      portfolio.supportPhoto,
      portfolio.selectorPhoto,
      ...portfolio.sectors.flatMap((sector) => sector.photos),
    ].filter(
      (asset): asset is NonNullable<typeof asset> =>
        asset != null && asset.url !== "" && !noHero.has(asset.url) && photoLike(asset),
    );
    for (const candidateUrl of [...new Set(assets.map((asset) => asset.url))]) {
      if (await isUniformImage(ctx, candidateUrl)) continue;
      const image = stored.get(candidateUrl) ?? (await copyRemoteImage(candidateUrl, CANVA_IMAGE_HOSTS));
      if (image) {
        photo = image;
        heroSourceUrl = candidateUrl;
        break;
      }
    }
  }

  let usedPhotoAsCover = 0;
  let withoutCover = 0;
  const unlabeledTotal = plan.filter((piece) => piece.sector.label === null).length;
  const pieces: ManualPrefill["pieces"] = [];
  for (const piece of plan) {
    let image: StoredImage | null = piece.poster ? (stored.get(piece.poster) ?? null) : null;
    if (!image && photo) {
      image = photo;
      usedPhotoAsCover += 1;
    }
    if (!image) {
      withoutCover += 1;
      continue;
    }
    pieces.push({
      title: pieceTitle(piece, unlabeledTotal, portfolio.videoLabels),
      image,
      videoUrl: piece.video.url,
      ...(piece.sector.label ? { nicheLabel: piece.sector.label } : {}),
    });
  }

  if (pieces.length < LIMITS.minPieces) {
    throw new ImportError(
      "unavailable",
      "No pudimos copiar las imágenes de tu sitio de Canva. Intenta de nuevo en unos minutos o llena tu portafolio a mano.",
    );
  }

  const ratesOutcome = await ratesTask;
  let canva: CanvaData | null = null;
  if (theme) {
    const imageOf = (asset: CanvaAsset | null) => (asset ? (stored.get(asset.url) ?? null) : null);
    /** Imágenes guardadas de un grupo de assets: en orden del sitio, sin la foto del hero, sin repetir. */
    const imagesOf = (assets: CanvaAsset[], max: number) =>
      [
        ...new Map(
          [...assets]
            .filter((asset) => asset.url !== heroUrl && asset.url !== heroSourceUrl)
            .sort((a, b) => a.order - b.order)
            .flatMap((asset) => {
              const image = imageOf(asset);
              return image ? [[image.url, image] as const] : [];
            }),
        ).values(),
      ].slice(0, max);
    const logoImageOf = (asset: CanvaAsset) => logoStored.get(asset.url) ?? imageOf(asset);
    const logoImages = [
      ...new Map(
        stripLogos.flatMap((entry) => {
          const image = logoImageOf(entry.candidate.asset);
          return image ? [[image.url, image] as const] : [];
        }),
      ).values(),
    ];
    const videoUrls = new Set(pieces.map((piece) => piece.videoUrl));
    const pieceLogos: Record<string, StoredImage> = {};
    for (const entry of accepted) {
      const image = logoImageOf(entry.candidate.asset);
      const videoUrl = entry.candidate.videoUrl;
      if (image && videoUrl && videoUrls.has(videoUrl) && !pieceLogos[videoUrl]) pieceLogos[videoUrl] = image;
    }
    // B3: ni la bio ni la galería repiten la foto principal (la misma imagen, aunque venga en otra resolución).
    const bioFinal = heroSourceUrl ? await withoutImage(ctx, bioAssets, heroSourceUrl) : bioAssets;
    const galleryFinal = heroSourceUrl ? await withoutImage(ctx, galleryAssets, heroSourceUrl) : galleryAssets;
    // Ronda 14 · C: el video del cierre, solo si es un MP4 de su sitio (igual que las piezas).
    const closingLink = portfolio.closingVideo ? parseVideoLink(portfolio.closingVideo.url) : null;
    const closingPoster = portfolio.closingVideo?.poster ? (stored.get(portfolio.closingVideo.poster) ?? null) : null;
    // Ronda 14 · C2.1: la textura entra al tema solo si sus píxeles la confirmaron.
    const swatch = await textureTask;
    const textureCopy = portfolio.texture ? imageOf(portfolio.texture) : null;
    let finalTheme: CanvaTheme = textureBg
      ? { ...theme, heroBg: textureBg, bands: [textureBg, ...theme.bands.slice(1)] }
      : theme;
    if (swatch && textureCopy) {
      finalTheme = {
        ...finalTheme,
        texture: { ...textureCopy, swatch },
        heroBg: finalTheme.heroBg ?? swatch,
        bands: finalTheme.bands.length > 0 ? finalTheme.bands : [swatch],
      };
    }
    // E3: la franja usa el color de la banda donde viven SUS logos (la segunda banda es la que consume la franja).
    const stripBand = mostFrequent(stripLogos.map((entry) => entry.candidate.band));
    if (stripBand && logoImages.length >= 2 && finalTheme.bands.length > 0) {
      const bands = [...finalTheme.bands];
      if (bands.length === 1) bands.push(stripBand);
      else bands[1] = stripBand;
      finalTheme = { ...finalTheme, bands: bands.slice(0, 24) };
    }
    if (!finalTheme.heroBg) {
      console.warn("[import/canva] el diseño no trae colores ni una textura confirmada:", siteUrl);
    } else {
      const rates = ratesOutcome.rates;
      const parsed = canvaDataSchema.safeParse({
        theme: finalTheme,
        logos: logoImages.slice(0, LIMITS.maxCanvaLogos),
        pieceLogos,
        metricsImages: imagesOf(proof.metrics, LIMITS.maxCanvaMetrics),
        rateCard: imageOf(portfolio.rateCard),
        supportPhoto: imageOf(bioFinal[0] ?? null),
        selectorPhoto: imageOf(portfolio.selectorPhoto),
        headings: portfolio.headings,
        source: siteUrl,
        bioPhotos: imagesOf(bioFinal, LIMITS.maxCanvaBioPhotos),
        closingVideo: closingLink?.platform === "canva" ? { url: closingLink.url, poster: closingPoster } : null,
        rates: rates && rates.length > 0 ? rates : null,
        galleryPhotos: imagesOf(galleryFinal, LIMITS.maxCanvaGallery),
        testimonialImages: imagesOf(proof.testimonials, LIMITS.maxCanvaTestimonials),
      } satisfies CanvaData);
      if (parsed.success) canva = parsed.data;
      else console.error("[import/canva] el diseño leído no es válido:", parsed.error.issues, siteUrl);
    }
  }

  const warnings: string[] = [];
  if (!portfolio.name) warnings.push("No encontramos tu nombre en el sitio: escríbelo en el formulario.");
  if (!photo) warnings.push("No pudimos traer tu foto principal: súbela en el formulario.");
  if (!canva) {
    warnings.push("No pudimos leer el diseño de tu Canva (colores y letras): tu portafolio usa una de nuestras plantillas.");
  }
  // B2 / A4: el tarifario que no se pudo leer nunca falla en silencio.
  if (ratesOutcome.failed && canva?.rateCard) warnings.push(RATES_WARNING);
  // A4: si la revisión por contenido no se pudo hacer, se dice.
  const needsVision = Boolean(theme) && (portfolio.proofPool.some((item) => item.zone === null) || candidates.length > 0);
  if (needsVision && !visionConfigured()) {
    warnings.push(
      "No pudimos revisar el contenido de tus imágenes: las ubicamos según su lugar en tu diseño. Revisa tus secciones en el editor.",
    );
  } else if (ctx.visionMisses.size > 0) {
    const missed = ctx.visionMisses.size;
    warnings.push(
      `No pudimos revisar ${missed} ${missed === 1 ? "imagen" : "imágenes"} de tu Canva con detalle: las ubicamos según su lugar en tu diseño.`,
    );
  }
  // E1 / A4: lo que no encajó en ninguna sección se avisa (nunca desaparece en silencio).
  const unplaced = proof.unplaced.filter((url) => !logoUrls.has(url)).length;
  if (theme && unplaced > 0) {
    warnings.push(
      `${unplaced} ${unplaced === 1 ? "imagen" : "imágenes"} de tu Canva no ${unplaced === 1 ? "encajó" : "encajaron"} en ninguna sección y no ${unplaced === 1 ? "aparece" : "aparecen"} en tu portafolio.`,
    );
  }
  if (portfolio.mixedLabels.length > 0) {
    warnings.push(
      `No pudimos separar bien los sectores ${portfolio.mixedLabels.join(", ")}: sus videos quedaron junto a los del sector anterior. Revisa el nicho de cada pieza.`,
    );
  }
  {
    const totalPieces = portfolio.sectors.reduce((sum, sector) => sum + sector.videos.length, 0);
    const labeledSectors = portfolio.sectors.filter((sector) => sector.label).length;
    if (totalPieces >= 4 && labeledSectors === 0) {
      warnings.push(
        "No pudimos separar tus videos por sector: quedaron todos juntos. Puedes asignar el nicho a cada pieza en el editor.",
      );
    }
  }
  if (discardedShots > 0) {
    warnings.push(
      `Descartamos ${discardedShots} ${discardedShots === 1 ? "imagen" : "imágenes"} de la franja de marcas porque no ${discardedShots === 1 ? "era un logo" : "eran logos"}.`,
    );
  }
  if (textureBg) {
    warnings.push(
      "La imagen principal de tu Canva era una textura de fondo: la reemplazamos por otra foto de tu sitio y usamos su color como fondo.",
    );
  }
  if (usedPhotoAsCover > 0) {
    warnings.push(
      `${usedPhotoAsCover} ${usedPhotoAsCover === 1 ? "video usa" : "videos usan"} tu foto principal como portada porque no encontramos la suya. Puedes cambiarla en cada pieza.`,
    );
  }
  if (withoutCover > 0) {
    warnings.push(
      `${withoutCover} ${withoutCover === 1 ? "video quedó" : "videos quedaron"} fuera porque no pudimos copiar su portada.`,
    );
  }
  if (portfolio.videoCount > plan.length) {
    warnings.push(
      `Tu Canva tiene ${portfolio.videoCount} videos; importamos ${plan.length} (el máximo es ${LIMITS.maxPieces} por portafolio).`,
    );
  }
  const niches = prefillNiches(pieces);
  const labels = [...new Set(pieces.flatMap((piece) => (piece.nicheLabel ? [piece.nicheLabel] : [])))];
  const outside = labels.filter((label) => !niches.some((niche) => niche.label.toLowerCase() === label.toLowerCase()));
  if (outside.length > 0) {
    warnings.push(
      `Tu portafolio puede tener hasta ${niches.length} nichos: usamos tus sectores con más videos. Los videos de ${outside.join(", ")} quedan en «Todo», con el nombre de su sector en el título.`,
    );
  }

  const contact: ManualPrefill["contact"] = {
    instagram: portfolio.contact.instagram ?? "",
    ...(portfolio.contact.tiktok ? { tiktok: portfolio.contact.tiktok } : {}),
    ...(portfolio.contact.email ? { email: portfolio.contact.email } : {}),
  };
  const sectorCount = new Set(pieces.map((piece) => piece.nicheLabel).filter(Boolean)).size;

  return {
    kind: "manual",
    reason: "canva_import",
    message: `Leímos tu sitio de Canva: ${pieces.length} videos${sectorCount > 0 ? ` en ${sectorCount} ${sectorCount === 1 ? "sector" : "sectores"}` : ""}.${canva ? " Tu portafolio conserva los colores, las letras y el orden de tu Canva." : ""} Revisa tus datos, tus nichos y tus piezas antes de generar tu portafolio.`,
    prefill: {
      username: portfolio.contact.instagram ?? slugify(portfolio.name, 30, ""),
      name: portfolio.name.slice(0, LIMITS.name),
      tagline: portfolio.tagline.slice(0, LIMITS.tagline),
      bio: composeBio(portfolio.paragraphs),
      photo,
      contact,
      pieces,
      warnings,
      origin: { source: "canva", url: siteUrl },
      ...(canva ? { canva } : {}),
      // E1: sus servicios leídos por patrón (el formulario los trae precargados).
      ...(portfolio.services.length > 0 ? { services: portfolio.services } : {}),
    },
  };
}

/** El valor que más se repite (null si no hay ninguno). */
function mostFrequent(values: (string | null)[]): string | null {
  const counts = new Map<string, number>();
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [value, total] of counts) {
    if (total > bestCount) {
      best = value;
      bestCount = total;
    }
  }
  return best;
}

// ── A1 + E2: prueba y fotos (la geometría manda; la visión decide solo lo que quedó sin zona) ──

type ProofSections = {
  metrics: CanvaAsset[];
  testimonials: CanvaAsset[];
  /** Fotos confirmadas (de la zona Fotos con tamaño de foto, o de láminas sin título que la visión llamó fotos). */
  gallery: CanvaAsset[];
  /** Fotos de la zona Fotos con tamaño de logo: siguen como candidatas a logo; si no son logo, vuelven a Fotos. */
  galleryMaybe: CanvaAsset[];
  /** URLs que quedaron en Métricas, Testimonios o Fotos: no son candidatas a logo. */
  claimed: Set<string>;
  /** URLs del pool sin zona que no encajaron en ninguna sección (A4: se avisan). */
  unplaced: string[];
};

const proofTargetOf = (kind: ProofKind | null): CanvaProofZone | null =>
  kind === "metrics" ? "metrics" : kind === "testimonial" ? "testimonials" : kind === "photo" ? "photos" : null;

/** E2: una lámina sin título se clasifica como conjunto (sus imágenes y sus textos, en una sola llamada). */
async function classifyGroup(ctx: ImportContext, items: CanvaProofItem[], texts: string[]): Promise<ProofKind | null> {
  if (items.length < 2) return null;
  const sample = items.slice(0, ZONE_SAMPLE_MAX);
  const bytes = (await Promise.all(sample.map((item) => bytesOf(ctx, item.asset.url)))).filter(
    (value): value is Buffer => value !== null,
  );
  if (bytes.length < 2) return null;
  return classifyProofZone(bytes, texts);
}

/**
 * A1: las imágenes con zona geométrica quedan en su zona, sin pasar por la visión (ninguna zona se vacía).
 * E2: las de láminas sin título se clasifican primero por lámina; si la lámina no tiene veredicto, imagen por imagen.
 * A3: cada imagen recibe UN veredicto (por hash); sus duplicados comparten el primero.
 * Las de láminas sin título solo cambian de sección si su clase junta al menos PROOF_MIN_VOTES votos, y una "galería"
 * con más del doble de su límite se ignora (error de lectura).
 */
async function resolveProof(portfolio: CanvaPortfolio, useVision: boolean, ctx: ImportContext): Promise<ProofSections> {
  const pool = portfolio.proofPool;
  const open = pool.filter((item) => item.zone === null);
  const groups = new Map<number, CanvaProofItem[]>();
  for (const item of open) {
    const key = item.group ?? -1;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  const groupKeys = [...groups.keys()].sort((a, b) => a - b);
  if (useVision && groupKeys.length > 0) {
    const zoneKinds = await mapWithConcurrency(groupKeys, PROOF_CONCURRENCY, (key) =>
      classifyGroup(ctx, groups.get(key) ?? [], key >= 0 ? (portfolio.zoneTexts[String(key)] ?? []) : []),
    );
    // A3: el veredicto de la lámina pasa a cada imagen, en orden; una imagen ya juzgada conserva su primer veredicto.
    for (let index = 0; index < groupKeys.length; index += 1) {
      const kind = zoneKinds[index];
      if (kind === null) continue;
      for (const item of groups.get(groupKeys[index]) ?? []) {
        const hash = await hashOf(ctx, item.asset.url);
        if (hash && !ctx.proofVerdicts.has(hash)) ctx.proofVerdicts.set(hash, Promise.resolve(kind));
      }
    }
  }
  const openVerdicts: (ProofKind | null)[] = useVision
    ? await mapWithConcurrency(open, PROOF_CONCURRENCY, (item) => proofVerdictOf(ctx, item.asset.url))
    : open.map(() => null);

  const votes = new Map<CanvaProofZone, number>();
  for (const verdict of openVerdicts) {
    const target = proofTargetOf(verdict);
    if (target) votes.set(target, (votes.get(target) ?? 0) + 1);
  }
  const galleryFlood = (votes.get("photos") ?? 0) > LIMITS.maxCanvaGallery * GALLERY_FLOOD_FACTOR;
  const logoSized = new Set(portfolio.galleryLogoSized.map((asset) => asset.url));

  const metrics: CanvaAsset[] = [];
  const testimonials: CanvaAsset[] = [];
  const gallery: CanvaAsset[] = [];
  const galleryMaybe: CanvaAsset[] = [];
  const unplaced: string[] = [];
  const claimed = new Set<string>();
  const place = (zone: CanvaProofZone, asset: CanvaAsset) => {
    claimed.add(asset.url);
    if (zone === "metrics") metrics.push(asset);
    else if (zone === "testimonials") testimonials.push(asset);
    else gallery.push(asset);
  };
  // A1: la asignación geométrica es final.
  for (const item of pool) {
    if (item.zone === null) continue;
    if (item.zone === "photos" && logoSized.has(item.asset.url)) {
      galleryMaybe.push(item.asset);
      continue;
    }
    place(item.zone, item.asset);
  }
  open.forEach((item, index) => {
    let target = proofTargetOf(openVerdicts[index]);
    if (target === "photos" && galleryFlood) target = null;
    if (target && (votes.get(target) ?? 0) < PROOF_MIN_VOTES) target = null;
    if (!target) {
      unplaced.push(item.asset.url);
      return;
    }
    place(target, item.asset);
  });

  const byOrder = (a: CanvaAsset, b: CanvaAsset) => a.order - b.order;
  return {
    metrics: await dedupeShots(ctx, metrics.sort(byOrder)),
    testimonials: await dedupeShots(ctx, testimonials.sort(byOrder)),
    gallery: gallery.sort(byOrder),
    galleryMaybe: galleryMaybe.sort(byOrder),
    claimed,
    unplaced,
  };
}

// ── B3 / B4: misma imagen, comparada en serio ──

/** Píxeles RGB de una imagen a un tamaño dado (fondo blanco si trae alfa). */
async function rgbAt(bytes: Buffer, width: number, height: number): Promise<Buffer> {
  return sharp(bytes)
    .flatten({ background: "#ffffff" })
    .toColourspace("srgb")
    .resize(width, height, { fit: "fill" })
    .raw()
    .toBuffer();
}

function pixelDiff(a: Buffer, b: Buffer): { mean: number; offShare: number } {
  const length = Math.min(a.length, b.length);
  if (length === 0) return { mean: 255, offShare: 1 };
  let total = 0;
  let off = 0;
  for (let i = 0; i < length; i += 1) {
    const diff = Math.abs(a[i] - b[i]);
    total += diff;
    if (diff > SAME_PIXEL_TOLERANCE) off += 1;
  }
  return { mean: total / length, offShare: off / length };
}

/**
 * B4: dos URLs son la MISMA imagen solo si su contenido es idéntico (mismo hash) o si, con la misma proporción,
 * sus píxeles son casi idénticos a la resolución completa de la menor. Dos capturas distintas de la misma app (otra
 * cifra, otro gráfico) no pasan. Ante cualquier duda o error: distintas (se conservan ambas).
 */
async function sameImage(ctx: ImportContext, a: string, b: string): Promise<boolean> {
  if (a === b) return true;
  try {
    const [hashA, hashB] = await Promise.all([hashOf(ctx, a), hashOf(ctx, b)]);
    if (hashA && hashB && hashA === hashB) return true;
    const [metaA, metaB] = await Promise.all([metaOf(ctx, a), metaOf(ctx, b)]);
    if (!metaA || !metaB) return false;
    const ratioA = metaA.width / metaA.height;
    const ratioB = metaB.width / metaB.height;
    if (Math.abs(ratioA - ratioB) / Math.max(ratioA, ratioB) > SAME_RATIO_TOLERANCE) return false;
    const [bytesA, bytesB] = await Promise.all([bytesOf(ctx, a), bytesOf(ctx, b)]);
    if (!bytesA || !bytesB) return false;
    const [smallA, smallB] = await Promise.all([
      rgbAt(bytesA, SAME_PREFILTER_SIDE, SAME_PREFILTER_SIDE),
      rgbAt(bytesB, SAME_PREFILTER_SIDE, SAME_PREFILTER_SIDE),
    ]);
    if (pixelDiff(smallA, smallB).mean > SAME_PREFILTER_MAX_DIFF) return false;
    const base = metaA.width * metaA.height <= metaB.width * metaB.height ? metaA : metaB;
    const scale = Math.min(1, Math.sqrt(SAME_MAX_PIXELS / (base.width * base.height)));
    const width = Math.max(1, Math.round(base.width * scale));
    const height = Math.max(1, Math.round(base.height * scale));
    const [fullA, fullB] = await Promise.all([rgbAt(bytesA, width, height), rgbAt(bytesB, width, height)]);
    const { mean, offShare } = pixelDiff(fullA, fullB);
    return mean <= SAME_MAX_MEAN_DIFF && offShare <= SAME_MAX_OFF_SHARE;
  } catch {
    return false;
  }
}

/** B3 / B4: la misma imagen repetida queda una vez, en su mayor resolución. Lo distinto, siempre se conserva. */
async function dedupeShots(ctx: ImportContext, assets: CanvaAsset[]): Promise<CanvaAsset[]> {
  const kept: CanvaAsset[] = [];
  for (const asset of assets) {
    let twin = -1;
    for (let index = 0; index < kept.length; index += 1) {
      if (await sameImage(ctx, kept[index].url, asset.url)) {
        twin = index;
        break;
      }
    }
    if (twin < 0) {
      kept.push(asset);
      continue;
    }
    const [mine, theirs] = await Promise.all([metaOf(ctx, asset.url), metaOf(ctx, kept[twin].url)]);
    if (mine && theirs && mine.width * mine.height > theirs.width * theirs.height) kept[twin] = asset;
  }
  return kept.sort((a, b) => a.order - b.order);
}

/** B3: quita de una lista la misma imagen que `url` (p. ej. la foto principal). */
async function withoutImage(ctx: ImportContext, assets: CanvaAsset[], url: string): Promise<CanvaAsset[]> {
  const kept: CanvaAsset[] = [];
  for (const asset of assets) if (!(await sameImage(ctx, asset.url, url))) kept.push(asset);
  return kept;
}

/** GET al sitio con User-Agent de navegador (HEAD no sirve en Canva). Solo hosts de Canva, también tras redirigir. */
async function fetchCanvaPage(siteUrl: string): Promise<{ html: string; url: string }> {
  let response: Response;
  let html: string;
  try {
    response = await fetch(siteUrl, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "es-419,es;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const finalUrl = response.url || siteUrl;
    let finalHost = "";
    try {
      finalHost = new URL(finalUrl).hostname;
    } catch {
      finalHost = "";
    }
    if (!isCanvaSiteHost(finalHost)) {
      throw new ImportError("unavailable", "Tu link nos llevó fuera de Canva. Pega el link directo de tu sitio publicado.");
    }
    if (response.status === 404 || response.status === 410) {
      throw new ImportError(
        "not_found",
        "No encontramos ese sitio de Canva. Revisa que esté publicado y que hayas copiado el link completo.",
      );
    }
    if (!response.ok) {
      throw new ImportError(
        "unavailable",
        `Canva no nos dejó leer tu sitio (error ${response.status}). Revisa que esté publicado y sea público. Si sigue fallando, contáctanos desde el formulario de soporte y lo revisamos contigo.`,
      );
    }
    if (Number(response.headers.get("content-length") ?? 0) > MAX_HTML_CHARS) {
      throw new ImportError("scrape_failed", FORMAT_MESSAGE);
    }
    html = await response.text();
    if (html.length > MAX_HTML_CHARS) throw new ImportError("scrape_failed", FORMAT_MESSAGE);
    return { html, url: finalUrl };
  } catch (error) {
    if (error instanceof ImportError) throw error;
    if (isTimeoutError(error)) {
      throw new ImportError("timeout", "Tu sitio de Canva tardó demasiado en responder. Intenta de nuevo en unos segundos.");
    }
    console.error("[import/canva] no se pudo descargar el sitio:", error);
    throw new ImportError("unavailable", "No pudimos abrir tu sitio de Canva. Revisa el link e intenta de nuevo.");
  }
}

/** Los bytes de una imagen del sitio (mismas guardas que el resto). null ante cualquier falla. */
async function downloadCanvaImage(url: string): Promise<Buffer | null> {
  try {
    if (!isCanvaSiteHost(new URL(url).hostname)) return null;
    const response = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": BROWSER_UA },
      signal: AbortSignal.timeout(LOGO_TIMEOUT_MS),
    });
    if (!response.ok || !isCanvaSiteHost(new URL(response.url || url).hostname)) return null;
    if (Number(response.headers.get("content-length") ?? 0) > MAX_LOGO_BYTES) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return bytes.length === 0 || bytes.length > MAX_LOGO_BYTES ? null : bytes;
  } catch {
    return null;
  }
}

/** Color promedio de unas estadísticas de sharp → "#RRGGBB". */
function meanHex(channels: { mean: number }[]): string | null {
  const [r, g, b] = channels;
  if (!r || !g || !b) return null;
  const byte = (value: number) => Math.round(value).toString(16).padStart(2, "0");
  return ("#" + byte(r.mean) + byte(g.mean) + byte(b.mean)).toUpperCase();
}

/** ¿La imagen es casi uniforme (textura, papel, color plano)? Ante cualquier error, false. */
async function isUniformImage(ctx: ImportContext, url: string): Promise<boolean> {
  try {
    const bytes = await bytesOf(ctx, url);
    if (!bytes) return false;
    const stats = await sharp(bytes).resize(64, 64, { fit: "inside" }).greyscale().stats();
    return (stats.channels[0]?.stdev ?? 99) < 7;
  } catch {
    return false;
  }
}

/** Color promedio de una imagen (para rescatar el fondo real de una textura). */
async function averageColor(ctx: ImportContext, url: string): Promise<string | null> {
  try {
    const bytes = await bytesOf(ctx, url);
    if (!bytes) return null;
    const stats = await sharp(bytes).resize(32, 32, { fit: "cover" }).stats();
    return meanHex(stats.channels);
  } catch {
    return null;
  }
}

type RatesOutcome = { rates: CanvaRate[] | null; failed: boolean };

/** B2: sus tarifas leídas del tarifario (con un reintento en rate-vision). `failed` alimenta el aviso (A4). */
async function readRatesFrom(ctx: ImportContext, url: string): Promise<RatesOutcome> {
  try {
    const bytes = await bytesOf(ctx, url);
    if (!bytes) {
      console.warn("[import/canva] no se pudo descargar el tarifario:", url);
      return { rates: null, failed: true };
    }
    const result = await readRateCardDetailed(bytes);
    if (result.ok) return { rates: result.rates, failed: false };
    console.warn("[import/canva] no se pudo leer el tarifario:", result.reason, url);
    return { rates: null, failed: true };
  } catch (error) {
    console.warn("[import/canva] no se pudo leer el tarifario:", url, error);
    return { rates: null, failed: true };
  }
}

/** Ronda 14 · C2.1: confirma una textura por sus píxeles y devuelve su color promedio. null ante duda. */
async function textureSwatch(ctx: ImportContext, url: string): Promise<string | null> {
  try {
    const bytes = await bytesOf(ctx, url);
    if (!bytes) return null;
    const grey = await sharp(bytes).resize(64, 64, { fit: "inside" }).greyscale().stats();
    if ((grey.channels[0]?.stdev ?? 99) >= TEXTURE_MAX_STDEV) return null;
    const color = await sharp(bytes).resize(32, 32, { fit: "cover" }).stats();
    return meanHex(color.channels);
  } catch (error) {
    console.warn("[import/canva] no se pudo revisar la textura:", url, error);
    return null;
  }
}

/**
 * Copia un logo de poca tinta sobre caja blanca quitándole el fondo, y recorta su aire transparente (C1: la franja
 * escala por la caja de contenido real). Ante cualquier error, null y quien llama usa la copia normal.
 */
async function copyLogoTransparent(ctx: ImportContext, url: string): Promise<StoredImage | null> {
  try {
    const bytes = await bytesOf(ctx, url);
    if (!bytes) return null;
    const transparent = await removeWhiteBackground(bytes);
    const trimmed = await sharp(transparent)
      .trim()
      .png()
      .toBuffer()
      .catch(() => transparent);
    return await saveImage(trimmed);
  } catch (error) {
    console.warn("[import/canva] no se pudo quitar el fondo de un logo:", url, error);
    return null;
  }
}

/** A2 / E3: lo que dicen los píxeles de un candidato a logo. */
type PixelSignal = {
  /** Tiene contenido visible (no es un fondo vacío). */
  content: boolean;
  /** Logo sobre caja blanca (el test de siempre). */
  whiteBoxed: boolean;
  /** Firma de captura: predominio de blanco con muchas líneas de interfaz, o pantalla de celular con texto. */
  screenshot: boolean;
  /** Paleta de fotografía (demasiados colores para un logo o una insignia). */
  photoLike: boolean;
  /** Más de la mitad de la imagen tiene tinta (insignia o logo con su fondo completo). */
  dense: boolean;
};

async function pixelSignal(bytes: Buffer): Promise<PixelSignal> {
  const [content, whiteBoxed, meta] = await Promise.all([
    hasVisibleContent(bytes),
    isWhiteBoxedLogo(bytes),
    sharp(bytes).metadata(),
  ]);
  const { data, info } = await sharp(bytes)
    .flatten({ background: "#ffffff" })
    .toColourspace("srgb")
    .resize(SIGNAL_SIDE, SIGNAL_SIDE, { fit: "inside" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let white = 0;
  const colors = new Set<number>();
  let textBands = 0;
  let inBand = false;
  for (let y = 0; y < height; y += 1) {
    let transitions = 0;
    let previous: boolean | null = null;
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * channels;
      const r = data[at];
      const g = data[at + 1];
      const b = data[at + 2];
      if (r >= WHITE_LEVEL && g >= WHITE_LEVEL && b >= WHITE_LEVEL) white += 1;
      colors.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
      const dark = 0.299 * r + 0.587 * g + 0.114 * b < DARK_LUMA;
      if (previous !== null && dark !== previous) transitions += 1;
      previous = dark;
    }
    const textRow = transitions >= TEXT_ROW_TRANSITIONS;
    if (textRow && !inBand) textBands += 1;
    inBand = textRow;
  }
  const whiteShare = white / Math.max(1, width * height);
  const tall = meta.width && meta.height ? meta.height / meta.width >= SCREENSHOT_TALL_RATIO : false;
  return {
    content,
    whiteBoxed,
    screenshot:
      (whiteShare >= SCREENSHOT_WHITE_SHARE && textBands >= SCREENSHOT_TEXT_BANDS) ||
      (tall && textBands >= SCREENSHOT_TALL_BANDS),
    photoLike: colors.size >= PHOTO_MIN_COLORS,
    dense: 1 - whiteShare >= DENSE_SHARE,
  };
}

type LogoVerdict = {
  /** Confirmado como logo: entra a la franja. */
  logo: boolean;
  /** Parecía logo pero la visión o la firma de captura lo descartaron: se avisa. */
  discarded: boolean;
  /** Solo los logos de poca tinta sobre caja blanca pierden su fondo (E3: las insignias, como vienen). */
  removeBackground: boolean;
};

/**
 * A2 / E3: ¿la imagen ES un logo? Píxeles Y visión.
 * 1. Píxeles (sin exigir caja blanca: B6): contenido visible, sin firma de captura y con paleta de logo o caja blanca.
 *    Si los píxeles dicen que no, no entra (la visión no rescata) y ni se consulta.
 * 2. Visión: "logo" confirma; persona, captura, foto u otro vetan (persona: sin apelación). Sin veredicto, manda el
 *    test de píxeles reforzado del paso 1.
 * Ante cualquier error, no es logo y no se avisa (nunca rompe el import).
 */
async function inspectLogo(ctx: ImportContext, url: string): Promise<LogoVerdict> {
  const none: LogoVerdict = { logo: false, discarded: false, removeBackground: false };
  try {
    const bytes = await bytesOf(ctx, url);
    if (!bytes) return none;
    const pixels = await pixelSignal(bytes);
    const removeBackground = pixels.whiteBoxed && !pixels.dense;
    const pixelOk = pixels.content && !pixels.screenshot && (pixels.whiteBoxed || !pixels.photoLike);
    if (!pixelOk) return { logo: false, discarded: pixels.content && pixels.screenshot, removeBackground };
    const vision = await logoVerdictOf(ctx, url, bytes);
    if (vision !== null && vision !== "logo") return { logo: false, discarded: true, removeBackground };
    return { logo: true, discarded: false, removeBackground };
  } catch (error) {
    console.warn("[import/canva] no se pudo revisar un posible logo:", url, error);
    return none;
  }
}

type PlannedPiece = {
  video: CanvaAsset;
  sector: CanvaSector;
  /** Posición dentro de su sector (0, 1, …). */
  index: number;
  /** Cuántas piezas de su sector entran. */
  sectorTotal: number;
  /** Portada: la del manifiesto o, si no hay, la primera foto del sector (que no sea un logo). */
  poster: string | null;
};

/**
 * Hasta LIMITS.maxPieces en total. Si no alcanza para todos, el cupo se reparte por turnos (uno por sector en cada
 * vuelta) para que ningún sector quede vacío; las piezas salen agrupadas por sector.
 */
function planPieces(sectors: CanvaSector[], logoUrls: Set<string>): PlannedPiece[] {
  const quota = sectors.map(() => 0);
  let total = 0;
  let grew = true;
  while (grew && total < LIMITS.maxPieces) {
    grew = false;
    sectors.forEach((sector, index) => {
      if (total < LIMITS.maxPieces && quota[index] < sector.videos.length) {
        quota[index] += 1;
        total += 1;
        grew = true;
      }
    });
  }
  return sectors.flatMap((sector, sectorIndex) =>
    sector.videos.slice(0, quota[sectorIndex]).map((video, index) => ({
      video,
      sector,
      index,
      sectorTotal: quota[sectorIndex],
      poster: video.poster ?? sector.photos.find((photo) => !logoUrls.has(photo.url))?.url ?? null,
    })),
  );
}

/**
 * B5: si el diseño trae la etiqueta de la pieza ("Siete Recipe"), ese es su título. Si no, el derivado de su sector
 * ("Lugares 2") o "Video 3".
 */
function pieceTitle(piece: PlannedPiece, unlabeledTotal: number, labels: Record<string, string>): string {
  const brand = labels[piece.video.url];
  if (brand) return brand.slice(0, LIMITS.pieceTitle);
  const label = piece.sector.label;
  const title = label
    ? piece.sectorTotal > 1
      ? label + " " + (piece.index + 1)
      : label
    : unlabeledTotal > 1
      ? "Video " + (piece.index + 1)
      : "Video";
  return title.slice(0, LIMITS.pieceTitle);
}

/** Sus párrafos de presentación tal cual: juntos si caben en la bio; si no, el primero (cortado por palabras). */
function composeBio(paragraphs: string[]): string {
  const clean = paragraphs.map((paragraph) => paragraph.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (clean.length === 0) return "";
  const joined = clean.join(" ");
  if (joined.length <= LIMITS.bio) return joined;
  return truncateWords(clean[0], LIMITS.bio - 1);
}
