"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

/*
 * Modal para encuadrar la foto del banner (obs. Fer, ronda 3 15/10). Al subir una foto se abre: muestra cómo se
 * verá recortada al formato del banner (Creator 4:3, Bio 21:9), se arrastra para encuadrar, un deslizador
 * acerca/aleja y un botón rota la foto en pasos de 90°. Funciona con dedo y con ratón (pointer events).
 * Al confirmar se recorta en el navegador (canvas) y se devuelve el archivo listo para subir.
 */

const OUTPUT_W = 1200;

type Offset = { x: number; y: number };

export function BannerCropModal({
  file,
  aspect = 4 / 3,
  onConfirm,
  onClose,
}: {
  file: File;
  /** Relación de aspecto del recorte (ancho/alto): la del banner de la plantilla elegida. */
  aspect?: number;
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
  const [rotation, setRotation] = useState(0);
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

  // Dimensiones efectivas: con 90°/270° la foto rotada intercambia ancho y alto. Todo el encuadre (escala,
  // límites, recorte) se calcula sobre estas.
  const eff = useMemo(() => {
    const swap = rotation % 180 !== 0;
    return { w: swap ? natural.h : natural.w, h: swap ? natural.w : natural.h };
  }, [natural, rotation]);

  // Escala base: la foto cubre el área (cover). Con zoom z, tamaño = efectiva * s0 * z.
  const s0 = eff.w > 0 && area.w > 0 ? Math.max(area.w / eff.w, area.h / eff.h) : 1;
  const rendered = useMemo(
    () => ({ w: eff.w * s0 * zoom, h: eff.h * s0 * zoom }),
    [eff.w, eff.h, s0, zoom],
  );
  // Tamaño del <img> sin rotar (el giro va por CSS dentro del marco ya posicionado).
  const imgSize = useMemo(
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

  function onRotate() {
    // 16/10 (obs. Fer): rotar la foto en pasos de 90°. Se recentra y el zoom vuelve a 1: predecible.
    const next = (rotation + 90) % 360;
    const swap = next % 180 !== 0;
    const ew = swap ? natural.h : natural.w;
    const eh = swap ? natural.w : natural.h;
    setRotation(next);
    setZoom(1);
    if (area.w > 0 && ew > 0) {
      const s = Math.max(area.w / ew, area.h / eh);
      setOffset({ x: (area.w - ew * s) / 2, y: (area.h - eh * s) / 2 });
    } else {
      setOffset({ x: 0, y: 0 });
    }
  }

  async function confirm() {
    const img = imgRef.current;
    if (!img || natural.w === 0) return;
    const outputH = Math.round(OUTPUT_W / aspect);
    const scale = s0 * zoom;
    const sx = Math.max(0, -safeOffset.x / scale);
    const sy = Math.max(0, -safeOffset.y / scale);
    const sw = Math.min(eff.w - sx, area.w / scale);
    const sh = Math.min(eff.h - sy, area.h / scale);
    // 1. La foto rotada, al tamaño efectivo.
    const rotated = document.createElement("canvas");
    rotated.width = eff.w;
    rotated.height = eff.h;
    const rctx = rotated.getContext("2d");
    if (!rctx) return;
    rctx.translate(eff.w / 2, eff.h / 2);
    rctx.rotate((rotation * Math.PI) / 180);
    rctx.drawImage(img, -natural.w / 2, -natural.h / 2);
    // 2. El recorte de la vista, a la salida.
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_W;
    canvas.height = outputH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(rotated, sx, sy, sw, sh, 0, 0, OUTPUT_W, outputH);
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
        <p className="mt-1 mb-4 text-sm text-muted">Arrastra la foto, usa el deslizador para acercar y rota si hace falta. Así se verá recortada.</p>
        {error ? (
          <p role="alert" className="text-sm font-semibold text-accent-ink">
            No pudimos leer esa foto. Prueba con otra.
          </p>
        ) : (
          <>
            <div
              ref={areaRef}
              className="relative w-full cursor-grab touch-none overflow-hidden rounded-2xl bg-cream active:cursor-grabbing"
              style={{ aspectRatio: `${aspect}` }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              {/* Marco posicionado (encuadre); la foto gira adentro por CSS. */}
              <div
                className="absolute top-0 left-0"
                style={{
                  width: `${rendered.w}px`,
                  height: `${rendered.h}px`,
                  transform: `translate(${safeOffset.x}px, ${safeOffset.y}px)`,
                }}
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
                  className="absolute top-1/2 left-1/2 max-w-none select-none"
                  style={{
                    width: `${imgSize.w}px`,
                    height: `${imgSize.h}px`,
                    transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                  }}
                />
              </div>
            </div>
            <div className="mt-4 flex items-end gap-3">
              <label className="block flex-1 text-sm font-semibold">
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
              <button
                type="button"
                onClick={onRotate}
                className="inline-flex min-h-tap shrink-0 items-center rounded-full border border-ink/60 bg-paper px-4 text-sm font-semibold"
                aria-label="Rotar la foto 90 grados"
              >
                <span aria-hidden="true" className="mr-1.5 inline-block">↻</span>
                Rotar
              </button>
            </div>
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
