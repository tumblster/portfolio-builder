"use client";

import { useEffect, useId, useRef, useState, type MouseEvent } from "react";  
import type { NicheFilter } from "./template-kit";

/*  
 * Ronda 13 · botón flotante "Ver categorías" de la variante clonada. Reemplaza  
 * al título del selector, a los botones de sector y al menú de la barra.  
 *  
 * Vive al fondo de la sección de videos con position: sticky, así que solo se  
 * ve mientras esa sección está en pantalla. Al tocarlo abre un panel con los  
 * sectores; clic fuera o Escape lo cierran.  
 *  
 * Elegir un sector:  
 * - vista previa (filtro "controlled"): cambia el nicho del editor y baja al grupo;  
 * - página (filtro "route"): si el grupo ya está visible, solo baja hasta él;  
 *   si no (la URL filtra otro sector), el link real /p/<slug>/<sector>#grupo  
 *   filtra como siempre (NicheScope lee la URL; también sin JS).  
 * El estilo vive en canva-template.css (.cv-sectors*).  
 */

export type SectorTarget = { slug: string; label: string; targetId: string };

type Item = { key: string; slug: string | null; label: string; targetId: string };

const ALL = "todo";

function scrollToTarget(targetId: string) {  
  const target = document.getElementById(targetId);  
  if (!target) return;  
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;  
  target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });  
}

function isShown(element: HTMLElement | null): boolean {  
  return element !== null && element.getClientRects().length > 0;  
}

export function CanvaSectorMenu({  
  filter,  
  sectors,  
  allTargetId,  
}: {  
  filter: NicheFilter;  
  sectors: readonly SectorTarget[];  
  allTargetId: string;  
}) {  
  const root = useRef<HTMLDivElement>(null);  
  const toggleRef = useRef<HTMLButtonElement>(null);  
  const panelId = useId();  
  const [open, setOpen] = useState(false);  
  const [active, setActive] = useState<string>(ALL);

  useEffect(() => {  
    if (!open) return;  
    const onPointerDown = (event: PointerEvent) => {  
      if (!root.current?.contains(event.target as Node)) setOpen(false);  
    };  
    const onKeyDown = (event: KeyboardEvent) => {  
      if (event.key !== "Escape") return;  
      setOpen(false);  
      toggleRef.current?.focus();  
    };  
    document.addEventListener("pointerdown", onPointerDown);  
    document.addEventListener("keydown", onKeyDown);  
    return () => {  
      document.removeEventListener("pointerdown", onPointerDown);  
      document.removeEventListener("keydown", onKeyDown);  
    };  
  }, [open]);

  /** El sector que se está mirando ahora (NicheScope lo marca en data-pf-filter). */  
  const currentView = (): string => {  
    if (filter.mode === "controlled") return filter.value ?? ALL;  
    return root.current?.closest("[data-pf-filter]")?.getAttribute("data-pf-filter") ?? ALL;  
  };

  const toggle = () => {  
    if (!open) setActive(currentView());  
    setOpen(!open);  
  };

  const items: Item[] = [  
    { key: ALL, slug: null, label: "Todo", targetId: allTargetId },  
    ...sectors.map((sector) => ({ key: sector.slug, slug: sector.slug, label: sector.label, targetId: sector.targetId })),  
  ];

  const onRouteClick = (event: MouseEvent<HTMLAnchorElement>, item: Item) => {  
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;  
    setOpen(false);  
    const visible =  
      item.slug === null ? currentView() === ALL : isShown(document.getElementById(item.targetId));  
    // No visible: el link filtra (navega a /p/<slug>/<sector>#grupo).  
    if (!visible) return;  
    event.preventDefault();  
    scrollToTarget(item.targetId);  
  };

  const renderItem = (item: Item) => {  
    const current = active === item.key;  
    if (filter.mode === "controlled") {  
      const onChange = filter.onChange;  
      return (  
        <button  
          type="button"  
          className="cv-sectors__item"  
          aria-pressed={current}  
          onClick={() => {  
            onChange(item.slug);  
            setOpen(false);  
            // Esperar a que el filtro muestre el grupo antes de bajar hasta él.  
            requestAnimationFrame(() => requestAnimationFrame(() => scrollToTarget(item.targetId)));  
          }}  
        >  
          {item.label}  
        </button>  
      );  
    }  
    const path = item.slug ? `$filter.basePath/${item.slug}` : filter.basePath;  
    return (  
      <a  
        className="cv-sectors__item"  
        href={`$path#${item.targetId}`}  
        aria-current={current ? "true" : undefined}  
        onClick={(event) => onRouteClick(event, item)}  
      >  
        {item.label}  
      </a>  
    );  
  };

  return (  
    <div ref={root} className="cv-sectors">  
      <div id={panelId} className="cv-sectors__panel" data-open={open ? "" : undefined}>  
        <ul className="cv-sectors__list">  
          {items.map((item) => (  
            <li key={item.key}>{renderItem(item)}</li>  
          ))}  
        </ul>  
      </div>  
      <button  
        ref={toggleRef}  
        type="button"  
        className="cv-sectors__toggle"  
        aria-expanded={open}  
        aria-controls={panelId}  
        onClick={toggle}  
      >  
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">  
          <path  
            d="M4 7h16M4 12h16M4 17h10"  
            fill="none"  
            stroke="currentColor"  
            strokeWidth="2"  
            strokeLinecap="round"  
          />  
        </svg>  
        Ver categorías  
      </button>  
    </div>  
  );  
}
