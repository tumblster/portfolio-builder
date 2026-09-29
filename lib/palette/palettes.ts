import type { PaletteId } from "@/lib/portfolio/design";
import type { StoredImage } from "@/lib/portfolio/schema";

/*
 * Paletas de los portafolios (v2 · M2). Sin teoría de color avanzada: 5 curadas a mano y una
 * "de su foto" que sale del color dominante de la foto de perfil (lib/palette/extract.ts).
 *
 * Cada paleta llena los mismos tokens que usan las 4 plantillas (app/portfolio.css):
 *   bg · ink · muted          página clara y sus textos
 *   soft · display            bloque claro teñido (CTA "Hablemos") y su titular de color
 *   deep · deepCard · deepMuted   bloque oscuro (trabajo; fondo de Editorial) y su texto secundario
 *   band · bandMuted          bloque de color medio (servicios)
 *   accent · accentSoft       solo decoración (estrellas, puntos, degradados): nunca texto
 * Sobre deep y band el texto principal es blanco.
 *
 * Regla de la Fase 1: todo texto ≥ 7:1. CONTRAST_RULES lista cada par que las plantillas usan;
 * las curadas lo cumplen (lo verifica la prueba de humo) y la de la foto se corrige sola hasta cumplirlo.
 */

export type Palette = {
  id: PaletteId;
  name: string;
  bg: string;
  ink: string;
  muted: string;
  soft: string;
  display: string;
  deep: string;
  deepCard: string;
  deepMuted: string;
  band: string;
  bandMuted: string;
  accent: string;
  accentSoft: string;
};

type Colors = Omit<Palette, "id" | "name">;

export const CURATED_PALETTES: readonly Palette[] = [
  {
    id: "crema",
    name: "Crema y acero",
    bg: "#faf7f2",
    ink: "#101b29",
    muted: "#3a4552",
    soft: "#eae3d4",
    display: "#23445e",
    deep: "#0b1b2e",
    deepCard: "#16283d",
    deepMuted: "#b7c7d6",
    band: "#1f5475",
    bandMuted: "#f1f6fa",
    accent: "#7fa6c6",
    accentSoft: "#a9c9e2",
  },
  {
    id: "terracota",
    name: "Terracota",
    bg: "#fbf6f1",
    ink: "#2a140d",
    muted: "#52362b",
    soft: "#f0dfd2",
    display: "#74301c",
    deep: "#2a120b",
    deepCard: "#3b1d14",
    deepMuted: "#ecd0c4",
    band: "#7a3320",
    bandMuted: "#fdf1ec",
    accent: "#d9774f",
    accentSoft: "#f2b89e",
  },
  {
    id: "salvia",
    name: "Salvia",
    bg: "#f5f7f2",
    ink: "#13201a",
    muted: "#35453b",
    soft: "#dde7d9",
    display: "#22493a",
    deep: "#0f2119",
    deepCard: "#1a3026",
    deepMuted: "#c3d7ca",
    band: "#27513f",
    bandMuted: "#f2f8f4",
    accent: "#7faa8c",
    accentSoft: "#b9d3c0",
  },
  {
    id: "rosa",
    name: "Rosa empolvado",
    bg: "#fcf6f7",
    ink: "#2a1420",
    muted: "#533644",
    soft: "#f3e0e6",
    display: "#732848",
    deep: "#2a0f1e",
    deepCard: "#3c1a2c",
    deepMuted: "#eecbd9",
    band: "#76294b",
    bandMuted: "#fdf0f5",
    accent: "#d98aa8",
    accentSoft: "#f0c1d2",
  },
  {
    id: "grafito",
    name: "Grafito",
    bg: "#f7f7f5",
    ink: "#111111",
    muted: "#3d3d3d",
    soft: "#e7e5e0",
    display: "#1f1f1f",
    deep: "#0e0e0e",
    deepCard: "#1c1c1c",
    deepMuted: "#c6c6c6",
    band: "#2a2a2a",
    bandMuted: "#f2f2f2",
    accent: "#9a9a9a",
    accentSoft: "#cfcfcf",
  },
];

export const DEFAULT_PALETTE = CURATED_PALETTES[0];

// ── Contraste (WCAG 2) ─────────────────────────────────────────────
type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const clean = hex.replace("#", "");
  return [0, 2, 4].map((index) => parseInt(clean.slice(index, index + 2), 16)) as Rgb;
}

const toHex = (rgb: Rgb) => `#${rgb.map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`;

function luminance([r, g, b]: Rgb): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(hexToRgb(a)), luminance(hexToRgb(b))].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** Mezcla `top` con opacidad `alpha` sobre `bottom` (para fondos translúcidos). */
function over(top: string, alpha: number, bottom: string): string {
  const [t, b] = [hexToRgb(top), hexToRgb(bottom)];
  return toHex(t.map((value, index) => value * alpha + b[index] * (1 - alpha)) as Rgb);
}

export const MIN_CONTRAST = 7;

/** Todos los pares texto/fondo que usan las plantillas. */
export const CONTRAST_RULES: readonly { text: (p: Colors) => string; on: (p: Colors) => string; label: string }[] = [
  { label: "texto sobre la página", text: (p) => p.ink, on: (p) => p.bg },
  { label: "texto sobre el bloque claro", text: (p) => p.ink, on: (p) => p.soft },
  { label: "texto secundario sobre la página", text: (p) => p.muted, on: (p) => p.bg },
  { label: "texto secundario sobre el bloque claro", text: (p) => p.muted, on: (p) => p.soft },
  { label: "texto secundario sobre tarjetas blancas", text: (p) => p.muted, on: () => "#ffffff" },
  // Tarjeta de vidrio (blanco al 88 %) sobre la parte más oscura posible de una foto.
  { label: "texto secundario sobre vidrio", text: (p) => p.muted, on: () => over("#ffffff", 0.88, "#000000") },
  { label: "titular de color sobre el bloque claro", text: (p) => p.display, on: (p) => p.soft },
  { label: "titular de color sobre la página", text: (p) => p.display, on: (p) => p.bg },
  { label: "blanco sobre botones y píldoras activas", text: () => "#ffffff", on: (p) => p.ink },
  { label: "blanco sobre el bloque oscuro", text: () => "#ffffff", on: (p) => p.deep },
  { label: "secundario sobre el bloque oscuro", text: (p) => p.deepMuted, on: (p) => p.deep },
  { label: "secundario sobre tarjetas del bloque oscuro", text: (p) => p.deepMuted, on: (p) => p.deepCard },
  { label: "blanco sobre el bloque de servicios", text: () => "#ffffff", on: (p) => p.band },
  // Las tarjetas de servicios oscurecen el bloque un 16 %.
  { label: "secundario sobre tarjetas de servicios", text: (p) => p.bandMuted, on: (p) => over("#000000", 0.16, p.band) },
];

/** Pares que no llegan a 7:1 (lista vacía = la paleta sirve). */
export function contrastFailures(colors: Colors): { label: string; ratio: number }[] {
  return CONTRAST_RULES.map((rule) => ({ label: rule.label, ratio: contrast(rule.text(colors), rule.on(colors)) })).filter(
    (result) => result.ratio < MIN_CONTRAST,
  );
}

// ── Paleta "de su foto" ────────────────────────────────────────────
type Hsl = [number, number, number];

function rgbToHsl([r, g, b]: Rgb): Hsl {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return [h * 60, s, l];
}

function hsl(h: number, s: number, l: number): string {
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  const [sat, light] = [clamp(s), clamp(l)];
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return toHex([f(0) * 255, f(8) * 255, f(4) * 255]);
}

/** Aclara u oscurece (misma tinta y saturación) hasta cumplir `ok`. */
function adjust(h: number, s: number, l: number, direction: 1 | -1, ok: (hex: string) => boolean): string {
  let lightness = l;
  for (let step = 0; step < 100; step += 1) {
    const hex = hsl(h, s, lightness);
    if (ok(hex)) return hex;
    lightness += direction * 0.01;
    if (lightness <= 0 || lightness >= 1) break;
  }
  return direction === 1 ? "#ffffff" : "#000000";
}

const HEX_PATTERN = /^#[0-9a-f]{6}$/i;

/**
 * Paleta armada a partir de un color (el dominante de la foto). Parte de proporciones fijas por
 * rol (fondo casi blanco, tinta casi negra, bloques oscuros de la misma tinta) y después ajusta
 * la luz de cada color hasta que todos los pares de texto lleguen a 7:1.
 */
export function paletteFromSwatch(swatch: string): Palette {
  const [h, rawS] = rgbToHsl(hexToRgb(swatch));
  const s = rawS < 0.12 ? 0.05 : Math.min(rawS, 0.7); // casi gris → paleta casi neutra

  const bg = hsl(h, s * 0.5, 0.97);
  const soft = hsl(h, s * 0.55, 0.89);
  const ink = adjust(h, s * 0.6, 0.13, -1, (c) => contrast(c, soft) >= 12);
  const muted = adjust(h, s * 0.45, 0.32, -1, (c) =>
    [bg, soft, "#ffffff", over("#ffffff", 0.88, "#000000")].every((on) => contrast(c, on) >= MIN_CONTRAST + 0.2),
  );
  const display = adjust(h, Math.max(s, 0.3) * 0.9, 0.3, -1, (c) => [bg, soft].every((on) => contrast(c, on) >= MIN_CONTRAST + 0.3));
  const deep = adjust(h, Math.max(s, 0.25) * 0.8, 0.12, -1, (c) => contrast("#ffffff", c) >= 14);
  const deepCard = adjust(h, Math.max(s, 0.25) * 0.7, 0.18, -1, (c) => contrast("#ffffff", c) >= 11);
  const deepMuted = adjust(h, s * 0.35, 0.8, 1, (c) => [deep, deepCard].every((on) => contrast(c, on) >= MIN_CONTRAST + 0.3));
  const band = adjust(h, Math.max(s, 0.3) * 0.85, 0.3, -1, (c) => contrast("#ffffff", c) >= 8.5);
  const bandMuted = adjust(h, s * 0.4, 0.95, 1, (c) => contrast(c, over("#000000", 0.16, band)) >= MIN_CONTRAST + 0.3);

  return {
    id: "auto",
    name: "De su foto",
    bg,
    ink,
    muted,
    soft,
    display,
    deep,
    deepCard,
    deepMuted,
    band,
    bandMuted,
    accent: hsl(h, Math.max(s, 0.35), 0.58),
    accentSoft: hsl(h, Math.max(s, 0.3) * 0.8, 0.8),
  };
}

/** La paleta que se usa de verdad. "auto" sin color de foto (foto vieja o sin foto) → la de siempre. */
export function resolvePalette(id: PaletteId, photo: StoredImage | null): Palette {
  if (id === "auto") {
    return photo?.swatch && HEX_PATTERN.test(photo.swatch) ? paletteFromSwatch(photo.swatch) : { ...DEFAULT_PALETTE, id: "auto", name: "De su foto" };
  }
  return CURATED_PALETTES.find((palette) => palette.id === id) ?? DEFAULT_PALETTE;
}

/** Variables CSS que leen las plantillas (app/portfolio.css). */
export function paletteStyle(palette: Palette): Record<string, string> {
  return {
    "--pf-bg": palette.bg,
    "--pf-ink": palette.ink,
    "--pf-muted": palette.muted,
    "--pf-beige": palette.soft,
    "--pf-display": palette.display,
    "--pf-work": palette.deep,
    "--pf-work-card": palette.deepCard,
    "--pf-work-muted": palette.deepMuted,
    "--pf-services": palette.band,
    "--pf-services-muted": palette.bandMuted,
    "--pf-accent": palette.accent,
    "--pf-accent-soft": palette.accentSoft,
  };
}
