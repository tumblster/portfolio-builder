import { TemplatePreview, type PreviewData } from "@/components/design/template-preview";
import { CURATED_PALETTES } from "@/lib/palette/palettes";
import type { PaletteId, TemplateId } from "@/lib/portfolio/design";

/*
 * Mock del hero que muta (ronda 30/09 · 8.1): la misma creadora de ejemplo pasa en loop de diseño en diseño y de
 * paleta en paleta, usando SOLO las 4 plantillas y las paletas curadas que existen en el producto (el mismo
 * componente de vista previa del studio: components/design/template-preview.tsx). Solo CSS (opacidad y escala,
 * landing.css): sin JS, sin imágenes. Con "reducir movimiento" queda quieto en el primer estado.
 */

const DEMO: PreviewData = {
  name: "Valeria Campos",
  handle: "@valeria.campos",
  niches: ["Recetas", "Fitness"],
};

/** Cada estado: una plantilla real con una paleta real. Pasan las 4 plantillas y las 5 paletas curadas. */
const STATES: [TemplateId, PaletteId][] = [
  ["creator", "crema"],
  ["bio", "terracota"],
  ["minimal", "salvia"],
  ["editorial", "grafito"],
  ["creator", "rosa"],
  ["bio", "salvia"],
];

export const HERO_MORPH_STATES = STATES;

export function HeroMorph() {
  return (
    <div
      className="hero-morph"
      role="img"
      aria-label="Ejemplo de portafolio de Valeria Campos, UGC Creator de recetas y fitness, que va cambiando entre las 4 plantillas y las paletas del producto."
      data-hero-morph
    >
      {STATES.map(([template, paletteId], index) => {
        const palette = CURATED_PALETTES.find((candidate) => candidate.id === paletteId) ?? CURATED_PALETTES[0];
        return (
          <div
            key={`${template}-${paletteId}`}
            className="hero-morph__layer"
            style={{ "--i": index } as React.CSSProperties}
            data-state={`${template}:${paletteId}`}
          >
            <TemplatePreview template={template} palette={palette} data={DEMO} />
          </div>
        );
      })}
    </div>
  );
}
