/*
 * Convierte lo que se pegó en un usuario de Instagram válido.
 * Acepta: "https://www.instagram.com/valen.ugc/?hl=es", "instagram.com/valen.ugc",
 * "@valen.ugc", "valen.ugc", y links de historias (instagram.com/stories/valen.ugc/…).
 * No depende del servidor: la pantalla lo usa para avisar al instante y la API lo repite.
 */

export type UsernameResult = { ok: true; username: string } | { ok: false; error: string };

const USERNAME = /^[a-z0-9._]{1,30}$/;
const POST_PATHS = new Set(["p", "reel", "reels", "tv"]);
const NOT_PROFILES = new Set(["explore", "accounts", "direct", "about", "legal", "developer"]);

export function parseInstagramUsername(raw: string): UsernameResult {
  const text = raw.trim();
  if (!text) return { ok: false, error: "Pega el link o el usuario de Instagram." };

  let candidate = text;
  if (/instagram\.com/i.test(text)) {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    } catch {
      return { ok: false, error: "Ese link no se ve bien. Cópialo de nuevo desde Instagram." };
    }
    if (!/(^|\.)instagram\.com$/i.test(url.hostname)) {
      return { ok: false, error: "Pega un link de instagram.com." };
    }
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments[0] === "_u" || segments[0] === "stories") segments.shift();
    const first = segments[0]?.toLowerCase();
    if (!first) return { ok: false, error: "Falta el usuario en el link: debería verse como instagram.com/usuario" };
    if (POST_PATHS.has(first)) {
      return { ok: false, error: "Ese es el link de una publicación. Pega el link del perfil: instagram.com/usuario" };
    }
    if (NOT_PROFILES.has(first)) return { ok: false, error: "Ese link no es de un perfil. Pega instagram.com/usuario" };
    candidate = first;
  }

  const username = candidate.replace(/^@/, "").toLowerCase();
  if (!USERNAME.test(username)) {
    return { ok: false, error: "Ese usuario no es válido: solo lleva letras, números, puntos y guiones bajos." };
  }
  return { ok: true, username };
}

export const instagramProfileUrl = (username: string) => `https://www.instagram.com/${username}/`;
