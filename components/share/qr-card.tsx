"use client";

import { useEffect, useState } from "react";
import { errorText, pillButton } from "@/components/brand-ui";
import { displayUrl, qrFileName, qrTargetUrl } from "@/lib/share/qr";

/*
 * Tarjeta de presentación con QR (spec 12.5 → ronda 6 · 13.7). No es un QR suelto: una tarjeta vertical de
 * 1080 × 1350 (la proporción de un post) con la foto y el nombre del portafolio, el QR y el link en texto, lista para
 * mostrar en el celular o imprimir en un evento. El QR lleva ?ref=qr: las visitas que entran escaneándolo se cuentan
 * aparte (12.9). El link impreso va limpio (sin ?ref).
 *
 * Se dibuja en el navegador (canvas) con la foto que ya está guardada en /media (mismo sitio: el canvas no queda
 * "contaminado" y se puede exportar). Nada se sube ni se guarda en el servidor. Colores de la marca: crema, tinta y el
 * acento solo como franja (nunca lleva texto: regla 7:1).
 *
 * "Descargar PNG" (bug del Preview al 06/10: no descargaba nada): antes era un <a download> con un data URL, que
 * algunos navegadores ignoran (sobre todo en el celular y en los navegadores internos de las apps). Ahora el PNG es
 * un Blob (canvas.toBlob) con su URL de objeto, y la descarga la dispara un enlace temporal agregado al documento (lo
 * que piden Firefox y Safari). Si aun así el navegador no descarga, queda "Abre la imagen y guárdala".
 */

const W = 1080;
const H = 1350;
const COLORS = {
  cream: "#f5f5e7",
  ink: "#0e110b",
  muted: "#3f4236",
  accent: "#fc3300",
  white: "#ffffff",
  line: "rgba(14, 17, 11, 0.16)",
} as const;
const NAME_SIZES = [84, 76, 68, 60, 52, 46];

type QrMatrix = { size: number; get: (row: number, col: number) => number | boolean };
type QrCreate = (text: string, options?: { errorCorrectionLevel?: "L" | "M" | "Q" | "H" }) => { modules: QrMatrix };

/** `qrcode` es CommonJS: según el empaquetador, create() llega en el módulo o en su default. */
async function loadQrCreate(): Promise<QrCreate> {
  const mod = (await import("qrcode")) as unknown as { create?: QrCreate; default?: { create?: QrCreate } };
  const create = mod.create ?? mod.default?.create;
  if (!create) throw new Error("La librería de QR no expone create().");
  return create;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

/** La tipografía de la página (la de next/font, ya cargada), para que la tarjeta se vea como el producto. */
async function pageFont(): Promise<string> {
  const family = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
  if ("fonts" in document) {
    await Promise.allSettled([document.fonts.load(`600 48px ${family}`), document.fonts.load(`500 28px ${family}`)]);
  }
  return family;
}

/** Corta el texto en hasta `maxLines` líneas que quepan en `maxWidth`; null si no cabe. */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] | null {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }
    if (ctx.measureText(word).width > maxWidth) return null;
    if (line) lines.push(line);
    line = word;
  }
  if (line) lines.push(line);
  return lines.length <= maxLines ? lines : null;
}

/** Recorta con "…" hasta que quepa. */
function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

/** El nombre en hasta 2 líneas: prueba tamaños de mayor a menor; si ni así cabe, una línea con "…". */
function fitName(ctx: CanvasRenderingContext2D, text: string, font: string, maxWidth: number): { size: number; lines: string[] } {
  for (const size of NAME_SIZES) {
    ctx.font = `600 ${size}px ${font}`;
    const lines = wrapLines(ctx, text, maxWidth, 2);
    if (lines) return { size, lines };
  }
  const size = NAME_SIZES[NAME_SIZES.length - 1];
  ctx.font = `600 ${size}px ${font}`;
  return { size, lines: [ellipsize(ctx, text, maxWidth)] };
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Dibuja la tarjeta y la devuelve como PNG. */
async function drawCard({ name, url, photoUrl }: { name: string; url: string; photoUrl: string | null }): Promise<Blob> {
  const [create, font, photo] = await Promise.all([
    loadQrCreate(),
    pageFont(),
    photoUrl ? loadImage(photoUrl) : Promise.resolve(null),
  ]);
  const qr = create(qrTargetUrl(url), { errorCorrectionLevel: "M" });
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("El navegador no puede dibujar la tarjeta (canvas 2D).");
  const cx = W / 2;
  const cleanName = name.trim() || "Mi portafolio";

  // Fondo crema y una franja de acento arriba (solo gráfico).
  ctx.fillStyle = COLORS.cream;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = COLORS.accent;
  ctx.fillRect(0, 0, W, 14);

  // Foto circular (o la inicial, si no hay foto o no cargó), con un anillo de tinta.
  const avatarY = 210;
  const radius = 110;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, avatarY, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (photo) {
    const scale = Math.max((radius * 2) / photo.naturalWidth, (radius * 2) / photo.naturalHeight);
    const width = photo.naturalWidth * scale;
    const height = photo.naturalHeight * scale;
    ctx.drawImage(photo, cx - width / 2, avatarY - height / 2, width, height);
  } else {
    ctx.fillStyle = COLORS.ink;
    ctx.fillRect(cx - radius, avatarY - radius, radius * 2, radius * 2);
    ctx.fillStyle = COLORS.cream;
    ctx.font = `600 104px ${font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(cleanName.charAt(0).toLocaleUpperCase("es"), cx, avatarY + 4);
  }
  ctx.restore();
  ctx.lineWidth = 6;
  ctx.strokeStyle = COLORS.ink;
  ctx.beginPath();
  ctx.arc(cx, avatarY, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Eyebrow neutral (11.7) y el nombre (hasta 2 líneas; si no cabe, se achica).
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = COLORS.muted;
  ctx.font = `600 28px ${font}`;
  ctx.fillText("UGC CREATOR", cx, 382);
  const { size, lines } = fitName(ctx, cleanName, font, W - 160);
  ctx.fillStyle = COLORS.ink;
  ctx.font = `600 ${size}px ${font}`;
  let baseline = 400 + size;
  for (const line of lines) {
    ctx.fillText(line, cx, baseline);
    baseline += Math.round(size * 1.08);
  }

  // El QR, en una tarjeta blanca con su zona de silencio.
  const quiet = 48;
  const qrSize = 444;
  const cardSize = qrSize + quiet * 2;
  const cardX = cx - cardSize / 2;
  const cardY = 604;
  ctx.fillStyle = COLORS.white;
  roundedRect(ctx, cardX, cardY, cardSize, cardSize, 36);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = COLORS.line;
  ctx.stroke();
  const count = qr.modules.size;
  const cell = qrSize / count;
  ctx.fillStyle = COLORS.ink;
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (!qr.modules.get(row, col)) continue;
      // Bordes redondeados a píxeles enteros: sin rendijas entre módulos.
      const x0 = Math.round(cardX + quiet + col * cell);
      const y0 = Math.round(cardY + quiet + row * cell);
      const x1 = Math.round(cardX + quiet + (col + 1) * cell);
      const y1 = Math.round(cardY + quiet + (row + 1) * cell);
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
  }

  // Llamado, link y firma.
  const below = cardY + cardSize;
  ctx.fillStyle = COLORS.ink;
  ctx.font = `600 38px ${font}`;
  ctx.fillText("Escanéame y mira mi portafolio", cx, below + 66);
  ctx.fillStyle = COLORS.muted;
  ctx.font = `500 28px ${font}`;
  ctx.fillText(ellipsize(ctx, displayUrl(url), W - 160), cx, below + 112);
  ctx.font = `500 22px ${font}`;
  ctx.fillText("Hecho con Supercreador", cx, H - 36);

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No se pudo exportar la tarjeta."))), "image/png"),
  );
}

type Card = { href: string };

export function QrCard({ name, url, photoUrl, slug }: { name: string; url: string; photoUrl: string | null; slug: string }) {
  const [card, setCard] = useState<Card | null>(null);
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let alive = true;
    let href: string | null = null;
    Promise.resolve()
      // El link del portafolio, absoluto (el QR tiene que funcionar fuera de esta página).
      .then(() => drawCard({ name, url: new URL(url, window.location.origin).toString(), photoUrl }))
      .then((blob) => {
        href = URL.createObjectURL(blob);
        if (alive) setCard({ href });
        else URL.revokeObjectURL(href);
      })
      .catch((error: unknown) => {
        console.warn("[qr] no se pudo armar la tarjeta:", error);
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
      if (href) URL.revokeObjectURL(href);
    };
  }, [name, url, photoUrl]);

  function download() {
    if (!card) return;
    const fileName = qrFileName(slug);
    // Un enlace temporal en el documento: Firefox y Safari no descargan con un enlace suelto.
    const link = document.createElement("a");
    link.href = card.href;
    link.download = fileName;
    link.rel = "noopener";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setStatus(`Descargando ${fileName}.`);
  }

  return (
    <figure className="flex flex-wrap items-start gap-4" data-testid="ready-qr-card">
      {card ? (
        // eslint-disable-next-line @next/next/no-img-element -- imagen armada en el navegador (URL de objeto)
        <img
          src={card.href}
          alt={`Tarjeta con el código QR del portafolio de ${name}`}
          width={144}
          height={180}
          className="h-[180px] w-[144px] rounded-xl border border-line object-cover"
        />
      ) : (
        <span aria-hidden="true" className="block h-[180px] w-[144px] rounded-xl border border-line bg-sand" />
      )}
      <figcaption className="min-w-0 flex-1 basis-48 text-sm">
        <span className="block font-semibold text-ink">Tarjeta con QR para eventos</span>
        <span className="mt-1 block text-muted">
          Tu foto, tu nombre y un QR a tu portafolio. Las visitas que lleguen escaneándolo se cuentan como «QR».
        </span>
        <button type="button" onClick={download} disabled={!card} className={`${pillButton} mt-3`} data-testid="ready-qr">
          {card || failed ? "Descargar PNG" : "Preparando…"}
        </button>
        {card && (
          <a
            href={card.href}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 block text-sm text-muted underline underline-offset-4 hover:text-ink"
          >
            ¿No se descargó? Abre la imagen y guárdala<span className="sr-only"> (se abre en otra pestaña)</span>
          </a>
        )}
        {failed && (
          <span role="alert" className={`${errorText} mt-2 block`}>
            No pudimos armar la tarjeta. Recarga la página e intenta de nuevo.
          </span>
        )}
        <span className="sr-only" aria-live="polite">
          {status}
        </span>
      </figcaption>
    </figure>
  );
}
