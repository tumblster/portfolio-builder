"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

/*
 * Modal para encuadrar la foto del banner (obs. Fer, ronda 3 15/10). Al subir una foto se abre: muestra cómo se
 * verá recortada a 4:3 (el formato del banner), se arrastra para encuadrar y un deslizador acerca/aleja.
 * Funciona con dedo y con ratón (pointer events). Al confirmar se recorta en el navegador (canvas, 1200×900)
 * y se devuelve el archivo listo para subir.
 */

const OUTPUT_W = 1200;
const OUTPUT_H = 900;

type Offset = { x: number; y: number };

export function BannerCropModal({
  file,
  onConfirm,
  onClose,
}: {
  file: File;
  onConfirm: (file: File) => void;
  onClose: () => void;
}) {
  const [url] = useState(() => URL.createObjectURL(file));
  const areaRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const drag = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const [area, setArea] = useState({ w: 0, h: 0 });
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [error, setError] = useState(false);

  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  // Medir el área de recorte (4:3 por CSS) al montar y al rotar/cambiar tamaño.
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const measure = () => setArea({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Escala base: la foto cubre el área (cover). Con zoom z, tamaño = natural * s0 * z.
  const s0 = natural.w > 0 && area.w > 0 ? Math.max(area.w / natural.w, area.h / natural.h) : 1;
  const rendered = useMemo(
    () => ({ w: natural.w * s0 * zoom, h: natural.h * s0 * zoom }),
    [natural.w, natural.h, s0, zoom],
  );

  const clamp = useCallback(
    (next: Offset): Offset => ({
      x: Math.min(0, Math.max(area.w - rendered.w, next.x)),
      y: Math.min(0, Math.max(area.h - rendered.h, next.y)),
    }),
    [area, rendered],
  );
  // El offset siempre se usa ya limitado: si el área cambia de tamaño (rotación), no se descuadra.
  const safeOffset = clamp(offset);

  function onPointerDown(event: React.PointerEvent) {
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    drag.current = { startX: event.clientX, startY: event.clientY, ox: offset.x, oy: offset.y };
  }
  function onPointerMove(event: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    setOffset(clamp({ x: d.ox + (event.clientX - d.startX), y: d.oy + (event.clientY - d.startY) }));
  }
  function onPointerUp() {
    drag.current = null;
  }

  function onZoom(next: number) {
    // El zoom mantiene el centro del área quieto.
    const cx = area.w / 2 - offset.x;
    const cy = area.h / 2 - offset.y;
    const ratio = next / zoom;
    setZoom(next);
    setOffset(clamp({ x: area.w / 2 - cx * ratio, y: area.h / 2 - cy * ratio }));
  }

  async function confirm() {
    const img = imgRef.current;
    if (!img || natural.w === 0) return;
    const scale = s0 * zoom;
    const sx = Math.max(0, -safeOffset.x / scale);
    const sy = Math.max(0, -safeOffset.y / scale);
    const sw = Math.min(natural.w - sx, area.w / scale);
    const sh = Math.min(natural.h - sy, area.h / scale);
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_W;
    canvas.height = OUTPUT_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, OUTPUT_W, OUTPUT_H);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    if (!blob) return;
    onConfirm(new File([blob], "banner.jpg", { type: "image/jpeg" }));
  }

  // Escape cierra; el fondo no hace scroll mientras el modal está abierto.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Encuadrar la foto del banner"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-card bg-paper p-5 sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-base font-semibold">Encuadra tu banner</p>
        <p className="mt-1 mb-4 text-sm text-muted">Arrastra la foto y usa el deslizador para acercar. Así se verá recortada.</p>
        {error ? (
          <p role="alert" className="text-sm font-semibold text-accent-ink">
            No pudimos leer esa foto. Prueba con otra.
          </p>
        ) : (
          <>
            <div
              ref={areaRef}
              className="relative aspect-[4/3] w-full cursor-grab touch-none overflow-hidden rounded-2xl bg-cream active:cursor-grabbing"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={url}
                alt=""
                draggable={false}
                onLoad={(event) => {
                  const el = event.currentTarget;
                  const nw = el.naturalWidth;
                  const nh = el.naturalHeight;
                  setNatural({ w: nw, h: nh });
                  // Al cargar: la foto arranca centrada en el área (se lee del ref, ya medido al montar).
                  const aw = areaRef.current?.clientWidth ?? 0;
                  const ah = areaRef.current?.clientHeight ?? 0;
                  if (aw > 0 && nw > 0) {
                    const s = Math.max(aw / nw, ah / nh);
                    setOffset({ x: (aw - nw * s) / 2, y: (ah - nh * s) / 2 });
                  }
                }}
                onError={() => setError(true)}
                className="absolute top-0 left-0 max-w-none select-none"
                style={{
                  width: `${rendered.w}px`,
                  height: `${rendered.h}px`,
                  transform: `translate(${safeOffset.x}px, ${safeOffset.y}px)`,
                }}
              />
            </div>
            <label className="mt-4 block text-sm font-semibold">
              Acercar
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                onChange={(event) => onZoom(Number(event.target.value))}
                className="mt-2 w-full accent-[#FC3300]"
                aria-label="Nivel de zoom"
              />
            </label>
          </>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-tap items-center rounded-full border border-ink/60 bg-paper px-5 text-sm font-semibold"
          >
            Cancelar
          </button>
          {!error && (
            <button
              type="button"
              onClick={confirm}
              className="inline-flex min-h-tap items-center rounded-full bg-ink px-5 text-sm font-semibold text-paper"
            >
              Usar esta vista
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
