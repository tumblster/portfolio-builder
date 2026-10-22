import { KNOWN_CANVA_FONTS } from "@/lib/portfolio/font-map";  
import { NICHE_LABEL_MAX } from "@/lib/portfolio/niches";  
import { LIMITS, type CanvaTheme } from "@/lib/portfolio/schema";

/*  
 * Parser del sitio público de Canva. Funciones puras: sin fetch, sin Next, sin servidor. Las usa la  
 * orquestación (canva-import.ts), la pantalla de importación (validar el link) y las pruebas con el HTML guardado.  
 *  
 * Contrato verificado contra un sitio real (16/10 y 20/10):  
 * - El HTML no trae DOM renderizado: todo el contenido vive en un JSON interno.  
 * - Videos: "url":"_assets/video/<hash>.mp4" con width/height. Fotos reales: _assets/media/*. Íconos y  
 *   decoración: _assets/images/* (no son fotos; solo se miran como posible textura de fondo).  
 *   URL absoluta = base del sitio + ruta relativa.  
 * - Textos: arreglos de strings dentro del JSON, en orden de documento.  
 * - Sectores: etiquetas cortas que preceden a sus videos después de "Elige un sector para ver mis videos".  
 *   Un video pertenece al último sector visto antes que él.  
 * Nada se inventa: lo que no se encuentra queda vacío. Si el formato no calza, se lanza CanvaFormatError.  
 *  
 * Importador v2 ("clonador fiel"): además del contenido se lee el DISEÑO (CanvaTheme). Las imágenes ganan un rol  
 * (hero, logo, metrics, ratecard, support, photo). La confirmación de un logo por sus píxeles ocurre en la  
 * orquestación (aquí no hay bytes): este archivo solo propone candidatos.  
 *  
 * Ronda 14 (universal; todo umbral es una constante con nombre):  
 * - LÁMINAS: fondos de color de ancho completo, cada uso de la textura repetida y las imágenes a sangre que arrancan  
 *   en la esquina de su lámina.  
 * - ZONAS: Métricas, Testimonios, Fotos, Razón y Contacto, con títulos en español e inglés.  
 * - LENGUAJE del tema, medido: textura, marcos de línea fina, titulares en mayúsculas y aire lateral.  
 *  
 * Ronda 14B (correcciones medidas):  
 * - El RECORRIDO DE SECTORES usa exactamente las entradas verificadas antes de la ronda 14: los cierres de sector  
 *   salen de la detección de secciones original y el video del cierre se saca DESPUÉS de agrupar.  
 * - CONTACTO es la unión de su lámina, su tramo hasta el siguiente título y la región que tenía antes; el tarifario  
 *   tiene además un respaldo con la detección original.  
 * - LOCALIDAD: Métricas, Testimonios y Fotos nunca cruzan un video y una zona con más del doble de su límite de  
 *   imágenes es un error de lectura: se anula y sus imágenes siguen el flujo normal.  
 * - Fotos: las imágenes con tamaño de logo de esa zona también son candidatas a logo.  
 * - PRUEBA POR CONTENIDO: todo lo de las zonas de prueba y de Fotos, más las imágenes de láminas sin título, va a  
 *   `proofPool` para que el import las clasifique con visión.  
 *  
 * Ronda 14C: el aviso de sectores mezclados solo lo genera un texto con JERARQUÍA DE TÍTULO DE SECTOR, medida contra  
 * los títulos de sector confirmados del mismo diseño (los que terminan con videos propios): su tamaño propio, o su  
 * familia tipográfica si no hay tamaño. Un epígrafe o el título de un video puntual no es sector ni aviso. Sin señal  
 * comparable el aviso se conserva (no se esconde un problema real). El recorrido y las zonas no cambian.  
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
    url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${ value }`);  
  } catch {  
    return { ok: false, error: NOT_A_CANVA_SITE };  
  }  
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, error: NOT_A_CANVA_SITE };  
  const host = url.hostname.toLowerCase();  
  if (host === "canva.com" || host.endsWith(".canva.com")) return { ok: false, error: CANVA_DESIGN_LINK };

  if (!isCanvaSiteHost(host) || url.username || url.password || url.port) return { ok: false, error: NOT_A_CANVA_SITE };  
  url.protocol = "https:";  
  url.search = "";  
  url.hash = "";  
  if (!url.pathname.endsWith("/")) url.pathname = `${ url.pathname }/`;  
  return { ok: true, url: url.toString() };  
}

// ── Datos crudos del sitio ──────────────────────────────────────────  
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
  /** Ronda 14: TODAS las posiciones donde el documento usa este asset (una por lámina en un fondo repetido). */  
  refs?: number[];  
};

export type CanvaText = {  
  text: string;  
  order: number;  
  /** Tamaño de fuente del estilo que sigue al texto en el documento, si se pudo leer. */  
  fontPx: number | null;  
  /**  
   * Ronda 14C: tamaño de fuente leído DENTRO del propio objeto del texto (nunca del elemento vecino). Solo se usa para  
   * la jerarquía de títulos de sector; las zonas siguen con `fontPx`.  
   */  
  ownPx?: number | null;  
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
  /** Ronda 14: posición en el documento donde empieza cada banda (fondo de ancho completo), en orden. */  
  bandStarts?: number[];  
  /** Ronda 14: imágenes de decoración (_assets/images): solo candidatas a textura de fondo. */  
  decor?: CanvaAsset[];  
  /** Ronda 14: posiciones de líneas finas (≤ 4 px de grosor y ≥ 200 px de largo). */  
  lines?: number[];  
};

const count = (text: string, pattern: RegExp) => text.match(pattern)?.length ?? 0;

/** El JSON interno a veces viene escapado dentro de un string de JS: se deja legible para los patrones. */  
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
      const value = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);  
      return Number.isFinite(value) && value > 0 && value < 0x110000 ? String.fromCodePoint(value) : whole;  
    }  
    return ENTITIES[code.toLowerCase()] ?? whole;  
  });  
}

function decodeJsonString(raw: string): string {  
  try {  
    return JSON.parse(`"${ raw }"`) as string;  
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

/** El objeto JSON que rodea una posición (conteo de llaves, acotado). null si no se encuentra. */  
function enclosingObject(source: string, index: number, maxSpan = 3000): JsonObject | null {  
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
  const match = new RegExp('"' + key + '"\\s*:\\s*(\\d+(?:\\.\\d+)?)').exec(scope);  
  const value = match ? Math.round(Number(match[1])) : 0;  
  return value > 0 ? value : null;  
}

// ── Geometría (v2) ──────────────────────────────────────────────────  
/** "clave": 123 o "clave": "123px" (los estilos de Canva traen px como texto, p. ej. "G":"34px"). */  
const NUMERIC_FIELD = /"([A-Za-z_$][\w$]*)"\s*:\s*(?:(-?\d+(?:\.\d+)?)(?![\d.])|"(-?\d+(?:\.\d+)?)px")/g;

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
  return [...text.matchAll(NUMERIC_FIELD)].map((match) => Number(match[2] ?? match[3])).filter(Number.isFinite);  
}

const BOX_KEYS = { x: ["x", "left"], y: ["y", "top"], w: ["width", "w"], h: ["height", "h"] } as const;

function boxFrom(text: string): CanvaBox | null {  
  const fields = numericFields(text);  
  const pick = (keys: readonly string[]) => keys.map((key) => fields.get(key)).find((value) => value !== undefined);  
  const x = pick(BOX_KEYS.x);  
  const y = pick(BOX_KEYS.y);  
  const w = pick(BOX_KEYS.w);  
  const h = pick(BOX_KEYS.h);  
  if (x === undefined || y === undefined || w === undefined || h === undefined || w <= 0 || h <= 0) return null;  
  return { x, y, w, h };  
}

/** Rectángulo del elemento que referencia un asset: en su objeto o en su contenedor inmediato. */  
function elementBox(source: string, at: number): CanvaBox | null {  
  const own = enclosingObject(source, at, 1500);  
  if (!own) return null;  
  const fromOwn = boxFrom(own.text);  
  if (fromOwn || own.start === 0) return fromOwn;  
  const parent = enclosingObject(source, own.start - 1, 1500);  
  return parent && parent.text.length <= 4000 ? boxFrom(parent.text) : null;  
}

/** ¿El elemento trae marco? Una clave de radio, esquina, borde o trazo con valor distinto de cero. */  
const FRAME_HINT =  
  /"[\w$]*(?:radius|corner|stroke|border)[\w$]*"\s*:\s*(?!(?:0|null|false|"0(?:px)?"|"none"|"")\s*[,}\]])/i;

function hasFrame(source: string, at: number): boolean {  
  const own = enclosingObject(source, at, 1500);  
  return own ? FRAME_HINT.test(own.text) : false;  
}

const ASSET_URL = /"url"\s*:\s*"(?:\.\/)?(_assets\/(video|media|images)\/[^"\\?#\s]+\.(mp4|jpe?g|png|webp))(?:[?#][^"\\]*)?"/gi;  
const IMAGE_PATH = /"(?:\.\/)?(_assets\/(?:media|video)\/[^"\\?#\s]+\.(?:jpe?g|png|webp))(?:[?#][^"\\]*)?"/i;  
const VIDEO_PATH = /_assets\/video\/[^"\\?#\s]+\.mp4/gi;  
/** Un contenedor más grande que esto ya no es "el elemento de video" (es una página o una sección). */  
const POSTER_SCOPE_MAX = 3000;  
/** Ronda 14: cuántas referencias de un asset se guardan (un fondo repetido aparece una vez por lámina). */  
const MAX_REFS = 64;

/** La imagen asociada a un video en el manifiesto: dentro de su objeto o del contenedor que solo lo tiene a él. */  
function posterNear(source: string, object: JsonObject | null, base: string): string | null {  
  if (!object) return null;  
  const own = IMAGE_PATH.exec(object.text)?.[1];  
  if (own) return absoluteAssetUrl(own, base);  
  if (object.start === 0) return null;  
  const parent = enclosingObject(source, object.start - 1);  
  if (!parent || parent.text.length > POSTER_SCOPE_MAX || count(parent.text, VIDEO_PATH) !== 1) return null;  
  const path = IMAGE_PATH.exec(parent.text)?.[1];  
  return path ? absoluteAssetUrl(path, base) : null;  
}

const area = (asset: CanvaAsset) => (asset.width ?? 0) * (asset.height ?? 0);

/** Deduplica por URL: conserva la primera aparición y la mayor resolución; junta todas las referencias. */  
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
    previous.refs = [...new Set([...(previous.refs ?? []), ...(asset.refs ?? [])])].sort((a, b) => a - b).slice(0, MAX_REFS);  
  }  
  return [...byUrl.values()].sort((a, b) => a.order - b.order);  
}

function collectAssets(source: string, base: string): { videos: CanvaAsset[]; photos: CanvaAsset[]; decor: CanvaAsset[] } {  
  const videos: CanvaAsset[] = [];  
  const photos: CanvaAsset[] = [];  
  const decor: CanvaAsset[] = [];  
  for (const match of source.matchAll(ASSET_URL)) {  
    const [, path, folder, extension] = match;  
    const isDecor = folder === "images"; // íconos y decoración: solo como posible textura  
    const isVideo = folder === "video" && extension.toLowerCase() === "mp4";  
    if (folder === "video" && !isVideo) continue; // imágenes sueltas de la carpeta de video: solo como póster  
    if (isDecor && extension.toLowerCase() === "mp4") continue;  
    const url = absoluteAssetUrl(path, base);  
    if (!url) continue;  
    const index = match.index ?? 0;  
    const object = enclosingObject(source, index);  
    const scope = object?.text ?? source.slice(Math.max(0, index - 200), index + 400);  
    // El árbol del documento referencia cada asset por el id de su entrada del manifiesto:  
    // la primera aparición de ese id (antes de la entrada misma) es su posición en la página.  
    // Ronda 14: se guardan TODAS esas apariciones (un fondo repetido = una por lámina).  
    const before = source.slice(Math.max(0, index - 600), index);  
    const entryId = [...before.matchAll(/"id"\s*:\s*"([A-Za-z0-9_]+)"/g)].at(-1)?.[1];  
    let order = index;  
    let referencedAt: number | null = null;  
    const refs: number[] = [];  
    if (entryId) {  
      const needle = '"' + entryId + '"';  
      const limit = (object?.start ?? index) - 5;  
      let from = 0;  
      while (refs.length < MAX_REFS) {  
        const at = source.indexOf(needle, from);  
        if (at < 0 || at >= limit) break;  
        refs.push(at);  
        from = at + needle.length;  
      }  
      if (refs.length > 0) {  
        order = refs[0];  
        referencedAt = refs[0];  
      }  
    }  
    let poster = isVideo ? posterNear(source, object, base) : null;  
    if (isVideo && !poster && object) {  
      const segment = source.slice(object.start, object.start + 4500);  
      const timeline = /"videoTimelines"\s*:\s*\[\s*\{[^}]*?"F"\s*:\s*"(_assets\/[^"]+)"/.exec(segment)?.[1];  
      if (timeline) poster = absoluteAssetUrl(timeline, base);  
    }  
    // v2: la geometría vive en el elemento que referencia al asset (no en su entrada del manifiesto).  
    const at = referencedAt;  
    const asset: CanvaAsset = {  
      url,  
      width: numberField(scope, "width"),  
      height: numberField(scope, "height"),  
      order,  
      poster,  
      box: at !== null ? safely(() => elementBox(source, at), null) : null,  
      framed: at !== null ? safely(() => hasFrame(source, at), false) : false,  
      refs,  
    };  
    (isVideo ? videos : isDecor ? decor : photos).push(asset);  
  }  
  return { videos: uniqueByUrl(videos), photos: uniqueByUrl(photos), decor: uniqueByUrl(decor) };  
}

// ── Colores (v2) ────────────────────────────────────────────────────  
const COLOR_LITERAL = /"(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}|rgba?${[}^{"}()]5,40$)"/g;

const hexByte = (value: number) => value.toString(16).padStart(2, "0");

/** "#fdcfd5", "#fff" o "rgb(253, 207, 213)" → "#FDCFD5". null si es transparente o no es un color. */  
function toHex(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  let match = /^#([0-9a-f]{6})$/.exec(value);
  if (match) return "#" + match[1].toUpperCase();
  match = /^#([0-9a-f]{3})$/.exec(value);
  if (match) return "#" + [...match[1]].map((char) => char + char).join("").toUpperCase();
  match = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([\d.]+))?\s*\)$/.exec(value);
  if (!match) return null;
  if (match[4] !== undefined && Number(match[4]) < 0.5) return null;
  const parts = [match[1], match[2], match[3]].map(Number);
  if (parts.some((part) => part > 255)) return null;
  return "#" + parts.map((part) => part.toString(16).padStart(2, "0")).join("").toUpperCase();
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
/** Ronda 14: un fondo de ancho completo más bajo que esto es una línea o un filete, no el inicio de una banda. */  
const BAND_MIN_HEIGHT = 160;  
const MAX_BAND_STARTS = 400;  
/** Ronda 14 · C2.2: una línea fina mide ≤ 4 px de grosor y ≥ 200 px de largo. */  
const LINE_MAX_THICKNESS = 4;  
const LINE_MIN_LENGTH = 200;  
const MAX_LINES = 400;

const isLineShape = (width: number, height: number) =>  
  (height <= LINE_MAX_THICKNESS && width >= LINE_MIN_LENGTH) || (width <= LINE_MAX_THICKNESS && height >= LINE_MIN_LENGTH);

/**  
 * Bandas de ancho completo: rectángulos con color de relleno que miden ≥ 90 % del ancho del lienzo. No depende de  
 * los nombres de las claves (Canva las minifica): se mira el color y los números del objeto que lo rodea. El ancho  
 * del lienzo es el valor grande que más se repite entre esas formas (1366 en la fixture). Los colores que ya se  
 * usaron como color de un texto no cuentan (`skip`).  
 * Ronda 14: además devuelve dónde empieza cada banda (`starts`, sin deduplicar por color) y dónde hay líneas finas.  
 */  
function collectBands(  
  source: string,  
  skip: Set<number>,  
): { bands: string[]; canvasWidth: number | null; starts: number[]; lines: number[] } {  
  type Candidate = { color: string; order: number; values: number[]; height: number | null };  
  const candidates: Candidate[] = [];  
  const lines: number[] = [];  
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
    let lastSize: { width: number; height: number } | null = null;  
    for (const size of back.matchAll(/"A":\s*(\d+(?:\.\d+)?)\s*,\s*"B":\s*(\d+(?:\.\d+)?)/g)) {  
      const width = Number(size[1]);  
      const height = Number(size[2]);  
      lastSize = { width, height };  
      if (width >= 600) ownSize = { width, height };  
    }  
    if (lastSize && isLineShape(lastSize.width, lastSize.height) && lines.length < MAX_LINES) lines.push(index);  
    if (ownSize) {  
      candidates.push({ color, order: index, values: [ownSize.width, ownSize.height], height: ownSize.height });  
      continue;  
    }  
    let scope = enclosingObject(source, index, 800);  
    let values: number[] = [];  
    for (let depth = 0; scope && depth < 3; depth += 1) {  
      if (scope.text.length > 2000 || scope.text.includes("_assets/") || TEXT_PROBE.test(scope.text)) {  
        values = [];  
        break;  
      }  
      values = numericValues(scope.text);  
      if (values.some((value) => value >= 600)) break;  
      scope = scope.start > 0 ? enclosingObject(source, scope.start - 1, 800) : null;  
    }  
    if (values.length > 0) candidates.push({ color, order: index, values, height: null });  
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
  if (canvasWidth === null) return { bands: [], canvasWidth: null, starts: [], lines };

  const width = canvasWidth;  
  const bands: string[] = [];  
  const starts: number[] = [];  
  for (const candidate of candidates.sort((a, b) => a.order - b.order)) {  
    if (!candidate.values.some((value) => value >= width * 0.9 && value <= width * 1.1)) continue;  
    if (bands.length < MAX_BANDS && bands.at(-1) !== candidate.color) bands.push(candidate.color);  
    if ((candidate.height === null || candidate.height >= BAND_MIN_HEIGHT) && starts.length < MAX_BAND_STARTS) {  
      starts.push(candidate.order);  
    }  
  }  
  return { bands, canvasWidth, starts, lines };  
}

// ── Fuentes (v2) ────────────────────────────────────────────────────  
type FontIndex = { names: Map<string, string>; ids: Map<string, string> };

const KNOWN_FONTS = new Map(KNOWN_CANVA_FONTS.map((name) => [name.toLowerCase(), name]));  
const FONT_NAME = /^[A-Za-z][A-Za-z0-9 ]{1,40}$/;  
const NOT_A_FAMILY =  
  /^(?:serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif|emoji|math|fangsong|inherit|initial|unset|bold|bolder|lighter|normal|italic|oblique|regular|light|medium|semibold|black|thin|none|auto)$/i;  
const FONT_KEY_FIELD = /"(?:[\w$]*family|[\w$]*typeface|font|fontName|font_name)"\s*:\s*"([^"\\]{2,40})"/gi;  
const SHORT_LITERAL = /"([^"\\]{2,40})"/g;  
const FONT_ID = /^([A-Za-z][A-Za-z0-9_-]{7,15})(?:[,:]\d{1,3})?$/;

/** Ids ofuscados de fuente de Canva ("YAFdJjbTu24", "YAFdJjbTu24,0"): mezcla de mayúsculas o dígitos. */  
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

/** La tabla de fuentes del documento: nombres (CSS, claves de familia, nombres conocidos) e ids → nombre. */  
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
    const needle = '"' + name + '"';  
    let from = 0;  
    for (let hits = 0; hits < 20; hits += 1) {  
      const at = source.indexOf(needle, from);  
      if (at < 0) break;  
      from = at + needle.length;  
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

// ── Textos ──────────────────────────────────────────────────────────  
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

/** v2: el color y la fuente del estilo que sigue a un texto. `colorAt` = posición del color (no es una banda). */  
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

/** Ronda 14C: el objeto propio de un texto más grande que esto ya no es "el texto" (es un grupo o una lámina). */  
const OWN_STYLE_MAX = 4000;  
const OWN_FONT_SIZE = /"G"\s*:\s*"(\d+(?:\.\d+)?)px"/g;

/**  
 * Ronda 14C: tamaño de fuente leído DENTRO del objeto que contiene el arreglo del texto. Si ese objeto trae un único  
 * tamaño, es el suyo; si trae ninguno o varios, null (sin adivinar). A diferencia de `fontPx`, nunca toma el tamaño  
 * del elemento siguiente.  
 */  
function ownFontPx(source: string, arrayStart: number): number | null {  
  const own = enclosingObject(source, arrayStart, OWN_STYLE_MAX);  
  if (!own || own.text.length > OWN_STYLE_MAX) return null;  
  const sizes = new Set<number>();  
  for (const match of own.text.matchAll(OWN_FONT_SIZE)) {  
    const value = Number(match[1]);  
    if (Number.isFinite(value) && value > 0) sizes.add(value);  
  }  
  return sizes.size === 1 ? [...sizes][0] : null;  
}

function collectTexts(source: string, fonts: FontIndex | null): { texts: CanvaText[]; colorIndexes: Set<number> } {  
  const texts: CanvaText[] = [];  
  const colorIndexes = new Set<number>();  
  for (const array of source.matchAll(STRING_ARRAY)) {  
    const start = array.index ?? 0;  
    const font = /"G":"([\d.]+)px"/.exec(source.slice(start, start + 900));  
    const fontPx = font ? Number(font[1]) : null;  
    let style: ReturnType<typeof readTextStyle> | null = null;  
    let ownPx: number | null | undefined;  
    for (const literal of array[0].matchAll(STRING_LITERAL)) {  
      const text = cleanText(decodeJsonString(literal[1]));  
      if (!isHumanText(text)) continue;  
      style ??= readTextStyle(source, start + array[0].length, fonts);  
      if (ownPx === undefined) ownPx = safely(() => ownFontPx(source, start), null);  
      if (style.colorAt !== null) colorIndexes.add(style.colorAt);  
      texts.push({ text, order: start + (literal.index ?? 0), fontPx, ownPx, color: style.color, font: style.font });  
    }  
  }  
  return { texts, colorIndexes };  
}

// ── Contacto ────────────────────────────────────────────────────────  
const INSTAGRAM_PROFILE = /instagram\.com\/([A-Za-z0-9._]{1,30})/gi;  
const INSTAGRAM_RESERVED = new Set([  
  "p", "reel", "reels", "tv", "explore", "stories", "accounts", "direct", "about", "developer", "legal", "share", "canva", "_u",  
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
    if (/\.(?:png|jpe?g|webp|gif|svg|mp4)$/.test(email) || /@(?:[\w-]+\.)*canva\.(?:com|site)$/.test(email)) continue;  
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
 * HTML del sitio → sus datos crudos. `pageUrl` es la URL final de la página (para resolver las rutas relativas).  
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
  const { videos, photos, decor } = collectAssets(source, base);  
  const fonts = safely(() => buildFontIndex(html, source), null);  
  const { texts, colorIndexes } = collectTexts(source, fonts);  
  if (videos.length === 0 && texts.length === 0) {  
    throw new CanvaFormatError("No encontramos ni textos ni videos en el contenido del sitio.");  
  }  
  const { bands, canvasWidth, starts, lines } = safely(() => collectBands(source, colorIndexes), {  
    bands: [] as string[],  
    canvasWidth: null as number | null,  
    starts: [] as number[],  
    lines: [] as number[],  
  });  
  const title = cleanText(decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? ""));  
  const mailtos = [...source.matchAll(/mailto:([^"'?\s<>\\]+)/gi)].map((match) => safeDecodeUri(match[1])).join("\n");  
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
    bandStarts: starts,  
    decor,  
    lines,  
  };  
}

// ── Lectura del portafolio ──────────────────────────────────────────  
export type CanvaSector = {  
  /** Nombre del sector tal como se muestra ("Lugares", "Canvas UGC"); null = videos antes del primer sector. */  
  label: string | null;  
  videos: CanvaAsset[];  
  /** Fotos del sector (sin la foto principal): respaldo de portada. */  
  photos: CanvaAsset[];  
};

/** v2 · R4/R5: una imagen que podría ser un logo (se confirma por sus píxeles al importar) y su video, si es seguro. */  
export type CanvaLogoCandidate = { asset: CanvaAsset; videoUrl: string | null };

export type CanvaHeadings = { sectors: string | null; bio: string | null; metrics: string | null; contact: string | null };

/** Ronda 14B · 3: las secciones de prueba y de fotos que se pueden decidir por contenido. */  
export type CanvaProofZone = "metrics" | "testimonials" | "photos";

/** Ronda 14B · 3: una imagen para clasificar por contenido; `zone` es lo que dice la geometría (null = sin zona). */  
export type CanvaProofItem = { asset: CanvaAsset; zone: CanvaProofZone | null };

export type CanvaPortfolio = {  
  name: string;  
  tagline: string;  
  /** Párrafos largos de presentación (bio, "¿Por qué yo?"), en orden y sin repetir. */  
  paragraphs: string[];  
  heroPhoto: CanvaAsset | null;  
  /** Solo los que tienen al menos un video, en orden de documento. */  
  sectors: CanvaSector[];  
  /** Títulos de sector (con jerarquía de título) que no se pudieron separar del anterior. */  
  mixedLabels: string[];  
  /** Videos del portafolio (sin el video del cierre). */  
  videoCount: number;  
  contact: { instagram: string | null; tiktok: string | null; email: string | null };  
  /** v2 · R1: el diseño. null = no se pudo leer (el import se comporta como la v1). */  
  theme: CanvaTheme | null;  
  /** v2 · R5: candidatos a logo, con su video si la geometría lo asocia sin dudas. */  
  logoCandidates: CanvaLogoCandidate[];  
  /** Ronda 14: capturas de la zona de métricas (por geometría; el import puede reclasificarlas por contenido). */  
  metricsPhotos: CanvaAsset[];  
  /** Ronda 14: capturas de la zona de testimonios (por geometría). */  
  testimonialPhotos: CanvaAsset[];  
  /** Ronda 14: fotos con tamaño de foto de la zona de fotos (por geometría). */  
  galleryPhotos: CanvaAsset[];  
  /** Ronda 14B · 4: imágenes con tamaño de logo de la zona de fotos: también son candidatas a logo. */  
  galleryLogoSized: CanvaAsset[];  
  /** Ronda 14B · 3: todo lo que el import puede clasificar por contenido (zonas de prueba/fotos y láminas sin título). */  
  proofPool: CanvaProofItem[];  
  /** v2 · R6: el tarifario (la imagen grande bajo contacto). */  
  rateCard: CanvaAsset | null;  
  /** v2 · R6: foto de apoyo de la bio (compatibilidad: la primera de `bioPhotos`). */  
  supportPhoto: CanvaAsset | null;  
  /** Ronda 14 · A: las fotos de su "¿Por qué yo?" con tamaño de foto, en orden. */  
  bioPhotos: CanvaAsset[];  
  /** Ronda 14 · A: las imágenes de esa sección con tamaño de logo (también candidatas a logo). */  
  bioLogoSized: CanvaAsset[];  
  /** v2 · R6: foto de apoyo del selector de sectores. */  
  selectorPhoto: CanvaAsset | null;  
  /** Ronda 14 · C: el video de su zona de contacto (fondo del cierre). No es una pieza. */  
  closingVideo: CanvaAsset | null;  
  /** Ronda 14 · C2.1: candidata a textura de fondo (se confirma por sus píxeles al importar). */  
  texture: CanvaAsset | null;  
  /** v2: los títulos de sección tal como los escribió ("Elige un sector…", "¿Por qué yo?", "CONTACTO"). */  
  headings: CanvaHeadings;  
};

const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

const isAllCaps = (text: string) => /\p{Lu}/u.test(text) && !/\p{Ll}/u.test(text);

const SECTOR_HEADING = /^elige (?:un|tu) sector/;  
const ACRONYMS = new Set(["UGC", "ASMR", "DIY", "POV", "GRWM", "TV", "IA", "AI", "PR", "B2B", "B2C", "3D"]);  
const MINOR_WORDS = new Set(["y", "e", "o", "u", "de", "del", "la", "las", "el", "los", "en", "con", "para", "por", "a"]);

/** "LUGARES" → "Lugares", "CANVAS UGC" → "Canvas UGC". Lo que no viene en mayúsculas queda tal cual. */  
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

/** "UGC/LIFESTYLE/BEAUTY/TECH/ FOODIE" → "UGC · Lifestyle · Beauty · Tech · Foodie". null si no es una lista de rubros. */  
export function formatTagline(raw: string, max: number = LIMITS.tagline): string | null {  
  if (raw.includes("\n")) return null;  
  const parts = raw  
    .split(/\s*[/|·•,]+\s*/)  
    .map((part) => part.trim())  
    .filter(Boolean);  
  if (parts.length < 2 || parts.some((part) => part.length > 24 || part.split(" ").length > 3 || /[\d@]/.test(part))) {  
    return null;  
  }  
  const labels = parts.map(displayLabel);  
  while (labels.length > 1 && labels.join(" · ").length > max) labels.pop();  
  return labels.join(" · ");  
}

function looksLikeName(text: string): boolean {  
  if (text.includes("\n") || text.length > 40 || /\d/.test(text)) return false;  
  const words = text.split(" ");  
  return words.length >= 2 && words.length <= 4 && words.every((word) => /^\p{Lu}[\p{L}'’.-]*$/u.test(word));  
}

function isSectorLabel(text: string, name: string): boolean {  
  if (text.length > NICHE_LABEL_MAX || /[\n\d@?¿!¡:/|]/.test(text) || !/\p{L}.*\p{L}/u.test(text)) return false;  
  const words = text.split(" ");  
  if (words.length > 3) return false;  
  if (name) {  
    const folded = fold(text);  
    // Ni su nombre completo ni UNA palabra de su nombre ("MARIA" en su portada  
    // no es un sector): en presentaciones el nombre se repite en cada lámina.  
    if (folded === fold(name)) return false;  
    if (fold(name).split(" ").filter(Boolean).includes(folded)) return false;  
  }  
  return isAllCaps(text) || words.every((word) => isAllCaps(word) || /^\p{Lu}\p{Ll}*$/u.test(word));  
}

// Secciones que NO son sectores. Ronda 14: títulos en español e inglés, y dos secciones nuevas (Fotos, Testimonios).  
type SectionKind = "bio" | "metrics" | "contact" | "brands" | "photos" | "testimonials";  
const SECTION_PATTERNS: readonly [SectionKind, RegExp][] = [  
  ["brands", /^(?:brands|marcas|clients|clientes|partners)\b/],  
  [  
    "bio",  
    /^(?:por que (?:yo|elegirme|trabajar conmigo)|sobre mi|quien soy|acerca de mi|conoceme|about(?: me)?|why (?:me|choose me|work with me)|who am i|me)\b/,  
  ],  
  [  
    "metrics",  
    /^(?:mis |my )?(?:metricas|estadisticas|resultados|numeros|analiticas|metrics|stats|statistics|analytics|insights|results|numbers|performance)\b/,  
  ],  
  ["testimonials", /^(?:testimonios|testimonials?|resenas|reviews|opiniones|lo que dicen)\b/],  
  ["photos", /^(?:mis |my )?(?:fotos|fotografia|galeria|photos|photography|gallery)\b/],  
  [  
    "contact",  
    /^(?:contacto|contactame|contratame|hablemos|trabajemos(?: juntos)?|trabaja conmigo|contact(?: me)?|get in touch|let'?s (?:work|talk|collab)|work with me|hire me)\b/,  
  ],  
];  
/**  
 * Ronda 14B · 2: la detección de secciones VERIFICADA antes de la ronda 14 (español, primera aparición). Es la que  
 * decide dónde se cierra un sector en el recorrido de videos: el recorrido no cambia por los títulos nuevos.  
 */  
const LEGACY_SECTION_PATTERNS: readonly [SectionKind, RegExp][] = [  
  ["brands", /^(?:brands|marcas)\b/],  
  ["bio", /^(?:por que (?:yo|elegirme|trabajar conmigo)|sobre mi|quien soy|acerca de mi|conoceme|about(?: me)?|me)\b/],  
  ["metrics", /^(?:mis )?(?:metricas|estadisticas|resultados|numeros|analiticas)\b/],  
  ["contact", /^(?:contacto|contactame|contratame|hablemos|trabajemos(?: juntos)?|trabaja conmigo)\b/],  
];  
/** Un título de sección trae fuente grande (si el dato viene). */  
const SECTION_MIN_PX = 28;

function sectionKey(text: string): string | null {  
  if (text.includes("\n") || text.length > 40) return null;  
  return fold(text).replace(/^[¿¡"'«\s]+/, "").replace(/[?!.:»"'\s]+$/, "");  
}

function sectionKind(text: string): SectionKind | null {  
  const key = sectionKey(text);  
  return key === null ? null : (SECTION_PATTERNS.find(([, pattern]) => pattern.test(key))?.[0] ?? null);  
}

function legacySectionKind(text: string): SectionKind | null {  
  const key = sectionKey(text);  
  return key === null ? null : (LEGACY_SECTION_PATTERNS.find(([, pattern]) => pattern.test(key))?.[0] ?? null);  
}

/**  
 * El título de cada sección después del hero (un "Contrátame" del hero no cuenta). Para las ZONAS: un título con  
 * fuente grande CONFIRMADA gana sobre uno sin dato de fuente que aparezca antes.  
 */  
function findSections(texts: CanvaText[], after: number): Partial<Record<SectionKind, CanvaText>> {  
  const strong: Partial<Record<SectionKind, CanvaText>> = {};  
  const weak: Partial<Record<SectionKind, CanvaText>> = {};  
  for (const text of texts) {  
    if (text.order <= after || (text.fontPx !== null && text.fontPx < SECTION_MIN_PX)) continue;  
    const kind = sectionKind(text.text);  
    if (!kind) continue;  
    const bucket = text.fontPx === null ? weak : strong;  
    if (!bucket[kind]) bucket[kind] = text;  
  }  
  return { ...weak, ...strong };  
}

/** Ronda 14B · 2: la detección original (primera aparición, patrones originales), para el recorrido de sectores. */  
function findSectionsLegacy(texts: CanvaText[], after: number): Partial<Record<SectionKind, CanvaText>> {  
  const found: Partial<Record<SectionKind, CanvaText>> = {};  
  for (const text of texts) {  
    if (text.order <= after || (text.fontPx !== null && text.fontPx < SECTION_MIN_PX)) continue;  
    const kind = legacySectionKind(text.text);  
    if (kind && !found[kind]) found[kind] = text;  
  }  
  return found;  
}

const dims = (asset: CanvaAsset) => (asset.width && asset.height ? { w: asset.width, h: asset.height } : null);

/**  
 * Foto principal: la primera foto grande, horizontal o retrato, que no sea una captura de celular (9:16 o más alta)  
 * ni un banner. Si la heurística duda, la primera foto grande; si no, la primera foto.  
 */  
function pickHeroPhoto(photos: CanvaAsset[]): CanvaAsset | null {  
  const isGoodShape = (asset: CanvaAsset) => {  
    const size = dims(asset);  
    return size !== null && Math.min(size.w, size.h) >= 800 && size.h / size.w < 1.7 && size.w / size.h <= 2.2;  
  };  
  const isLarge = (asset: CanvaAsset) => {  
    const size = dims(asset);  
    return size !== null && Math.min(size.w, size.h) >= 600;  
  };  
  return photos.find(isGoodShape) ?? photos.find(isLarge) ?? photos[0] ?? null;  
}

/** v2 · R5: tamaño compatible con un logo (lado mayor ≤ 800). Sin medidas, decide la revisión por píxeles. */  
function isLogoSized(asset: CanvaAsset): boolean {  
  const size = dims(asset);  
  if (!size) return true;  
  return Math.max(size.w, size.h) <= 800 && Math.max(size.w, size.h) / Math.min(size.w, size.h) <= 3;  
}

/** Margen de la asociación logo↔video: el rectángulo del video expandido un 15 % (7,5 % por lado). */  
const LOGO_REACH = 0.075;

/** El video sobre el que está el logo (su centro dentro del video). null si no hay geometría o si hay dudas. */  
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
  const inTitle = site.texts.findIndex((text) => looksLikeName(text.text) && title.includes(fold(text.text)));  
  const index = inTitle >= 0 ? inTitle : site.texts.findIndex((text) => looksLikeName(text.text) && !isAllCaps(text.text));  
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
  weightedMode(texts.flatMap((text) => (text.font ? [[text.font, weigh(text)] as [string, number]] : [])));

const FONT_SAFE = /^[A-Za-z0-9 ]{1,60}$/;  
const safeFont = (font: string | null) => (font && FONT_SAFE.test(font) ? font : null);

/**  
 * v2 · R1: el tema. null si no hay nada que clonar: ni color de hero ni textura candidata.  
 * Ronda 14: un diseño de textura sin bandas de color sigue teniendo tema; el import confirma la textura.  
 */  
function buildTheme(  
  site: CanvaSiteData,  
  context: {  
    heroPhoto: CanvaAsset | null;  
    nameText: CanvaText | null;  
    heroTexts: CanvaText[];  
    headingTexts: CanvaText[];  
    paragraphTexts: CanvaText[];  
    hasTexture: boolean;  
  },  
): CanvaTheme | null {  
  const bands = (site.bands ?? []).slice(0, MAX_BANDS);  
  const heroBg = bands[0] ?? null;  
  if (!heroBg && !context.hasTexture) return null;

  const colored = site.texts.flatMap((text) => (text.color ? [[text.color, text.text.length] as [string, number]] : []));  
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
    heroPhoto?.box && width ? (heroPhoto.box.x + heroPhoto.box.w / 2 <= width / 2 ? "left" : "right") : "left";

  const biggest = [...context.heroTexts].sort((a, b) => (b.fontPx ?? 0) - (a.fontPx ?? 0))[0];  
  const display = safeFont(context.nameText?.font ?? biggest?.font ?? null);  
  const headings = safeFont(  
    fontOf(context.headingTexts.filter((text) => text.font !== display)) ?? fontOf(context.headingTexts),  
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
  | { kind: "text"; order: number; item: CanvaText }  
  | { kind: "video"; order: number; asset: CanvaAsset }  
  | { kind: "photo"; order: number; asset: CanvaAsset };

type Region = "hero" | "selector" | "work" | SectionKind;

type Mark = { region: Region; order: number };

/** Ronda 14: tramo del documento [start, end) que pertenece a una sección. */  
type Span = { start: number; end: number };

/** Ronda 14: las secciones que se arman por ZONA (todo lo de su lámina/banda es suyo), en orden de prioridad. */  
const ZONE_KINDS = ["metrics", "testimonials", "photos", "bio", "contact"] as const;  
type ZoneKind = (typeof ZONE_KINDS)[number];  
/** Ronda 14B · 4: las zonas que nunca cruzan un video (la zona de videos no se absorbe). */  
const LOCAL_ZONES: ReadonlySet<SectionKind> = new Set<SectionKind>(["metrics", "testimonials", "photos"]);  
/** Ronda 14B · 4: una zona con más de este múltiplo de su límite de imágenes es un error de lectura y se anula. */  
const ZONE_OVERFLOW_FACTOR = 2;  
/** Ronda 14B · 3: tope de imágenes de láminas sin título que se mandan a clasificar por contenido. */  
const PROOF_POOL_UNTITLED_MAX = 48;  
/**  
 * Ronda 14C: un texto tiene jerarquía de título de sector si su tamaño propio es al menos esta fracción de la mediana  
 * de los títulos de sector confirmados del MISMO diseño (relativo, nunca un número absoluto).  
 */  
const SECTOR_TITLE_MIN_SHARE = 0.75;

/** Ronda 14 · C2.1: una textura de fondo se repite al menos en esta cantidad de láminas. */  
const TEXTURE_MIN_REPEATS = 3;  
/** Ronda 14 · C2.1/láminas: una imagen "cubre" su lámina si mide ≥ 90 % del ancho del lienzo. */  
const COVER_WIDTH_SHARE = 0.9;  
/** Ronda 14: una imagen de fondo arranca en la esquina de su lámina (tolerancia en px). */  
const CORNER_TOLERANCE = 2;  
/** Ronda 14 · C2.2: marcos = líneas finas en al menos esta fracción de las láminas (y ≥ 2 láminas). */  
const FRAMES_MIN_SHARE = 0.5;  
/** Ronda 14 · C2.3: titulares en mayúsculas = ≥ 75 % de ≥ 3 títulos de sección en MAYÚSCULAS. */  
const UPPER_MIN_SHARE = 0.75;  
const UPPER_MIN_HEADINGS = 3;  
/** Ronda 14 · C2.4: aireado = margen lateral típico (mediana por lámina) ≥ 10 % del lienzo, en ≥ 2 láminas. */  
const AIRY_MIN_MARGIN = 0.1;  
const AIRY_MIN_PAGES = 2;

const heading = (text: string | undefined) => (text ? text.replace(/\s+/g, " ").trim().slice(0, 80) || null : null);

/** El ancho de lienzo deducido de las cajas, si no hubo bandas de color: la caja más ancha (≥ 600). */  
function widestBox(assets: CanvaAsset[]): number | null {  
  const widths = assets.flatMap((asset) => (asset.box && asset.box.w >= 600 ? [asset.box.w] : []));  
  return widths.length > 0 ? Math.max(...widths) : null;  
}

const median = (values: number[]) => {  
  const sorted = [...values].sort((a, b) => a - b);  
  const middle = Math.floor(sorted.length / 2);  
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;  
};

/**  
 * Ronda 14C: ¿este texto tiene jerarquía de título de sector en ESTE diseño? Se compara contra los títulos de sector  
 * confirmados (los que terminaron con videos propios):  
 * 1. tamaño propio contra la mediana de los suyos;  
 * 2. si no hay tamaños comparables, su familia tipográfica contra la de ellos;  
 * 3. sin ninguna señal comparable, sí (el aviso se conserva: no se esconde un problema real).  
 */  
function hasSectorTitleHierarchy(text: CanvaText, confirmed: CanvaText[]): boolean {  
  const sizes = confirmed.flatMap((title) => (typeof title.ownPx === "number" ? [title.ownPx] : []));  
  if (typeof text.ownPx === "number" && sizes.length > 0) {  
    return text.ownPx >= median(sizes) * SECTOR_TITLE_MIN_SHARE;  
  }  
  const families = confirmed.flatMap((title) => (title.font ? [title.font] : []));  
  if (text.font && families.length > 0) return families.includes(text.font);  
  return true;  
}

const toMarks = (found: Partial<Record<SectionKind, CanvaText>>): Mark[] =>  
  (Object.entries(found) as [SectionKind, CanvaText][]).map(([region, text]) => ({ region, order: text.order }));

const nextMarkIn = (marks: Mark[], order: number) =>  
  marks.find((mark) => mark.order > order)?.order ?? Number.POSITIVE_INFINITY;

const regionIn = (marks: Mark[], order: number): Region => marks.filter((mark) => mark.order < order).at(-1)?.region ?? "hero";

/** Datos crudos → lo que el import necesita: nombre, tagline, textos, foto principal, sectores con sus videos y el diseño. */  
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

  // Ronda 14 · C2.1: textura de fondo = imagen repetida en varias láminas que cubre su lámina (o grande).  
  const decor = site.decor ?? [];  
  const pageWidth = site.canvasWidth ?? widestBox([...site.photos, ...decor, ...site.videos]);  
  const covers = (asset: CanvaAsset) =>  
    pageWidth !== null && asset.box != null && asset.box.w >= pageWidth * COVER_WIDTH_SHARE;  
  const texture =  
    [...site.photos, ...decor]  
      .filter((asset) => (asset.refs?.length ?? 0) >= TEXTURE_MIN_REPEATS && (covers(asset) || !isLogoSized(asset)))  
      .sort((a, b) => (b.refs?.length ?? 0) - (a.refs?.length ?? 0) || area(b) - area(a))[0] ?? null;  
  const photos = site.photos.filter((photo) => photo.url !== texture?.url);

  const heroPool = headingOrder >= 0 ? photos.filter((photo) => photo.order < headingOrder) : photos;  
  const heroPhoto = pickHeroPhoto(heroPool.length > 0 ? heroPool : photos);

  // Ronda 14: láminas.  
  const backgroundRefs = [...site.photos, ...decor]  
    .filter(  
      (asset) =>  
        covers(asset) &&  
        asset.box != null &&  
        Math.abs(asset.box.x) <= CORNER_TOLERANCE &&  
        Math.abs(asset.box.y) <= CORNER_TOLERANCE,  
    )  
    .flatMap((asset) => (asset.refs && asset.refs.length > 0 ? asset.refs : [asset.order]));  
  const starts = [...new Set([...(site.bandStarts ?? []), ...(texture?.refs ?? []), ...backgroundRefs])].sort(  
    (a, b) => a - b,  
  );  
  const pageIndexOf = (order: number) => {  
    let index = -1;  
    for (let i = 0; i < starts.length; i += 1) {  
      if (starts[i] <= order) index = i;  
      else break;  
    }  
    return index;  
  };

  // Secciones: las de ZONAS (español e inglés, fuerte gana a débil) y las ORIGINALES (para el recorrido de sectores).  
  const after = Math.max(headingOrder, nameText?.order ?? -1);  
  const sections = findSections(site.texts, after);  
  const legacySections = findSectionsLegacy(site.texts, after);  
  const bigEnough = (text: CanvaText) => text.fontPx === null || text.fontPx >= 34;  
  const labelTexts = site.texts.filter(  
    (text) => text.order > headingOrder && bigEnough(text) && isSectorLabel(text.text, name) && !sectionKind(text.text),  
  );  
  const fixedMarks: Mark[] = [  
    ...(headingOrder >= 0 ? [{ region: "selector" as const, order: headingOrder }] : []),  
    ...(labelTexts[0] ? [{ region: "work" as const, order: labelTexts[0].order }] : []),  
  ];  
  const marks = [...fixedMarks, ...toMarks(sections)].sort((a, b) => a.order - b.order);  
  const legacyMarks = [...fixedMarks, ...toMarks(legacySections)].sort((a, b) => a.order - b.order);  
  const regionOf = (order: number): Region => regionIn(marks, order);

  // Ronda 14 · zonas: cada sección es la lámina que contiene su título. Si en esa lámina hay otro título fuerte, se  
  // vuelve al orden del documento (del título al siguiente).  
  const strongMarks = [  
    ...(headingOrder >= 0 ? [headingOrder] : []),  
    ...Object.values(sections)  
      .filter((text) => text.fontPx !== null && text.fontPx >= SECTION_MIN_PX)  
      .map((text) => text.order),  
  ];  
  const videoOrders = site.videos.map((video) => video.order).sort((a, b) => a - b);  
  const spanOf = (kind: SectionKind): Span | null => {  
    const head = sections[kind];  
    if (!head) return null;  
    const nextMark = nextMarkIn(marks, head.order);  
    let start = -1;  
    let end = Number.POSITIVE_INFINITY;  
    for (const at of starts) {  
      if (at <= head.order) start = at;  
      else {  
        end = at;  
        break;  
      }  
    }  
    const bandStart = start;  
    const bandEnd = end;  
    const hasBand = bandStart >= 0;  
    const shared = hasBand && strongMarks.some((at) => at !== head.order && at >= bandStart && at < bandEnd);  
    let span: Span = hasBand && !shared ? { start: bandStart, end: bandEnd } : { start: head.order, end: nextMark };  
    // 14B · 1: Contacto suma lo que sigue a su título hasta el siguiente título (como antes de la ronda 14).  
    if (kind === "contact") span = { start: span.start, end: Math.max(span.end, nextMark) };  
    // 14B · 4: Métricas, Testimonios y Fotos nunca cruzan un video.  
    if (LOCAL_ZONES.has(kind)) {  
      const videoBefore = videoOrders.filter((at) => at < head.order).at(-1);  
      const videoAfter = videoOrders.find((at) => at > head.order);  
      span = {  
        start: Math.max(span.start, videoBefore ?? Number.NEGATIVE_INFINITY),  
        end: Math.min(span.end, videoAfter ?? Number.POSITIVE_INFINITY),  
      };  
    }  
    return span;  
  };  
  const spans = Object.fromEntries(ZONE_KINDS.map((kind) => [kind, spanOf(kind)])) as Record<ZoneKind, Span | null>;  
  // 14B · 1: la región de contacto que existía antes de la ronda 14 también es contacto.  
  const legacyContact = legacySections.contact;  
  const legacyContactSpan: Span | null = legacyContact  
    ? { start: legacyContact.order, end: nextMarkIn(legacyMarks, legacyContact.order) }  
    : null;  
  const within = (span: Span | null, order: number) => span !== null && order >= span.start && order < span.end;  
  const disabled = new Set<ZoneKind>();  
  const zoneOf = (order: number, withLegacyContact = true): Region => {  
    for (const kind of ZONE_KINDS) {  
      if (disabled.has(kind)) continue;  
      if (within(spans[kind], order)) return kind;  
      if (kind === "contact" && withLegacyContact && within(legacyContactSpan, order)) return kind;  
    }  
    const region = regionOf(order);  
    // Fuera de la lámina de su sección (o en una zona anulada): lo que el orden del documento le daba no le pertenece.  
    return (ZONE_KINDS as readonly string[]).includes(region) ? "work" : region;  
  };

  // 14B · 4: una zona que se traga más del doble de su límite es un error de lectura: se anula.  
  const zoneCap: Partial<Record<ZoneKind, number>> = {  
    metrics: LIMITS.maxCanvaMetrics,  
    testimonials: LIMITS.maxCanvaTestimonials,  
    photos: LIMITS.maxCanvaGallery,  
    bio: LIMITS.maxCanvaBioPhotos,  
  };  
  const zonePhotos = photos.filter((photo) => photo.url !== heroPhoto?.url);  
  for (let pass = 0; pass < ZONE_KINDS.length; pass += 1) {  
    const counts = new Map<Region, number>();  
    for (const photo of zonePhotos) {  
      const zone = zoneOf(photo.order);  
      counts.set(zone, (counts.get(zone) ?? 0) + 1);  
    }  
    const over = ZONE_KINDS.filter((kind) => {  
      const cap = zoneCap[kind];  
      return !disabled.has(kind) && cap !== undefined && (counts.get(kind) ?? 0) > cap * ZONE_OVERFLOW_FACTOR;  
    });  
    if (over.length === 0) break;  
    for (const kind of over) disabled.add(kind);  
  }

  // A2: la portada de un video nunca es un logo.  
  const posterUrls = new Set(site.videos.flatMap((video) => (video.poster ? [video.poster] : [])));  
  const metricsPhotos: CanvaAsset[] = [];  
  const testimonialPhotos: CanvaAsset[] = [];  
  const galleryPhotos: CanvaAsset[] = [];  
  const galleryLogoSized: CanvaAsset[] = [];  
  let contactPhotos: CanvaAsset[] = [];  
  const bioPhotos: CanvaAsset[] = [];  
  const bioLogoSized: CanvaAsset[] = [];  
  const candidates: CanvaAsset[] = [];  
  const mayBeLogo = (photo: CanvaAsset) => isLogoSized(photo) && !posterUrls.has(photo.url);  
  let selectorPhoto: CanvaAsset | null = null;  
  for (const photo of zonePhotos) {  
    const zone = zoneOf(photo.order);  
    // B / A2: todo lo de una zona de prueba es de esa sección; nunca llega a candidato a logo.  
    if (zone === "metrics") metricsPhotos.push(photo);  
    else if (zone === "testimonials") testimonialPhotos.push(photo);  
    else if (zone === "photos") {  
      // 14B · 4: las de tamaño de logo también son candidatas (la franja no se vacía por absorción).  
      if (!isLogoSized(photo)) galleryPhotos.push(photo);  
      else {  
        galleryLogoSized.push(photo);  
        if (mayBeLogo(photo)) candidates.push(photo);  
      }  
    } else if (zone === "contact") contactPhotos.push(photo);  
    else if (zone === "bio") {  
      // A: toda la galería. Las de tamaño de logo las decide la revisión por píxeles.  
      if (!isLogoSized(photo)) bioPhotos.push(photo);  
      else {  
        bioLogoSized.push(photo);  
        if (mayBeLogo(photo)) candidates.push(photo);  
      }  
    } else if (zone === "selector" && !selectorPhoto && !isLogoSized(photo)) selectorPhoto = photo;  
    else if (mayBeLogo(photo)) candidates.push(photo);  
  }  
  // 14B · 1: si ninguna zona de contacto tomó imágenes, la región de contacto ORIGINAL decide (como antes).  
  if (contactPhotos.length === 0 && legacyContact) {  
    contactPhotos = zonePhotos.filter((photo) => regionIn(legacyMarks, photo.order) === "contact");  
  }  
  const supportPhoto = bioPhotos[0] ?? null;  
  // El tarifario: la imagen más grande bajo contacto (si no hay otra señal, basta la sección). Las chicas pueden ser logos.  
  const rateCard = [...contactPhotos].sort((a, b) => area(b) - area(a) || a.order - b.order)[0] ?? null;  
  if (rateCard) {  
    // El tarifario no se repite en otra sección.  
    for (const list of [metricsPhotos, testimonialPhotos, galleryPhotos, bioPhotos]) {  
      const at = list.indexOf(rateCard);  
      if (at >= 0) list.splice(at, 1);  
    }  
  }  
  for (const photo of contactPhotos) if (photo !== rateCard && mayBeLogo(photo) && !candidates.includes(photo)) candidates.push(photo);  
  const reserved = new Set(  
    [  
      ...metricsPhotos,  
      ...testimonialPhotos,  
      ...galleryPhotos,  
      ...galleryLogoSized,  
      ...bioPhotos,  
      ...bioLogoSized,  
      rateCard,  
      selectorPhoto,  
      texture,  
    ].flatMap((asset) => (asset ? [asset.url] : [])),  
  );

  // C: el video de la zona de contacto (medida nueva) es el fondo del cierre, no una pieza.  
  const closingVideo = site.videos.find((video) => zoneOf(video.order, false) === "contact") ?? null;

  // ── Recorrido de sectores (14B · 2: mismas entradas que antes de la ronda 14) ──  
  // Un video pertenece al sector visto antes que él. Los botones del selector (~27px) no son  
  // títulos: el título de sección trae fuente grande (>= 34px cuando el dato viene). Si dos  
  // títulos seguidos preceden a los mismos videos, manda el primero; el otro es candidato a  
  // "mezclado" (14C: solo se avisa si tiene jerarquía de título de sector). Los sectores repetidos  
  // (versión móvil) se juntan. Los cierres de sector salen de la detección ORIGINAL de secciones, y  
  // TODOS los videos recorren (el del cierre se saca al final).  
  const closingOrders = new Set(Object.values(legacySections).map((text) => text.order));  
  const events: WalkEvent[] = [  
    ...site.texts.map((item): WalkEvent => ({ kind: "text", order: item.order, item })),  
    ...site.videos.map((asset): WalkEvent => ({ kind: "video", order: asset.order, asset })),  
    ...photos  
      .filter((photo) => photo.url !== heroPhoto?.url && !reserved.has(photo.url))  
      .map((asset): WalkEvent => ({ kind: "photo", order: asset.order, asset })),  
  ].sort((a, b) => a.order - b.order);

  const groups = new Map<string, CanvaSector>();  
  /** 14C: el texto que abrió cada sector (para medir la jerarquía de los títulos confirmados). */  
  const titleOf = new Map<string, CanvaText>();  
  const mixedCandidates: { label: string; item: CanvaText; group: string }[] = [];  
  let current = "";  
  for (const event of events) {  
    if (event.kind === "text") {  
      const { item } = event;  
      if (closingOrders.has(event.order)) {  
        current = "";  
        continue;  
      }  
      const isBig = item.fontPx === null || item.fontPx >= 34;  
      if (event.order > headingOrder && isBig && isSectorLabel(item.text, name) && !sectionKind(item.text)) {  
        const key = fold(item.text);  
        const currentGroup = groups.get(current);  
        if (current && currentGroup && currentGroup.videos.length === 0 && key !== current) {  
          mixedCandidates.push({ label: displayLabel(item.text), item, group: current });  
        } else {  
          current = key;  
          if (!groups.has(current)) {  
            groups.set(current, { label: displayLabel(item.text), videos: [], photos: [] });  
            titleOf.set(current, item);  
          }  
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
  // 14C: títulos confirmados = los que terminaron con videos propios. Solo un candidato con su misma jerarquía avisa.  
  const confirmedTitles = [...groups.entries()].flatMap(([key, group]) => {  
    const title = titleOf.get(key);  
    return title && group.label !== null && group.videos.length > 0 ? [title] : [];  
  });  
  // Auditoría 14C (Muse): dos o más rótulos DISTINTOS interrumpiendo el mismo grupo vacío
  // no son un título en disputa: son una enumeración del diseño (una lista de tipos de
  // contenido, servicios, etc.) y ningún video se desplazó por ellos. Solo el rótulo
  // solitario que interrumpe un grupo puede ser un título compitiendo por esos videos.
  const labelsPerGroup = new Map<string, Set<string>>();
  for (const candidate of mixedCandidates) {
    const set = labelsPerGroup.get(candidate.group) ?? new Set<string>();
    set.add(candidate.label);
    labelsPerGroup.set(candidate.group, set);
  }
  // La misma idea a nivel de ESTILO: el orden del documento en Canva es orden de capas,
  // no de lectura, así que los rótulos de una misma lista (mismo tamaño de fuente: una
  // banda de "tipos de contenido", por ejemplo) pueden interrumpir grupos distintos.
  // Si dos o más rótulos distintos comparten el tamaño, son una lista, no títulos en
  // disputa, aunque cada uno haya interrumpido un grupo diferente.
  const labelsPerSize = new Map<string, Set<string>>();
  for (const candidate of mixedCandidates) {
    const sizeKey = String(candidate.item.ownPx ?? candidate.item.fontPx ?? "null");
    const set = labelsPerSize.get(sizeKey) ?? new Set<string>();
    set.add(candidate.label);
    labelsPerSize.set(sizeKey, set);
  }
  const mixedLabels: string[] = [];
  for (const candidate of mixedCandidates) {
    if ((labelsPerGroup.get(candidate.group)?.size ?? 0) > 1) continue;
    const sizeKey = String(candidate.item.ownPx ?? candidate.item.fontPx ?? "null");
    if ((labelsPerSize.get(sizeKey)?.size ?? 0) > 1) continue;
    if (!hasSectorTitleHierarchy(candidate.item, confirmedTitles)) continue;
    if (!mixedLabels.includes(candidate.label)) mixedLabels.push(candidate.label);
  }
  const sectors = [...groups.values()]  
    .map((group) =>  
      closingVideo ? { ...group, videos: group.videos.filter((video) => video.url !== closingVideo.url) } : group,  
    )  
    .filter((group) => group.videos.length > 0);

  // ── 14B · 3: lo que se puede decidir por CONTENIDO ──  
  const zoneItems: CanvaProofItem[] = [  
    ...metricsPhotos.map((asset) => ({ asset, zone: "metrics" as const })),  
    ...testimonialPhotos.map((asset) => ({ asset, zone: "testimonials" as const })),  
    ...galleryPhotos.map((asset) => ({ asset, zone: "photos" as const })),  
    ...galleryLogoSized.map((asset) => ({ asset, zone: "photos" as const })),  
  ];  
  const untitled: CanvaProofItem[] = [];  
  if (starts.length >= 2) {  
    const heroPage = heroPhoto ? pageIndexOf(heroPhoto.order) : -2;  
    const markOrders = [...marks, ...legacyMarks].map((mark) => mark.order);  
    const pageIsBusy = (index: number) => {  
      const from = starts[index];  
      const to = starts[index + 1] ?? Number.POSITIVE_INFINITY;  
      return (  
        index === heroPage ||  
        markOrders.some((at) => at >= from && at < to) ||  
        videoOrders.some((at) => at >= from && at < to)  
      );  
    };  
    for (const photo of zonePhotos) {  
      if (reserved.has(photo.url)) continue;  
      const index = pageIndexOf(photo.order);  
      if (index < 0 || pageIsBusy(index)) continue;  
      untitled.push({ asset: photo, zone: null });  
      if (untitled.length >= PROOF_POOL_UNTITLED_MAX) break;  
    }  
  }  
  const proofPool = [...zoneItems, ...untitled];

  const seen = new Set<string>();  
  const isParagraph = (text: string) => text.length >= 60 && text.split(/\s+/).length >= 8 && !SECTOR_HEADING.test(fold(text));  
  const paragraphs = site.texts  
    .map((text) => text.text)  
    .filter(isParagraph)  
    .filter((text) => {  
      const key = fold(text);  
      if (seen.has(key)) return false;  
      seen.add(key);  
      return true;  
    });

  // ── Ronda 14 · C2: lenguaje del diseño, medido ──  
  const lines = site.lines ?? [];  
  let pagesWithLines = 0;  
  for (let i = 0; i < starts.length; i += 1) {  
    const from = starts[i];  
    const to = starts[i + 1] ?? Number.POSITIVE_INFINITY;  
    if (lines.some((at) => at >= from && at < to)) pagesWithLines += 1;  
  }  
  const frames = starts.length >= 2 && pagesWithLines >= Math.ceil(starts.length * FRAMES_MIN_SHARE) ? ("line" as const) : null;  
  const headTexts = [...Object.values(sections), ...(sectorHeading ? [sectorHeading] : [])];  
  const headingsUpper =  
    headTexts.length >= UPPER_MIN_HEADINGS &&  
    headTexts.filter((text) => isAllCaps(text.text)).length / headTexts.length >= UPPER_MIN_SHARE;  
  const extents = new Map<number, { left: number; right: number }>();  
  if (pageWidth !== null) {  
    for (const asset of [...photos, ...site.videos]) {  
      if (!asset.box || covers(asset)) continue;  
      const page = pageIndexOf(asset.order);  
      const extent = extents.get(page) ?? { left: Number.POSITIVE_INFINITY, right: Number.NEGATIVE_INFINITY };  
      extent.left = Math.min(extent.left, asset.box.x);  
      extent.right = Math.max(extent.right, asset.box.x + asset.box.w);  
      extents.set(page, extent);  
    }  
  }  
  const margins =  
    pageWidth === null  
      ? []  
      : [...extents.values()].map((extent) => Math.max(0, Math.min(extent.left, pageWidth - extent.right)) / pageWidth);  
  const airy = margins.length >= AIRY_MIN_PAGES && median(margins) >= AIRY_MIN_MARGIN;

  const baseTheme = safely(  
    () =>  
      buildTheme(site, {  
        heroPhoto,  
        nameText,  
        heroTexts: site.texts.filter((text) => headingOrder < 0 || text.order < headingOrder),  
        headingTexts: [...labelTexts, ...Object.values(sections)],  
        paragraphTexts: site.texts.filter((text) => isParagraph(text.text)),  
        hasTexture: texture !== null,  
      }),  
    null,  
  );  
  const theme: CanvaTheme | null = baseTheme ? { ...baseTheme, frames, headingsUpper, airy } : null;

  return {  
    name,  
    tagline,  
    paragraphs,  
    heroPhoto,  
    sectors,  
    mixedLabels,  
    videoCount: site.videos.length - (closingVideo ? 1 : 0),  
    contact: { instagram: site.instagram, tiktok: site.tiktok, email: site.email },  
    theme,  
    logoCandidates: candidates.map((asset) => ({ asset, videoUrl: associateLogo(asset, site.videos) })),  
    metricsPhotos,  
    testimonialPhotos,  
    galleryPhotos,  
    galleryLogoSized,  
    proofPool,  
    rateCard,  
    supportPhoto,  
    bioPhotos,  
    bioLogoSized,  
    selectorPhoto,  
    closingVideo,  
    texture,  
    headings: {  
      sectors: heading(sectorHeading?.text),  
      bio: heading(sections.bio?.text),  
      metrics: heading(sections.metrics?.text),  
      contact: heading(sections.contact?.text),  
    },  
  };  
}
