/*
 * @menciones en los textos de las publicaciones (ronda 6 · 13.6; también es la base de 13.19 "Brand partners").
 * Sin dependencias: lo usan la importación (servidor), la IA, el studio y la prueba de humo.
 *
 * Una mención NO prueba una colaboración: es solo una pista. Las sugerencias que salgan de aquí siempre las revisa y
 * confirma la creadora (en Brand partners, ninguna mención aparece en el Media kit sin que ella la agregue).
 */

/**
 * Usuario de Instagram: letras, números, punto y guion bajo, hasta 30, sin terminar en punto. Antes de la @ no puede
 * haber letra, número, punto ni otra @ (así un correo como hola@marca.com no cuenta como mención).
 */
const MENTION = /(^|[^\w.@])@([A-Za-z0-9_](?:[A-Za-z0-9_.]{0,28}[A-Za-z0-9_])?)/g;

/** 13.19: cuántas marcas detectadas se ofrecen para confirmar (de los últimos 12 contenidos y los links agregados). */
export const MAX_DETECTED_BRANDS = 12;

/**
 * Las cuentas mencionadas en los textos, en minúsculas y sin @, sin repetir: primero las más mencionadas y, a igual
 * cantidad, en el orden en que aparecen. `exclude`: cuentas que no cuentan (la propia).
 */
export function captionMentions(captions: readonly string[], exclude: readonly string[] = [], max = 8): string[] {
  const skip = new Set(exclude.map((handle) => handle.replace(/^@/, "").toLowerCase()));
  const seen = new Map<string, { count: number; first: number }>();
  let order = 0;
  for (const caption of captions) {
    for (const match of caption.matchAll(MENTION)) {
      const handle = match[2].toLowerCase();
      if (skip.has(handle)) continue;
      const current = seen.get(handle);
      if (current) current.count += 1;
      else seen.set(handle, { count: 1, first: order++ });
    }
  }
  return [...seen.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[1].first - b[1].first)
    .slice(0, max)
    .map(([handle]) => handle);
}

/** 13.19 (a): las marcas candidatas de los captions y de los links agregados, para que la creadora confirme. */
export function detectBrandMentions(texts: readonly string[], exclude: readonly string[] = []): string[] {
  return captionMentions(texts, exclude, MAX_DETECTED_BRANDS);
}

/** Une listas de menciones sin repetir, en orden, hasta el tope. */
export function mergeMentions(...lists: readonly (readonly string[])[]): string[] {
  const merged: string[] = [];
  for (const list of lists) {
    for (const handle of list) {
      if (!merged.includes(handle)) merged.push(handle);
    }
  }
  return merged.slice(0, MAX_DETECTED_BRANDS);
}
