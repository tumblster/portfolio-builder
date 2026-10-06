import "server-only";
import sharp from "sharp";

/*
 * Color dominante de una imagen, para la paleta "de su foto" (lib/palette/palettes.ts).
 * Sin teoría avanzada: se achica la foto a 48×48, se descartan los píxeles casi grises, casi
 * negros o casi blancos (fondos, sombras) y gana el tono con más presencia, pesado por su
 * saturación. Si la foto casi no tiene color, null: la paleta "de su foto" no se ofrece.
 */

const SIZE = 48;
const HUE_BUCKETS = 24;
const MIN_COLORFUL_SHARE = 0.06; // al menos 6 % de píxeles con color

export async function extractSwatch(input: Uint8Array): Promise<string | null> {
  const { data, info } = await sharp(input).resize(SIZE, SIZE, { fit: "cover" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const buckets = Array.from({ length: HUE_BUCKETS }, () => ({ weight: 0, r: 0, g: 0, b: 0, count: 0 }));
  let colorful = 0;
  const pixels = info.width * info.height;

  for (let offset = 0; offset < data.length; offset += info.channels) {
    const [r, g, b] = [data[offset], data[offset + 1], data[offset + 2]];
    const max = Math.max(r, g, b) / 255;
    const min = Math.min(r, g, b) / 255;
    const l = (max + min) / 2;
    const d = max - min;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    if (s < 0.2 || l < 0.12 || l > 0.92) continue;
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const h = max === rn ? ((gn - bn) / d + 6) % 6 : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
    const bucket = buckets[Math.floor((h / 6) * HUE_BUCKETS) % HUE_BUCKETS];
    bucket.weight += s;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.count += 1;
    colorful += 1;
  }

  if (colorful / pixels < MIN_COLORFUL_SHARE) return null;
  const best = buckets.reduce((top, bucket) => (bucket.weight > top.weight ? bucket : top));
  const hex = (value: number) => Math.round(value / best.count).toString(16).padStart(2, "0");
  return `#${hex(best.r)}${hex(best.g)}${hex(best.b)}`;
}
