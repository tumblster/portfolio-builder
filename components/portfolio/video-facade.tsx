import { youtubeId } from "@/lib/portfolio/embed";
import type { VideoLink } from "@/lib/portfolio/schema";
import "./video-facade.css";

/*
 * Prototipo exp/embed-facade: fachada liviana para piezas que son solo un link de video
 * (sin imagen de portada). La tarjeta la diseñamos nosotros: cero chrome de la plataforma
 * (nada de "Ver en Instagram", likes, "Ver perfil" ni avatares ajenos). El reproductor
 * oficial se abre recién al tocar, vía el InlineReel que ya envuelve la pieza.
 *
 * - YouTube: miniatura determinística (img.youtube.com/vi/{id}/hqdefault.jpg, sin API).
 * - Instagram / TikTok: no exponen miniatura sin llamada de red → tarjeta diseñada.
 * No carga ningún iframe ni JS de las plataformas: solo una <img> en YouTube.
 */

const PLATFORM_LABEL = { instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube" } as const;

export function VideoFacade({ video }: { video: VideoLink }) {
  const platform = video.platform === "instagram" || video.platform === "tiktok" || video.platform === "youtube" ? video.platform : null;
  const thumb = platform === "youtube" ? youtubeId(video.url) : null;
  const label = platform ? PLATFORM_LABEL[platform] : "Video";
  return (
    <span className="vf" aria-hidden="true" data-vf-platform={platform ?? "video"}>
      {thumb ? (
        // Miniatura externa de YouTube: no pasa por el optimizador de Vercel a propósito
        // (next.config solo permite /media/** para no pagar ancho de banda).
        // eslint-disable-next-line @next/next/no-img-element
        <img className="vf__thumb" src={`https://img.youtube.com/vi/${thumb}/hqdefault.jpg`} alt="" loading="lazy" />
      ) : (
        <span className="vf__art" />
      )}
      <span className="vf__scrim" />
      <span className="vf__play">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M8 5.5v13l11-6.5z" />
        </svg>
      </span>
      <span className="vf__platform">{label}</span>
    </span>
  );
}
