"use client";

import { useSyncExternalStore, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";

/*
 * Toggle SOBRE MÍ / MEDIA KIT arriba del portafolio público (ronda 30/09 · 7.3).
 * Las dos vistas vienen ya dibujadas del servidor; el toggle solo muestra una (hidden en la otra), así cambiar no
 * pierde nada (ni el scroll interno ni lo cargado). SOBRE MÍ es la de siempre y la que se ve por defecto; el
 * Media Kit tiene su propio link: /p/<slug>#media-kit. Patrón de pestañas de WAI-ARIA (flechas incluidas).
 */

const KIT_HASH = "#media-kit";
const EVENT = "pf-view";

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}
const isKit = () => window.location.hash === KIT_HASH;

function show(kit: boolean) {
  const url = `${window.location.pathname}${window.location.search}${kit ? KIT_HASH : ""}`;
  window.history.replaceState(window.history.state, "", url);
  window.dispatchEvent(new Event(EVENT));
  window.scrollTo({ top: 0 });
}

export function PortfolioViews({ about, kit, style }: { about: ReactNode; kit: ReactNode; style?: CSSProperties }) {
  const kitActive = useSyncExternalStore(subscribe, isKit, () => false);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? false : event.key === "End" ? true : !kitActive;
    show(next);
    document.getElementById(next ? "pf-tab-kit" : "pf-tab-about")?.focus();
  }

  return (
    <div className="pf-views" style={style} data-view={kitActive ? "kit" : "about"}>
      <div className="pf-switch" data-pf-switch>
        <div role="tablist" aria-label="Vista del portafolio" className="pf-switch__tabs" onKeyDown={onKeyDown}>
          <button
            type="button"
            role="tab"
            id="pf-tab-about"
            aria-selected={!kitActive}
            aria-controls="pf-panel-about"
            tabIndex={kitActive ? -1 : 0}
            onClick={() => show(false)}
          >
            Sobre mí
          </button>
          <button
            type="button"
            role="tab"
            id="pf-tab-kit"
            aria-selected={kitActive}
            aria-controls="pf-panel-kit"
            tabIndex={kitActive ? 0 : -1}
            onClick={() => show(true)}
          >
            Media kit
          </button>
        </div>
      </div>
      <div role="tabpanel" id="pf-panel-about" aria-labelledby="pf-tab-about" hidden={kitActive} className="pf-views__panel">
        {about}
      </div>
      <div role="tabpanel" id="pf-panel-kit" aria-labelledby="pf-tab-kit" hidden={!kitActive} className="pf-views__panel pf-views__kit">
        {kit}
      </div>
    </div>
  );
}
