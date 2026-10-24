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
 * - Textos: arreglos de strings dentro del JSON, en orden de documento.
 * - Sectores: etiquetas cortas que preceden a sus videos después de "Elige un sector para ver mis videos".
 * Nada se inventa: lo que no se encuentra queda vacío. Si el formato no calza, se lanza CanvaFormatError.
 *
 * v2: además del contenido se lee el DISEÑO (CanvaTheme) y se proponen candidatos (logos, métricas, tarifario…);
 * la confirmación por píxeles y por visión ocurre en la orquestación (aquí no hay bytes).
 *
 * Ronda 14 / 14B / 14C: láminas, zonas en español e inglés, lenguaje del tema, recorrido de sectores con las
 * entradas verificadas, contacto unido, localidad de zonas, prueba por contenido y jerarquía de títulos de sector.
 *
 * Ronda 15:
 * - B1 · RECORRIDO VISUAL: dentro de cada lámina, si TODOS sus textos y videos traen caja, el recorrido de sectores
 *   los ordena por posición (y, luego x). Si no, manda el orden del documento (respaldo). Solo reordena: ningún
 *   video se gana ni se pierde, cambian a qué sector pertenecen.
 * - B5 · ETIQUETA POR VIDEO: un texto corto (≤ 4 palabras) pegado a un video, debajo o encima y en su misma lámina,
 *   que no es título de sección ni de sector ni un párrafo, es la etiqueta de marca de esa pieza.
 * - B6 · FRANJA POR ZONA: en diseños sin títulos legibles, las imágenes chicas o medianas de una lámina sin videos
 *   son candidatas a logo. No se exige caja blanca: decide el import (píxeles + visión).
 * - E1 · SERVICIOS POR PATRÓN: un encabezado seguido de 2+ pares título corto + descripción corta, con jerarquía
 *   medida (tamaño propio o familia). Sus textos reales, tal cual.
 * - E2 · ZONAS SIN TÍTULO: cada imagen del pool sin zona lleva su lámina (`group`) y los textos de esa lámina.
 * - E3 · BANDA DE CADA LOGO: el color de la banda donde vive cada candidato.
 * - E4 · FOTO PRINCIPAL: en el primer tramo, la de mayor área mostrada (no la primera del documento).
 *
 * Mini-ronda correctiva:
 * - 1 · Un sector es la corrida contigua de videos tras su PRIMER título. Un título posterior cuya etiqueta ya tuvo
 *   sector no lo reabre: sus videos quedan sin sector.
 * - 2 · Segunda capa de textos: si el canal principal trae pocos textos o ninguno con tamaño, se suman los textos
 *   del almacén del diseño (texto, tamaño y orden), sin duplicar. Los servicios pueden emparejarse sin adyacencia
 *   solo cuando esa capa aportó textos.
 *
 * Addendum · corridas:
 * - La segunda capa también lee los elementos de texto con corridas (`A`: {"A?":"A","A":"<texto>"}) y estilos
 *   (`B`): su texto toma el tamaño de la primera entrada de estilos que trae `font-size`. Si los avances de estilos
 *   cubren exactamente el texto y el tamaño cambia en un salto de línea, cada tramo es su propio texto. Los tamaños
 *   que viven dentro de esos elementos ya no se leen por la subida genérica.
 *
 * Addendum 2 · secuencia:
 * - Servicios: con la capa del almacén y solo si las pasadas por tamaño no dieron 2 pares, una pasada más en orden
 *   de documento empareja una corrida de títulos cortos del mismo nivel con la corrida de descripciones que la sigue
 *   (título[i] ↔ descripción[i]). No exige que el título sea más grande que su descripción.
 *
 * Addendum 3 · títulos de la secuencia:
 * - En la corrida de títulos de la pasada por secuencia, un título que calza con el patrón de una sección no corta
 *   la corrida (las demás guardas siguen). El encabezado y las descripciones conservan ese veto.
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
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, error: NOT_A_CANVA_SITE };
  const host = url.hostname.toLowerCase();
  if (host === "canva.com" || host.endsWith(".canva.com")) return { ok: false, error: CANVA_DESIGN_LINK };

  if (!isCanvaSiteHost(host) || url.username || url.password || url.port) return { ok: false, error: NOT_A_CANVA_SITE };
  url.protocol = "https:";
  url.search = "";
  url.hash = "";
  if (!url.pathname.endsWith("/")) url.pathname = `${url.pathname}/`;
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
  /** Ronda 14C: tamaño de fuente leído DENTRO del propio objeto del texto (nunca del elemento vecino). */
  ownPx?: number | null;
  /** v2: color del texto (#RRGGBB), si se pudo leer. */
  color?: string | null;
  /** v2: nombre de la fuente tal como lo trae Canva ("Pinyon Script"), si se pudo leer. */
  font?: string | null;
  /** Ronda 15 · B1/B5: rectángulo del texto en su lámina, si se pudo leer. */
  box?: CanvaBox | null;
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
  /** Ronda 15 · E3: el color de cada inicio de banda (alineado con `bandStarts`). */
  bandStartColors?: string[];
  /** Ronda 14: imágenes de decoración (_assets/images): solo candidatas a textura de fondo. */
  decor?: CanvaAsset[];
  /** Ronda 14: posiciones de líneas finas (≤ 4 px de grosor y ≥ 200 px de largo). */
  lines?: number[];
  /** Mini-ronda · 2: cuántos textos aportó (o completó) la capa del almacén. 0 o ausente = solo el canal principal. */
  storeTexts?: number;
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

/** Rectángulo del elemento que referencia un asset (o que contiene un texto): en su objeto o en su contenedor. */
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
    const isDecor = folder === "images";
    const isVideo = folder === "video" && extension.toLowerCase() === "mp4";
    if (folder === "video" && !isVideo) continue;
    if (isDecor && extension.toLowerCase() === "mp4") continue;
    const url = absoluteAssetUrl(path, base);
    if (!url) continue;
    const index = match.index ?? 0;
    const object = enclosingObject(source, index);
    const scope = object?.text ?? source.slice(Math.max(0, index - 200), index + 400);
    // El árbol del documento referencia cada asset por el id de su entrada del manifiesto: la primera aparición de
    // ese id (antes de la entrada misma) es su posición en la página. Ronda 14: se guardan TODAS esas apariciones.
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
// Ronda 15: restituida a su forma evidente (en el paquete llegó corrupta). Verificar contra la rama.
const COLOR_LITERAL = /"(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}|rgba?\([^"()]{5,40}\))"/g;

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

type BandScan = { bands: string[]; canvasWidth: number | null; starts: number[]; startColors: string[]; lines: number[] };

/**
 * Bandas de ancho completo: rectángulos con color de relleno que miden ≥ 90 % del ancho del lienzo. Ronda 14:
 * además devuelve dónde empieza cada banda y dónde hay líneas finas. Ronda 15 · E3: y el color de cada inicio.
 */
function collectBands(source: string, skip: Set<number>): BandScan {
  type Candidate = { color: string; order: number; values: number[]; height: number | null };
  const candidates: Candidate[] = [];
  const lines: number[] = [];
  for (const match of source.matchAll(COLOR_LITERAL)) {
    const index = match.index ?? 0;
    if (skip.has(index)) continue;
    const color = toHex(match[1]);
    if (!color) continue;
    // Atajo medido en el fixture: el rectángulo de fondo serializa su tamaño en "C":{"A":ancho,"B":alto}
    // inmediatamente ANTES del relleno "D":{"C":#hex} del mismo elemento.
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
  if (canvasWidth === null) return { bands: [], canvasWidth: null, starts: [], startColors: [], lines };

  const width = canvasWidth;
  const bands: string[] = [];
  const starts: number[] = [];
  const startColors: string[] = [];
  for (const candidate of candidates.sort((a, b) => a.order - b.order)) {
    if (!candidate.values.some((value) => value >= width * 0.9 && value <= width * 1.1)) continue;
    if (bands.length < MAX_BANDS && bands.at(-1) !== candidate.color) bands.push(candidate.color);
    if ((candidate.height === null || candidate.height >= BAND_MIN_HEIGHT) && starts.length < MAX_BAND_STARTS) {
      starts.push(candidate.order);
      startColors.push(candidate.color);
    }
  }
  return { bands, canvasWidth, starts, startColors, lines };
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

/** Los recursos de fuente del documento: {"A":"<id>","B":0,"C":"<nombre>","D":[variantes]}. */
const FONT_RESOURCE =
  /\\?"A\\?"\s*:\s*\\?"([A-Za-z0-9_-]{8,16})\\?"\s*,\s*\\?"B\\?"\s*:\s*\d+\s*,\s*\\?"C\\?"\s*:\s*\\?"([A-Za-z][A-Za-z0-9 ]{1,40})\\?"/g;

/** La tabla de fuentes del documento: nombres (CSS, claves de familia, nombres conocidos) e ids → nombre. */
function buildFontIndex(html: string, source: string): FontIndex {
  const names = new Map<string, string>();
  const tableIds = new Map<string, string>();
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

/** Ronda 14C: tamaño de fuente leído DENTRO del objeto que contiene el arreglo del texto (único, o null). */
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
    let box: CanvaBox | null | undefined;
    for (const literal of array[0].matchAll(STRING_LITERAL)) {
      const text = cleanText(decodeJsonString(literal[1]));
      if (!isHumanText(text)) continue;
      style ??= readTextStyle(source, start + array[0].length, fonts);
      if (ownPx === undefined) ownPx = safely(() => ownFontPx(source, start), null);
      // Ronda 15 · B1/B5: la caja del texto (en su objeto o su contenedor inmediato).
      if (box === undefined) box = safely(() => elementBox(source, start), null);
      if (style.colorAt !== null) colorIndexes.add(style.colorAt);
      texts.push({ text, order: start + (literal.index ?? 0), fontPx, ownPx, color: style.color, font: style.font, box });
    }
  }
  return { texts, colorIndexes };
}

// ── Textos · segunda capa: el almacén del diseño (mini-ronda · 2) ──
/** Con menos textos que esto en el canal principal (o ninguno con tamaño), se suma la capa del almacén. */
const STORE_FEW_TEXTS = 8;
/** Alcance de cada objeto al subir desde un tamaño hasta su texto, y cuántos niveles se sube como máximo. */
const STORE_SCOPE_MAX = 2500;
const STORE_CLIMB_MAX = 5;
/** Tope de tamaños leídos (cada corrida de estilo trae el suyo). */
const STORE_MAX_SIZES = 2000;
const STORE_MIN_PX = 4;
const STORE_MAX_PX = 2000;
/**
 * Tamaño como CLAVE del almacén: "font-size" (o fontSize / font_size) con valor 301.33, "301.33", "301.33px" o
 * anidado ({"B":"301.33"}), con o sin comillas escapadas.
 */
const STORE_SIZE_KEY =
  /\\{0,3}"font[-_]?size\\{0,3}"\s*:\s*(?:\{[^{}]{0,60}?:\s*)?\\{0,3}"?(\d+(?:\.\d+)?)(?:px)?(?![\d.])/gi;
/** Tamaño en estilo en línea de un texto con marcado: style="…font-size:301.33px…">texto< */
const STORE_INLINE_SIZE = /style=\\{0,3}["'][^"'<>]*?font-size\s*:\s*(\d+(?:\.\d+)?)px[^<>]*>([^<]{1,600})</gi;
/** Valores de estilo que nunca son el texto del elemento. */
const STORE_STYLE_KEY =
  /(?:font|family|weight|style|align|decoration|transform|direction|colou?r|link|href|url|src|^id$|type|role|lang|name)/i;
const STORE_KEY_BEFORE = /"([^"\\]{1,40})"\s*:\s*$/;

const validStoreSize = (value: number) => Number.isFinite(value) && value >= STORE_MIN_PX && value <= STORE_MAX_PX;

/** Los textos para personas de un objeto del almacén (valores, nunca claves ni valores de estilo). */
function storeLiterals(scope: JsonObject, fonts: FontIndex | null): { text: string; order: number }[] {
  const found: { text: string; order: number }[] = [];
  for (const match of scope.text.matchAll(STRING_LITERAL)) {
    const index = match.index ?? 0;
    const end = index + match[0].length;
    if (/^\s*:/.test(scope.text.slice(end, end + 8))) continue;
    const key = STORE_KEY_BEFORE.exec(scope.text.slice(Math.max(0, index - 60), index))?.[1];
    if (key && STORE_STYLE_KEY.test(key)) continue;
    const text = cleanText(decodeJsonString(match[1]));
    if (!isHumanText(text) || fonts?.names.has(text.toLowerCase())) continue;
    found.push({ text, order: scope.start + index });
  }
  return found;
}

/**
 * El texto dueño de un tamaño: se sube por los objetos que lo contienen hasta el primero con texto. Si ese objeto
 * trae más de un texto distinto, o si ya contiene assets (es una lámina o un grupo), no se adivina: null.
 */
function storeTextAt(source: string, at: number, fonts: FontIndex | null): { text: string; order: number; scope: JsonObject } | null {
  let scope = enclosingObject(source, at, STORE_SCOPE_MAX);
  for (let depth = 0; scope && depth < STORE_CLIMB_MAX; depth += 1) {
    if (scope.text.includes("_assets/")) return null;
    const found = storeLiterals(scope, fonts);
    if (found.length > 0) {
      if (new Set(found.map((item) => item.text)).size > 1) return null;
      return { text: found[0].text, order: found[0].order, scope };
    }
    scope = scope.start > 0 ? enclosingObject(source, scope.start - 1, STORE_SCOPE_MAX) : null;
  }
  return null;
}

// ── Textos · segunda capa: elementos con corridas y estilos (addendum) ──
/** El inicio de la lista de corridas de un elemento de texto: "A":[{"A?":"A","A":"<texto>"… */
const RUN_LIST = /"A"\s*:\s*\[\s*\{\s*"A\?"\s*:\s*"A"\s*,\s*"A"\s*:\s*"/g;
/** Un elemento más grande que esto no se lee aquí (queda para la subida genérica). */
const RUN_ELEMENT_MAX = 20000;
/** Hasta dónde se busca hacia atrás la llave que abre el elemento, y cuántos elementos se leen como máximo. */
const RUN_OPEN_SCAN = 4000;
const RUN_ELEMENTS_MAX = 2000;
const RUN_SIZE_KEY = /^font[-_]?size$/i;
const RUN_COLOR_KEY = /^colou?r$/i;
const RUN_FAMILY_KEY = /^font[-_]?family$/i;

type JsonRecord = Record<string, unknown>;
type RunStyle = { size: number | null; color: string | null; font: string | null };
type RunPiece = { text: string; offset: number; style: RunStyle };
type RunRange = { start: number; end: number };
type RunElement = { start: number; end: number; pieces: RunPiece[] };

const EMPTY_RUN_STYLE: RunStyle = { size: null, color: null, font: null };

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** La llave que abre el objeto que contiene una posición (conteo de llaves hacia atrás). -1 si no se encuentra. */
function openingBrace(source: string, index: number, maxSpan: number): number {
  let depth = 0;
  for (let i = index; i >= Math.max(0, index - maxSpan); i -= 1) {
    const char = source[i];
    if (char === "}") depth += 1;
    else if (char === "{") {
      if (depth === 0) return i;
      depth -= 1;
    }
  }
  return -1;
}

/** El objeto que abre en `start`, respetando strings (una llave dentro de un texto no cuenta). null si no cierra. */
function objectFrom(source: string, start: number, maxSpan: number): JsonObject | null {
  if (source[start] !== "{") return null;
  let depth = 0;
  let inString = false;
  const limit = Math.min(source.length, start + maxSpan);
  for (let i = start; i < limit; i += 1) {
    const char = source[i];
    if (inString) {
      if (char === "\\") i += 1;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return { start, end: i + 1, text: source.slice(start, i + 1) };
    }
  }
  return null;
}

/** Un atributo de estilo: su valor bajo `B` ({"B": valor}) o el valor directo. */
function attributeOf(attributes: JsonRecord, key: RegExp): { present: boolean; value: unknown } {
  const name = Object.keys(attributes).find((candidate) => key.test(candidate));
  if (name === undefined) return { present: false, value: undefined };
  const entry = attributes[name];
  return { present: true, value: isRecord(entry) ? entry.B : entry };
}

/** 301.33, "301.33" o "301.33px" → 301.33. null si no es un tamaño válido. */
function runSize(value: unknown): number | null {
  if (typeof value === "number") return validStoreSize(value) ? value : null;
  if (typeof value !== "string") return null;
  const match = /^\s*(\d+(?:\.\d+)?)(?:px)?\s*$/.exec(value);
  const size = match ? Number(match[1]) : Number.NaN;
  return validStoreSize(size) ? size : null;
}

function runFont(value: unknown, fonts: FontIndex | null): string | null {
  if (!fonts || typeof value !== "string") return null;
  return fontIn('"' + value + '"', fonts);
}

/** Aplica una entrada de estilos: lo que la entrada trae (aunque venga vacío) reemplaza al estilo vigente. */
function withAttributes(current: RunStyle, attributes: JsonRecord, fonts: FontIndex | null): RunStyle {
  const next = { ...current };
  const size = attributeOf(attributes, RUN_SIZE_KEY);
  if (size.present) next.size = runSize(size.value);
  const color = attributeOf(attributes, RUN_COLOR_KEY);
  if (color.present) next.color = typeof color.value === "string" ? toHex(color.value) : null;
  const family = attributeOf(attributes, RUN_FAMILY_KEY);
  if (family.present) next.font = safely(() => runFont(family.value, fonts), null);
  return next;
}

/**
 * Tramos por tamaño. Solo si los avances ({"A?":"B","A":<n>}) cubren EXACTAMENTE el texto, todos los tramos traen
 * tamaño, hay al menos dos tamaños distintos y cada cambio cae en un salto de línea. Si no, null (un solo texto).
 */
function splitBySize(raw: string, styles: unknown[], fonts: FontIndex | null): RunPiece[] | null {
  let current = EMPTY_RUN_STYLE;
  let position = 0;
  const pieces: (RunPiece & { end: number })[] = [];
  for (const entry of styles) {
    if (!isRecord(entry)) return null;
    const step = entry.A;
    if (entry["A?"] === "A" && isRecord(step)) {
      current = withAttributes(current, step, fonts);
      continue;
    }
    if (entry["A?"] !== "B" || typeof step !== "number" || !Number.isInteger(step) || step < 0) return null;
    const from = position;
    position += step;
    if (step === 0) continue;
    const last = pieces.at(-1);
    if (raw.slice(from, position).trim() === "") {
      if (last) last.end = position;
      continue;
    }
    if (last && last.style.size === current.size) last.end = position;
    else pieces.push({ text: "", offset: from, end: position, style: current });
  }
  if (position !== raw.length || pieces.length < 2) return null;
  if (pieces.some((piece) => piece.style.size === null)) return null;
  if (new Set(pieces.map((piece) => piece.style.size)).size < 2) return null;
  for (let i = 1; i < pieces.length; i += 1) {
    const at = pieces[i].offset;
    if (!raw.slice(Math.max(0, at - 1), at + 1).includes("\n")) return null;
  }
  return pieces.map((piece) => ({ text: raw.slice(piece.offset, piece.end), offset: piece.offset, style: piece.style }));
}

/**
 * Un elemento con corridas (`A`) y estilos (`B`): su texto (las corridas de texto, en orden) con el tamaño de la
 * primera entrada de estilos que trae `font-size`. null si no tiene esa forma o si ninguna entrada trae tamaño.
 */
function readRunElement(source: string, anchor: number, fonts: FontIndex | null): RunElement | null {
  const start = openingBrace(source, anchor, RUN_OPEN_SCAN);
  if (start < 0) return null;
  const object = objectFrom(source, start, RUN_ELEMENT_MAX);
  if (!object) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(object.text);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.A) || !Array.isArray(parsed.B)) return null;
  const runs: unknown[] = parsed.A;
  const styles: unknown[] = parsed.B;
  const inserts: string[] = [];
  let plain = true;
  for (const run of runs) {
    if (isRecord(run) && run["A?"] === "A" && typeof run.A === "string") inserts.push(run.A);
    else plain = false;
  }
  if (inserts.length === 0) return null;
  const raw = inserts.join("");
  let first: RunStyle | null = null;
  for (const entry of styles) {
    if (!isRecord(entry) || !isRecord(entry.A)) continue;
    const style = withAttributes(EMPTY_RUN_STYLE, entry.A, fonts);
    if (style.size !== null) {
      first = style;
      break;
    }
  }
  if (!first) return null;
  const split = plain ? safely(() => splitBySize(raw, styles, fonts), null) : null;
  return { start: object.start, end: object.end, pieces: split ?? [{ text: raw, offset: 0, style: first }] };
}

/** Los textos de los elementos con corridas y estilos, y los rangos que ocupan (la subida genérica no entra ahí). */
function collectRunTexts(source: string, fonts: FontIndex | null): { texts: CanvaText[]; claimed: RunRange[] } {
  const texts: CanvaText[] = [];
  const claimed: RunRange[] = [];
  let read = 0;
  let lastEnd = -1;
  for (const match of source.matchAll(RUN_LIST)) {
    read += 1;
    if (read > RUN_ELEMENTS_MAX) break;
    const anchor = match.index ?? 0;
    if (anchor < lastEnd) continue;
    const quoteAt = anchor + match[0].length - 1;
    const element = safely(() => readRunElement(source, anchor, fonts), null);
    if (!element) continue;
    lastEnd = element.end;
    claimed.push({ start: element.start, end: element.end });
    const box = safely(() => elementBox(source, element.start), null);
    for (const piece of element.pieces) {
      const text = cleanText(piece.text);
      if (!isHumanText(text) || fonts?.names.has(text.toLowerCase())) continue;
      const size = piece.style.size;
      texts.push({
        text,
        order: Math.min(element.end - 1, quoteAt + piece.offset),
        fontPx: size,
        ownPx: size,
        color: piece.style.color,
        font: piece.style.font,
        box,
      });
    }
  }
  return { texts, claimed };
}

/** Mini-ronda · 2: textos del almacén con su tamaño y su orden en el documento. Un texto con varias corridas toma la primera. */
function collectStoreTexts(source: string, fonts: FontIndex | null): CanvaText[] {
  const bySpot = new Map<number, CanvaText>();
  // Addendum · corridas: primero los elementos con corridas y estilos; sus tamaños no se vuelven a subir.
  const runs = safely(() => collectRunTexts(source, fonts), { texts: [] as CanvaText[], claimed: [] as RunRange[] });
  for (const text of runs.texts) if (!bySpot.has(text.order)) bySpot.set(text.order, text);
  const claimed = runs.claimed;
  let cursor = 0;
  const inClaimed = (at: number) => {
    while (cursor < claimed.length && claimed[cursor].end <= at) cursor += 1;
    return cursor < claimed.length && claimed[cursor].start <= at;
  };
  let read = 0;
  for (const match of source.matchAll(STORE_SIZE_KEY)) {
    read += 1;
    if (read > STORE_MAX_SIZES) break;
    if (inClaimed(match.index ?? 0)) continue;
    const size = Number(match[1]);
    if (!validStoreSize(size)) continue;
    const found = safely(() => storeTextAt(source, match.index ?? 0, fonts), null);
    if (!found || bySpot.has(found.order)) continue;
    let color: string | null = null;
    for (const literal of found.scope.text.matchAll(COLOR_LITERAL)) {
      color = toHex(literal[1]);
      if (color) break;
    }
    const scopeText = found.scope.text;
    bySpot.set(found.order, {
      text: found.text,
      order: found.order,
      fontPx: size,
      ownPx: size,
      color,
      font: fonts ? safely(() => fontIn(scopeText, fonts), null) : null,
      box: safely(() => elementBox(source, found.order), null),
    });
  }
  for (const match of source.matchAll(STORE_INLINE_SIZE)) {
    read += 1;
    if (read > STORE_MAX_SIZES) break;
    const size = Number(match[1]);
    if (!validStoreSize(size)) continue;
    const text = cleanText(decodeEntities(decodeJsonString(match[2])));
    if (!isHumanText(text)) continue;
    const order = (match.index ?? 0) + match[0].length - 1 - match[2].length;
    if (bySpot.has(order)) continue;
    bySpot.set(order, {
      text,
      order,
      fontPx: size,
      ownPx: size,
      color: null,
      font: null,
      box: safely(() => elementBox(source, order), null),
    });
  }
  return [...bySpot.values()].sort((a, b) => a.order - b.order);
}

/**
 * Mini-ronda · 2: une el almacén al canal principal sin duplicar. Mismo texto y mismo tamaño = mismo elemento; si
 * el gemelo del canal principal no trae tamaño, es el mismo elemento y toma el del almacén.
 */
function withStoreTexts(primary: CanvaText[], store: CanvaText[]): { texts: CanvaText[]; merged: number } {
  const sizeKey = (value: number | null | undefined) => (typeof value === "number" ? value.toFixed(2) : null);
  const sizeOfText = (text: CanvaText) => sizeKey(text.ownPx ?? text.fontPx);
  const texts = primary.map((text) => ({ ...text }));
  const byText = new Map<string, CanvaText[]>();
  const remember = (text: CanvaText) => {
    const key = fold(text.text);
    byText.set(key, [...(byText.get(key) ?? []), text]);
  };
  texts.forEach(remember);
  const orders = new Set(texts.map((text) => text.order));
  let merged = 0;
  for (const item of store) {
    if (orders.has(item.order)) continue;
    const twins = byText.get(fold(item.text)) ?? [];
    const size = sizeKey(item.fontPx);
    if (twins.some((twin) => sizeOfText(twin) === size)) continue;
    const blank = twins.find((twin) => sizeOfText(twin) === null);
    if (blank) {
      blank.fontPx = item.fontPx;
      blank.ownPx = item.ownPx;
      blank.font ??= item.font;
      blank.color ??= item.color;
      blank.box ??= item.box;
      merged += 1;
      continue;
    }
    texts.push(item);
    orders.add(item.order);
    remember(item);
    merged += 1;
  }
  return { texts: texts.sort((a, b) => a.order - b.order), merged };
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
  const primary = collectTexts(source, fonts);
  const colorIndexes = primary.colorIndexes;
  // Mini-ronda · 2: con pocos textos o ninguno con tamaño, se suma la capa del almacén del diseño.
  const sizedTexts = primary.texts.filter((text) => text.fontPx !== null || typeof text.ownPx === "number").length;
  const layered =
    primary.texts.length < STORE_FEW_TEXTS || sizedTexts === 0
      ? withStoreTexts(primary.texts, safely(() => collectStoreTexts(source, fonts), [] as CanvaText[]))
      : { texts: primary.texts, merged: 0 };
  const texts = layered.texts;
  if (videos.length === 0 && texts.length === 0) {
    throw new CanvaFormatError("No encontramos ni textos ni videos en el contenido del sitio.");
  }
  const emptyScan: BandScan = { bands: [], canvasWidth: null, starts: [], startColors: [], lines: [] };
  const { bands, canvasWidth, starts, startColors, lines } = safely(() => collectBands(source, colorIndexes), emptyScan);
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
    bandStartColors: startColors,
    decor,
    lines,
    storeTexts: layered.merged,
  };
}

// ── Lectura del portafolio ──────────────────────────────────────────
export type CanvaSector = {
  /** Nombre del sector tal como se muestra ("Lugares", "Canvas UGC"); null = videos sin sector. */
  label: string | null;
  videos: CanvaAsset[];
  /** Fotos del sector (sin la foto principal): respaldo de portada. */
  photos: CanvaAsset[];
};

/** v2 · R4/R5: una imagen que podría ser un logo; su video, si es seguro; E3: el color de la banda donde vive. */
export type CanvaLogoCandidate = { asset: CanvaAsset; videoUrl: string | null; band: string | null };

export type CanvaHeadings = { sectors: string | null; bio: string | null; metrics: string | null; contact: string | null };

/** Ronda 14B · 3: las secciones de prueba y de fotos que se pueden decidir por contenido. */
export type CanvaProofZone = "metrics" | "testimonials" | "photos";

/**
 * Ronda 14B · 3: una imagen para clasificar por contenido; `zone` es lo que dice la geometría (null = sin zona).
 * Ronda 15 · E2: `group` es la lámina de una imagen sin zona (la visión clasifica la lámina como conjunto).
 */
export type CanvaProofItem = { asset: CanvaAsset; zone: CanvaProofZone | null; group: number | null };

/** Ronda 15 · E1: un servicio leído de su diseño, con sus textos tal cual. */
export type CanvaService = { title: string; description: string };

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
  /** Ronda 14: capturas de la zona de métricas (por geometría: FINAL desde la ronda 15). */
  metricsPhotos: CanvaAsset[];
  /** Ronda 14: capturas de la zona de testimonios (por geometría). */
  testimonialPhotos: CanvaAsset[];
  /** Ronda 14: fotos con tamaño de foto de la zona de fotos (por geometría). */
  galleryPhotos: CanvaAsset[];
  /** Ronda 14B · 4: imágenes con tamaño de logo de la zona de fotos: también son candidatas a logo. */
  galleryLogoSized: CanvaAsset[];
  /** Ronda 14B · 3: lo que el import mira por contenido (zonas de prueba/fotos y láminas sin título). */
  proofPool: CanvaProofItem[];
  /** Ronda 15 · E2: los textos de cada lámina sin título del pool (clave = su `group`). */
  zoneTexts: Record<string, string[]>;
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
  /** v2: los títulos de sección tal como los escribió. */
  headings: CanvaHeadings;
  /** Ronda 15 · B5: la etiqueta de marca de cada video (por URL), tal como está escrita junto a él. */
  videoLabels: Record<string, string>;
  /** Ronda 15 · E1: sus servicios leídos por patrón (vacío si no hay un patrón claro). */
  services: CanvaService[];
};

const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

const isAllCaps = (text: string) => /\p{Lu}/u.test(text) && !/\p{Ll}/u.test(text);

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

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
    if (folded === fold(name)) return false;
    if (fold(name).split(" ").filter(Boolean).includes(folded)) return false;
  }
  return isAllCaps(text) || words.every((word) => isAllCaps(word) || /^\p{Lu}\p{Ll}*$/u.test(word));
}

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
/** Ronda 14B · 2: la detección de secciones VERIFICADA antes de la ronda 14 (decide los cierres de sector). */
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

/** El título de cada sección después del hero. Un título con fuente grande CONFIRMADA gana sobre uno sin dato. */
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

/** Ronda 15 · E4: área con la que el diseño MUESTRA la imagen (su caja), 0 si no se sabe. */
const shownArea = (asset: CanvaAsset) => (asset.box ? asset.box.w * asset.box.h : 0);

/**
 * Foto principal: grande, horizontal o retrato, que no sea una captura de celular (9:16 o más alta) ni un banner.
 * Ronda 15 · E4: con `byArea` (el pool es el primer tramo), entre las que cumplen gana la de mayor área mostrada;
 * sin cajas, la primera (como antes).
 */
function pickHeroPhoto(photos: CanvaAsset[], byArea: boolean): CanvaAsset | null {
  const isGoodShape = (asset: CanvaAsset) => {
    const size = dims(asset);
    return size !== null && Math.min(size.w, size.h) >= 800 && size.h / size.w < 1.7 && size.w / size.h <= 2.2;
  };
  const isLarge = (asset: CanvaAsset) => {
    const size = dims(asset);
    return size !== null && Math.min(size.w, size.h) >= 600;
  };
  const pick = (list: CanvaAsset[]): CanvaAsset | null => {
    if (list.length === 0) return null;
    if (!byArea) return list[0];
    const boxed = list.filter((asset) => asset.box);
    if (boxed.length === 0) return list[0];
    return boxed.reduce((best, asset) => (shownArea(asset) > shownArea(best) ? asset : best));
  };
  return pick(photos.filter(isGoodShape)) ?? pick(photos.filter(isLarge)) ?? photos[0] ?? null;
}

/** v2 · R5: tamaño compatible con un logo (lado mayor ≤ 800). Sin medidas, decide la revisión por píxeles. */
function isLogoSized(asset: CanvaAsset): boolean {
  const size = dims(asset);
  if (!size) return true;
  return Math.max(size.w, size.h) <= 800 && Math.max(size.w, size.h) / Math.min(size.w, size.h) <= 3;
}

/** Ronda 15 · B6: tamaño chico o mediano para la franja por zona (lado mayor ≤ 1200, sin panorámicas extremas). */
const STRIP_ZONE_MAX_SIDE = 1200;
const STRIP_ZONE_MAX_RATIO = 4;
/** Ronda 15 · B6: una lámina es zona de franja si junta al menos estas imágenes y ningún video. */
const STRIP_ZONE_MIN_IMAGES = 2;

function isStripZoneSized(asset: CanvaAsset): boolean {
  const size = dims(asset);
  if (!size) return true;
  const long = Math.max(size.w, size.h);
  return long <= STRIP_ZONE_MAX_SIDE && long / Math.min(size.w, size.h) <= STRIP_ZONE_MAX_RATIO;
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

/** v2 · R1: el tema. null si no hay nada que clonar: ni color de hero ni textura candidata. */
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
  | { kind: "text"; order: number; box: CanvaBox | null; item: CanvaText }
  | { kind: "video"; order: number; box: CanvaBox | null; asset: CanvaAsset }
  | { kind: "photo"; order: number; box: CanvaBox | null; asset: CanvaAsset };

type Region = "hero" | "selector" | "work" | SectionKind;

type Mark = { region: Region; order: number };

/** Ronda 14: tramo del documento [start, end) que pertenece a una sección. */
type Span = { start: number; end: number };

const ZONE_KINDS = ["metrics", "testimonials", "photos", "bio", "contact"] as const;
type ZoneKind = (typeof ZONE_KINDS)[number];
const LOCAL_ZONES: ReadonlySet<SectionKind> = new Set<SectionKind>(["metrics", "testimonials", "photos"]);
const ZONE_OVERFLOW_FACTOR = 2;
const PROOF_POOL_UNTITLED_MAX = 48;
/** Ronda 15 · E2: contexto de una lámina sin título para la visión (textos cortos, tope). */
const ZONE_TEXT_MAX_CHARS = 120;
const ZONE_TEXTS_MAX = 12;
const SECTOR_TITLE_MIN_SHARE = 0.75;

const TEXTURE_MIN_REPEATS = 3;
const COVER_WIDTH_SHARE = 0.9;
const CORNER_TOLERANCE = 2;
const FRAMES_MIN_SHARE = 0.5;
const UPPER_MIN_SHARE = 0.75;
const UPPER_MIN_HEADINGS = 3;
const AIRY_MIN_MARGIN = 0.1;
const AIRY_MIN_PAGES = 2;

/** Ronda 15 · B5: etiqueta de marca de un video (texto vecino). */
const BRAND_LABEL_MAX_WORDS = 4;
const BRAND_LABEL_MAX_CHARS = 40;
/** Hasta dónde llega "pegado": un cuarto del alto del video (mínimo 48 px), con 8 px de solape tolerado. */
const LABEL_REACH = 0.25;
const LABEL_MIN_REACH = 48;
const LABEL_OVERLAP = 8;

/** Ronda 15 · E1: servicios por patrón. */
const SERVICE_HEADING_MAX_CHARS = 60;
const SERVICE_HEADING_MAX_WORDS = 8;
const SERVICE_TITLE_MAX_WORDS = 6;
const SERVICE_DESC_MIN_WORDS = 3;
const SERVICE_MIN_PAIRS = 2;

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

/** Ronda 14C: ¿este texto tiene jerarquía de título de sector en ESTE diseño? */
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

/**
 * Ronda 15 · B1: orden de lectura. Las entradas se recorren en orden de documento y se agrupan por lámina; dentro de
 * una lámina, si TODAS traen caja, se ordenan por posición (y, luego x). Si no, queda el orden del documento.
 * `pageOf` devuelve -1 cuando no hay láminas: entonces nada se reordena.
 */
function visualOrder<T extends { order: number; box?: CanvaBox | null }>(items: T[], pageOf: (order: number) => number): T[] {
  const sorted = [...items].sort((a, b) => a.order - b.order);
  const out: T[] = [];
  let run: T[] = [];
  let runPage: number | null = null;
  const flush = () => {
    if (run.length > 1 && runPage !== null && runPage >= 0 && run.every((item) => item.box)) {
      run.sort((a, b) => {
        const boxA = a.box as CanvaBox;
        const boxB = b.box as CanvaBox;
        return boxA.y - boxB.y || boxA.x - boxB.x || a.order - b.order;
      });
    }
    out.push(...run);
    run = [];
  };
  for (const item of sorted) {
    const page = pageOf(item.order);
    if (page !== runPage) {
      flush();
      runPage = page;
    }
    run.push(item);
  }
  flush();
  return out;
}

/** Ronda 15 · B5: ¿puede ser la etiqueta de marca de un video? Corto, sin datos de contacto ni cifras, no sección. */
function isBrandLabelText(text: string): boolean {
  if (text.includes("\n") || text.length > BRAND_LABEL_MAX_CHARS) return false;
  if (wordCount(text) > BRAND_LABEL_MAX_WORDS) return false;
  if (/@|:\/\//.test(text) || /^\+?\d[\d\s.,]*[kKmM]?\+?$/.test(text)) return false;
  if (!/\p{L}{2,}/u.test(text)) return false;
  return !sectionKind(text) && !SECTOR_HEADING.test(fold(text));
}

/** Ronda 15 · B5: distancia vertical de un texto pegado a un video (debajo o encima, centrado sobre él), o null. */
function labelGap(text: CanvaBox, video: CanvaBox): number | null {
  const center = text.x + text.w / 2;
  if (center < video.x || center > video.x + video.w) return null;
  const reach = Math.max(LABEL_MIN_REACH, video.h * LABEL_REACH);
  const below = text.y - (video.y + video.h);
  const above = video.y - (text.y + text.h);
  const gaps = [below, above].filter((gap) => gap >= -LABEL_OVERLAP && gap <= reach);
  return gaps.length > 0 ? Math.max(0, Math.min(...gaps)) : null;
}

/** Ronda 15 · B5: cada texto se asocia a su video más cercano (sin empates); cada video toma su texto más cercano. */
function labelVideos(texts: CanvaText[], videos: CanvaAsset[], pageOf: (order: number) => number): Record<string, string> {
  const best = new Map<string, { text: CanvaText; gap: number }>();
  for (const text of texts) {
    const box = text.box;
    if (!box) continue;
    let chosen: { video: CanvaAsset; gap: number } | null = null;
    let tie = false;
    for (const video of videos) {
      if (!video.box || pageOf(video.order) !== pageOf(text.order)) continue;
      const gap = labelGap(box, video.box);
      if (gap === null) continue;
      if (!chosen || gap < chosen.gap) {
        chosen = { video, gap };
        tie = false;
      } else if (gap === chosen.gap) tie = true;
    }
    if (!chosen || tie) continue;
    const current = best.get(chosen.video.url);
    if (!current || chosen.gap < current.gap) best.set(chosen.video.url, { text, gap: chosen.gap });
  }
  return Object.fromEntries([...best].map(([url, entry]) => [url, entry.text.text.replace(/\s+/g, " ").trim()]));
}

const sizeOf = (text: CanvaText) => text.ownPx ?? text.fontPx ?? null;

/** Ronda 15 · E1: ¿`upper` está por encima de `lower` en jerarquía? Tamaño (estricto) o, sin tamaños, familia. */
function ranksAbove(upper: CanvaText, lower: CanvaText): boolean | null {
  const a = sizeOf(upper);
  const b = sizeOf(lower);
  if (a !== null && b !== null) return a > b;
  if (upper.font && lower.font) return upper.font !== lower.font;
  return null;
}

/** Ronda 15 · E1: misma jerarquía (mismo tamaño o, sin tamaños, misma familia). */
function sameTier(a: CanvaText, b: CanvaText): boolean {
  const sizeA = sizeOf(a);
  const sizeB = sizeOf(b);
  if (sizeA !== null && sizeB !== null) return sizeA === sizeB;
  return Boolean(a.font) && a.font === b.font;
}

const isServiceTitle = (text: CanvaText) =>
  !text.text.includes("\n") &&
  text.text.length <= LIMITS.serviceTitle &&
  wordCount(text.text) <= SERVICE_TITLE_MAX_WORDS &&
  /\p{L}{2,}/u.test(text.text) &&
  !/@|:\/\//.test(text.text);

const serviceDescription = (text: CanvaText, title: CanvaText): string | null => {
  const value = text.text.replace(/\s+/g, " ").trim();
  if (value.length > LIMITS.serviceDescription || wordCount(value) < SERVICE_DESC_MIN_WORDS) return null;
  if (value.length <= title.text.length || /@|:\/\//.test(value)) return null;
  return value;
};

type ServicePair = { title: CanvaText; description: CanvaText; value: string };

type PairCollector = (
  texts: CanvaText[],
  at: number,
  page: number,
  pageOf: (order: number) => number,
  skip: (text: CanvaText) => boolean,
) => ServicePair[];

/** Ronda 15 · E1: pares ADYACENTES (título, descripción) tras el encabezado, en su lámina y en el mismo nivel. */
const adjacentPairs: PairCollector = (texts, at, page, pageOf, skip) => {
  const pairs: ServicePair[] = [];
  let j = at + 1;
  while (j + 1 < texts.length && pairs.length < LIMITS.maxServices) {
    const title = texts[j];
    const description = texts[j + 1];
    if (skip(title) || skip(description)) break;
    if (pageOf(title.order) !== page || pageOf(description.order) !== page) break;
    if (!isServiceTitle(title)) break;
    const value = serviceDescription(description, title);
    if (!value || ranksAbove(title, description) !== true) break;
    if (pairs.length > 0 && !sameTier(pairs[0].title, title)) break;
    pairs.push({ title, description, value });
    j += 2;
  }
  return pairs;
};

/**
 * Mini-ronda · 2: pares NO adyacentes (solo cuando la capa del almacén aportó textos). El bloque es lo que sigue al
 * encabezado en su lámina, por debajo de él en tamaño (solo textos con tamaño medido). Los títulos son el nivel más
 * alto con al menos SERVICE_MIN_PAIRS títulos cortos; cada título toma el texto corto siguiente más cercano, más
 * chico que él y todavía libre.
 */
const nearestPairs: PairCollector = (texts, at, page, pageOf, skip) => {
  const head = texts[at];
  if (sizeOf(head) === null) return [];
  const block: CanvaText[] = [];
  for (let k = at + 1; k < texts.length; k += 1) {
    const text = texts[k];
    if (pageOf(text.order) !== page) break;
    if (skip(text) || sizeOf(text) === null) continue;
    if (sectionKind(text.text) || ranksAbove(head, text) !== true) break;
    block.push(text);
  }
  const tiers = new Map<number, CanvaText[]>();
  for (const text of block) {
    if (!isServiceTitle(text)) continue;
    const size = sizeOf(text) as number;
    tiers.set(size, [...(tiers.get(size) ?? []), text]);
  }
  const tier = [...tiers.entries()]
    .filter(([, list]) => list.length >= SERVICE_MIN_PAIRS)
    .sort((a, b) => b[0] - a[0])[0];
  if (!tier) return [];
  const [tierSize, titles] = tier;
  const taken = new Set<CanvaText>();
  const pairs: ServicePair[] = [];
  for (const title of titles) {
    if (pairs.length >= LIMITS.maxServices) break;
    let match: ServicePair | null = null;
    for (const text of block.slice(block.indexOf(title) + 1)) {
      if (taken.has(text) || (sizeOf(text) as number) >= tierSize) continue;
      const value = serviceDescription(text, title);
      if (value) {
        match = { title, description: text, value };
        break;
      }
    }
    if (!match) break;
    taken.add(match.description);
    pairs.push(match);
  }
  return pairs;
};

/**
 * Addendum 2: pares POR SECUENCIA (solo con la capa del almacén y solo si las pasadas anteriores no dieron 2 pares).
 * Tras el encabezado y en su lámina: primero una corrida de 2+ títulos cortos con tamaño medido y en el mismo nivel;
 * luego una corrida de descripciones, cada una válida para su título con la definición de siempre. Se empareja en
 * orden título[i] ↔ descripción[i], hasta min(títulos, descripciones). No se exige que el título sea más grande que
 * su descripción; en su lugar, las descripciones emparejadas suman más palabras y más caracteres que sus títulos.
 * Addendum 3: en la corrida de títulos no se mira el patrón de secciones (un título de servicio puede empezar con la
 * misma palabra que una sección); el corte por cambio de lámina, `skip()`, título corto, tamaño medido y mismo nivel
 * sigue igual. Las descripciones conservan el veto por patrón.
 */
const sequencePairs: PairCollector = (texts, at, page, pageOf, skip) => {
  const titles: CanvaText[] = [];
  let k = at + 1;
  for (; k < texts.length; k += 1) {
    const text = texts[k];
    if (pageOf(text.order) !== page || skip(text)) break;
    if (!isServiceTitle(text) || sizeOf(text) === null) break;
    if (titles.length > 0 && !sameTier(titles[0], text)) break;
    titles.push(text);
  }
  if (titles.length < SERVICE_MIN_PAIRS) return [];
  const pairs: ServicePair[] = [];
  for (; k < texts.length && pairs.length < titles.length; k += 1) {
    const description = texts[k];
    if (pageOf(description.order) !== page || skip(description) || sectionKind(description.text)) break;
    const title = titles[pairs.length];
    const value = serviceDescription(description, title);
    if (!value) break;
    pairs.push({ title, description, value });
  }
  const kept = pairs.slice(0, LIMITS.maxServices);
  if (kept.length < SERVICE_MIN_PAIRS) return [];
  const titleTexts = kept.map((pair) => pair.title.text.replace(/\s+/g, " ").trim());
  const descriptionTexts = kept.map((pair) => pair.value);
  const totalWords = (list: string[]) => list.reduce((sum, value) => sum + wordCount(value), 0);
  const totalChars = (list: string[]) => list.reduce((sum, value) => sum + value.length, 0);
  if (totalWords(descriptionTexts) <= totalWords(titleTexts)) return [];
  if (totalChars(descriptionTexts) <= totalChars(titleTexts)) return [];
  return kept;
};

/**
 * Ronda 15 · E1: servicios por patrón. Un encabezado seguido de 2+ pares (título corto, descripción corta) en la
 * misma lámina, sin videos entre medio, con jerarquía medida: encabezado > título > descripción y todos los títulos
 * en el mismo nivel. Sin señal de jerarquía no hay servicios (ante la duda, nada).
 * Mini-ronda · 2: con `loose` (capa del almacén), si no hay pares adyacentes se prueba el emparejamiento cercano.
 * Addendum 2: con `loose`, si ninguna de esas pasadas dio 2 pares, se prueba el emparejamiento por secuencia en orden
 * de documento (mismas guardas de encabezado, de lámina y de videos).
 */
function detectServices(
  texts: CanvaText[],
  pageOf: (order: number) => number,
  blockedPage: (page: number) => boolean,
  skip: (text: CanvaText) => boolean,
  videoOrders: number[],
  loose = false,
): { services: CanvaService[]; used: Set<number> } {
  const scan = (list: CanvaText[], collect: PairCollector): { services: CanvaService[]; used: Set<number> } | null => {
    for (let i = 0; i < list.length; i += 1) {
      const head = list[i];
      if (skip(head) || head.text.includes("\n")) continue;
      if (head.text.length > SERVICE_HEADING_MAX_CHARS || wordCount(head.text) > SERVICE_HEADING_MAX_WORDS) continue;
      if (sectionKind(head.text)) continue;
      const page = pageOf(head.order);
      if (blockedPage(page)) continue;
      const pairs = collect(list, i, page, pageOf, skip);
      if (pairs.length < SERVICE_MIN_PAIRS) continue;
      if (ranksAbove(head, pairs[0].title) !== true) continue;
      const orders = [head.order, ...pairs.flatMap((pair) => [pair.title.order, pair.description.order])];
      const from = Math.min(...orders);
      const to = Math.max(...orders);
      if (videoOrders.some((at) => at > from && at < to)) continue;
      return {
        services: pairs.map((pair) => ({ title: pair.title.text.replace(/\s+/g, " ").trim(), description: pair.value })),
        used: new Set(orders),
      };
    }
    return null;
  };
  const collectors: PairCollector[] = loose ? [adjacentPairs, nearestPairs] : [adjacentPairs];
  for (const collect of collectors) {
    const found = scan(texts, collect);
    if (found) return found;
  }
  if (loose) {
    const found = scan(
      [...texts].sort((a, b) => a.order - b.order),
      sequencePairs,
    );
    if (found) return found;
  }
  return { services: [], used: new Set() };
}

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

  // Ronda 14: láminas (calculadas antes del hero: la ronda 15 · E4 las usa).
  const backgroundAssets = [...site.photos, ...decor].filter(
    (asset) =>
      covers(asset) &&
      asset.box != null &&
      Math.abs(asset.box.x) <= CORNER_TOLERANCE &&
      Math.abs(asset.box.y) <= CORNER_TOLERANCE,
  );
  const backgroundUrls = new Set(backgroundAssets.map((asset) => asset.url));
  const backgroundRefs = backgroundAssets.flatMap((asset) => (asset.refs && asset.refs.length > 0 ? asset.refs : [asset.order]));
  const starts = [...new Set([...(site.bandStarts ?? []), ...(texture?.refs ?? []), ...backgroundRefs])].sort((a, b) => a - b);
  const pageIndexOf = (order: number) => {
    let index = -1;
    for (let i = 0; i < starts.length; i += 1) {
      if (starts[i] <= order) index = i;
      else break;
    }
    return index;
  };
  const pagesKnown = starts.length >= 2;
  const walkPage = (order: number) => (pagesKnown ? pageIndexOf(order) : -1);

  // E3: el color de la banda que contiene una posición.
  const bandStarts = site.bandStarts ?? [];
  const bandColors = site.bandStartColors ?? [];
  const bandColorAt = (order: number): string | null => {
    let color: string | null = null;
    for (let i = 0; i < bandStarts.length; i += 1) {
      if (bandStarts[i] <= order) color = bandColors[i] ?? color;
      else break;
    }
    return color;
  };

  // E4: el primer tramo (antes del selector de sectores o, sin él, la primera lámina con fotos). Gana la de mayor
  // área mostrada; los fondos de lámina solo compiten si no hay otra.
  let heroPool = photos;
  let byArea = false;
  if (headingOrder >= 0) {
    heroPool = photos.filter((photo) => photo.order < headingOrder);
    byArea = true;
  } else if (pagesKnown && photos.length > 0) {
    const firstPage = pageIndexOf(photos[0].order);
    heroPool = photos.filter((photo) => pageIndexOf(photo.order) === firstPage);
    byArea = true;
  }
  const foreground = heroPool.filter((photo) => !backgroundUrls.has(photo.url));
  if (byArea && foreground.length > 0) heroPool = foreground;
  const heroPhoto = pickHeroPhoto(heroPool.length > 0 ? heroPool : photos, byArea && heroPool.length > 0);

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
    if (kind === "contact") span = { start: span.start, end: Math.max(span.end, nextMark) };
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
    return (ZONE_KINDS as readonly string[]).includes(region) ? "work" : region;
  };

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
    if (zone === "metrics") metricsPhotos.push(photo);
    else if (zone === "testimonials") testimonialPhotos.push(photo);
    else if (zone === "photos") {
      if (!isLogoSized(photo)) galleryPhotos.push(photo);
      else {
        galleryLogoSized.push(photo);
        if (mayBeLogo(photo)) candidates.push(photo);
      }
    } else if (zone === "contact") contactPhotos.push(photo);
    else if (zone === "bio") {
      if (!isLogoSized(photo)) bioPhotos.push(photo);
      else {
        bioLogoSized.push(photo);
        if (mayBeLogo(photo)) candidates.push(photo);
      }
    } else if (zone === "selector" && !selectorPhoto && !isLogoSized(photo)) selectorPhoto = photo;
    else if (mayBeLogo(photo)) candidates.push(photo);
  }
  if (contactPhotos.length === 0 && legacyContact) {
    contactPhotos = zonePhotos.filter((photo) => regionIn(legacyMarks, photo.order) === "contact");
  }
  const supportPhoto = bioPhotos[0] ?? null;
  const rateCard = [...contactPhotos].sort((a, b) => area(b) - area(a) || a.order - b.order)[0] ?? null;
  if (rateCard) {
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

  const heroPage = heroPhoto && pagesKnown ? pageIndexOf(heroPhoto.order) : -2;
  const pageHasVideo = (page: number) => page >= 0 && videoOrders.some((at) => pageIndexOf(at) === page);

  // ── Ronda 15 · B6: franja por zona en diseños sin títulos legibles ──
  const untitledDesign = Object.keys(sections).length === 0 && headingOrder < 0;
  if (untitledDesign && pagesKnown) {
    const byPage = new Map<number, CanvaAsset[]>();
    for (const photo of zonePhotos) {
      if (reserved.has(photo.url) || posterUrls.has(photo.url) || backgroundUrls.has(photo.url)) continue;
      const page = pageIndexOf(photo.order);
      if (page < 0 || page === heroPage || pageHasVideo(page)) continue;
      const list = byPage.get(page) ?? [];
      list.push(photo);
      byPage.set(page, list);
    }
    for (const list of byPage.values()) {
      if (list.length < STRIP_ZONE_MIN_IMAGES) continue;
      for (const photo of list) if (isStripZoneSized(photo) && !candidates.includes(photo)) candidates.push(photo);
    }
    candidates.sort((a, b) => a.order - b.order);
  }

  const closingVideo = site.videos.find((video) => zoneOf(video.order, false) === "contact") ?? null;

  // ── Recorrido de sectores (14B · 2: mismas entradas; 15 · B1: en orden de lectura dentro de cada lámina) ──
  const closingOrders = new Set(Object.values(legacySections).map((text) => text.order));
  const events = visualOrder<WalkEvent>(
    [
      ...site.texts.map((item): WalkEvent => ({ kind: "text", order: item.order, box: item.box ?? null, item })),
      ...site.videos.map((asset): WalkEvent => ({ kind: "video", order: asset.order, box: asset.box ?? null, asset })),
      ...photos
        .filter((photo) => photo.url !== heroPhoto?.url && !reserved.has(photo.url))
        .map((asset): WalkEvent => ({ kind: "photo", order: asset.order, box: asset.box ?? null, asset })),
    ],
    walkPage,
  );

  const groups = new Map<string, CanvaSector>();
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
        } else if (key !== current && (groups.get(key)?.videos.length ?? 0) > 0) {
          // Mini-ronda · 1: esta etiqueta ya tuvo su corrida de videos. Un título repetido no reabre ni extiende ese
          // sector: lo que sigue queda SIN sector (entra igual como pieza).
          current = "";
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
  const confirmedTitles = [...groups.entries()].flatMap(([key, group]) => {
    const title = titleOf.get(key);
    return title && group.label !== null && group.videos.length > 0 ? [title] : [];
  });
  const labelsPerGroup = new Map<string, Set<string>>();
  for (const candidate of mixedCandidates) {
    const set = labelsPerGroup.get(candidate.group) ?? new Set<string>();
    set.add(candidate.label);
    labelsPerGroup.set(candidate.group, set);
  }
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

  // ── Ronda 15 · B5: etiqueta de marca por video ──
  const sectorKeys = new Set([...groups.keys()].filter(Boolean));
  const nameKey = fold(name);
  const nameWords = new Set(nameKey.split(" ").filter(Boolean));
  const taglineKey = fold(tagline);
  const isOwnText = (text: CanvaText) => {
    const key = fold(text.text);
    return key === nameKey || nameWords.has(key) || (taglineKey !== "" && key === taglineKey) || sectorKeys.has(key);
  };
  const pieceVideos = site.videos.filter((video) => video.url !== closingVideo?.url);
  const videoLabels = safely(
    () =>
      labelVideos(
        site.texts.filter((text) => isBrandLabelText(text.text) && !isOwnText(text) && !closingOrders.has(text.order)),
        pieceVideos,
        walkPage,
      ),
    {} as Record<string, string>,
  );

  // ── Ronda 15 · E1: servicios por patrón (mini-ronda · 2: emparejamiento cercano solo con la capa del almacén) ──
  const isParagraph = (text: string) => text.length >= 60 && text.split(/\s+/).length >= 8 && !SECTOR_HEADING.test(fold(text));
  const detected = safely(
    () =>
      detectServices(
        visualOrder(site.texts, walkPage),
        walkPage,
        (page) => page >= 0 && (page === heroPage || pageHasVideo(page)),
        (text) => text === nameText || isOwnText(text) || SECTOR_HEADING.test(fold(text.text)),
        videoOrders,
        (site.storeTexts ?? 0) > 0,
      ),
    { services: [] as CanvaService[], used: new Set<number>() },
  );

  // ── 14B · 3 / 15 · E2: lo que se puede decidir por CONTENIDO ──
  const zoneItems: CanvaProofItem[] = [
    ...metricsPhotos.map((asset) => ({ asset, zone: "metrics" as const, group: null })),
    ...testimonialPhotos.map((asset) => ({ asset, zone: "testimonials" as const, group: null })),
    ...galleryPhotos.map((asset) => ({ asset, zone: "photos" as const, group: null })),
    ...galleryLogoSized.map((asset) => ({ asset, zone: "photos" as const, group: null })),
  ];
  const untitled: CanvaProofItem[] = [];
  const zoneTexts: Record<string, string[]> = {};
  if (pagesKnown) {
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
      if (reserved.has(photo.url) || backgroundUrls.has(photo.url)) continue;
      const index = pageIndexOf(photo.order);
      if (index < 0 || pageIsBusy(index)) continue;
      untitled.push({ asset: photo, zone: null, group: index });
      const key = String(index);
      if (!zoneTexts[key]) {
        zoneTexts[key] = site.texts
          .filter((text) => pageIndexOf(text.order) === index && text.text.length <= ZONE_TEXT_MAX_CHARS)
          .slice(0, ZONE_TEXTS_MAX)
          .map((text) => text.text.replace(/\s+/g, " "));
      }
      if (untitled.length >= PROOF_POOL_UNTITLED_MAX) break;
    }
  }
  const proofPool = [...zoneItems, ...untitled];

  const seen = new Set<string>();
  const paragraphs = site.texts
    .filter((text) => !detected.used.has(text.order))
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
    logoCandidates: candidates.map((asset) => ({
      asset,
      videoUrl: associateLogo(asset, site.videos),
      band: bandColorAt(asset.order),
    })),
    metricsPhotos,
    testimonialPhotos,
    galleryPhotos,
    galleryLogoSized,
    proofPool,
    zoneTexts,
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
    videoLabels,
    services: detected.services,
  };
}
