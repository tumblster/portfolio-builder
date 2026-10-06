/*
 * Género de la creadora (ronda 6 · 13.11) y los textos de WhatsApp que dependen de él (13.8 · 13.23 · 2).
 * Sin dependencias: lo usan el esquema, las plantillas (servidor), el header del portafolio (cliente), el modal
 * "Portafolio listo" y la prueba de humo.
 *
 * Nunca se infiere por la foto ni por el nombre (13.11): lo elige ella (onboarding, 13.15). Sin dato, o con "Otro" o
 * "Prefiero no decirlo", los textos van en neutro. El eyebrow del portafolio sigue siendo "UGC Creator" (11.7).
 */

export const GENDERS = ["hombre", "mujer", "otro", "prefiero-no-decirlo"] as const;
export type Gender = (typeof GENDERS)[number];

/** Las opciones exactas del spec, en su orden. */
export const GENDER_LABEL: Record<Gender, string> = {
  hombre: "Hombre",
  mujer: "Mujer",
  otro: "Otro",
  "prefiero-no-decirlo": "Prefiero no decirlo",
};

export const isGender = (value: unknown): value is Gender =>
  typeof value === "string" && (GENDERS as readonly string[]).includes(value);

/** "supercreadora" (Mujer) o "supercreador" (Hombre); null en neutro (Otro, Prefiero no decirlo o sin dato). */
export function creatorNoun(gender: Gender | null | undefined): string | null {
  if (gender === "mujer") return "supercreadora";
  if (gender === "hombre") return "supercreador";
  return null;
}

/**
 * 12.4 · 13.8: el texto para compartir el portafolio por WhatsApp (lo manda la creadora).
 * Neutro (13.23 · 2): "Conoce mi trabajo 😀: [link]".
 */
export function shareMessage(gender: Gender | null | undefined, link: string): string {
  const noun = creatorNoun(gender);
  return noun ? `Conoce mi trabajo como ${noun} 😀: ${link}` : `Conoce mi trabajo 😀: ${link}`;
}

/**
 * 12.6 · 13.8 · 13.9: lo que le escribe una marca a la creadora al tocar "Hablemos" (talk) o "Trabaja conmigo"
 * (work). Lo escribe la marca, así que va en segunda persona; el género solo cambia "supercreadora/supercreador".
 */
export function contactMessage(gender: Gender | null | undefined, firstName: string, intent: "talk" | "work"): string {
  const noun = creatorNoun(gender);
  const name = firstName.trim();
  const greeting = name ? `Hola ${name}` : "Hola";
  const seen = noun ? `vi tu trabajo como ${noun} en Supercreador` : "vi tu portafolio en Supercreador";
  return `${greeting}, ${seen} y me gustaría ${intent === "work" ? "trabajar" : "conversar"} contigo.`;
}

/**
 * wa.me con el texto pre-llenado. `phone`: el número de la creadora (se dejan solo los dígitos, con código de país);
 * sin número, WhatsApp pide elegir a quién mandarlo (para compartir).
 */
export function whatsappUrl(phone: string | null | undefined, text: string): string {
  const digits = phone?.replace(/\D/g, "") ?? "";
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
