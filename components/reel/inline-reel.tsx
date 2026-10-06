"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { carouselEmbedFor, embedFor, type CarouselEmbed, type Embed } from "@/lib/portfolio/embed";
import "./inline-reel.css";

/*
 * Reproductor de piezas (spec 3.1 / 7.1; ajuste 30/09: sin autoplay ni hover; ronda 6 · 13.2 y 13.3), patrón facade:
 * la miniatura queda tal cual y el embed oficial se carga recién al interactuar (la carga inicial no trae ningún
 * iframe ni JS de las plataformas). Tap o clic, igual en web y móvil; nunca hover ni autoplay: el iframe ni siquiera
 * recibe el permiso de autoplay, así ninguna plataforma puede arrancar sola.
 *
 * Dos modos (13.23 · 5):
 * - "overlay" (por defecto: portafolio público y studio, 13.2): el video se abre en un overlay dentro de la página,
 *   con fondo negro al 92 % y el reproductor centrado y a la medida de la pantalla (mobile-first, 360 px). Es un
 *   <dialog> modal: la página de atrás queda quieta e inerte, y se cierra con la ×, un tap fuera del reproductor o
 *   Escape (el foco vuelve a la miniatura).
 * - "inline" (solo la landing, §11.14): click-to-load ahí mismo, con el reproductor sobre la miniatura.
 *
 * Carruseles de Instagram (13.3 / 13.23 · 3): con `carousel`, el overlay prueba en cadena /p/{code}/embed/ y luego
 * /reel/{code}/embed/; si ninguno carga, muestra la portada (slide 1, la imagen que ya está guardada) y el botón "Ver
 * carrusel en Instagram" (el post original, en otra pestaña). Nada se descarga ni se proxea. Un iframe de otro sitio
 * no avisa si su contenido se puede reproducir: la cadena avanza cuando un embed no carga a tiempo (o da error), y
 * debajo siempre queda "¿No carga? Ver carrusel en Instagram" como salida manual.
 *
 * Nunca dos a la vez: hay un solo reproductor abierto en toda la página; al abrir otro (o el visor de una foto), el
 * anterior se desmonta y deja de sonar, como en TikTok o Instagram.
 */

let activeId: string | null = null;
const listeners = new Set<() => void>();
function setActive(id: string | null) {
  if (activeId === id) return;
  activeId = id;
  listeners.forEach((listener) => listener());
}
/** Cierra el reproductor abierto, si hay (p. ej. al abrir el visor de una foto): nunca dos visores a la vez. */
export const closeActiveReel = () => setActive(null);

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const MIN_FILL = 200;
const FLOAT_WIDTH = 280;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

/** 13.3: cuánto se espera a que cargue cada embed del carrusel antes de probar el siguiente (o mostrar la portada). */
const CAROUSEL_LOAD_TIMEOUT_MS = 8_000;

/** Permisos del iframe. Sin "autoplay": el play es siempre manual, dentro del reproductor oficial. */
const IFRAME_ALLOW = "encrypted-media; picture-in-picture; fullscreen";

export type ReelMode = "overlay" | "inline";

export function InlineReel({
  link,
  title,
  className,
  children,
  mode = "overlay",
  carousel = null,
}: {
  link: { platform: string; url: string };
  title: string;
  className?: string;
  children: ReactNode;
  /** 13.2 / 13.23 · 5: "overlay" en el portafolio público y el studio (por defecto); "inline" solo en la landing. */
  mode?: ReelMode;
  /** 13.3: la pieza es un carrusel de Instagram (`link` = su post). `cover`: su portada (slide 1), ya guardada. */
  carousel?: { cover: string | null } | null;
}) {
  const id = useId();
  const active = useSyncExternalStore(
    subscribe,
    () => activeId === id,
    () => false,
  );
  const wrap = useRef<HTMLDivElement>(null);
  const player = useRef<HTMLDivElement>(null);
  const chain = carousel ? carouselEmbedFor(link) : null;
  const embed = carousel ? null : embedFor(link);
  // Los carruseles siempre van en overlay: necesitan espacio para la cadena y su salida.
  const inline = mode === "inline" && embed !== null;
  const naturalWidth = embed?.naturalWidth ?? null;

  // Inline: mientras está activo, el reproductor sigue a su miniatura (un rAF por frame, sin re-render).
  useEffect(() => {
    if (!active || !inline) return;
    let frame = 0;
    let last = "";
    const place = () => {
      const media = wrap.current?.querySelector<HTMLElement>("[data-reel-media]") ?? wrap.current;
      const node = player.current;
      if (media && node) {
        const rect = media.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        if (rect.bottom < 0 || rect.top > vh) return setActive(null); // salió de la pantalla
        let { left, top, width, height } = rect;
        if (width < MIN_FILL || height < MIN_FILL) {
          width = Math.min(FLOAT_WIDTH, vw - 24);
          height = Math.min((width * 16) / 9, vh - 24);
          left = clamp(rect.left + rect.width / 2 - width / 2, 12, vw - width - 12);
          top = clamp(rect.top + rect.height / 2 - height / 2, 12, vh - height - 12);
        }
        const key = `${left}|${top}|${width}|${height}`;
        if (key !== last) {
          last = key;
          node.style.transform = `translate(${left}px, ${top}px)`;
          node.style.width = `${width}px`;
          node.style.height = `${height}px`;
          // Instagram mide al menos 326 px: se dibuja a su ancho natural y se escala para que quepa.
          const scale = naturalWidth ? Math.min(1, width / naturalWidth) : 1;
          node.style.setProperty("--reel-scale", String(scale));
        }
      }
      frame = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(frame);
  }, [active, inline, naturalWidth]);

  // Inline: toque fuera o Escape lo cierran. Al desmontarse activo, suelta el turno.
  useEffect(() => {
    if (!active || !inline) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (wrap.current?.contains(target) || player.current?.contains(target)) return;
      setActive(null);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setActive(null);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      if (activeId === id) setActive(null);
    };
  }, [active, inline, id]);

  // Overlay: si la tarjeta se desmonta con el overlay abierto, suelta el turno.
  useEffect(() => {
    if (!active || inline) return;
    return () => {
      if (activeId === id) setActive(null);
    };
  }, [active, inline, id]);

  if (!embed && !chain) return <div className={className}>{children}</div>;

  const platform = chain?.platform ?? embed?.platform;
  // YouTube (salvo los Shorts) es horizontal; TikTok, Instagram y los Shorts, verticales.
  const landscape = embed?.platform === "youtube" && !/\/shorts\//.test(link.url);
  const release = () => {
    if (activeId === id) setActive(null);
  };

  return (
    <div
      ref={wrap}
      className={`reel-card ${className ?? ""}`}
      data-inline-reel={platform}
      data-reel-mode={inline ? "inline" : "overlay"}
      data-reel-carousel={chain ? "" : undefined}
      data-active={active ? "" : undefined}
    >
      {children}
      {inline ? (
        <button
          type="button"
          className="reel-hit"
          aria-label={active ? `Cerrar «${title}»` : `Ver «${title}»`}
          aria-pressed={active}
          onClick={() => setActive(active ? null : id)}
        />
      ) : (
        <button type="button" className="reel-hit" aria-label={`Ver «${title}»`} aria-haspopup="dialog" onClick={() => setActive(id)} />
      )}
      {active &&
        inline &&
        embed &&
        createPortal(
          <div ref={player} className="reel-player" data-platform={embed.platform} role="region" aria-label={`Video: ${title}`}>
            <div className="reel-player__frame">
              <iframe
                src={embed.src}
                title={`Video: ${title}`}
                allow={IFRAME_ALLOW}
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                data-reel-iframe
              />
            </div>
            <button type="button" className="reel-player__close" aria-label="Cerrar el video" onClick={() => setActive(null)}>
              <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
                <path d="M3 3l6 6M9 3l-6 6" />
              </svg>
            </button>
          </div>,
          document.body,
        )}
      {active && !inline && (
        <ReelOverlay
          title={title}
          embed={embed}
          chain={chain}
          cover={carousel?.cover ?? null}
          landscape={landscape}
          onClose={release}
        />
      )}
    </div>
  );
}

/**
 * Overlay (13.2): <dialog> modal a pantalla completa, negro al 92 %, con el reproductor centrado. Se abre UNA vez al
 * montarse (sin dependencias: cambiar de props no lo cierra ni lo reabre) y "close" se escucha con el prop onClose
 * de React. Cierra con la ×, un tap fuera del reproductor o Escape (el "cancel" nativo del diálogo).
 */
function ReelOverlay({
  title,
  embed,
  chain,
  cover,
  landscape,
  onClose,
}: {
  title: string;
  embed: Embed | null;
  chain: CarouselEmbed | null;
  cover: string | null;
  landscape: boolean;
  onClose: () => void;
}) {
  const uid = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    if (node && !node.open) node.showModal();
  }, []);
  const close = () => dialog.current?.close();
  const label = chain ? `Carrusel: ${title}` : `Video: ${title}`;

  return createPortal(
    <dialog
      ref={dialog}
      className="reel-overlay"
      aria-labelledby={`${uid}-title`}
      onClose={onClose}
      // Tap o clic fuera del reproductor (en el fondo negro) lo cierra.
      onClick={(event) => event.target === event.currentTarget && close()}
      data-reel-overlay
    >
      {/* Primera en el orden: al abrir, el foco cae en la × (no dentro del iframe). */}
      <button type="button" className="reel-overlay__close" aria-label="Cerrar" onClick={close}>
        <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
          <path d="M3 3l6 6M9 3l-6 6" />
        </svg>
      </button>
      <div className="reel-overlay__stage" onClick={(event) => event.target === event.currentTarget && close()}>
        <p id={`${uid}-title`} className="sr-only">
          {label}
        </p>
        {chain ? (
          <CarouselPlayer chain={chain} cover={cover} title={title} />
        ) : embed ? (
          <Frame naturalWidth={embed.naturalWidth} landscape={landscape} platform={embed.platform}>
            <iframe
              src={embed.src}
              title={label}
              allow={IFRAME_ALLOW}
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              data-reel-iframe
            />
          </Frame>
        ) : null}
      </div>
    </dialog>,
    document.body,
  );
}

/**
 * Marco del reproductor en el overlay: proporción de la plataforma y medida de la pantalla (CSS). Instagram mide al
 * menos 326 px: si el marco es más angosto, se dibuja a su ancho natural y se escala para que quepa.
 */
function Frame({
  naturalWidth,
  landscape,
  platform,
  children,
}: {
  naturalWidth: number | null;
  landscape: boolean;
  platform: string;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = box.current;
    if (!node || !naturalWidth) return;
    const fit = () => {
      // Mientras el diálogo no está abierto el marco mide 0: se espera a que tenga tamaño.
      if (node.clientWidth > 0) node.style.setProperty("--reel-scale", String(Math.min(1, node.clientWidth / naturalWidth)));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(node);
    return () => observer.disconnect();
  }, [naturalWidth]);
  return (
    <div ref={box} className="reel-overlay__frame" data-platform={platform} data-ratio={landscape ? "landscape" : "portrait"}>
      <span className="reel-overlay__loading" aria-hidden="true">
        Cargando…
      </span>
      <div className="reel-overlay__scaler">{children}</div>
    </div>
  );
}

/**
 * Carrusel (13.3 / 13.23 · 3): prueba los embeds en orden (/p/ y luego /reel/). Si uno no carga en
 * CAROUSEL_LOAD_TIMEOUT_MS (o da error), pasa al siguiente; si ninguno carga, la portada + "Ver carrusel en Instagram".
 */
function CarouselPlayer({ chain, cover, title }: { chain: CarouselEmbed; cover: string | null; title: string }) {
  const [attempt, setAttempt] = useState({ index: 0, loaded: false });
  const failed = attempt.index >= chain.srcs.length;

  useEffect(() => {
    if (failed || attempt.loaded) return;
    const timer = setTimeout(
      () => setAttempt((current) => ({ index: current.index + 1, loaded: false })),
      CAROUSEL_LOAD_TIMEOUT_MS,
    );
    return () => clearTimeout(timer);
  }, [attempt.index, attempt.loaded, failed]);

  const external = (
    <>
      Ver carrusel en Instagram
      <span className="sr-only"> (se abre en otra pestaña)</span>
    </>
  );

  if (failed) {
    return (
      <div className="reel-overlay__frame" data-platform="instagram" data-ratio="portrait" data-carousel-fallback>
        {cover && (
          <Image
            src={cover}
            alt={`Primera imagen del carrusel «${title}»`}
            fill
            sizes="(min-width: 640px) 420px, 92vw"
            className="reel-overlay__cover"
          />
        )}
        <a href={chain.postUrl} target="_blank" rel="noopener noreferrer" className="reel-overlay__external" data-carousel-external>
          {external}
        </a>
      </div>
    );
  }

  const index = attempt.index;
  const src = chain.srcs[index];
  return (
    <>
      <Frame naturalWidth={chain.naturalWidth} landscape={false} platform="instagram">
        <iframe
          key={src}
          src={src}
          title={`Carrusel: ${title}`}
          allow={IFRAME_ALLOW}
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => setAttempt((current) => (current.index === index ? { ...current, loaded: true } : current))}
          onError={() => setAttempt((current) => (current.index === index ? { index: index + 1, loaded: false } : current))}
          data-reel-iframe
          data-carousel-attempt={index + 1}
        />
      </Frame>
      <p className="reel-overlay__hint">
        ¿No carga?{" "}
        <a href={chain.postUrl} target="_blank" rel="noopener noreferrer" data-carousel-external>
          {external}
        </a>
      </p>
    </>
  );
}
