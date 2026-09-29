"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import { portfolioTitle } from "@/lib/portfolio/metadata";
import { nicheFromPath, type NicheDef } from "@/lib/portfolio/niches";

/*
 * Filtro por nicho de la página pública (v2 · M1). El único JavaScript propio de la página.
 *
 * El servidor ya manda TODAS las piezas; cada una dice en qué vistas aparece
 * (data-pf-show="todo belleza"). El filtro solo cambia data-pf-filter en el contenedor
 * y una regla CSS (creator-template.tsx) oculta lo que no corresponde: es instantáneo y no
 * vuelve a pedir nada al servidor.
 *
 * Cada nicho conserva su link (/p/<slug>/<nicho>): las píldoras son links reales. Con
 * JavaScript, el toque se intercepta y la URL cambia con history.pushState (Next la sincroniza
 * con usePathname), así el link se puede copiar y el botón "atrás" vuelve al filtro anterior.
 * Sin JavaScript, el link carga la versión de ese nicho.
 *
 * Dos modos:
 *  - "route": página pública. El nicho activo sale de la URL.
 *  - "controlled": vista previa del editor. El nicho activo lo maneja el editor.
 */

type RouteMode = { mode: "route"; basePath: string };
type ControlledMode = { mode: "controlled"; value: string | null; onChange: (niche: string | null) => void };
type FilterMode = RouteMode | ControlledMode;

function useActiveNiche(props: FilterMode, validSlugs: readonly string[]): string | null {
  const pathname = usePathname();
  if (props.mode === "controlled") return props.value && validSlugs.includes(props.value) ? props.value : null;
  return nicheFromPath(pathname ?? "", props.basePath, validSlugs);
}

type ScopeProps = FilterMode & {
  /** Los nichos que tienen piezas (los únicos filtrables). */
  nicheSlugs: readonly string[];
  className?: string;
  variant: "page" | "preview";
  children: ReactNode;
};

export function NicheScope(props: ScopeProps) {
  const { nicheSlugs, className, variant, children } = props;
  const active = useActiveNiche(props, nicheSlugs);
  const root = useRef<HTMLDivElement>(null);
  const previous = useRef(active);

  // Al cambiar de nicho, el carrusel vuelve al inicio (si no, podría quedar mostrando un hueco).
  useEffect(() => {
    if (previous.current === active) return;
    previous.current = active;
    root.current?.querySelectorAll<HTMLElement>("[data-pf-carousel]").forEach((element) => element.scrollTo({ left: 0 }));
  }, [active]);

  return (
    <div ref={root} className={className} data-template="creator" data-variant={variant} data-pf-filter={active ?? "todo"}>
      {children}
    </div>
  );
}

type PillsProps = FilterMode & {
  niches: readonly NicheDef[];
  /** Para el título de la pestaña: "Valentina Ruiz · Portafolio UGC — Belleza". */
  name: string;
};

export function NichePills(props: PillsProps) {
  const { niches, name } = props;
  const active = useActiveNiche(
    props,
    niches.map((niche) => niche.slug),
  );
  const basePath = props.mode === "route" ? props.basePath : "";

  function select(event: MouseEvent<HTMLAnchorElement>, slug: string | null) {
    if (props.mode === "controlled") {
      event.preventDefault();
      props.onChange(slug);
      return;
    }
    // Ctrl/Cmd + clic o clic del medio: que el navegador abra el link en otra pestaña.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const href = slug ? `${basePath}/${slug}` : basePath;
    if (href !== window.location.pathname) window.history.pushState(null, "", href);
  }

  // Título de la pestaña según el nicho activo (también al volver con "atrás").
  const activeLabel = niches.find((niche) => niche.slug === active)?.label ?? null;
  const isRoute = props.mode === "route";
  useEffect(() => {
    if (isRoute) document.title = portfolioTitle(name, activeLabel);
  }, [isRoute, name, activeLabel]);

  // En el celular pueden no caber todas: la píldora activa siempre queda a la vista.
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const container = list.current;
    const pill = container?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!container || !pill) return;
    const start = pill.offsetLeft; // .pf-pills es position: relative (su offsetParent)
    const end = start + pill.offsetWidth;
    if (start < container.scrollLeft || end > container.scrollLeft + container.clientWidth) {
      container.scrollTo({ left: start - (container.clientWidth - pill.offsetWidth) / 2 });
    }
  }, [active]);

  // Marca si de verdad no caben (activa el borde desvanecido de .pf-pills en portfolio.css).
  useEffect(() => {
    const container = list.current;
    if (!container) return;
    const update = () => container.toggleAttribute("data-overflow", container.scrollWidth - container.clientWidth > 4);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const options = [{ slug: null, label: "Todo" }, ...niches];
  return (
    <ul ref={list} className="pf-pills" aria-label="Nichos">
      {options.map((option) => (
        <li key={option.slug ?? "todo"}>
          <a
            href={props.mode === "route" ? (option.slug ? `${basePath}/${option.slug}` : basePath) : "#"}
            aria-current={active === option.slug ? "page" : undefined}
            onClick={(event) => select(event, option.slug)}
            className="pf-pill"
          >
            {option.label}
          </a>
        </li>
      ))}
    </ul>
  );
}
