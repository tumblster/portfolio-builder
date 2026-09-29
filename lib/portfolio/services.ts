import type { Service } from "./schema";

/**
 * Formas de colaborar habituales en UGC. El editor las ofrece con "Usar sugerencias"
 * cuando un portafolio no tiene servicios (creado a mano o importado en la v1).
 * Se pueden editar o quitar antes de guardar.
 */
export const SUGGESTED_SERVICES: readonly Service[] = [
  { title: "Videos UGC para anuncios", description: "Piezas verticales pensadas para pauta en Meta y TikTok, con gancho en los primeros segundos." },
  { title: "Reels y TikToks", description: "Contenido nativo para tus redes, con guion, grabación y edición incluidos." },
  { title: "Fotos de producto", description: "Fotos en contexto real, listas para tu web, catálogo o redes." },
  { title: "Derechos de uso", description: "Licencia para usar el contenido en tus canales y anuncios por el tiempo que acordemos." },
];
