import "server-only";
import sharp from "sharp";
import { mapWithConcurrency } from "@/lib/instagram/images";
import { truncateWords } from "@/lib/instagram/snapshot";
import { LIMITS, canvaDataSchema, type CanvaData, type StoredImage } from
"@/lib/portfolio/schema";
import { copyRemoteImage } from "@/lib/remote-image";
import { slugify } from "@/lib/text/slugify";
import {
  CanvaFormatError,
  isCanvaSiteHost,
  parseCanvaSite,
  readCanvaPortfolio,
  type CanvaAsset,
  type CanvaSector,
} from "./canva";
import { ImportError, isTimeoutError } from "./errors";
import { prefillNiches, type ImportStep, type ManualPrefill } from "./events";
import { saveImage } from "@/lib/media";
import { isWhiteBoxedLogo, removeWhiteBackground } from "./remove-bg";

/*
 * Importador de Canva: link público de un sitio de Canva → formulario manual prellenado.
 * 1. scrape GET al sitio (sin login) y lectura de su JSON interno (./canva.ts).
 * 2. images Se copian a nuestro almacenamiento la foto principal y las portadas de los
videos
 *          (el esquema solo acepta imágenes nuestras). Los MP4 quedan enlazados al
Canva de la creadora.
 * No usa los borradores de Instagram: devuelve un ManualPrefill y la creadora revisa todo
en /crear/manual.
 * Sus sectores pasan a ser sus nichos (hasta 6 piezas por sector y LIMITS.maxPieces en
total).
 * Nada se inventa: lo que no está en su sitio, no va. Formato desconocido →
ImportError("scrape_failed").
 *
 * v2 ("clonador fiel"): si el parser leyó el diseño (theme), además se confirman los logos por
sus píxeles
 * (borde blanco, ./remove-bg.ts), se copian logos, capturas de métricas, tarifario y fotos de
apoyo, y todo viaja en
 * `prefill.canva`. Sin tema, todo queda como en la v1.
 */

const FETCH_TIMEOUT_MS = 25_000;
const MAX_HTML_CHARS = 8_000_000;
const IMAGE_CONCURRENCY = 6;
const LOGO_CONCURRENCY = 4;
const LOGO_TIMEOUT_MS = 15_000;
const MAX_LOGO_BYTES = 6_000_000;
/** Spec Canva v1: máximo de piezas por sector. */
const CANVA_IMAGE_HOSTS = [/(^|\.)canva\.site$/i];
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

const FORMAT_MESSAGE =
 "No pudimos leer el contenido de tu sitio de Canva: su formato cambió o no es un sitio publicado. Intenta de nuevo más tarde o llena tu portafolio a mano.";

export type CanvaImportOutcome = { kind: "manual"; reason: "canva_import"; message:
string; prefill: ManualPrefill };

export async function importFromCanva(siteUrl: string, onStep: (step: ImportStep) => void):
Promise<CanvaImportOutcome> {
 onStep("scrape");
 const page = await fetchCanvaPage(siteUrl);
 let portfolio;
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
     `En tu sitio de Canva ${found} y tu portafolio necesita al menos ${LIMITS.minPieces}.
Revisa que tus videos estén publicados en el sitio, o llena tu portafolio a mano.`,
   );
 }

 onStep("images");
 // v2 · R5: solo con tema se buscan logos (si no, nada de lo que sigue se muestra).
 const theme = portfolio.theme;
 const candidates = theme ? portfolio.logoCandidates : [];
 const verdicts = await mapWithConcurrency(candidates, LOGO_CONCURRENCY,
(candidate) => inspectLogo(candidate.asset.url));
 const logos = candidates.filter((_, index) => verdicts[index]);
 const logoUrls = new Set(logos.map((candidate) => candidate.asset.url));
 // Un logo nunca es la portada de respaldo de un video.
 const plan = logoUrls.size > 0 ? planPieces(portfolio.sectors, logoUrls) : firstPlan;

 const heroUrl = portfolio.heroPhoto?.url ?? null;
 const extras = theme
   ?[
       ...logos.map((candidate) => candidate.asset.url),
       ...portfolio.metricsPhotos.slice(0, LIMITS.maxCanvaMetrics).map((photo) => photo.url),
       portfolio.rateCard?.url,
       portfolio.supportPhoto?.url,
       portfolio.selectorPhoto?.url,
     ]
   : [];
 const toCopy = [
   ...new Set([heroUrl, ...plan.map((piece) => piece.poster), ...extras].filter((url): url is string => Boolean(url))),
 ];
 const copied = await mapWithConcurrency(toCopy, IMAGE_CONCURRENCY, (url) =>
copyRemoteImage(url, CANVA_IMAGE_HOSTS));
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
     ...(portfolio.metricsPhotos ?? []).map((asset) => asset.url),
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
   const imageOf = (asset: CanvaAsset | null) => (asset ? (stored.get(asset.url) ?? null) :
null);
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
     if (image && candidate.videoUrl && videoUrls.has(candidate.videoUrl) &&
!pieceLogos[candidate.videoUrl]) {
       pieceLogos[candidate.videoUrl] = image;
     }
   }
   const parsed = canvaDataSchema.safeParse({
     theme: textureBg
       ? { ...theme, heroBg: textureBg, bands: [textureBg, ...theme.bands.slice(1)] }
       : theme,
     logos: logoImages.slice(0, LIMITS.maxCanvaLogos),
     pieceLogos,
     metricsImages: portfolio.metricsPhotos
       .slice(0, LIMITS.maxCanvaMetrics)
       .flatMap((asset) => imageOf(asset) ?? []),
     rateCard: imageOf(portfolio.rateCard),
     supportPhoto: imageOf(portfolio.supportPhoto),
     selectorPhoto: imageOf(portfolio.selectorPhoto),
     headings: portfolio.headings,
     source: siteUrl,
   } satisfies CanvaData);
   if (parsed.success) canva = parsed.data;
   else console.error("[import/canva] el diseño leído no es válido:", parsed.error.issues,
siteUrl);
 }

 const warnings: string[] = [];
 if (!portfolio.name) warnings.push("No encontramos tu nombre en el sitio: escríbelo en el formulario.");
 if (!photo) warnings.push("No pudimos traer tu foto principal: súbela en el formulario.");
 if (!canva) {
   warnings.push("No pudimos leer el diseño de tu Canva (colores y letras): tu portafolio usa una de nuestras plantillas.");
 }
 if (portfolio.mixedLabels.length > 0) {
   warnings.push(
     `No pudimos separar bien los sectores ${portfolio.mixedLabels.join(", ")}: sus videos
quedaron junto a los del sector anterior. Revisa el nicho de cada pieza.`,
   );
 }
 if (usedPhotoAsCover > 0) {
   warnings.push(
     `${usedPhotoAsCover} ${usedPhotoAsCover === 1 ? "video usa" : "videos usan"} tu foto
principal como portada porque no encontramos la suya. Puedes cambiarla en cada pieza.`,
   );
 }
 if (withoutCover > 0) {
   warnings.push(
     `${withoutCover} ${withoutCover === 1 ? "video quedó" : "videos quedaron"} fuera
porque no pudimos copiar su portada.`,
   );
 }
 if (portfolio.videoCount > plan.length) {
   warnings.push(
      `Tu Canva tiene ${portfolio.videoCount} videos; importamos ${plan.length} (el máximo es
${LIMITS.maxPieces} por portafolio).`,
    );
  }
  const niches = prefillNiches(pieces);
  const labels = [...new Set(pieces.flatMap((piece) => (piece.nicheLabel ? [piece.nicheLabel]
: [])))];
  const outside = labels.filter((label) => !niches.some((niche) => niche.label.toLowerCase()
=== label.toLowerCase()));
  if (outside.length > 0) {
    warnings.push(
      `Tu portafolio puede tener hasta ${niches.length} nichos: usamos tus sectores con más
videos. Los videos de ${outside.join(", ")} quedan en «Todo», con el nombre de su sector en
el título.`,
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
    message: `Leímos tu sitio de Canva: ${pieces.length} videos${sectorCount > 0 ? ` en
${sectorCount} ${sectorCount === 1 ? "sector" : "sectores"}` : ""}.${canva ? " Tu portafolio conserva los colores, las letras y el orden de tu Canva." : ""} Revisa tus datos, tus nichos y
tus piezas antes de generar tu portafolio.`,
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

/** GET al sitio con User-Agent de navegador (HEAD no sirve en Canva). Solo hosts de
Canva, también tras redirigir. */
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
       `Canva no nos dejó leer tu sitio (error ${response.status}). Revisa que esté publicado y
sea público, o intenta en unos minutos.`,
     );
   }
   if (Number(response.headers.get("content-length") ?? 0) > MAX_HTML_CHARS) {
     throw new ImportError("scrape_failed", FORMAT_MESSAGE);
   }
   html = await response.text();
   if (html.length > MAX_HTML_CHARS) throw new ImportError("scrape_failed",
FORMAT_MESSAGE);
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

/** Auditoría de imagen: ¿es casi uniforme (textura, papel, color plano)? Se mide
 * la desviación de una versión 64px en gris. Ante cualquier error, false (se
 * conserva la foto elegida). */
async function isUniformImage(url: string): Promise<boolean> {
  try {
    if (!isCanvaSiteHost(new URL(url).hostname)) return false;
    const response = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": BROWSER_UA },
      signal: AbortSignal.timeout(LOGO_TIMEOUT_MS),
    });
    if (!response.ok || !isCanvaSiteHost(new URL(response.url || url).hostname)) return false;
    if (Number(response.headers.get("content-length") ?? 0) > MAX_LOGO_BYTES) return false;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_LOGO_BYTES) return false;
    const stats = await sharp(bytes).resize(64, 64, { fit: "inside" }).greyscale().stats();
    return (stats.channels[0]?.stdev ?? 99) < 7;
  } catch {
    return false;
  }
}

/** Color promedio de una imagen (para rescatar el fondo real de una textura). */
async function averageColor(url: string): Promise<string | null> {
  try {
    if (!isCanvaSiteHost(new URL(url).hostname)) return null;
    const response = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": BROWSER_UA },
      signal: AbortSignal.timeout(LOGO_TIMEOUT_MS),
    });
    if (!response.ok || !isCanvaSiteHost(new URL(response.url || url).hostname)) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_LOGO_BYTES) return null;
    const stats = await sharp(bytes).resize(32, 32, { fit: "cover" }).stats();
    const [r, g, b] = stats.channels;
    if (!r || !g || !b) return null;
    const hex = (value: number) => Math.round(value).toString(16).padStart(2, "0");
    return `#${hex(r.mean)}${hex(g.mean)}${hex(b.mean)}`.toUpperCase();
  } catch {
    return null;
  }
}

/** v2 · R5: copia un logo confirmado quitándole el fondo blanco (queda transparente).
 * Mismas guardas que inspectLogo; ante cualquier error, null y quien llama usa la
 * copia normal. */
async function copyLogoTransparent(url: string): Promise<StoredImage | null> {
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
    if (bytes.length === 0 || bytes.length > MAX_LOGO_BYTES) return null;
    const transparent = await removeWhiteBackground(bytes);
    return await saveImage(transparent);
  } catch (error) {
    console.warn("[import/canva] no se pudo quitar el fondo de un logo:", url, error);
    return null;
  }
}

/** v2 · R5: ¿la imagen es un logo con caja blanca? Ante cualquier error, no (nunca rompe el
import). */
async function inspectLogo(url: string): Promise<boolean> {
  try {
    if (!isCanvaSiteHost(new URL(url).hostname)) return false;
    const response = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": BROWSER_UA },
      signal: AbortSignal.timeout(LOGO_TIMEOUT_MS),
    });
    if (!response.ok || !isCanvaSiteHost(new URL(response.url || url).hostname)) return false;
    if (Number(response.headers.get("content-length") ?? 0) > MAX_LOGO_BYTES) return false;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_LOGO_BYTES) return false;
    return await isWhiteBoxedLogo(bytes);
  } catch (error) {
    console.warn("[import/canva] no se pudo revisar un posible logo:", url, error);
    return false;
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
      poster: video.poster ?? sector.photos.find((photo) => !logoUrls.has(photo.url))?.url ??
null,
    })),
  );
}

/** Título derivado de su sector ("Lugares 2"); sin sector, "Video 3". */
function pieceTitle(piece: PlannedPiece, unlabeledTotal: number): string {
  const label = piece.sector.label;
  const title = label
   ? piece.sectorTotal > 1
     ? `${label} ${piece.index + 1}`
     : label
   : unlabeledTotal > 1
     ? `Video ${piece.index + 1}`
     : "Video";
  return title.slice(0, LIMITS.pieceTitle);
}

/** Sus párrafos de presentación tal cual: juntos si caben en la bio; si no, el primero (cortado
por palabras). */
function composeBio(paragraphs: string[]): string {
  const clean = paragraphs.map((paragraph) => paragraph.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (clean.length === 0) return "";
  const joined = clean.join(" ");
  if (joined.length <= LIMITS.bio) return joined;
    return truncateWords(clean[0], LIMITS.bio - 1);
}
