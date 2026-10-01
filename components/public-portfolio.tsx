import { BioTemplate } from "@/components/portfolio/bio-template";
import { CreatorTemplate } from "@/components/portfolio/creator-template";
import { EditorialTemplate } from "@/components/portfolio/editorial-template";
import { MinimalTemplate } from "@/components/portfolio/minimal-template";
import { MediaKit } from "@/components/portfolio/media-kit";
import { PortfolioViews } from "@/components/portfolio/portfolio-views";
import type { NicheFilter, TemplateProps } from "@/components/portfolio/template-kit";
import { paletteStyle, resolvePalette } from "@/lib/palette/palettes";
import { contactLinks } from "@/lib/portfolio/contact-links";
import { nichesWithPieces } from "@/lib/portfolio/niches";
import type { TemplateId } from "@/lib/portfolio/design";
import type { ResolvedPortfolio } from "@/lib/portfolio/resolve";
import { publicPath } from "@/lib/portfolio/slug";

/*
 * Portafolio público (/p/<slug> y /p/<slug>/<nicho>) y su vista previa en el editor.
 * v2 · M2: 4 plantillas con los mismos datos; la elegida vive en `portfolio.design` y aquí se
 * decide cuál se dibuja. Cambiarla no toca ningún dato: solo cambia la piel.
 *
 * Todas las piezas llegan siempre; el nicho activo solo decide cuáles se ven:
 *  - página: sale de la URL, y las píldoras la cambian sin recargar;
 *  - vista previa: lo maneja el editor (`niche` + `onNicheChange`).
 *
 * Ronda 30/09 · 7.3: la página tiene dos vistas con un toggle arriba (components/portfolio/portfolio-views.tsx):
 *  - SOBRE MÍ (por defecto): la plantilla de siempre, sin las cifras del perfil ni el ER (ajuste 10: las vistas de
 *    cada pieza sí se muestran) y sin el selector de nichos (ese queda para la vista previa del studio);
 *  - MEDIA KIT: components/portfolio/media-kit.tsx, con las 3 métricas. Link directo: /p/<slug>#media-kit.
 */

/** "Sobre mí" no lleva las cifras del perfil ni el ER (viven en el Media Kit); las vistas de cada pieza sí. */
function withoutMetrics(portfolio: ResolvedPortfolio): ResolvedPortfolio {
  return { ...portfolio, stats: [], engagementRate: null };
}

const TEMPLATE_COMPONENTS: Record<TemplateId, (props: TemplateProps) => React.ReactNode> = {
  creator: CreatorTemplate,
  bio: BioTemplate,
  minimal: MinimalTemplate,
  editorial: EditorialTemplate,
};

type PublicPortfolioProps =
  | { portfolio: ResolvedPortfolio; variant?: "page" }
  | {
      portfolio: ResolvedPortfolio;
      variant: "preview";
      /** Nicho que se está mirando en la vista previa; null = Todo. */
      niche: string | null;
      onNicheChange: (niche: string | null) => void;
      /** Ajuste 7: el lápiz del banner del hero (solo en el editor). */
      coverEdit?: React.ReactNode;
    };

export function PublicPortfolio(props: PublicPortfolioProps) {
  const { portfolio } = props;
  const Template = TEMPLATE_COMPONENTS[portfolio.design.template] ?? CreatorTemplate;
  const filter: NicheFilter =
    props.variant === "preview"
      ? { mode: "controlled", value: props.niche, onChange: props.onNicheChange }
      : { mode: "route", basePath: publicPath(portfolio.slug) };
  const about = (
    <Template
      portfolio={withoutMetrics(portfolio)}
      variant={props.variant ?? "page"}
      filter={filter}
      coverEdit={props.variant === "preview" ? props.coverEdit : undefined}
    />
  );
  if (props.variant === "preview") return about;
  const palette = resolvePalette(portfolio.design.palette, portfolio.photo);
  return (
    <PortfolioViews
      style={paletteStyle(palette) as React.CSSProperties}
      about={about}
      kit={<MediaKit portfolio={portfolio} />}
      nav={{
        basePath: publicPath(portfolio.slug),
        name: portfolio.name,
        photoUrl: portfolio.photo?.url ?? null,
        niches: nichesWithPieces(portfolio.niches, portfolio.pieces).map(({ slug, label }) => ({ slug, label })),
        contactId: contactLinks(portfolio.contact).length > 0 ? "pf-page-contacto" : null,
        // 12.6: "Hablemos" abre WhatsApp con el número que el creador puso en el editor.
        whatsapp: portfolio.contact.whatsapp?.replace(/\D/g, "") || null,
      }}
    />
  );
}
