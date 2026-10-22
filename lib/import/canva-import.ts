import "server-only";  
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
  type CanvaProofZone,  
  type CanvaSector,  
} from "./canva";  
import { ImportError, isTimeoutError } from "./errors";  
import { prefillNiches, type ImportStep, type ManualPrefill } from "./events";  
import { saveImage } from "@/lib/media";  
import { visionSaysLogo } from "./logo-vision";  
import { classifyProofImage, type ProofKind } from "./proof-vision";  
import { readRateCard } from "./rate-vision";  
import { hasVisibleContent, isWhiteBoxedLogo, removeWhiteBackground } from "./remove-bg";

/*  
 * Importador de Canva: link público de un sitio de Canva → formulario manual prellenado.  
 * 1. scrape  GET al sitio (sin login) y lectura de su JSON interno (./canva.ts).  
 * 2. images  Se copian a nuestro almacenamiento la foto principal y las portadas de los videos  
 *            (el esquema solo acepta imágenes nuestras). Los MP4 quedan enlazados al Canva de la creadora.  
 * No usa los borradores de Instagram: devuelve un ManualPrefill y la creadora revisa todo en /crear/manual.  
 * Sus sectores pasan a ser sus nichos (hasta 6 piezas por sector y LIMITS.maxPieces en total).  
 * Nada se inventa: lo que no está en su sitio, no va. Formato desconocido → ImportError("scrape_failed").  
 *  
 * v2 ("clonador fiel"): si el parser leyó el diseño (theme), además se confirman los logos por sus píxeles  
 * (borde blanco, ./remove-bg.ts), se copian logos, capturas de métricas, tarifario y fotos de apoyo, y todo viaja en  
 * `prefill.canva`. Sin tema, todo queda como en la v1.  
 *  
 * Ronda 14: galería de "¿Por qué yo?", video del cierre, tarifas leídas con visión, Fotos, Testimonios y textura.  
 *  
 * Ronda 14B:  
 * - 3: las imágenes de prueba y de fotos se clasifican por CONTENIDO (./proof-vision.ts) ANTES de revisar logos: una  
 *   imagen clasificada como métrica, testimonio o foto pasa a esa sección (las de láminas sin título, solo si su clase  
 *   junta al menos 2 votos) y deja de ser candidata a logo. Sin veredicto, manda la geometría y nada se descarta.  
 * - 5: Métricas y Testimonios no repiten la misma captura: si dos son la misma imagen (misma proporción y píxeles casi  
 *   idénticos a 64×64), queda la de mayor resolución.  
 */

const FETCH_TIMEOUT_MS = 25_000;  
const MAX_HTML_CHARS = 8_000_000;  
const IMAGE_CONCURRENCY = 6;  
const LOGO_CONCURRENCY = 4;  
const LOGO_TIMEOUT_MS = 15_000;  
const MAX_LOGO_BYTES = 6_000_000;  
/** Ronda 14 · C2.1: una textura tiene poca variación (desviación del gris a 64px por debajo de esto). */  
const TEXTURE_MAX_STDEV = 18;  
/** Ronda 14B · 3: clasificación por contenido, en paralelo acotado. */  
const PROOF_CONCURRENCY = 4;  
/** Ronda 14B · 3: una imagen de lámina sin título solo cambia de sección si su clase junta al menos estos votos. */  
const PROOF_MIN_VOTES = 2;  
/** Ronda 14B · 4: más fotos que este múltiplo del límite es un error de lectura (no una galería). */  
const GALLERY_FLOOD_FACTOR = 2;  
/** Ronda 14B · 5: misma captura = proporción dentro de 2 % y diferencia media de gris ≤ 3 (de 255) a 64×64. */  
const SAME_SHOT_RATIO_TOLERANCE = 0.02;  
const SAME_SHOT_MAX_MEAN_DIFF = 3;  
const SAME_SHOT_SIDE = 64;  
/** Spec Canva v1: máximo de piezas por sector. */  
const CANVA_IMAGE_HOSTS = [/(^|\.)canva\.site$/i];  
const BROWSER_UA =  
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

const FORMAT_MESSAGE =  
  "No pudimos leer el contenido de tu sitio de Canva: su formato cambió o no es un sitio publicado. Llena tu portafolio a mano o contáctanos desde el formulario de soporte y lo revisamos contigo.";

export type CanvaImportOutcome = { kind: "manual"; reason: "canva_import"; message: string; prefill: ManualPrefill };

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
        : `encontramos solo ${ firstPlan.length } ${ firstPlan.length === 1 ? "video" : "videos" }`;  
    throw new ImportError(  
      "unavailable",  
      `En tu sitio de Canva ${ found } y tu portafolio necesita al menos ${ LIMITS.minPieces }. Revisa que tus videos estén publicados en el sitio, o llena tu portafolio a mano.`,  
    );  
  }

  onStep("images");  
  // v2 · R5: solo con tema se buscan logos (si no, nada de lo que sigue se muestra).  
  const theme = portfolio.theme;  
  // Ronda 14 · D: el tarifario se lee con visión en paralelo. Nunca rechaza.  
  const ratesTask: Promise<CanvaRate[] | null> =  
    theme && portfolio.rateCard ? readRatesFrom(portfolio.rateCard.url) : Promise.resolve(null);  
  // Ronda 14 · C2.1: la textura candidata se confirma por sus píxeles, también en paralelo. Nunca rechaza.  
  const textureTask: Promise<string | null> =  
    theme && portfolio.texture ? textureSwatch(portfolio.texture.url) : Promise.resolve(null);  
  // Ronda 14B · 3 y 5: prueba y fotos por contenido (antes de revisar logos), sin capturas repetidas.  
  const proof = await resolveProof(portfolio, Boolean(theme));  
  const candidates = theme ? portfolio.logoCandidates.filter((candidate) => !proof.claimed.has(candidate.asset.url)) : [];  
  const verdicts = await mapWithConcurrency(candidates, LOGO_CONCURRENCY, (candidate) => inspectLogo(candidate.asset.url));  
  // Auditoría de la franja por CONTENIDO (no por forma): inspectLogo ya decidió  
  // si cada candidato confirmado ES un logo; los que pasaron el test de píxeles  
  // pero no son logos (capturas, fondos) se cuentan para avisar en la revisión.  
  const discardedShots = verdicts.filter((verdict) => verdict.discarded).length;  
  const logos = candidates.filter((_, index) => verdicts[index].logo);  
  const logoUrls = new Set(logos.map((candidate) => candidate.asset.url));  
  // Un logo nunca es la portada de respaldo de un video.  
  const plan = logoUrls.size > 0 ? planPieces(portfolio.sectors, logoUrls) : firstPlan;  
  // Ronda 14 · A / 14B · 4: las imágenes chicas de Razón y de Fotos que NO son logos vuelven a su galería.  
  const bioExtra = portfolio.bioLogoSized.filter((asset) => !logoUrls.has(asset.url));  
  const galleryExtra = proof.galleryMaybe.filter((asset) => !logoUrls.has(asset.url));

  const heroUrl = portfolio.heroPhoto?.url ?? null;  
  const extras = theme  
    ? [  
        ...logos.map((candidate) => candidate.asset.url),  
        ...proof.metrics.slice(0, LIMITS.maxCanvaMetrics).map((photo) => photo.url),  
        portfolio.rateCard?.url,  
        portfolio.supportPhoto?.url,  
        portfolio.selectorPhoto?.url,  
        ...portfolio.bioPhotos.map((photo) => photo.url),  
        ...bioExtra.map((photo) => photo.url),  
        portfolio.closingVideo?.poster,  
        ...[...proof.gallery, ...galleryExtra].slice(0, LIMITS.maxCanvaGallery).map((photo) => photo.url),  
        ...proof.testimonials.slice(0, LIMITS.maxCanvaTestimonials).map((photo) => photo.url),  
        portfolio.texture?.url,  
      ]  
    : [];  
  const toCopy = [  
    ...new Set([heroUrl, ...plan.map((piece) => piece.poster), ...extras].filter((url): url is string => Boolean(url))),  
  ];  
  const copied = await mapWithConcurrency(toCopy, IMAGE_CONCURRENCY, (url) => copyRemoteImage(url, CANVA_IMAGE_HOSTS));  
  const stored = new Map(toCopy.map((url, index) => [url, copied[index]]));  
  // v2 · R5: los logos confirmados se guardan SIN fondo (PNG transparente →  
  // WebP con alfa). Si algo falla, queda la copia normal de `stored`.  
  const logoUrlsConfirmed = [...new Set(logos.map((candidate) => candidate.asset.url))];  
  const transparentLogos = await mapWithConcurrency(logoUrlsConfirmed, LOGO_CONCURRENCY, (url) =>  
    copyLogoTransparent(url),  
  );  
  const logoStored = new Map(  
    logoUrlsConfirmed.flatMap((url, index) => {  
      const image = transparentLogos[index];  
      return image ? [[url, image] as const] : [];  
    }),  
  );  
  let photo = heroUrl ? (stored.get(heroUrl) ?? null) : null;  
  // La foto que de verdad terminó en el hero (puede cambiar abajo): no se repite en las galerías.  
  let heroSourceUrl = heroUrl;  
  let textureBg: string | null = null;  
  // Auditoría del hero: si la "foto" elegida es casi uniforme (la textura de  
  // fondo de una presentación, un papel, un color plano), no es una foto de la  
  // creadora: se busca la primera foto real entre las demás del sitio. Y la  
  // textura misma ES su fondo: su color promedio manda como fondo del hero.  
  if (heroUrl && photo && (await isUniformImage(heroUrl))) {  
    textureBg = await averageColor(heroUrl);  
    const noHero = new Set([  
      heroUrl,  
      ...logoUrlsConfirmed,  
      ...proof.metrics.map((asset) => asset.url),  
      ...proof.testimonials.map((asset) => asset.url),  
      portfolio.rateCard?.url ?? "",  
    ]);  
    // Una foto de hero de verdad: JPG (los PNG chicos de Canva son íconos o  
    // gráficos), área grande, sin panoramas extremos; en el orden del sitio.  
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
      if (await isUniformImage(candidateUrl)) continue;  
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
      title: pieceTitle(piece, unlabeledTotal),  
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

  // v2: el diseño y lo que solo existe en la variante clonada.  
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
    const logoImageOf = (candidate: (typeof logos)[number]) =>  
      logoStored.get(candidate.asset.url) ?? imageOf(candidate.asset);  
    const logoImages = [  
      ...new Map(  
        logos.flatMap((candidate) => {  
          const image = logoImageOf(candidate);  
          return image ? [[image.url, image] as const] : [];  
        }),  
      ).values(),  
    ];  
    const videoUrls = new Set(pieces.map((piece) => piece.videoUrl));  
    const pieceLogos: Record<string, StoredImage> = {};  
    for (const candidate of logos) {  
      const image = logoImageOf(candidate);  
      if (image && candidate.videoUrl && videoUrls.has(candidate.videoUrl) && !pieceLogos[candidate.videoUrl]) {  
        pieceLogos[candidate.videoUrl] = image;  
      }  
    }  
    // Ronda 14 · C: el video del cierre, solo si es un MP4 de su sitio (igual que las piezas).  
    const closingLink = portfolio.closingVideo ? parseVideoLink(portfolio.closingVideo.url) : null;  
    const closingPoster = portfolio.closingVideo?.poster ? (stored.get(portfolio.closingVideo.poster) ?? null) : null;  
    // Ronda 14 · D: ya validadas por rate-vision con el mismo esquema.  
    const rates = await ratesTask;  
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
    if (!finalTheme.heroBg) {  
      console.warn("[import/canva] el diseño no trae colores ni una textura confirmada:", siteUrl);  
    } else {  
      const parsed = canvaDataSchema.safeParse({  
        theme: finalTheme,  
        logos: logoImages.slice(0, LIMITS.maxCanvaLogos),  
        pieceLogos,  
        metricsImages: imagesOf(proof.metrics, LIMITS.maxCanvaMetrics),  
        rateCard: imageOf(portfolio.rateCard),  
        supportPhoto: imageOf(portfolio.supportPhoto),  
        selectorPhoto: imageOf(portfolio.selectorPhoto),  
        headings: portfolio.headings,  
        source: siteUrl,  
        bioPhotos: imagesOf([...portfolio.bioPhotos, ...bioExtra], LIMITS.maxCanvaBioPhotos),  
        closingVideo: closingLink?.platform === "canva" ? { url: closingLink.url, poster: closingPoster } : null,  
        rates: rates && rates.length > 0 ? rates : null,  
        galleryPhotos: imagesOf([...proof.gallery, ...galleryExtra], LIMITS.maxCanvaGallery),  
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
  if (portfolio.mixedLabels.length > 0) {  
    warnings.push(  
      `No pudimos separar bien los sectores ${ portfolio.mixedLabels.join(", ") }: sus videos quedaron junto a los del sector anterior. Revisa el nicho de cada pieza.`,  
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
      `Descartamos ${ discardedShots } ${ discardedShots === 1 ? "imagen" : "imágenes" } de la franja de marcas porque no ${ discardedShots === 1 ? "era un logo" : "eran logos" }.`,  
    );  
  }  
  if (textureBg) {  
    warnings.push(  
      "La imagen principal de tu Canva era una textura de fondo: la reemplazamos por otra foto de tu sitio y usamos su color como fondo.",  
    );  
  }  
  if (usedPhotoAsCover > 0) {  
    warnings.push(  
      `${ usedPhotoAsCover } ${ usedPhotoAsCover === 1 ? "video usa" : "videos usan" } tu foto principal como portada porque no encontramos la suya. Puedes cambiarla en cada pieza.`,  
    );  
  }  
  if (withoutCover > 0) {  
    warnings.push(  
      `${ withoutCover } ${ withoutCover === 1 ? "video quedó" : "videos quedaron" } fuera porque no pudimos copiar su portada.`,  
    );  
  }  
  if (portfolio.videoCount > plan.length) {  
    warnings.push(  
      `Tu Canva tiene ${ portfolio.videoCount } videos; importamos ${ plan.length } (el máximo es ${ LIMITS.maxPieces } por portafolio).`,  
    );  
  }  
  const niches = prefillNiches(pieces);  
  const labels = [...new Set(pieces.flatMap((piece) => (piece.nicheLabel ? [piece.nicheLabel] : [])))];  
  const outside = labels.filter((label) => !niches.some((niche) => niche.label.toLowerCase() === label.toLowerCase()));  
  if (outside.length > 0) {  
    warnings.push(  
      `Tu portafolio puede tener hasta ${ niches.length } nichos: usamos tus sectores con más videos. Los videos de ${ outside.join(", ") } quedan en «Todo», con el nombre de su sector en el título.`,  
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
    message: `Leímos tu sitio de Canva: ${pieces.length} videos${ sectorCount > 0 ? ` en ${ sectorCount } ${ sectorCount === 1 ? "sector" : "sectores" }` : "" }.${ canva ? " Tu portafolio conserva los colores, las letras y el orden de tu Canva." : "" } Revisa tus datos, tus nichos y tus piezas antes de generar tu portafolio.`,  
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
    },  
  };  
}

// ── Ronda 14B · 3 y 5: prueba y fotos por contenido, sin capturas repetidas ──

type ProofSections = {  
  metrics: CanvaAsset[];  
  testimonials: CanvaAsset[];  
  /** Fotos confirmadas (tamaño de foto, o tamaño de logo que la visión llamó foto). */  
  gallery: CanvaAsset[];  
  /** Fotos con tamaño de logo sin veredicto: siguen como candidatas a logo; si no son logo, vuelven a Fotos. */  
  galleryMaybe: CanvaAsset[];  
  /** URLs que quedaron en Métricas, Testimonios o Fotos: no son candidatas a logo. */  
  claimed: Set<string>;  
};

type Fingerprint = { grey: Buffer; ratio: number; area: number };

const proofTargetOf = (kind: ProofKind | null): CanvaProofZone | null =>  
  kind === "metrics" ? "metrics" : kind === "testimonial" ? "testimonials" : kind === "photo" ? "photos" : null;

/**  
 * Decide la sección de cada imagen del pool: con veredicto de visión, su clase (Métricas, Testimonios o Fotos);  
 * sin veredicto (sin llave, sin red, duda), lo que dijo la geometría. Las de láminas sin título solo cambian si su  
 * clase junta al menos PROOF_MIN_VOTES votos; una "galería" con más del doble de su límite se ignora (error de  
 * lectura). Nunca rechaza: ante cualquier falla, la geometría.  
 */  
async function resolveProof(portfolio: CanvaPortfolio, useBytes: boolean): Promise<ProofSections> {  
  const pool = portfolio.proofPool;  
  const prints = new Map<string, Fingerprint>();  
  const verdicts: (ProofKind | null)[] = useBytes  
    ? await mapWithConcurrency(pool, PROOF_CONCURRENCY, async (item) => {  
        try {  
          const bytes = await downloadCanvaImage(item.asset.url);  
          if (!bytes) return null;  
          const print = await fingerprint(bytes);  
          if (print) prints.set(item.asset.url, print);  
          return await classifyProofImage(bytes);  
        } catch {  
          return null;  
        }  
      })  
    : pool.map(() => null);

  const votes = new Map<CanvaProofZone, number>();  
  for (const verdict of verdicts) {  
    const target = proofTargetOf(verdict);  
    if (target) votes.set(target, (votes.get(target) ?? 0) + 1);  
  }  
  const galleryFlood = (votes.get("photos") ?? 0) > LIMITS.maxCanvaGallery * GALLERY_FLOOD_FACTOR;  
  const logoSized = new Set(portfolio.galleryLogoSized.map((asset) => asset.url));

  const metrics: CanvaAsset[] = [];  
  const testimonials: CanvaAsset[] = [];  
  const gallery: CanvaAsset[] = [];  
  const galleryMaybe: CanvaAsset[] = [];  
  const claimed = new Set<string>();  
  pool.forEach((item, index) => {  
    let target = proofTargetOf(verdicts[index]);  
    if (target === "photos" && galleryFlood) target = null;  
    if (target && item.zone === null && (votes.get(target) ?? 0) < PROOF_MIN_VOTES) target = null;  
    const zone = target ?? item.zone;  
    if (zone === null) return;  
    const url = item.asset.url;  
    if (zone === "photos" && logoSized.has(url) && target !== "photos") {  
      galleryMaybe.push(item.asset);  
      return;  
    }  
    claimed.add(url);  
    if (zone === "metrics") metrics.push(item.asset);  
    else if (zone === "testimonials") testimonials.push(item.asset);  
    else gallery.push(item.asset);  
  });

  const byOrder = (a: CanvaAsset, b: CanvaAsset) => a.order - b.order;  
  return {  
    metrics: dedupeShots(metrics.sort(byOrder), prints),  
    testimonials: dedupeShots(testimonials.sort(byOrder), prints),  
    gallery: gallery.sort(byOrder),  
    galleryMaybe: galleryMaybe.sort(byOrder),  
    claimed,  
  };  
}

/** Huella para comparar capturas: gris a 64×64 (sin proporción: la proporción se compara aparte) y tamaño real. */  
async function fingerprint(bytes: Buffer): Promise<Fingerprint | null> {  
  try {  
    const meta = await sharp(bytes).metadata();  
    if (!meta.width || !meta.height) return null;  
    const grey = await sharp(bytes)  
      .removeAlpha()  
      .greyscale()  
      .resize(SAME_SHOT_SIDE, SAME_SHOT_SIDE, { fit: "fill" })  
      .raw()  
      .toBuffer({ resolveWithObject: true });  
    const channels = grey.info.channels;  
    const pixels = Buffer.alloc(SAME_SHOT_SIDE * SAME_SHOT_SIDE);  
    for (let i = 0; i < pixels.length; i += 1) pixels[i] = grey.data[i * channels];  
    return { grey: pixels, ratio: meta.width / meta.height, area: meta.width * meta.height };  
  } catch {  
    return null;  
  }  
}

function isSameShot(a: Fingerprint, b: Fingerprint): boolean {  
  if (Math.abs(a.ratio - b.ratio) / Math.max(a.ratio, b.ratio) > SAME_SHOT_RATIO_TOLERANCE) return false;  
  let total = 0;  
  for (let i = 0; i < a.grey.length; i += 1) total += Math.abs(a.grey[i] - b.grey[i]);  
  return total / a.grey.length <= SAME_SHOT_MAX_MEAN_DIFF;  
}

/** La misma captura repetida queda una vez, en su mayor resolución. Sin huella, la imagen nunca se descarta. */  
function dedupeShots(assets: CanvaAsset[], prints: Map<string, Fingerprint>): CanvaAsset[] {  
  const kept: CanvaAsset[] = [];  
  for (const asset of assets) {  
    const print = prints.get(asset.url);  
    const twinIndex = print  
      ? kept.findIndex((other) => {  
          const otherPrint = prints.get(other.url);  
          return otherPrint !== undefined && isSameShot(print, otherPrint);  
        })  
      : -1;  
    if (twinIndex < 0) {  
      kept.push(asset);  
      continue;  
    }  
    const twinPrint = prints.get(kept[twinIndex].url);  
    if (print && twinPrint && print.area > twinPrint.area) kept[twinIndex] = asset;  
  }  
  return kept.sort((a, b) => a.order - b.order);  
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
        `Canva no nos dejó leer tu sitio (error ${ response.status }). Revisa que esté publicado y sea público. Si sigue fallando, contáctanos desde el formulario de soporte y lo revisamos contigo.`,  
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

/** Color promedio de unas estadísticas de sharp → "#RRGGBB" (sin plantillas de texto). */  
function meanHex(channels: { mean: number }[]): string | null {  
  const [r, g, b] = channels;  
  if (!r || !g || !b) return null;  
  const byte = (value: number) => Math.round(value).toString(16).padStart(2, "0");  
  return ("#" + byte(r.mean) + byte(g.mean) + byte(b.mean)).toUpperCase();  
}

/** Auditoría de imagen: ¿es casi uniforme (textura, papel, color plano)? Se mide  
 * la desviación de una versión 64px en gris. Ante cualquier error, false (se  
 * conserva la foto elegida). */  
async function isUniformImage(url: string): Promise<boolean> {  
  try {  
    const bytes = await downloadCanvaImage(url);  
    if (!bytes) return false;  
    const stats = await sharp(bytes).resize(64, 64, { fit: "inside" }).greyscale().stats();  
    return (stats.channels[0]?.stdev ?? 99) < 7;  
  } catch {  
    return false;  
  }  
}

/** Color promedio de una imagen (para rescatar el fondo real de una textura). */  
async function averageColor(url: string): Promise<string | null> {  
  try {  
    const bytes = await downloadCanvaImage(url);  
    if (!bytes) return null;  
    const stats = await sharp(bytes).resize(32, 32, { fit: "cover" }).stats();  
    return meanHex(stats.channels);  
  } catch {  
    return null;  
  }  
}

/** Ronda 14 · D: sus tarifas leídas del tarifario, o null (manda la imagen). Nunca lanza. */  
async function readRatesFrom(url: string): Promise<CanvaRate[] | null> {  
  try {  
    const bytes = await downloadCanvaImage(url);  
    return bytes ? await readRateCard(bytes) : null;  
  } catch (error) {  
    console.warn("[import/canva] no se pudo leer el tarifario:", url, error);  
    return null;  
  }  
}

/**  
 * Ronda 14 · C2.1: confirma una textura por sus píxeles (poca variación: papel, lino, grano) y devuelve su color  
 * promedio (#RRGGBB). null ante cualquier falla o duda (nunca lanza).  
 */  
async function textureSwatch(url: string): Promise<string | null> {  
  try {  
    const bytes = await downloadCanvaImage(url);  
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

/** v2 · R5: copia un logo confirmado quitándole el fondo blanco (queda transparente).  
 * Mismas guardas que inspectLogo; ante cualquier error, null y quien llama usa la  
 * copia normal. */  
async function copyLogoTransparent(url: string): Promise<StoredImage | null> {  
  try {  
    const bytes = await downloadCanvaImage(url);  
    if (!bytes) return null;  
    const transparent = await removeWhiteBackground(bytes);  
    return await saveImage(transparent);  
  } catch (error) {  
    console.warn("[import/canva] no se pudo quitar el fondo de un logo:", url, error);  
    return null;  
  }  
}

type LogoVerdict = {  
  /** Confirmado como logo: entra a la franja. */  
  logo: boolean;  
  /** Pasó el test de píxeles pero NO es un logo (captura, fondo vacío): se avisa. */  
  discarded: boolean;  
};

/**  
 * v2 · R5 + auditoría: ¿la imagen ES un logo? Primero píxeles (caja blanca y  
 * contenido visible); después, contenido con visión (logo-vision.ts), porque  
 * una captura de estadísticas es idéntica a un logo en píxeles. La forma y el  
 * tamaño NO descartan: un logo alto y angosto es un logo. Ante cualquier  
 * error, no es logo y no se avisa (nunca rompe el import).  
 */  
async function inspectLogo(url: string): Promise<LogoVerdict> {  
  try {  
    const bytes = await downloadCanvaImage(url);  
    if (!bytes) return { logo: false, discarded: false };  
    if (!(await isWhiteBoxedLogo(bytes))) return { logo: false, discarded: false };  
    if (!(await hasVisibleContent(bytes))) return { logo: false, discarded: true };  
    if ((await visionSaysLogo(bytes)) === false) return { logo: false, discarded: true };  
    return { logo: true, discarded: false };  
  } catch (error) {  
    console.warn("[import/canva] no se pudo revisar un posible logo:", url, error);  
    return { logo: false, discarded: false };  
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
 * Hasta LIMITS.maxPieces en total. Si no alcanza para todos, el cupo se reparte por  
 * turnos (uno por sector en cada vuelta) para que ningún sector quede vacío; las piezas  
 * salen agrupadas por sector.  
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

/** Título derivado de su sector ("Lugares 2"); sin sector, "Video 3". */  
function pieceTitle(piece: PlannedPiece, unlabeledTotal: number): string {  
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
