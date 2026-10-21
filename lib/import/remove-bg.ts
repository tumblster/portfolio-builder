import "server-only";
import sharp from "sharp";

/*
 * Importador de Canva v2 · R5: logos con fondo blanco.
 *
 * isWhiteBoxedLogo: la confirmación por píxeles de que una imagen es un logo. El parser
(puro, sin bytes) solo
 * marca candidatos; aquí se mira el borde: ≥95 % de píxeles casi blancos (cada canal >
240) y lado mayor ≤ 800 px.
 *
 * removeWhiteBackground: clave de blanco determinista, probada con los logos de la
fixture.
 * whiteness = min(r, g, b)
 * alpha = clip((252 - whiteness) / (252 - 225), 0, 1)         (1 = contenido opaco)
 * rgb      = clip((rgb - 255·(1 - alpha)) / max(alpha, ε), 0, 255) (des-velar el borde contra
blanco)
 * Devuelve un PNG con transparencia. Si algo falla, quien llama usa el original (nunca es
un error del import).
 */

export const LOGO_MAX_SIDE = 800;
const NEAR_WHITE = 240;
const BORDER_WHITE_RATIO = 0.95;
const KEY_HIGH = 252;
const KEY_LOW = 225;
const EPSILON = 1e-3;

/** ¿Es un logo con caja blanca? false ante cualquier duda (si dudás, no es logo). */
export async function isWhiteBoxedLogo(input: Buffer): Promise<boolean> {
  const meta = await sharp(input).metadata();
  if (!meta.width || !meta.height || Math.max(meta.width, meta.height) > LOGO_MAX_SIDE)
return false;
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject:
true });
  const { width, height, channels } = info;
  if (width < 2 || height < 2) return false;

 let white = 0;
 let total = 0;
 const check = (x: number, y: number) => {
   const i = (y * width + x) * channels;
   total += 1;
    // Un borde transparente NO cuenta como blanco: podría ser un recorte de la creadora.
    if (data[i + 3] >= 250 && data[i] > NEAR_WHITE && data[i + 1] > NEAR_WHITE && data[i
+ 2] > NEAR_WHITE) white += 1;
  };
  for (let x = 0; x < width; x += 1) {
    check(x, 0);
    check(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    check(0, y);
    check(width - 1, y);
  }
  return total > 0 && white / total >= BORDER_WHITE_RATIO;
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

/** El logo sin su fondo blanco, como PNG con transparencia. */
export async function removeWhiteBackground(input: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject:
true });
  const { width, height, channels } = info;
  const output = Buffer.alloc(width * height * 4);
  const clip = (value: number, min: number, max: number) => Math.min(max, Math.max(min,
value));

    for (let p = 0; p < width * height; p += 1) {
      const i = p * channels;
      const o = p * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const originalAlpha = data[i + 3] / 255;
      const whiteness = Math.min(r, g, b);
      const alpha = clip((KEY_HIGH - whiteness) / (KEY_HIGH - KEY_LOW), 0, 1);
      const divisor = Math.max(alpha, EPSILON);
      output[o] = Math.round(clip((r - 255 * (1 - alpha)) / divisor, 0, 255));
      output[o + 1] = Math.round(clip((g - 255 * (1 - alpha)) / divisor, 0, 255));
      output[o + 2] = Math.round(clip((b - 255 * (1 - alpha)) / divisor, 0, 255));
      output[o + 3] = Math.round(alpha * originalAlpha * 255);
    }

    return sharp(output, { raw: { width, height, channels: 4 } }).png().toBuffer();
}
