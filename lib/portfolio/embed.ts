/*
 * Embeds oficiales para ver una pieza sin salir de la página (spec 3.1 / 7.1, ajuste 30/09: sin autoplay).
 * Sin dependencias: lo usan el reproductor (components/reel/inline-reel.tsx) y la prueba de humo.
 * El play es SIEMPRE manual, en todas las plataformas: el embed se carga en la página (iframe) y la persona le da
 * play dentro del reproductor oficial. Aunque TikTok o YouTube lo permitan, no se pide autoplay (autoplay=0 donde
 * existe el parámetro). Instagram, además, mide al menos 326 px de ancho: el reproductor lo escala para que quepa.
 * Nada se descarga, se aloja ni se proxea aquí (no self-hosting en esta fase).
 *
 * Ronda 6 · 13.3 / 13.23.3: los carruseles de Instagram tienen su propia cadena (carouselEmbedFor): primero
 * /p/{code}/embed/, luego /reel/{code}/embed/ y, si ninguno carga, el reproductor muestra la portada (slide 1) y
 * "Ver carrusel en Instagram" (el post original, en otra pestaña).
 */

/** Ancho mínimo (px) del embed de Instagram. */
export const INSTAGRAM_MIN_WIDTH = 326;

export type Embed = {
  src: string;
  platform: "instagram" | "tiktok" | "youtube";
  /** Siempre false: el play es manual en todas las plataformas (ajuste 30/09). */
  autoplay: false;
  /** Ancho natural del embed (px): Instagram no baja de 326. null = se adapta al espacio. */
  naturalWidth: number | null;
};

export function embedFor(link: { platform: string; url: string }): Embed | null {
  let url: URL;
  try {
    url = new URL(link.url);
  } catch {
    return null;
  }
  const path = url.pathname;
  if (link.platform === "instagram") {
    const code = /\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/.exec(path)?.[1];
    // Experimento 01/10: los reels usan /reel/{code}/embed para probar si el player
    // reproduce inline en móvil (/p/ bota a la app de IG al dar play). Si no funciona,
    // el fallback es botón "Ver en Instagram" (decisión pendiente de prueba en device real).
    const isReel = /\/(?:reel|reels|tv)\//.test(path);
    return code
      ? {
          src: isReel ? `https://www.instagram.com/reel/${code}/embed/` : `https://www.instagram.com/p/${code}/embed/`,
          platform: "instagram",
          autoplay: false,
          naturalWidth: INSTAGRAM_MIN_WIDTH,
        }
      : null;
  }
  if (link.platform === "tiktok") {
    const id = /\/video\/(\d+)/.exec(path)?.[1];
    return id
      ? {
          src: `https://www.tiktok.com/player/v1/${id}?autoplay=0&music_info=0&description=0&rel=0`,
          platform: "tiktok",
          autoplay: false,
          naturalWidth: null,
        }
      : null;
  }
  if (link.platform === "youtube") {
    const id =
      url.searchParams.get("v") ??
      /^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{6,})/.exec(path)?.[1] ??
      (url.hostname.endsWith("youtu.be") ? path.slice(1).split("/")[0] : null);
    return id
      ? {
          src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=0&playsinline=1&rel=0`,
          platform: "youtube",
          autoplay: false,
          naturalWidth: null,
        }
      : null;
  }
  return null;
}

/** Código de un post de Instagram (/p/, /reel/, /reels/ o /tv/); null si el link no es de un post de instagram.com. */
export function instagramCode(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (!/(^|\.)instagram\.com$/i.test(url.hostname)) return null;
  return /^\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/.exec(url.pathname)?.[1] ?? null;
}

/** Carrusel de Instagram (13.3): los embeds a probar, en orden, y el post original para la salida. */
export type CarouselEmbed = {
  platform: "instagram";
  /** En el orden en que se prueban (13.23.3): /p/{code}/embed/ y luego /reel/{code}/embed/. */
  srcs: string[];
  /** El post original, para "Ver carrusel en Instagram" (link externo, otra pestaña). */
  postUrl: string;
  /** Siempre false: el play es manual. */
  autoplay: false;
  naturalWidth: number;
};

export function carouselEmbedFor(link: { platform: string; url: string }): CarouselEmbed | null {
  if (link.platform !== "instagram") return null;
  const code = instagramCode(link.url);
  if (!code) return null;
  return {
    platform: "instagram",
    srcs: [`https://www.instagram.com/p/${code}/embed/`, `https://www.instagram.com/reel/${code}/embed/`],
    postUrl: `https://www.instagram.com/p/${code}/`,
    autoplay: false,
    naturalWidth: INSTAGRAM_MIN_WIDTH,
  };
}
