/*
 * El nombre de Instagram suele traer el "qué hace" pegado: "Daniela Gadea | Marca Personal para profesionales".
 * En el hero (con letras grandes) eso se ve larguísimo: se separa en nombre + tagline. El tagline va abajo del
 * nombre, como tag o descripción. Regla determinista sobre separadores (no se le deja a la IA adivinar el nombre
 * de alguien): parte en el PRIMER separador; los guiones exigen espacios alrededor para no romper "María-José".
 */

/** Lo que sigue al separador: "Marca Personal para profesionales". */
export const TAGLINE_MAX = 60;

const SEPARATOR = /\s*[|·•/:]\s*|\s+[-–—]\s+/;

export function splitNameTagline(fullName: string): { name: string; tagline: string } {
  const clean = fullName.trim();
  const match = SEPARATOR.exec(clean);
  if (!match || match.index === undefined) return { name: clean, tagline: "" };
  const name = clean.slice(0, match.index).trim();
  const tagline = clean
    .slice(match.index + match[0].length)
    .trim()
    .slice(0, TAGLINE_MAX);
  if (!name || !tagline) return { name: clean, tagline: "" };
  return { name, tagline };
}
