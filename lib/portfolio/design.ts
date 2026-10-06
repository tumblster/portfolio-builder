/*
 * Diseño del portafolio (v2 · M2): qué plantilla lo dibuja y con qué paleta.
 * Son las mismas piezas y los mismos textos con otra "piel": cambiar el diseño nunca toca los datos.
 * Se guarda por portafolio (campo `design` del documento); sin campo = Creator + Crema y acero,
 * que es exactamente como se veía en el M1.
 */

export const TEMPLATES = ["creator", "bio", "minimal", "editorial"] as const;
export type TemplateId = (typeof TEMPLATES)[number];

export const TEMPLATE_INFO: Record<TemplateId, { name: string; description: string }> = {
  creator: { name: "Creator", description: "Foto grande, cifras y carrusel de videos. La más completa." },
  bio: { name: "Bio", description: "Todo en una columna, como un link en la bio. Ideal para compartir por DM." },
  minimal: { name: "Minimal", description: "Fondo claro, mucho aire y un mosaico de tu trabajo." },
  editorial: { name: "Editorial", description: "Oscura, con tipografía enorme y el trabajo en lista numerada." },
};

export const RECOMMENDED_TEMPLATE: TemplateId = "creator";

/** "auto" = sale de los colores de la foto de perfil (lib/palette). */
export const PALETTE_IDS = ["auto", "crema", "terracota", "salvia", "rosa", "grafito"] as const;
export type PaletteId = (typeof PALETTE_IDS)[number];

export type Design = { template: TemplateId; palette: PaletteId };

export const DEFAULT_DESIGN: Design = { template: "creator", palette: "crema" };

export const isTemplateId = (value: unknown): value is TemplateId =>
  typeof value === "string" && (TEMPLATES as readonly string[]).includes(value);
