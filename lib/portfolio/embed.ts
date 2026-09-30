/*
 * Embeds oficiales para ver una pieza sin salir de la página (spec 3.1, adelantado a la ronda 30/09 · 7.1,
 * ajuste 30/09: play siempre manual, sin autoplay ni hover-to-play).
 * Sin dependencias: lo usan el reproductor (components/reel/inline-reel.tsx) y la prueba de humo.
 * - TikTok y YouTube: reproductor oficial SIN autoplay; el play es manual con tap/click.
 * - Instagram: su embed oficial NO permite autoplay; se carga ahí mismo y se reproduce con un toque dentro de él.
 *   Además mide al menos 326 px de ancho (mínimo de Instagram): el reproductor lo escala para que quepa.
 * Nada se descarga ni se aloja aquí (no self-hosting en esta fase).
 */

export type Embed = {
  src: string;
  platform: "instagram" | "tiktok" | "youtube";
  /** Si el reproductor empieza solo al cargarse. Siempre false: el play es manual (decisión 30/09). */
  autoplay: boolean;
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
    return code
      ? { src: `https://www.instagram.com/p/${code}/embed/`, platform: "instagram", autoplay: false, naturalWidth: 326 }
      : null;
  }
  if (link.platform === "tiktok") {
    const id = /\/video\/(\d+)/.exec(path)?.[1];
    return id
      ? {
          src: `https://www.tiktok.com/player/v1/${id}?loop=1&music_info=0&description=0&rel=0`,
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
          src: `https://www.youtube-nocookie.com/embed/${id}?playsinline=1&loop=1&playlist=${id}&rel=0`,
          platform: "youtube",
          autoplay: false,
          naturalWidth: null,
        }
      : null;
  }
  return null;
}
