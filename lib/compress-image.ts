/*
 * Comprime una foto EN EL NAVEGADOR antes de subirla: las del celular suelen pasar
 * de 4 MB y Vercel rechaza cuerpos de más de 4,5 MB.
 * La endereza, la reduce a 1600 px en su lado mayor y la pasa a JPEG. De paso le
 * quita los metadatos (incluido el GPS) antes de que salga del teléfono.
 * El servidor igual la vuelve a normalizar (WebP): esto es para que llegue.
 */

const MAX_SIDE_PX = 1600;
const QUALITY = 0.85;
const MAX_BYTES = 4 * 1024 * 1024;

export async function compressImage(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Formato que este navegador no sabe leer: si ya pesa poco, que lo intente el servidor.
    if (file.size <= MAX_BYTES) return file;
    throw new Error("No pudimos leer esa foto. Prueba con una en JPG o PNG.");
  }

  const scale = Math.min(1, MAX_SIDE_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Este navegador no pudo procesar la foto. Prueba con otro.");
  }
  context.fillStyle = "#16163a"; // si la imagen tiene transparencias, quedan del color del fondo
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
  if (!blob) throw new Error("No pudimos comprimir la foto. Prueba con otra.");
  if (blob.size > MAX_BYTES) throw new Error("La foto sigue pesando más de 4 MB. Prueba con otra.");
  return blob;
}
