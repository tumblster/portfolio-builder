"use client";

import type { NicheFilter } from "./template-kit";

/*
 * Importador de Canva v2: los botones del selector de sectores de la variante
 * clonada. En la página son links reales a /p/<slug>/<nicho> (sin JS también
 * filtran: NicheScope lee la URL); en la vista previa cambian el nicho del
 * editor. El estilo vive en canva-template.css (.cv-sector-btn).
 */
export function SectorButton({
  filter,
  slug,
  label,
}: {
  filter: NicheFilter;
  slug: string | null;
  label: string;
}) {
  if (filter.mode === "controlled") {
    return (
      <button
        type="button"
        className="cv-sector-btn"
        aria-pressed={filter.value === slug}
        onClick={() => filter.onChange(slug)}
      >
        {label}
      </button>
    );
  }
  const href = slug ? `${filter.basePath}/${slug}` : filter.basePath;
  return (
    <a className="cv-sector-btn" href={href}>
      {label}
    </a>
  );
}
