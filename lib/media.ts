import "server-only";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { InvalidInputError } from "@/lib/errors";
import { MEDIA_FILE_PATTERN, type StoredImage } from "@/lib/portfolio/schema";
import { getStorage, type StoredMedia } from "@/lib/storage";

/** Vercel acepta hasta 4.5 MB por petición; dejamos margen. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_SIDE_PX = 1600;
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"]);

/**
 * Normaliza y guarda una imagen (subida a mano o copiada de Instagram):
 *  - la endereza según la orientación de la cámara,
 *  - la reduce a 1600 px en su lado mayor (la página pública carga rápido en 4G),
 *  - la convierte a WebP,
 *  - le quita todos los metadatos, incluida la ubicación GPS de las fotos de celular.
 */
export async function saveImage(input: Uint8Array): Promise<StoredImage> {
  if (input.byteLength === 0) throw new InvalidInputError("La imagen está vacía.");
  if (input.byteLength > MAX_UPLOAD_BYTES) {
    throw new InvalidInputError("La imagen pesa más de 4 MB. Sube una versión más liviana.", 413);
  }

  let format: string | undefined;
  try {
    ({ format } = await sharp(input).metadata());
  } catch {
    throw new InvalidInputError("No pudimos leer ese archivo como imagen. Usa JPG, PNG o WebP.");
  }
  if (!format || !ACCEPTED_FORMATS.has(format)) {
    throw new InvalidInputError("Formato no soportado. Usa JPG, PNG o WebP.");
  }

  const { data, info } = await sharp(input)
    .autoOrient()
    .resize({ width: MAX_SIDE_PX, height: MAX_SIDE_PX, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });

  const file = `${randomUUID()}.webp`;
  await getStorage().putMedia(file, data, "image/webp");
  return { url: `/media/${file}`, width: info.width, height: info.height };
}

/** Devuelve la imagen guardada, o null si el nombre no es válido o no existe. */
export async function readImage(file: string): Promise<StoredMedia | null> {
  if (!MEDIA_FILE_PATTERN.test(file)) return null;
  return getStorage().getMedia(file);
}
