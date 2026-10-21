import { KNOWN_CANVA_FONTS } from "@/lib/portfolio/font-map";
import { NICHE_LABEL_MAX } from "@/lib/portfolio/niches";
import { LIMITS, type CanvaTheme } from "@/lib/portfolio/schema";

/*
 * Parser del sitio público de Canva. Funciones puras: sin fetch, sin Next, sin servidor. Las
usa la
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
 *
 * Importador v2 ("clonador fiel"): además del contenido se lee el DISEÑO (CanvaTheme):
bandas de color de ancho
 * completo, color de texto, acento, lado y marco de la foto del hero y las fuentes por rol. Las
imágenes ganan un
 * rol (hero, logo, metrics, ratecard, support, photo). Todo lo de diseño es tolerante: si algo
no se puede leer,
 * queda vacío y el tema sale null (el import se comporta como la v1). La confirmación de un
logo por sus píxeles
 * ocurre en la orquestación (aquí no hay bytes): este archivo solo propone candidatos.
 */

export class CanvaFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanvaFormatError";
  }
}

// ── El link
// ─────────────────────────────────────────────────────────
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

// ── Datos crudos del sitio
// ──────────────────────────────────────────
/** Rectángulo de un elemento en el lienzo (coordenadas del documento de Canva). */
export type CanvaBox = { x: number; y: number; w: number; h: number };

export type CanvaAsset = {
 /** URL absoluta en el sitio de Canva. */
 url: string;
 width: number | null;
  height: number | null;
  /** Posición en el documento (primera aparición). */
  order: number;
  /** Solo videos: la imagen asociada en el manifiesto de Canva, si la hay. */
  poster: string | null;
  /** v2: rectángulo del elemento en la página, si se pudo leer. */
  box?: CanvaBox | null;
  /** v2: el elemento trae marco (radio, borde o trazo). */
  framed?: boolean;
};

export type CanvaText = {
  text: string;
  order: number;
  /** Tamaño de fuente del estilo que sigue al texto en el documento, si se pudo leer. */
  fontPx: number | null;
  /** v2: color del texto (#RRGGBB), si se pudo leer. */
  color?: string | null;
  /** v2: nombre de la fuente tal como lo trae Canva ("Pinyon Script"), si se pudo leer. */
  font?: string | null;
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
  /** v2: colores de las bandas de ancho completo, en orden de aparición. */
  bands?: string[];
  /** v2: ancho del lienzo (p. ej. 1366), si se pudo deducir. */
  canvasWidth?: number | null;
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
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp:
"\u00A0" };

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

/** Lo de diseño nunca rompe el import: si falla, su valor por defecto. */
function safely<T>(read: () => T, fallback: T): T {
  try {
    return read();
  } catch {
    return fallback;
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

// ── Geometría (v2)
// ─────────────────────────────────────────────────
/** "clave": 123 o "clave": "123px" (los estilos de Canva traen px como texto, p. ej.
"G":"34px"). */
const NUMERIC_FIELD =
/"([A-Za-z_$][\w$]*)"\s*:\s*(?:(-?\d+(?:\.\d+)?)(?![\d.])|"(-?\d+(?:\.\d+)?)px")/g;

function numericFields(text: string): Map<string, number> {
 const fields = new Map<string, number>();
 for (const match of text.matchAll(NUMERIC_FIELD)) {
   const key = match[1].toLowerCase();
   const value = Number(match[2] ?? match[3]);
   if (!fields.has(key) && Number.isFinite(value)) fields.set(key, value);
 }
    return fields;
}

function numericValues(text: string): number[] {
  return [...text.matchAll(NUMERIC_FIELD)].map((match) => Number(match[2] ??
match[3])).filter(Number.isFinite);
}

const BOX_KEYS = { x: ["x", "left"], y: ["y", "top"], w: ["width", "w"], h: ["height", "h"] } as const;

function boxFrom(text: string): CanvaBox | null {
  const fields = numericFields(text);
  const pick = (keys: readonly string[]) => keys.map((key) => fields.get(key)).find((value) =>
value !== undefined);
  const x = pick(BOX_KEYS.x);
  const y = pick(BOX_KEYS.y);
  const w = pick(BOX_KEYS.w);
  const h = pick(BOX_KEYS.h);
  if (x === undefined || y === undefined || w === undefined || h === undefined || w <= 0 || h
<= 0) return null;
  return { x, y, w, h };
}

/** Rectángulo del elemento que referencia un asset: en su objeto o en su contenedor
inmediato. */
function elementBox(source: string, at: number): CanvaBox | null {
  const own = enclosingObject(source, at, 1500);
  if (!own) return null;
  const fromOwn = boxFrom(own.text);
  if (fromOwn || own.start === 0) return fromOwn;
  const parent = enclosingObject(source, own.start - 1, 1500);
  return parent && parent.text.length <= 4000 ? boxFrom(parent.text) : null;
}

/** ¿El elemento trae marco? Una clave de radio, esquina, borde o trazo con valor distinto
de cero. */
const FRAME_HINT = 
/"[\w$]*(?:radius|corner|stroke|border)[\w$]*"\s*:\s*(?!(?:0|null|false|"0(?:px)?"|"none"|"")\s*[,}\]])/i;

function hasFrame(source: string, at: number): boolean {
  const own = enclosingObject(source, at, 1500);
  return own ? FRAME_HINT.test(own.text) : false;
}

const ASSET_URL = /"url"\s*:\s*"(?:\.\/)?(_assets\/(video|media|images)\/[^"\\?#\s]+\.(mp4|jpe?g|png|webp))(?:[?#][^"\\]*)?"/gi;
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
    previous.box = previous.box ?? asset.box ?? null;
    previous.framed = Boolean(previous.framed || asset.framed);
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
    if (folder === "video" && !isVideo) continue; // imágenes sueltas de la carpeta de video:
// solo como póster
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
    let referencedAt: number | null = null;
    if (entryId) {
      const at = source.indexOf(`"${entryId}"`);
      if (at >= 0 && at < (object?.start ?? index) - 5) {
        order = at;
        referencedAt = at;
      }
    }
    let poster = isVideo ? posterNear(source, object, base) : null;
    if (isVideo && !poster && object) {
      const segment = source.slice(object.start, object.start + 4500);
      const timeline =
/"videoTimelines"\s*:\s*\[\s*\{[^}]*?"F"\s*:\s*"(_assets\/[^"]+)"/.exec(segment)?.[1];
      if (timeline) poster = absoluteAssetUrl(timeline, base);
    }
    // v2: la geometría vive en el elemento que referencia al asset (no en su entrada del
// manifiesto).
    const at = referencedAt;
    const asset: CanvaAsset = {
      url,
      width: numberField(scope, "width"),
      height: numberField(scope, "height"),
      order,
      poster,
      box: at !== null ? safely(() => elementBox(source, at), null) : null,
      framed: at !== null ? safely(() => hasFrame(source, at), false) : false,
    };
    (isVideo ? videos : photos).push(asset);
  }
  return { videos: uniqueByUrl(videos), photos: uniqueByUrl(photos) };
}

// ── Colores (v2)
// ───────────────────────────────────────────────────
const COLOR_LITERAL = /"(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}|rgba?\([^"()]{5,40}\))"/g;

/** "#fdcfd5", "#fff" o "rgb(253, 207, 213)" → "#FDCFD5". null si es transparente o no es un
color. */
function toHex(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  let match = /^#([0-9a-f]{6})$/.exec(value);
  if (match) return `#${match[1].toUpperCase()}`;
  match = /^#([0-9a-f]{3})$/.exec(value);
  if (match) return `#${[...match[1]].map((char) => char + char).join("").toUpperCase()}`;
  match =
/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([\d.]+))?\s*\)$/.exec(value);
  if (!match) return null;
  if (match[4] !== undefined && Number(match[4]) < 0.5) return null;
  const parts = [match[1], match[2], match[3]].map(Number);
  if (parts.some((part) => part > 255)) return null;
  return `#${parts.map((part) => part.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function saturationLightness(hex: string): { s: number; l: number } {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  return { s: d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)), l };
}

function weightedMode(entries: Iterable<[string, number]>): string | null {
  const totals = new Map<string, number>();
  for (const [key, weight] of entries) totals.set(key, (totals.get(key) ?? 0) + weight);
  let best: string | null = null;
  let bestWeight = 0;
  for (const [key, weight] of totals) {
    if (weight > bestWeight) {
      best = key;
      bestWeight = weight;
    }
  }
  return best;
}

/** Un arreglo con texto para personas adentro: el objeto es un texto, no una forma. */
const TEXT_PROBE = /\[\s*"[^"\\]*\p{L}[^"\\]*\s[^"\\]*"/u;
const MAX_BANDS = 24;

/**
 * Bandas de ancho completo: rectángulos con color de relleno que miden ≥ 90 % del ancho
del lienzo. No depende de
 * los nombres de las claves (Canva las minifica): se mira el color y los números del objeto
que lo rodea. El ancho
 * del lienzo es el valor grande que más se repite entre esas formas (1366 en la fixture). Los
colores que ya se
 * usaron como color de un texto no cuentan (`skip`).
 */
function collectBands(source: string, skip: Set<number>): { bands: string[]; canvasWidth:
number | null } {
  type Candidate = { color: string; order: number; values: number[] };
  const candidates: Candidate[] = [];
  for (const match of source.matchAll(COLOR_LITERAL)) {
    const index = match.index ?? 0;
    if (skip.has(index)) continue;
    const color = toHex(match[1]);
    if (!color) continue;
    // Atajo medido en el fixture: el rectángulo de fondo serializa su tamaño en
    // "C":{"A":ancho,"B":alto} inmediatamente ANTES del relleno "D":{"C":#hex} del
    // mismo elemento. La ventana hacia atrás lo captura aunque el objeto
    // contenedor sea un grupo con imágenes (el camino por scopes lo descarta).
    const back = source.slice(Math.max(0, index - 320), index);
    let ownSize: { width: number; height: number } | null = null;
    for (const size of back.matchAll(/"A":\s*(\d+(?:\.\d+)?)\s*,\s*"B":\s*(\d+(?:\.\d+)?)/g)) {
      const width = Number(size[1]);
      if (width >= 600) ownSize = { width, height: Number(size[2]) };
    }
    if (ownSize) {
      candidates.push({ color, order: index, values: [ownSize.width, ownSize.height] });
      continue;
    }
    let scope = enclosingObject(source, index, 800);
    let values: number[] = [];
    for (let depth = 0; scope && depth < 3; depth += 1) {
      if (scope.text.length > 2000 || scope.text.includes("_assets/") ||
TEXT_PROBE.test(scope.text)) {
        values = [];
        break;
      }
      values = numericValues(scope.text);
      if (values.some((value) => value >= 600)) break;
      scope = scope.start > 0 ? enclosingObject(source, scope.start - 1, 800) : null;
    }
    if (values.length > 0) candidates.push({ color, order: index, values });
    if (candidates.length > 5000) break;
  }

 const widths = new Map<number, number>();
 for (const candidate of candidates) {
   for (const value of new Set(candidate.values.map(Math.round))) {
     if (value >= 600) widths.set(value, (widths.get(value) ?? 0) + 1);
   }
 }
 let canvasWidth: number | null = null;
 let best = 0;
 for (const [value, hits] of widths) {
   if (hits > best || (hits === best && canvasWidth !== null && value > canvasWidth)) {
     canvasWidth = value;
     best = hits;
  }
 }
 if (canvasWidth === null) return { bands: [], canvasWidth: null };

  const width = canvasWidth;
  const bands: string[] = [];
  for (const candidate of candidates.sort((a, b) => a.order - b.order)) {
    if (!candidate.values.some((value) => value >= width * 0.9 && value <= width * 1.1))
continue;
    if (bands.at(-1) !== candidate.color) bands.push(candidate.color);
    if (bands.length >= MAX_BANDS) break;
  }
  return { bands, canvasWidth };
}

// ── Fuentes (v2)
// ───────────────────────────────────────────────────
type FontIndex = { names: Map<string, string>; ids: Map<string, string> };

const KNOWN_FONTS = new Map(KNOWN_CANVA_FONTS.map((name) =>
[name.toLowerCase(), name]));
const FONT_NAME = /^[A-Za-z][A-Za-z0-9 ]{1,40}$/;
const NOT_A_FAMILY =

/^(?:serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif|emoji|math|fangsong|inherit|initial|unset|bold|bolder|lighter|normal|italic|oblique|regular|light|medium|semibold|black|thin|none|auto)$/i;
const FONT_KEY_FIELD =
/"(?:[\w$]*family|[\w$]*typeface|font|fontName|font_name)"\s*:\s*"([^"\\]{2,40})"/gi;
const SHORT_LITERAL = /"([^"\\]{2,40})"/g;
const FONT_ID = /^([A-Za-z][A-Za-z0-9_-]{7,15})(?:[,:]\d{1,3})?$/;

/** Ids ofuscados de fuente de Canva ("YAFdJjbTu24", "YAFdJjbTu24,0"): mezcla de
mayúsculas o dígitos. */
function fontIdOf(literal: string): string | null {
  const match = FONT_ID.exec(literal);
  if (!match) return null;
  const id = match[1];
  return /\d/.test(id) || id.replace(/[^A-Z]/g, "").length >= 3 ? id : null;
}

/** Los recursos de fuente del documento: {"A":"<id>","B":0,"C":"<nombre>","D":[variantes]}.
 * Es la tabla EXACTA id → nombre; tolera comillas escapadas (el documento viaja
 * en dos serializaciones). */
const FONT_RESOURCE =
  /\\?"A\\?"\s*:\s*\\?"([A-Za-z0-9_-]{8,16})\\?"\s*,\s*\\?"B\\?"\s*:\s*\d+\s*,\s*\\?"C\\?"\s*:\s*\\?"([A-Za-z][A-Za-z0-9 ]{1,40})\\?"/g;

/** La tabla de fuentes del documento: nombres (CSS, claves de familia, nombres
conocidos) e ids → nombre. */
function buildFontIndex(html: string, source: string): FontIndex {
  const names = new Map<string, string>();
  const tableIds = new Map<string, string>();
  // Semilla exacta: la tabla de recursos manda sobre cualquier heurística
  // (sin esto, fuentes fuera de la lista conocida — Perandory, Hagrid — no
  // resuelven y el tema sale sin tipografía).
  for (const match of source.matchAll(FONT_RESOURCE)) {
    const name = match[2].trim().replace(/\s+/g, " ");
    if (!FONT_NAME.test(name) || NOT_A_FAMILY.test(name)) continue;
    tableIds.set(match[1], name);
    if (!names.has(name.toLowerCase())) names.set(name.toLowerCase(), name);
  }
  const add = (raw: string) => {
   const name = raw.replace(/["']/g, "").trim().replace(/\s+/g, " ");
   const lower = name.toLowerCase();
      if (!FONT_NAME.test(name) || NOT_A_FAMILY.test(name)) return;
      if (!KNOWN_FONTS.has(lower) && (/\d/.test(name) || fontIdOf(name))) return;
      if (!names.has(lower)) names.set(lower, KNOWN_FONTS.get(lower) ?? name);
    };
    for (const match of html.matchAll(/font-family\s*:\s*([^;{}]+)/gi)) add(match[1].split(",")[0]);
    for (const match of source.matchAll(FONT_KEY_FIELD)) add(match[1]);
    for (const match of source.matchAll(SHORT_LITERAL)) {
      if (KNOWN_FONTS.has(match[1].toLowerCase())) add(match[1]);
    }

    const ids = new Map<string, string>(tableIds);
    for (const name of new Set(names.values())) {
      let from = 0;
      for (let hits = 0; hits < 20; hits += 1) {
        const at = source.indexOf(`"${name}"`, from);
        if (at < 0) break;
        from = at + name.length + 2;
        const object = enclosingObject(source, at, 600);
        if (!object || object.text.length > 1200) continue;
        for (const literal of object.text.matchAll(SHORT_LITERAL)) {
          const id = fontIdOf(literal[1]);
          if (id && id.toLowerCase() !== name.toLowerCase() && !ids.has(id)) ids.set(id, name);
        }
      }
    }
    return { names, ids };
}

function fontIn(region: string, index: FontIndex): string | null {
  for (const literal of region.matchAll(SHORT_LITERAL)) {
    const byName = index.names.get(literal[1].toLowerCase());
    if (byName) return byName;
    const id = fontIdOf(literal[1]);
    const byId = id ? index.ids.get(id) : undefined;
    if (byId) return byId;
  }
  return null;
}

// ── Textos
// ─────────────────────────────────────────────────────────
const STRING_ARRAY = /\[\s*"(?:[^"\\]|\\.)*"(?:\s*,\s*"(?:[^"\\]|\\.)*")*\s*\]/g;
const STRING_LITERAL = /"((?:[^"\\]|\\.)*)"/g;

const cleanText = (raw: string) =>
 raw
  .replace(/\\n/g, "\n")
  .replace(/\\u([0-9a-fA-F]{4})/g, (_whole, hex: string) => String.fromCodePoint(parseInt(hex,
16)))
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

/** v2: el color y la fuente del estilo que sigue a un texto. `colorAt` = posición del color (no es
una banda). */
const STYLE_SPAN = 600;

function readTextStyle(source: string, from: number, fonts: FontIndex | null) {
  const region = source.slice(from, from + STYLE_SPAN);
  let color: string | null = null;
  let colorAt: number | null = null;
  for (const match of region.matchAll(COLOR_LITERAL)) {
    const hex = toHex(match[1]);
    if (hex) {
      color = hex;
      colorAt = from + (match.index ?? 0);
      break;
    }
  }
  const font = fonts ? safely(() => fontIn(region, fonts), null) : null;
  return { color, colorAt, font };
}
function collectTexts(source: string, fonts: FontIndex | null): { texts: CanvaText[];
colorIndexes: Set<number> } {
  const texts: CanvaText[] = [];
  const colorIndexes = new Set<number>();
  for (const array of source.matchAll(STRING_ARRAY)) {
    const start = array.index ?? 0;
    const font = /"G":"([\d.]+)px"/.exec(source.slice(start, start + 900));
    const fontPx = font ? Number(font[1]) : null;
    let style: ReturnType<typeof readTextStyle> | null = null;
    for (const literal of array[0].matchAll(STRING_LITERAL)) {
      const text = cleanText(decodeJsonString(literal[1]));
      if (!isHumanText(text)) continue;
      style ??= readTextStyle(source, start + array[0].length, fonts);
      if (style.colorAt !== null) colorIndexes.add(style.colorAt);
      texts.push({ text, order: start + (literal.index ?? 0), fontPx, color: style.color, font:
style.font });
    }
  }
  return { texts, colorIndexes };
}

// ── Contacto
// ────────────────────────────────────────────────────────
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
 const fonts = safely(() => buildFontIndex(html, source), null);
 const { texts, colorIndexes } = collectTexts(source, fonts);
 if (videos.length === 0 && texts.length === 0) {
    throw new CanvaFormatError("No encontramos ni textos ni videos en el contenido del sitio.");
 }
 const { bands, canvasWidth } = safely(() => collectBands(source, colorIndexes), {
    bands: [] as string[],
    canvasWidth: null as number | null,
 });
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
      bands,
      canvasWidth,
    };
}

// ── Lectura del portafolio
// ──────────────────────────────────────────
export type CanvaSector = {
  /** Nombre del sector tal como se muestra ("Lugares", "Canvas UGC"); null = videos antes
del primer sector. */
  label: string | null;
  videos: CanvaAsset[];
  /** Fotos del sector (sin la foto principal): respaldo de portada. */
  photos: CanvaAsset[];
};

/** v2 · R4/R5: una imagen que podría ser un logo (se confirma por sus píxeles al importar)
y su video, si es seguro. */
export type CanvaLogoCandidate = { asset: CanvaAsset; videoUrl: string | null };

export type CanvaHeadings = { sectors: string | null; bio: string | null; metrics: string | null;
contact: string | null };

export type CanvaPortfolio = {
  name: string;
  tagline: string;
  /** Párrafos largos de presentación (bio, "¿Por qué yo?"), en orden y sin repetir. */
  paragraphs: string[];
  heroPhoto: CanvaAsset | null;
  /** Solo los que tienen al menos un video, en orden de documento. */
  sectors: CanvaSector[];
  /** Títulos de sector que no se pudieron separar del anterior (sus videos quedaron juntos).
*/
  mixedLabels: string[];
  videoCount: number;
  contact: { instagram: string | null; tiktok: string | null; email: string | null };
  /** v2 · R1: el diseño. null = no se pudo leer (el import se comporta como la v1). */
  theme: CanvaTheme | null;
  /** v2 · R5: candidatos a logo, con su video si la geometría lo asocia sin dudas. */
  logoCandidates: CanvaLogoCandidate[];
  /** v2 · R6: capturas bajo la sección de métricas. */
  metricsPhotos: CanvaAsset[];
  /** v2 · R6: el tarifario (la imagen grande bajo contacto). */
  rateCard: CanvaAsset | null;
  /** v2 · R6: foto de apoyo de la bio ("¿Por qué yo?"). */
  supportPhoto: CanvaAsset | null;
  /** v2 · R6: foto de apoyo del selector de sectores. */
  selectorPhoto: CanvaAsset | null;
  /** v2: los títulos de sección tal como los escribió ("Elige un sector…", "¿Por qué yo?",
"CONTACTO"). */
  headings: CanvaHeadings;
};

const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu,
"").toLowerCase().replace(/\s+/g, " ").trim();

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
  if (name) {
    const folded = fold(text);
    // Ni su nombre completo ni UNA palabra de su nombre ("MARIA" en su portada
    // no es un sector): en presentaciones el nombre se repite en cada lámina.
    if (folded === fold(name)) return false;
    if (fold(name).split(" ").filter(Boolean).includes(folded)) return false;
  }
  return isAllCaps(text) || words.every((word) => isAllCaps(word) ||
/^\p{Lu}\p{Ll}*$/u.test(word));
}

// v2: secciones que NO son sectores ("¿Por qué yo?", "METRICAS", "CONTACTO").
type SectionKind = "bio" | "metrics" | "contact" | "brands";
const SECTION_PATTERNS: readonly [SectionKind, RegExp][] = [
  ["brands", /^(?:brands|marcas)\b/],
  ["bio", /^(?:por que (?:yo|elegirme|trabajar conmigo)|sobre mi|quien soy|acerca de mi|conoceme|about(?: me)?|me)\b/],
  ["metrics", /^(?:mis )?(?:metricas|estadisticas|resultados|numeros|analiticas)\b/],
  ["contact", /^(?:contacto|contactame|contratame|hablemos|trabajemos(?: juntos)?|trabaja conmigo)\b/],
];
/** Un título de sección trae fuente grande (si el dato viene). */
const SECTION_MIN_PX = 28;

function sectionKind(text: string): SectionKind | null {
  if (text.includes("\n") || text.length > 40) return null;
  const key = fold(text).replace(/^[¿¡"'«\s]+/, "").replace(/[?!.:»"'\s]+$/, "");
  return SECTION_PATTERNS.find(([, pattern]) => pattern.test(key))?.[0] ?? null;
}

/** El primer título de cada sección después del hero (un "Contrátame" del hero no cuenta).
*/
function findSections(texts: CanvaText[], after: number): Partial<Record<SectionKind,
CanvaText>> {
  const found: Partial<Record<SectionKind, CanvaText>> = {};
  for (const text of texts) {
    if (text.order <= after || (text.fontPx !== null && text.fontPx < SECTION_MIN_PX))
continue;
    const kind = sectionKind(text.text);
    if (kind && !found[kind]) found[kind] = text;
  }
  return found;
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

/** v2 · R5: tamaño compatible con un logo (lado mayor ≤ 800). Sin medidas, decide la
revisión por píxeles. */
function isLogoSized(asset: CanvaAsset): boolean {
  const size = dims(asset);
  if (!size) return true;
  return Math.max(size.w, size.h) <= 800 && Math.max(size.w, size.h) / Math.min(size.w,
size.h) <= 3;
}

/** Margen de la asociación logo↔video: el rectángulo del video expandido un 15 % (7,5 %
por lado). */
const LOGO_REACH = 0.075;

/** El video sobre el que está el logo (su centro dentro del video). null si no hay geometría o
si hay dudas. */
function associateLogo(logo: CanvaAsset, videos: CanvaAsset[]): string | null {
  if (!logo.box) return null;
  const cx = logo.box.x + logo.box.w / 2;
  const cy = logo.box.y + logo.box.h / 2;
    const hits = videos.filter((video) => {
      if (!video.box) return false;
      const { x, y, w, h } = video.box;
      const dx = w * LOGO_REACH;
      const dy = h * LOGO_REACH;
      return cx >= x - dx && cx <= x + w + dx && cy >= y - dy && cy <= y + h + dy;
    });
    return hits.length === 1 ? hits[0].url : null;
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

/** Fuente de un conjunto de textos (la que más texto cubre). */
const fontOf = (texts: CanvaText[], weigh: (text: CanvaText) => number = () => 1) =>
  weightedMode(texts.flatMap((text) => (text.font ? [[text.font, weigh(text)] as [string,
number]] : [])));

const FONT_SAFE = /^[A-Za-z0-9 ]{1,60}$/;
const safeFont = (font: string | null) => (font && FONT_SAFE.test(font) ? font : null);

/** v2 · R1: el tema. null si no hay color de hero (sin bandas no hay nada que clonar). */
function buildTheme(
  site: CanvaSiteData,
  context: {
    heroPhoto: CanvaAsset | null;
    nameText: CanvaText | null;
    heroTexts: CanvaText[];
    headingTexts: CanvaText[];
    paragraphTexts: CanvaText[];
  },
): CanvaTheme | null {
  const bands = (site.bands ?? []).slice(0, MAX_BANDS);
    const heroBg = bands[0] ?? null;
    if (!heroBg) return null;

  const colored = site.texts.flatMap((text) => (text.color ? [[text.color, text.text.length] as
[string, number]] : []));
  const inkColor = weightedMode(colored);
  const accentColor = weightedMode(
    colored.filter(([color]) => {
      if (color === inkColor) return false;
      const { s, l } = saturationLightness(color);
      return s >= 0.55 && l >= 0.3 && l <= 0.75;
    }),
  );

  const { heroPhoto } = context;
  const width = site.canvasWidth ?? null;
  const heroSide: CanvaTheme["heroSide"] =
   heroPhoto?.box && width ? (heroPhoto.box.x + heroPhoto.box.w / 2 <= width / 2 ? "left" :
"right") : "left";

 const biggest = [...context.heroTexts].sort((a, b) => (b.fontPx ?? 0) - (a.fontPx ?? 0))[0];
 const display = safeFont(context.nameText?.font ?? biggest?.font ?? null);
 const headings = safeFont(
   fontOf(context.headingTexts.filter((text) => text.font !== display)) ??
fontOf(context.headingTexts),
 );
 const body = safeFont(fontOf(context.paragraphTexts, (text) => text.text.length));

    return {
      bands,
      heroBg,
      inkColor,
      accentColor,
      heroSide,
      heroFramed: Boolean(heroPhoto?.framed),
      fonts: { display, headings, body },
    };
}

type WalkEvent =
  | { kind: "text"; order: number; text: string; fontPx: number | null }
  | { kind: "video"; order: number; asset: CanvaAsset }
  | { kind: "photo"; order: number; asset: CanvaAsset };

type Region = "hero" | "selector" | "work" | SectionKind;

const heading = (text: string | undefined) => (text ? text.replace(/\s+/g, " ").trim().slice(0, 80)
|| null : null);
/** Datos crudos → lo que el import necesita: nombre, tagline, textos, foto principal, sectores
con sus videos y el diseño. */
export function readCanvaPortfolio(site: CanvaSiteData): CanvaPortfolio {
  const { name, index: nameIndex } = findName(site);
  const taglineStart = nameIndex >= 0 ? nameIndex + 1 : 0;
  const tagline =
   site.texts
    .slice(taglineStart, taglineStart + 8)
    .map((text) => formatTagline(text.text))
    .find((value): value is string => Boolean(value)) ?? "";

 const sectorHeading = site.texts.find((text) => SECTOR_HEADING.test(fold(text.text)));
 const headingOrder = sectorHeading?.order ?? -1;
 const nameText = nameIndex >= 0 ? site.texts[nameIndex] : null;
 const heroPool = headingOrder >= 0 ? site.photos.filter((photo) => photo.order <
headingOrder) : site.photos;
 const heroPhoto = pickHeroPhoto(heroPool.length > 0 ? heroPool : site.photos);

 // v2: secciones y regiones de la página, para darle un rol a cada imagen (R6).
 const sections = findSections(site.texts, Math.max(headingOrder, nameText?.order ?? -1));
 const sectionOrders = new Set(Object.values(sections).map((text) => text.order));
 const bigEnough = (text: CanvaText) => text.fontPx === null || text.fontPx >= 34;
 const labelTexts = site.texts.filter(
   (text) => text.order > headingOrder && bigEnough(text) && isSectorLabel(text.text, name)
&& !sectionKind(text.text),
 );
 const marks: { region: Region; order: number }[] = [
   ...(headingOrder >= 0 ? [{ region: "selector" as const, order: headingOrder }] : []),
   ...(labelTexts[0] ? [{ region: "work" as const, order: labelTexts[0].order }] : []),
   ...(Object.entries(sections) as [SectionKind, CanvaText][]).map(([region, text]) => ({ region,
order: text.order })),
 ].sort((a, b) => a.order - b.order);
 const regionOf = (order: number): Region => marks.filter((mark) => mark.order <
order).at(-1)?.region ?? "hero";

 const metricsPhotos: CanvaAsset[] = [];
 const contactPhotos: CanvaAsset[] = [];
 const candidates: CanvaAsset[] = [];
 let supportPhoto: CanvaAsset | null = null;
 let selectorPhoto: CanvaAsset | null = null;
 for (const photo of site.photos) {
   if (photo.url === heroPhoto?.url) continue;
   const region = regionOf(photo.order);
   if (region === "metrics") metricsPhotos.push(photo);
   else if (region === "contact") contactPhotos.push(photo);
   else if (region === "bio" && !supportPhoto && !isLogoSized(photo)) supportPhoto = photo;
   else if (region === "selector" && !selectorPhoto && !isLogoSized(photo)) selectorPhoto =
photo;
   else if (isLogoSized(photo)) candidates.push(photo);
 }
 // El tarifario: la imagen más grande bajo contacto (si no hay otra señal, basta la sección).
// Las chicas pueden ser logos.
 const rateCard = [...contactPhotos].sort((a, b) => area(b) - area(a) || a.order - b.order)[0] ??
null;
 for (const photo of contactPhotos) if (photo !== rateCard && isLogoSized(photo))
candidates.push(photo);
 const reserved = new Set([...metricsPhotos, rateCard, supportPhoto,
selectorPhoto].flatMap((asset) => (asset ? [asset.url] : [])));

 const events: WalkEvent[] = [
   ...site.texts.map((text): WalkEvent => ({ kind: "text", order: text.order, text: text.text, fontPx:
text.fontPx })),
   ...site.videos.map((asset): WalkEvent => ({ kind: "video", order: asset.order, asset })),
   ...site.photos
     .filter((photo) => photo.url !== heroPhoto?.url && !reserved.has(photo.url))
     .map((asset): WalkEvent => ({ kind: "photo", order: asset.order, asset })),
 ].sort((a, b) => a.order - b.order);

  // Un video pertenece al sector visto antes que él. Los botones del selector (~27px) no son
  // títulos: el título de sección trae fuente grande (>= 34px cuando el dato viene). Si dos
  // títulos seguidos preceden a los mismos videos, manda el primero y el otro se anota
// como
  // mezclado. Los sectores repetidos (versión móvil) se juntan.
  // v2: "¿Por qué yo?", "METRICAS" o "CONTACTO" cierran el último sector: lo que sigue
// queda sin sector.
  const groups = new Map<string, CanvaSector>();
  const mixedLabels: string[] = [];
  let current = "";
  for (const event of events) {
    if (event.kind === "text") {
      if (sectionOrders.has(event.order)) {
        current = "";
        continue;
      }
      const isBig = event.fontPx === null || event.fontPx >= 34;
      if (event.order > headingOrder && isBig && isSectorLabel(event.text, name) &&
!sectionKind(event.text)) {
        const key = fold(event.text);
        const currentGroup = groups.get(current);
        if (current && currentGroup && currentGroup.videos.length === 0 && key !== current) {
          const label = displayLabel(event.text);
          if (!mixedLabels.includes(label)) mixedLabels.push(label);
        } else {
          current = key;
         if (!groups.has(current)) groups.set(current, { label: displayLabel(event.text), videos: [],
photos: [] });
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
 const isParagraph = (text: string) => text.length >= 60 && text.split(/\s+/).length >= 8 &&
!SECTOR_HEADING.test(fold(text));
 const paragraphs = site.texts
  .map((text) => text.text)
  .filter(isParagraph)
  .filter((text) => {
    const key = fold(text);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

 const theme = safely(
   () =>
     buildTheme(site, {
       heroPhoto,
       nameText,
       heroTexts: site.texts.filter((text) => headingOrder < 0 || text.order < headingOrder),
       headingTexts: [...labelTexts, ...Object.values(sections)],
       paragraphTexts: site.texts.filter((text) => isParagraph(text.text)),
     }),
   null,
 );

 return {
  name,
  tagline,
  paragraphs,
  heroPhoto,
  sectors: [...groups.values()].filter((group) => group.videos.length > 0),
  mixedLabels,
  videoCount: site.videos.length,
    contact: { instagram: site.instagram, tiktok: site.tiktok, email: site.email },
    theme,
    logoCandidates: candidates.map((asset) => ({ asset, videoUrl: associateLogo(asset,
site.videos) })),
    metricsPhotos,
    rateCard,
    supportPhoto,
    selectorPhoto,
    headings: {
      sectors: heading(sectorHeading?.text),
      bio: heading(sections.bio?.text),
      metrics: heading(sections.metrics?.text),
      contact: heading(sections.contact?.text),
    },
  };
}
