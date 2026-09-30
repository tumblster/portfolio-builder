import { memo } from "react";
import { CURATED_PALETTES, resolvePalette, type Palette } from "@/lib/palette/palettes";
import { RECOMMENDED_TEMPLATE, TEMPLATES, TEMPLATE_INFO, type PaletteId, type TemplateId } from "@/lib/portfolio/design";
import type { StoredImage } from "@/lib/portfolio/schema";

/*
 * Galería de plantillas y selector de paletas (v2 · M2). Se usan al importar (antes de generar),
 * en el modal "Portafolio listo" y en el editor.
 *
 * Los mockups son SVG estáticos dibujados a mano: "cómo se vería" cada plantilla, nítidos en
 * cualquier pantalla, sin datos reales ni llamadas a nada. Solo toman los colores de la paleta.
 */

const LIVE = "#22c55e";

type Box = [x: number, y: number, w: number, h: number, fill: string, r?: number, opacity?: number];
const boxes = (items: Box[]) =>
  items.map(([x, y, w, h, fill, r = 1.5, opacity], index) => (
    <rect key={index} x={x} y={y} width={w} height={h} rx={r} fill={fill} opacity={opacity} />
  ));

function MockupBody({ template, p }: { template: TemplateId; p: Palette }) {
  const line = `${p.ink}22`;
  switch (template) {
    case "creator":
      return (
        <>
          {boxes([
            [24, 6, 72, 9, "#ffffff", 4.5],
            [27, 8, 16, 5, p.ink, 2.5],
            [8, 20, 104, 56, p.accentSoft, 9],
          ])}
          <circle cx={60} cy={42} r={12} fill={p.accent} opacity={0.75} />
          <rect x={36} y={52} width={48} height={30} rx={14} fill={p.accent} opacity={0.75} />
          {boxes([
            [14, 62, 92, 10, "#ffffff", 5],
            [18, 65, 5, 4, p.accentSoft, 2],
            [26, 66, 24, 2.5, p.ink],
            [86, 65, 16, 4, "#ffffff", 2],
            [10, 84, 26, 2.5, p.muted],
            [10, 90, 82, 7, p.ink],
            [10, 100, 58, 7, p.ink],
            [10, 112, 96, 2.5, p.muted],
            [10, 117, 76, 2.5, p.muted],
            [10, 124, 38, 9, p.ink, 4.5],
            [52, 124, 34, 9, p.bg, 4.5],
            [10, 139, 30, 8, p.ink],
            [10, 149, 26, 2, p.muted],
            [58, 140, 16, 5, p.ink],
            [82, 140, 16, 5, p.ink],
            [6, 156, 108, 40, p.deep, 8],
            [12, 164, 30, 28, p.deepCard, 4],
            [45, 164, 30, 28, p.deepCard, 4],
            [78, 164, 30, 28, p.deepCard, 4],
          ])}
          <rect x={52} y={124} width={34} height={9} rx={4.5} fill="none" stroke={p.ink} strokeWidth={0.8} />
        </>
      );
    case "bio":
      return (
        <>
          <rect x={6} y={6} width={108} height={34} rx={9} fill={p.accentSoft} />
          <circle cx={34} cy={18} r={16} fill={p.accent} opacity={0.6} />
          <circle cx={88} cy={28} r={18} fill={p.soft} opacity={0.8} />
          <circle cx={60} cy={40} r={12} fill={p.soft} stroke={p.bg} strokeWidth={2.5} />
          {boxes([
            [38, 57, 44, 6, p.ink],
            [47, 66, 26, 2.5, p.muted],
            [34, 73, 52, 10, "#ffffff", 5],
            [40, 76, 14, 4, p.ink],
            [57, 77, 22, 2.5, p.muted],
            [12, 89, 96, 10, p.ink, 5],
            [12, 102, 96, 10, "#ffffff", 5],
            [12, 115, 96, 10, "#ffffff", 5],
            [12, 131, 96, 18, "#ffffff", 5],
            [15, 133, 10, 14, p.accentSoft, 2],
            [29, 136, 50, 3, p.ink],
            [29, 142, 32, 2.5, p.muted],
            [12, 153, 96, 18, "#ffffff", 5],
            [15, 155, 10, 14, p.accent, 2, 0.7],
            [29, 158, 44, 3, p.ink],
            [29, 164, 30, 2.5, p.muted],
            [26, 180, 68, 12, p.bg, 6],
            [29, 182, 18, 8, p.ink, 4],
            [51, 184, 16, 3, p.ink],
            [71, 184, 18, 3, p.ink],
          ])}
          {[102, 115, 131, 153].map((y) => (
            <rect key={y} x={12} y={y} width={96} height={y > 120 ? 18 : 10} rx={5} fill="none" stroke={line} strokeWidth={0.8} />
          ))}
          <rect x={26} y={180} width={68} height={12} rx={6} fill="none" stroke={line} strokeWidth={0.8} />
        </>
      );
    case "minimal":
      return (
        <>
          <circle cx={16} cy={16} r={7} fill={p.soft} />
          {boxes([
            [10, 28, 54, 6, p.ink],
            [10, 38, 98, 2.5, p.ink],
            [10, 43, 90, 2.5, p.ink],
            [10, 48, 60, 2.5, p.muted],
            [17, 56, 42, 2.5, p.ink],
            [10, 63, 42, 9, p.ink, 4.5],
            [10, 79, 26, 8, p.ink],
            [10, 89, 44, 2, p.muted],
          ])}
          <circle cx={12} cy={57.2} r={2} fill={LIVE} />
          {[76, 94].map((y) => (
            <rect key={y} x={10} y={y} width={100} height={0.6} fill={p.ink} opacity={0.25} />
          ))}
          {boxes([
            [10, 101, 48, 50, "#bdbdbd", 5],
            [10, 155, 48, 38, "#d6d6d6", 5],
            [62, 101, 48, 32, "#cfcfcf", 5],
            [62, 137, 48, 56, "#b4b4b4", 5],
          ])}
        </>
      );
    case "editorial":
      return (
        <>
          <rect x={1} y={1} width={118} height={198} rx={15} fill={p.deep} />
          {boxes([
            [10, 9, 26, 3, "#ffffff"],
            [86, 9, 24, 3, "#ffffff"],
            [10, 17, 100, 0.6, "#ffffff", 0, 0.25],
            [17, 25, 32, 2.5, p.deepMuted],
            [10, 32, 100, 15, "#ffffff", 1],
            [10, 50, 70, 15, "#ffffff", 1],
            [10, 72, 64, 3, "#ffffff"],
            [10, 78, 50, 3, "#ffffff"],
            [10, 88, 38, 16, "#ffffff", 1],
            [52, 96, 26, 2.5, p.deepMuted],
          ])}
          <circle cx={12} cy={26.2} r={2} fill={p.accent} />
          {[0, 1, 2, 3].map((row) => {
            const y = 114 + row * 21;
            return (
              <g key={row}>
                <rect x={10} y={y + 7} width={6} height={2.5} rx={1} fill={p.deepMuted} />
                <rect x={22} y={y + 5} width={row % 2 ? 44 : 58} height={6} rx={1} fill="#ffffff" />
                <rect x={22} y={y + 13} width={26} height={2} rx={1} fill={p.deepMuted} />
                <rect x={92} y={y + 1} width={18} height={18} rx={2} fill={p.deepCard} />
                <rect x={10} y={y + 20} width={100} height={0.6} fill="#ffffff" opacity={0.2} />
              </g>
            );
          })}
        </>
      );
  }
}

/**
 * "Cómo se vería" una plantilla, en miniatura. Decorativo: el nombre va en el texto del botón.
 * Memoizado (r2, C3): con la misma plantilla y paleta no se vuelve a dibujar al cambiar otra cosa.
 */
export const TemplateMockup = memo(function TemplateMockup({
  template,
  palette,
  className,
}: {
  template: TemplateId;
  palette: Palette;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 120 200" className={className} aria-hidden="true" focusable="false">
      <rect x={1} y={1} width={118} height={198} rx={15} fill={palette.bg} />
      <MockupBody template={template} p={palette} />
      <rect x={1} y={1} width={118} height={198} rx={15} fill="none" stroke="#000000" strokeOpacity={0.12} strokeWidth={1} />
    </svg>
  );
});

const optionBase =
  "relative flex cursor-pointer flex-col rounded-card border-2 p-2.5 transition-[translate,box-shadow,background-color] duration-150 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent";
const optionState = (checked: boolean) =>
  checked ? "-translate-px border-ink bg-highlight shadow-hard" : "border-ink/25 bg-paper hover:border-ink";

export function TemplatePicker({
  value,
  onChange,
  palette,
  name = "plantilla",
  compact = false,
}: {
  value: TemplateId;
  onChange: (template: TemplateId) => void;
  palette: Palette;
  name?: string;
  /** Sin descripciones (modal). */
  compact?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="Plantilla" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {TEMPLATES.map((template) => {
        const checked = value === template;
        const info = TEMPLATE_INFO[template];
        return (
          <label key={template} className={`${optionBase} ${optionState(checked)}`} data-template-option={template}>
            <input
              type="radio"
              name={name}
              value={template}
              checked={checked}
              onChange={() => onChange(template)}
              className="sr-only"
            />
            <TemplateMockup template={template} palette={palette} className="block h-auto w-full" />
            <span className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-bold">{info.name}</span>
              {template === RECOMMENDED_TEMPLATE && (
                <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-semibold text-cream">Recomendada</span>
              )}
            </span>
            {!compact && <span className="mt-1 text-sm leading-snug text-muted">{info.description}</span>}
          </label>
        );
      })}
    </div>
  );
}

/** La primera oración de la descripción: la línea que acompaña al nombre en la lista compacta. */
const firstSentence = (text: string) => text.match(/^[^.]*\./)?.[0] ?? text;

/**
 * Lista compacta de plantillas (r2, C1) para el paso Plantilla al importar: radio cards con el nombre y una línea.
 * Vertical en escritorio (a la izquierda de la vista previa grande); en el celular, una fila horizontal con
 * scroll sobre la vista previa. Sin mockups: la vista previa grande muestra la elegida.
 */
export function TemplateList({
  value,
  onChange,
  name = "plantilla",
}: {
  value: TemplateId;
  onChange: (template: TemplateId) => void;
  name?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Plantilla"
      className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pt-1 pb-3 md:mx-0 md:flex-col md:overflow-visible md:p-0"
    >
      {TEMPLATES.map((template) => {
        const checked = value === template;
        const info = TEMPLATE_INFO[template];
        return (
          <label
            key={template}
            className={`${optionBase} ${optionState(checked)} w-52 shrink-0 snap-start px-4 py-3 md:w-auto`}
            data-template-option={template}
          >
            <input
              type="radio"
              name={name}
              value={template}
              checked={checked}
              onChange={() => onChange(template)}
              className="sr-only"
            />
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-bold">{info.name}</span>
              {template === RECOMMENDED_TEMPLATE && (
                <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-semibold text-cream">Recomendada</span>
              )}
            </span>
            <span className="mt-1 text-sm leading-snug text-muted">{firstSentence(info.description)}</span>
          </label>
        );
      })}
    </div>
  );
}

/** Paletas que se ofrecen: la "de su foto" primero (si la foto tiene color), después las curadas. */
export function paletteOptions(photo: StoredImage | null): Palette[] {
  const auto = photo?.swatch ? [resolvePalette("auto", photo)] : [];
  return [...auto, ...CURATED_PALETTES];
}

/** La paleta que se sugiere al empezar: la de su foto si se puede; si no, la de siempre. */
export const recommendedPalette = (photo: StoredImage | null): PaletteId => (photo?.swatch ? "auto" : "crema");

export function PalettePicker({
  value,
  onChange,
  photo,
  name = "paleta",
}: {
  value: PaletteId;
  onChange: (palette: PaletteId) => void;
  photo: StoredImage | null;
  name?: string;
}) {
  const options = paletteOptions(photo);
  return (
    <div role="radiogroup" aria-label="Paleta" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {options.map((palette) => {
        const checked = value === palette.id;
        return (
          <label key={palette.id} className={`${optionBase} ${optionState(checked)} px-3 py-3`} data-palette-option={palette.id}>
            <input type="radio" name={name} value={palette.id} checked={checked} onChange={() => onChange(palette.id)} className="sr-only" />
            <span className="flex" aria-hidden="true">
              {[palette.bg, palette.soft, palette.accent, palette.band, palette.deep].map((color, index) => (
                <span
                  key={index}
                  className="-ml-1.5 size-7 rounded-full border-2 border-ink first:ml-0"
                  style={{ backgroundColor: color }}
                />
              ))}
            </span>
            <span className="mt-2.5 font-bold">{palette.name}</span>
            {palette.id === "auto" && <span className="text-sm text-muted">Recomendada · sale de su foto</span>}
          </label>
        );
      })}
    </div>
  );
}
