import "server-only";
import sharp from "sharp";

/*
 * Importador de Canva v2 · R5: logos con fondo blanco.
 *
 * isWhiteBoxedLogo: la confirmación por píxeles de que una imagen es un logo. El parser (puro, sin bytes) solo
 * marca candidatos; aquí se mira el borde: ≥95 % de píxeles casi blancos (cada canal > 240) y lado mayor ≤ 800 px.
 *
 * removeWhiteBackground: clave de blanco determinista, probada con los logos de la fixture.
 *   whiteness = min(r, g, b)
 *   alpha     = clip((252 - whiteness) / (252 - 225), 0, 1)               (1 = contenido opaco)
 *   rgb       = clip((rgb - 255·(1 - alpha)) / max(alpha, ε), 0, 255)    (des-velar el borde contra blanco)
 * Devuelve un PNG con transparencia. Si algo falla, quien llama usa el original (nunca es un error del import).
 *
 * Ronda de corrección · F4: dos modos de clave.
 * - "global" (el de siempre): todo el blanco se vuelve transparente. Para logos de poca tinta, donde los huecos de
 *   sus letras también son fondo.
 * - "edge": solo el blanco CONECTADO al borde de la imagen (la caja o los bordes blancos). Para logos a color,
 *   avatares e insignias: su fondo propio y sus blancos interiores quedan intactos (nunca se les recorta el fondo).
 * whiteBorderShare mide qué parte del borde es blanca, sin tope de tamaño: detecta cajas y bordes blancos.
 * hasRealTransparency (F5) dice si el archivo original ya viene con transparencia real.
 */

export const LOGO_MAX_SIDE = 800;
const NEAR_WHITE = 240;
const BORDER_WHITE_RATIO = 0.95;
const KEY_HIGH = 252;
const KEY_LOW = 225;
const EPSILON = 1e-3;
const OPAQUE = 250;
const BORDER_SAMPLE_SIDE = 400;
const TRANSPARENT_SAMPLE_SIDE = 64;
const TRANSPARENT_MIN_SHARE = 0.02;

export type BackgroundMode = "global" | "edge";

type Raw = { data: Buffer; width: number; height: number; channels: number };

/** Parte del borde que es blanco opaco (0 a 1). Un borde transparente NO cuenta: podría ser un recorte. */
function borderWhite({ data, width, height, channels }: Raw): number {
  if (width < 2 || height < 2) return 0;
  let white = 0;
  let total = 0;
  const check = (x: number, y: number) => {
    const i = (y * width + x) * channels;
    total += 1;
    if (data[i + 3] >= OPAQUE && data[i] > NEAR_WHITE && data[i + 1] > NEAR_WHITE && data[i + 2] > NEAR_WHITE) white += 1;
  };
  for (let x = 0; x < width; x += 1) {
    check(x, 0);
    check(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    check(0, y);
    check(width - 1, y);
  }
  return total > 0 ? white / total : 0;
}

/** ¿Es un logo con caja blanca? false ante cualquier duda (si dudás, no es logo). */
export async function isWhiteBoxedLogo(input: Buffer): Promise<boolean> {
  const meta = await sharp(input).metadata();
  if (!meta.width || !meta.height || Math.max(meta.width, meta.height) > LOGO_MAX_SIDE) return false;
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width < 2 || info.height < 2) return false;
  return borderWhite({ data, width: info.width, height: info.height, channels: info.channels }) >= BORDER_WHITE_RATIO;
}

/** F4: qué parte del borde es blanca, a cualquier tamaño (cajas blancas y bordes blancos). */
export async function whiteBorderShare(input: Buffer): Promise<number> {
  const { data, info } = await sharp(input)
    .resize(BORDER_SAMPLE_SIDE, BORDER_SAMPLE_SIDE, { fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return borderWhite({ data, width: info.width, height: info.height, channels: info.channels });
}

/** F5: ¿el archivo ya trae transparencia real (no solo un canal alfa lleno)? */
export async function hasRealTransparency(input: Buffer): Promise<boolean> {
  const meta = await sharp(input).metadata();
  if (!meta.hasAlpha) return false;
  const { data, info } = await sharp(input)
    .resize(TRANSPARENT_SAMPLE_SIDE, TRANSPARENT_SAMPLE_SIDE, { fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = info.width * info.height;
  let clear = 0;
  for (let i = 3; i < data.length; i += info.channels) if (data[i] < OPAQUE) clear += 1;
  return pixels > 0 && clear / pixels >= TRANSPARENT_MIN_SHARE;
}

/**
 * Un logo tiene contenido visible: si la imagen es prácticamente un fondo
 * vacío (una textura, un papel en blanco), no es un logo aunque su borde sea
 * blanco. Tinta = píxeles cuyo canal mínimo baja de 235; un logo real supera
 * el 4 % y una textura vacía mide 0 %.
 */
export async function hasVisibleContent(input: Buffer): Promise<boolean> {
  const { data, info } = await sharp(input)
    .resize(128, 128, { fit: "inside" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let ink = 0;
  const pixels = info.width * info.height;
  for (let i = 0; i < data.length; i += info.channels) {
    if (Math.min(data[i], data[i + 1], data[i + 2]) < 235) ink += 1;
  }
  return pixels > 0 && ink / pixels >= 0.01;
}

/**
 * F4 · modo "edge": los píxeles de fondo son los blancos (o ya transparentes) CONECTADOS al borde. Relleno por
 * inundación desde los cuatro lados (vecindad 4). Lo que no se alcanza (blancos interiores) queda intacto.
 */
function edgeBackground(data: Buffer, width: number, height: number, channels: number): Uint8Array {
  const total = width * height;
  const background = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  const passable = (p: number) => {
    const i = p * channels;
    return data[i + 3] < OPAQUE || Math.min(data[i], data[i + 1], data[i + 2]) >= KEY_LOW;
  };
  const visit = (p: number) => {
    if (background[p] || !passable(p)) return;
    background[p] = 1;
    queue[tail] = p;
    tail += 1;
  };
  for (let x = 0; x < width; x += 1) {
    visit(x);
    visit((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    visit(y * width);
    visit(y * width + width - 1);
  }
  while (head < tail) {
    const p = queue[head];
    head += 1;
    const x = p % width;
    if (x > 0) visit(p - 1);
    if (x < width - 1) visit(p + 1);
    if (p >= width) visit(p - width);
    if (p < total - width) visit(p + width);
  }
  return background;
}

/** El logo sin su fondo blanco, como PNG con transparencia. */
export async function removeWhiteBackground(input: Buffer, mode: BackgroundMode = "global"): Promise<Buffer> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const output = Buffer.alloc(width * height * 4);
  const clip = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  const background = mode === "edge" ? edgeBackground(data, width, height, channels) : null;

  for (let p = 0; p < width * height; p += 1) {
    const i = p * channels;
    const o = p * 4;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const originalAlpha = data[i + 3] / 255;
    const whiteness = Math.min(r, g, b);
    const keyed = clip((KEY_HIGH - whiteness) / (KEY_HIGH - KEY_LOW), 0, 1);
    const alpha = background && !background[p] ? 1 : keyed;
    const divisor = Math.max(alpha, EPSILON);
    output[o] = Math.round(clip((r - 255 * (1 - alpha)) / divisor, 0, 255));
    output[o + 1] = Math.round(clip((g - 255 * (1 - alpha)) / divisor, 0, 255));
    output[o + 2] = Math.round(clip((b - 255 * (1 - alpha)) / divisor, 0, 255));
    output[o + 3] = Math.round(alpha * originalAlpha * 255);
  }

  return sharp(output, { raw: { width, height, channels: 4 } }).png().toBuffer();
}
