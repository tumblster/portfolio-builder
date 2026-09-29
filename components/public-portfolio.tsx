import { BioTemplate } from "@/components/portfolio/bio-template";
import { CreatorTemplate } from "@/components/portfolio/creator-template";
import { EditorialTemplate } from "@/components/portfolio/editorial-template";
import { MinimalTemplate } from "@/components/portfolio/minimal-template";
import type { NicheFilter, TemplateProps } from "@/components/portfolio/template-kit";
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
 */

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
    };

export function PublicPortfolio(props: PublicPortfolioProps) {
  const { portfolio } = props;
  const Template = TEMPLATE_COMPONENTS[portfolio.design.template] ?? CreatorTemplate;
  const filter: NicheFilter =
    props.variant === "preview"
      ? { mode: "controlled", value: props.niche, onChange: props.onNicheChange }
      : { mode: "route", basePath: publicPath(portfolio.slug) };
  return <Template portfolio={portfolio} variant={props.variant ?? "page"} filter={filter} />;
}
