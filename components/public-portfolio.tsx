import { CreatorTemplate } from "@/components/portfolio/creator-template";
import type { ResolvedPortfolio } from "@/lib/portfolio/resolve";
import { publicPath } from "@/lib/portfolio/slug";

/*
 * Portafolio público (/p/<slug> y /p/<slug>/<nicho>) y su vista previa en el editor.
 * v2 · M1: una sola plantilla, Creator (components/portfolio/creator-template.tsx).
 * M2 suma las demás plantillas: este es el único punto que elige cuál se dibuja.
 *
 * Todas las piezas llegan siempre; el nicho activo solo decide cuáles se ven:
 *  - página: sale de la URL, y las píldoras la cambian sin recargar;
 *  - vista previa: lo maneja el editor (`niche` + `onNicheChange`).
 */

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
  if (props.variant === "preview") {
    return (
      <CreatorTemplate
        portfolio={portfolio}
        variant="preview"
        filter={{ mode: "controlled", value: props.niche, onChange: props.onNicheChange }}
      />
    );
  }
  return <CreatorTemplate portfolio={portfolio} variant="page" filter={{ mode: "route", basePath: publicPath(portfolio.slug) }} />;
}
