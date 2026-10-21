import { NICHE_LABEL_MAX } from "@/lib/portfolio/niches";
import { LIMITS } from "@/lib/portfolio/schema";

/*
 * Parser del sitio público de Canva (importador v1). Funciones puras: sin fetch, sin Next, sin
servidor. Las usa la
 * orquestación (canva-import.ts), la pantalla de importación (validar el link) y las pruebas
con el HTML guardado.
 *
 * Contrato verificado contra un sitio real (16/10 y 20/10):
 * - El HTML no trae DOM renderizado: todo el contenido vive en un JSON interno.
 * - Videos: "url":"_assets/video/<hash>.mp4" con width/height. Fotos reales:
_assets/media/*. Íconos y

 * decoración: _assets/images/* (se ignoran). URL absoluta = base del sitio + ruta relativa.
 * - Textos: arreglos de strings dentro del JSON, en orden de documento.
 * - Sectores: etiquetas cortas que preceden a sus videos después de "Elige un sector para
ver mis videos".
 * Un video pertenece al último sector visto antes que él.
 * Nada se inventa: lo que no se encuentra queda vacío. Si el formato no calza, se lanza
CanvaFormatError.
 */

export class CanvaFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanvaFormatError";
  }
}

// ── El link ─────────────────────────────────────────────────────────
const NOT_A_CANVA_SITE =
  "Ese link no es de un sitio de Canva. Pega el link público de tu sitio publicado (termina en .canva.site).";
const CANVA_DESIGN_LINK =
  "Ese link es de un diseño de Canva, no de un sitio publicado. En Canva, publica tu diseño como sitio web y pega ese link.";

/** Sitios publicados de Canva: canva.site y *.canva.site (p. ej. tunombre.my.canva.site). */
export const isCanvaSiteHost = (hostname: string) => {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return host === "canva.site" || host.endsWith(".canva.site");
};

export type CanvaLink = { ok: true; url: string } | { ok: false; error: string };

/** Valida y normaliza el link de un sitio de Canva: https, sin query ni hash, con "/" al final. */
export function parseCanvaSiteUrl(raw: string): CanvaLink {
  const value = raw.trim();
  if (!value) return { ok: false, error: "Pega el link de tu sitio de Canva." };
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return { ok: false, error: NOT_A_CANVA_SITE };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, error:
NOT_A_CANVA_SITE };
  const host = url.hostname.toLowerCase();
  if (host === "canva.com" || host.endsWith(".canva.com")) return { ok: false, error:
CANVA_DESIGN_LINK };

  if (!isCanvaSiteHost(host) || url.username || url.password || url.port) return { ok: false, error:
NOT_A_CANVA_SITE };
  url.protocol = "https:";
  url.search = "";
  url.hash = "";
  if (!url.pathname.endsWith("/")) url.pathname = `${url.pathname}/`;
  return { ok: true, url: url.toString() };
}

// ── Datos crudos del sitio ──────────────────────────────────────────
export type CanvaAsset = {
  /** URL absoluta en el sitio de Canva. */
  url: string;
  width: number | null;
  height: number | null;
  /** Posición en el documento (primera aparición). */
  order: number;
  /** Solo videos: la imagen asociada en el manifiesto de Canva, si la hay. */
  poster: string | null;
};

export type CanvaText = {
  text: string;
  order: number;
  /** Tamaño de fuente del estilo que sigue al texto en el documento, si se pudo leer. */
  fontPx: number | null;
};

export type CanvaSiteData = {
  title: string;
  texts: CanvaText[];
  /** Únicos por URL (la mayor resolución), en orden de documento. */
  videos: CanvaAsset[];
  /** Fotos de _assets/media, únicas por URL, en orden de documento. */
  photos: CanvaAsset[];
  instagram: string | null;
  tiktok: string | null;
  email: string | null;
};

const count = (text: string, pattern: RegExp) => text.match(pattern)?.length ?? 0;

/** El JSON interno a veces viene escapado dentro de un string de JS: se deja legible para
los patrones. */
function readableSource(html: string): string {
  const source = html.replace(/\\u002[fF]/g, "/").replace(/\\\//g, "/");
  const plain = count(source, /"url"\s*:\s*"(?:\.\/)?_assets\//g);
  const escaped = count(source, /\\"url\\"\s*:\s*\\"(?:\.\/)?_assets\//g);
  return escaped > plain ? source.replace(/\\"/g, '"') : source;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00A0" };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code.startsWith("#")) {
      const value = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) :
parseInt(code.slice(1), 10);
      return Number.isFinite(value) && value > 0 && value < 0x110000 ?
String.fromCodePoint(value) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

function decodeJsonString(raw: string): string {
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return raw;
  }
}

/** Ruta relativa → URL absoluta, solo si queda dentro de un sitio de Canva. */
function absoluteAssetUrl(path: string, base: string): string | null {
  try {
    const url = new URL(path, base);
    return url.protocol === "https:" && isCanvaSiteHost(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

type JsonObject = { start: number; end: number; text: string };

/** El objeto JSON que rodea una posición (conteo de llaves, acotado). null si no se
encuentra. */
function enclosingObject(source: string, index: number, maxSpan = 3000): JsonObject | null
{
  let depth = 0;
  let start = -1;
  for (let i = index; i >= Math.max(0, index - maxSpan); i -= 1) {
    const char = source[i];
    if (char === "}") depth += 1;
    else if (char === "{") {
      if (depth === 0) {
        start = i;
        break;

         }
         depth -= 1;
     }
    }
    if (start < 0) return null;
    depth = 0;
    for (let i = start; i < Math.min(source.length, start + maxSpan * 2); i += 1) {
      const char = source[i];
      if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) return { start, end: i + 1, text: source.slice(start, i + 1) };
      }
    }
    return null;
}

function numberField(scope: string, key: "width" | "height"): number | null {
  const match = new RegExp(`"${key}"\\s*:\\s*(\\d+(?:\\.\\d+)?)`).exec(scope);
  const value = match ? Math.round(Number(match[1])) : 0;
  return value > 0 ? value : null;
}

const ASSET_URL =

/"url"\s*:\s*"(?:\.\/)?(_assets\/(video|media|images)\/[^"\\?#\s]+\.(mp4|jpe?g|png|webp))(?:[?#][^"\\]*)?"/gi;
const IMAGE_PATH =
/"(?:\.\/)?(_assets\/(?:media|video)\/[^"\\?#\s]+\.(?:jpe?g|png|webp))(?:[?#][^"\\]*)?"/i;
const VIDEO_PATH = /_assets\/video\/[^"\\?#\s]+\.mp4/gi;
/** Un contenedor más grande que esto ya no es "el elemento de video" (es una página o
una sección). */
const POSTER_SCOPE_MAX = 3000;

/** La imagen asociada a un video en el manifiesto: dentro de su objeto o del contenedor
que solo lo tiene a él. */
function posterNear(source: string, object: JsonObject | null, base: string): string | null {
  if (!object) return null;
  const own = IMAGE_PATH.exec(object.text)?.[1];
  if (own) return absoluteAssetUrl(own, base);
  if (object.start === 0) return null;
  const parent = enclosingObject(source, object.start - 1);
  if (!parent || parent.text.length > POSTER_SCOPE_MAX || count(parent.text,
VIDEO_PATH) !== 1) return null;
  const path = IMAGE_PATH.exec(parent.text)?.[1];
  return path ? absoluteAssetUrl(path, base) : null;
}

const area = (asset: CanvaAsset) => (asset.width ?? 0) * (asset.height ?? 0);

/** Deduplica por URL: conserva la primera aparición y la mayor resolución. */
function uniqueByUrl(assets: CanvaAsset[]): CanvaAsset[] {
  const byUrl = new Map<string, CanvaAsset>();
  for (const asset of assets) {
    const previous = byUrl.get(asset.url);
    if (!previous) {
      byUrl.set(asset.url, { ...asset });
      continue;
    }
    if (area(asset) > area(previous)) {
      previous.width = asset.width;
      previous.height = asset.height;
    }
    previous.poster = previous.poster ?? asset.poster;
  }
  return [...byUrl.values()].sort((a, b) => a.order - b.order);
}

function collectAssets(source: string, base: string): { videos: CanvaAsset[]; photos:
CanvaAsset[] } {
  const videos: CanvaAsset[] = [];
  const photos: CanvaAsset[] = [];
  for (const match of source.matchAll(ASSET_URL)) {
    const [, path, folder, extension] = match;
    if (folder === "images") continue; // íconos y decoración
    const isVideo = folder === "video" && extension.toLowerCase() === "mp4";
    if (folder === "video" && !isVideo) continue; // imágenes sueltas de la carpeta de video: solo como póster
    const url = absoluteAssetUrl(path, base);
    if (!url) continue;
    const index = match.index ?? 0;
    const object = enclosingObject(source, index);
    const scope = object?.text ?? source.slice(Math.max(0, index - 200), index + 400);
    // El árbol del documento referencia cada asset por el id de su entrada del manifiesto:
    // la primera aparición de ese id (antes de la entrada misma) es su posición en la página.
    const before = source.slice(Math.max(0, index - 600), index);
    const entryId = [...before.matchAll(/"id"\s*:\s*"([A-Za-z0-9_]+)"/g)].at(-1)?.[1];
    let order = index;
    if (entryId) {
      const referencedAt = source.indexOf(`"${entryId}"`);
      if (referencedAt >= 0 && referencedAt < (object?.start ?? index) - 5) order = referencedAt;
    }
    let poster = isVideo ? posterNear(source, object, base) : null;
    if (isVideo && !poster && object) {
      const segment = source.slice(object.start, object.start + 4500);
      const timeline = /"videoTimelines"\s*:\s*\[\s*\{[^}]*?"F"\s*:\s*"(_assets\/[^"]+)"/.exec(segment)?.[1];
      if (timeline) poster = absoluteAssetUrl(timeline, base);
    }
    const asset: CanvaAsset = {
      url,
      width: numberField(scope, "width"),
      height: numberField(scope, "height"),
      order,
      poster,
    };
    (isVideo ? videos : photos).push(asset);
  }
  return { videos: uniqueByUrl(videos), photos: uniqueByUrl(photos) };
}

// ── Textos ─────────────────────────────────────────────────────────
const STRING_ARRAY = /\[\s*"(?:[^"\\]|\\.)*"(?:\s*,\s*"(?:[^"\\]|\\.)*")*\s*\]/g;
const STRING_LITERAL = /"((?:[^"\\]|\\.)*)"/g;

const cleanText = (raw: string) =>
 raw
  .replace(/\\n/g, "\n")
  .replace(/\\u([0-9a-fA-F]{4})/g, (_whole, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
  .replace(/[\u200b-\u200d\ufeff]/g, "")
  .replace(/[\u00a0\u2028\u2029]/g, " ")
  .replace(/\r\n?/g, "\n")
  .split("\n")
  .map((line) => line.replace(/[ \t\f\v]+/g, " ").trim())
  .filter(Boolean)
  .join("\n")
  .trim();

const SINGLE_TOKEN = [
  /^\p{Lu}[\p{Lu}\p{N}&+'’.-]*$/u, // LUGARES, ASMR
  /^[¡¿]?\p{Lu}\p{Ll}+[!?.]*$/u, // Eventos, Vlog, Contrátame
  /^\+?\d+(?:[.,]\d+)?\s?[kKmM]\+?$/, // 11k, 6k
  /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i, // correo
  /^@[\w.]+$/, // @usuario
];

/** ¿Es texto para personas (y no un id, una ruta, un enum o CSS)? */
function isHumanText(text: string): boolean {
  if (!text || text.length > 3000 || !/\p{L}/u.test(text)) return false;
  if (/^(?:https?:|\/\/|\/|\.\/|_assets|data:|#|www\.)/i.test(text) || text.includes("://")) return false;
  if (/[{}<>]/.test(text) || /^[\w-]+\s*:\s*[^;]+;/.test(text)) return false;
  if (!/\s/.test(text)) return SINGLE_TOKEN.some((pattern) => pattern.test(text));
  return /\p{L}{2,}/u.test(text);
}

function collectTexts(source: string): CanvaText[] {
  const texts: CanvaText[] = [];
  for (const array of source.matchAll(STRING_ARRAY)) {
    const start = array.index ?? 0;
    const font = /"G":"([\d.]+)px"/.exec(source.slice(start, start + 900));
    const fontPx = font ? Number(font[1]) : null;
    for (const literal of array[0].matchAll(STRING_LITERAL)) {
      const text = cleanText(decodeJsonString(literal[1]));
      if (isHumanText(text)) texts.push({ text, order: start + (literal.index ?? 0), fontPx });
    }
  }
  return texts;
}

// ── Contacto ────────────────────────────────────────────────────────
const INSTAGRAM_PROFILE = /instagram\.com\/([A-Za-z0-9._]{1,30})/gi;

const INSTAGRAM_RESERVED = new Set([
  "p", "reel", "reels", "tv", "explore", "stories", "accounts", "direct", "about", "developer", "legal",
"share", "canva", "_u",
]);
const TIKTOK_PROFILE = /tiktok\.com\/@([A-Za-z0-9._]{2,24})/gi;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi;

function firstHandle(source: string, pattern: RegExp, reserved: Set<string>): string | null {
  for (const match of source.matchAll(pattern)) {
    const handle = match[1].replace(/\.+$/, "").toLowerCase();
    if (handle && !reserved.has(handle)) return handle;
  }
  return null;
}

function firstEmail(text: string): string | null {
  for (const match of text.matchAll(EMAIL)) {
    const email = match[0].toLowerCase();
    if (/\.(?:png|jpe?g|webp|gif|svg|mp4)$/.test(email) ||
/@(?:[\w-]+\.)*canva\.(?:com|site)$/.test(email)) continue;
    return email;
  }
  return null;
}

function safeDecodeUri(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * HTML del sitio → sus datos crudos. `pageUrl` es la URL final de la página (para resolver
las rutas relativas).
 * Lanza CanvaFormatError si el HTML no trae el contenido en el formato conocido.
 */
export function parseCanvaSite(html: string, pageUrl: string): CanvaSiteData {
  const baseHref = /<base\s[^>]*href\s*=\s*["']([^"']+)["']/i.exec(html)?.[1];
  let base = pageUrl;
  if (baseHref) {
    try {
      base = new URL(baseHref, pageUrl).toString();
    } catch {
      // <base> inválido: se usa la URL de la página
    }
  }

  const source = readableSource(html);
  if (!source.includes("_assets/")) {
    throw new CanvaFormatError("El sitio no trae su contenido en el formato de Canva que conocemos.");
  }
  const { videos, photos } = collectAssets(source, base);
  const texts = collectTexts(source);
  if (videos.length === 0 && texts.length === 0) {
    throw new CanvaFormatError("No encontramos ni textos ni videos en el contenido del sitio.");
  }
  const title = cleanText(decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? ""));
  const mailtos = [...source.matchAll(/mailto:([^"'?\s<>\\]+)/gi)].map((match) =>
safeDecodeUri(match[1])).join("\n");
  return {
    title,
    texts,
    videos,
    photos,
    instagram: firstHandle(source, INSTAGRAM_PROFILE, INSTAGRAM_RESERVED),
    tiktok: firstHandle(source, TIKTOK_PROFILE, new Set(["canva"])),
    email: firstEmail(texts.map((text) => text.text).join("\n")) ?? firstEmail(mailtos),
  };
}

// ── Lectura del portafolio ──────────────────────────────────────────
export type CanvaSector = {
  /** Nombre del sector tal como se muestra ("Lugares", "Canvas UGC"); null = videos antes
del primer sector. */
  label: string | null;
  videos: CanvaAsset[];
  /** Fotos del sector (sin la foto principal): respaldo de portada. */
  photos: CanvaAsset[];
};

export type CanvaPortfolio = {
  name: string;
  tagline: string;
  /** Párrafos largos de presentación (bio, "¿Por qué yo?"), en orden y sin repetir. */
  paragraphs: string[];
  heroPhoto: CanvaAsset | null;
  /** Solo los que tienen al menos un video, en orden de documento. */
  sectors: CanvaSector[];
  /** Títulos de sector que no se pudieron separar del anterior (sus videos quedaron juntos). */
  mixedLabels: string[];
  videoCount: number;
  contact: { instagram: string | null; tiktok: string | null; email: string | null };
};

const fold = (text: string) =>
 text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

const isAllCaps = (text: string) => /\p{Lu}/u.test(text) && !/\p{Ll}/u.test(text);

const SECTOR_HEADING = /^elige (?:un|tu) sector/;
const ACRONYMS = new Set(["UGC", "ASMR", "DIY", "POV", "GRWM", "TV", "IA", "AI",
"PR", "B2B", "B2C", "3D"]);
const MINOR_WORDS = new Set(["y", "e", "o", "u", "de", "del", "la", "las", "el", "los", "en",
"con", "para", "por", "a"]);

/** "LUGARES" → "Lugares", "CANVAS UGC" → "Canvas UGC". Lo que no viene en
mayúsculas queda tal cual. */
export function displayLabel(raw: string): string {
  const text = raw.replace(/\s+/g, " ").trim();
  const shout = isAllCaps(text);
  return text
   .split(" ")
   .map((word, index) => {
     const upper = word.toLocaleUpperCase("es");
     if (ACRONYMS.has(upper)) return upper;
     if (!shout) return word;
     const lower = word.toLocaleLowerCase("es");
     if (index > 0 && MINOR_WORDS.has(lower)) return lower;
     return lower.replace(/^\p{L}/u, (letter) => letter.toLocaleUpperCase("es"));
   })
   .join(" ");
}

/** "UGC/LIFESTYLE/BEAUTY/TECH/ FOODIE" → "UGC · Lifestyle · Beauty · Tech ·
Foodie". null si no es una lista de rubros. */
export function formatTagline(raw: string, max: number = LIMITS.tagline): string | null {
  if (raw.includes("\n")) return null;
  const parts = raw
    .split(/\s*[/|·•,]+\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2 || parts.some((part) => part.length > 24 || part.split(" ").length > 3 ||
/[\d@]/.test(part))) {
    return null;
  }
  const labels = parts.map(displayLabel);
  while (labels.length > 1 && labels.join(" · ").length > max) labels.pop();
  return labels.join(" · ");
}

function looksLikeName(text: string): boolean {
 if (text.includes("\n") || text.length > 40 || /\d/.test(text)) return false;

  const words = text.split(" ");
  return words.length >= 2 && words.length <= 4 && words.every((word) =>
/^\p{Lu}[\p{L}'’.-]*$/u.test(word));
}

function isSectorLabel(text: string, name: string): boolean {
  if (text.length > NICHE_LABEL_MAX || /[\n\d@?¿!¡:/|]/.test(text) || !/\p{L}.*\p{L}/u.test(text))
return false;
  const words = text.split(" ");
  if (words.length > 3) return false;
  if (name && fold(text) === fold(name)) return false;
  return isAllCaps(text) || words.every((word) => isAllCaps(word) ||
/^\p{Lu}\p{Ll}*$/u.test(word));
}

const dims = (asset: CanvaAsset) => (asset.width && asset.height ? { w: asset.width, h:
asset.height } : null);

/**
 * Foto principal: la primera foto grande, horizontal o retrato, que no sea una captura de
celular (9:16 o más alta)
 * ni un banner. Si la heurística duda, la primera foto grande; si no, la primera foto.
 */
function pickHeroPhoto(photos: CanvaAsset[]): CanvaAsset | null {
  const isGoodShape = (asset: CanvaAsset) => {
    const size = dims(asset);
    return size !== null && Math.min(size.w, size.h) >= 800 && size.h / size.w < 1.7 && size.w
/ size.h <= 2.2;
  };
  const isLarge = (asset: CanvaAsset) => {
    const size = dims(asset);
    return size !== null && Math.min(size.w, size.h) >= 600;
  };
  return photos.find(isGoodShape) ?? photos.find(isLarge) ?? photos[0] ?? null;
}

function findName(site: CanvaSiteData): { name: string; index: number } {
  const title = fold(site.title);
  const inTitle = site.texts.findIndex((text) => looksLikeName(text.text) &&
title.includes(fold(text.text)));
  const index = inTitle >= 0 ? inTitle : site.texts.findIndex((text) => looksLikeName(text.text)
&& !isAllCaps(text.text));
  if (index >= 0) {
    const text = site.texts[index].text;
    return { name: isAllCaps(text) ? displayLabel(text) : text, index };
  }
  const fromTitle = site.title
    .replace(/\b(?:portafolio|portfolio|media\s*kit|sitio\s*web|ugc|creadora?|de)\b/gi, " ")

     .replace(/[|·•\-–—:]+/g, " ")
     .replace(/\s+/g, " ")
     .trim();
    return { name: looksLikeName(fromTitle) ? fromTitle : "", index: -1 };
}

type WalkEvent =
  | { kind: "text"; order: number; text: string; fontPx: number | null }
  | { kind: "video"; order: number; asset: CanvaAsset }
  | { kind: "photo"; order: number; asset: CanvaAsset };

/** Datos crudos → lo que el import necesita: nombre, tagline, textos, foto principal, sectores
con sus videos. */
export function readCanvaPortfolio(site: CanvaSiteData): CanvaPortfolio {
  const { name, index: nameIndex } = findName(site);
  const taglineStart = nameIndex >= 0 ? nameIndex + 1 : 0;
  const tagline =
   site.texts
    .slice(taglineStart, taglineStart + 8)
    .map((text) => formatTagline(text.text))
    .find((value): value is string => Boolean(value)) ?? "";

 const headingOrder = site.texts.find((text) =>
SECTOR_HEADING.test(fold(text.text)))?.order ?? -1;
 const heroPool = headingOrder >= 0 ? site.photos.filter((photo) => photo.order <
headingOrder) : site.photos;
 const heroPhoto = pickHeroPhoto(heroPool.length > 0 ? heroPool : site.photos);

    const events: WalkEvent[] = [
      ...site.texts.map((text): WalkEvent => ({ kind: "text", order: text.order, text: text.text, fontPx: text.fontPx })),
      ...site.videos.map((asset): WalkEvent => ({ kind: "video", order: asset.order, asset })),
      ...site.photos
        .filter((photo) => photo.url !== heroPhoto?.url)
        .map((asset): WalkEvent => ({ kind: "photo", order: asset.order, asset })),
    ].sort((a, b) => a.order - b.order);

 // Un video pertenece al sector visto antes que él. Los botones del selector (~27px) no son
 // títulos: el título de sección trae fuente grande (>= 34px cuando el dato viene). Si dos
 // títulos seguidos preceden a los mismos videos, manda el primero y el otro se anota como
 // mezclado. Los sectores repetidos (versión móvil) se juntan.
 const groups = new Map<string, CanvaSector>();
 const mixedLabels: string[] = [];
 let current = "";
 for (const event of events) {
   if (event.kind === "text") {
     const bigEnough = event.fontPx === null || event.fontPx >= 34;
     if (event.order > headingOrder && bigEnough && isSectorLabel(event.text, name)) {
       const key = fold(event.text);
       const currentGroup = groups.get(current);
       if (current && currentGroup && currentGroup.videos.length === 0 && key !== current) {
         const label = displayLabel(event.text);
         if (!mixedLabels.includes(label)) mixedLabels.push(label);
       } else {
         current = key;
         if (!groups.has(current)) groups.set(current, { label: displayLabel(event.text), videos: [], photos: [] });
       }
     }
     continue;
   }
        let group = groups.get(current);
        if (!group) {
          group = { label: null, videos: [], photos: [] };
          groups.set(current, group);
        }
        if (event.kind === "video") group.videos.push(event.asset);
        else group.photos.push(event.asset);
    }

 const seen = new Set<string>();
 const paragraphs = site.texts
  .map((text) => text.text)
  .filter((text) => text.length >= 60 && text.split(/\s+/).length >= 8 &&
!SECTOR_HEADING.test(fold(text)))
  .filter((text) => {
    const key = fold(text);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

    return {
      name,
      tagline,
      paragraphs,
      heroPhoto,
      sectors: [...groups.values()].filter((group) => group.videos.length > 0),
      mixedLabels,
      videoCount: site.videos.length,
      contact: { instagram: site.instagram, tiktok: site.tiktok, email: site.email },
    };
}
