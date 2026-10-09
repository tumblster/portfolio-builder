"use client";

import { usePathname } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { contactMessage, whatsappUrl, type Gender } from "@/lib/portfolio/gender";
import { MadeWithBadge } from "./made-with-badge";
import { ShareMenu } from "./share-menu";

/*
 * Header ÚNICO del portafolio publicado (spec 11.6; ronda 6 · 13.10), en 2 filas contextuales:
 *  - Fila 1 (siempre): [foto en círculo + vistas] | control segmentado "Contenido | Media kit" | Hablemos.
 *  - Fila 2 (solo en Contenido): chips de nichos, con scroll horizontal y fundido a la izquierda si no caben.
 *    Al pasar a Media kit se colapsa con animación y el header se compacta: el Media kit es ER + métricas, ahí no
 *    se filtra por nicho. Sin nombre en texto, sin chip "Todo"; "Media kit" es texto del control, nunca un chip. El
 *    chip elegido va solo trazado (outline). Tocar el elegido lo suelta (vuelve a todo).
 * Además: "Hablemos" abre WhatsApp con un mensaje pre-llenado si el creador puso su número (12.6; si no, lleva a su
 * contacto); el ojito con las vistas (12.7: 1 por persona por día, lo cuenta el servidor); y compartir al final
 * (12.4; E2 #9: icono sutil + cápsula con WhatsApp, X, Instagram, TikTok y copiar link). Al abrir, avisa la visita
 * con su ?ref= y la página (11.9 / 12.9): sin cookies.
 *
 * Ronda 6:
 *  - 13.8: los textos de WhatsApp ("Hablemos" y compartir) se adaptan al género que eligió (lib/portfolio/gender.ts);
 *    sin dato, Otro o Prefiero no decirlo, en neutro (13.23 · 2).
 *  - 13.9: el CTA "Ver media kit" de las plantillas (data-pf-to-kit) cambia de vista igual que el switch.
 *  - 13.13: con un link de nicho (/p/<slug>/<nicho>, el formato del M1), la página llega con ese nicho ya elegido y
 *    SIN la fila de chips: quien lo recibe ve solo ese nicho (el header queda en "foto | Contenido · Media kit |
 *    Hablemos").
 *  - 13.17 / 13.23 · 6: el badge flotante "Hecho con Supercreador", en todos los portafolios.
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

function show(kit: boolean, scrollTo?: string) {
  const url = `${window.location.pathname}${window.location.search}${kit ? KIT_HASH : ""}`;
  window.history.replaceState(window.history.state, "", url);
  window.dispatchEvent(new Event(EVENT));
  if (scrollTo) requestAnimationFrame(() => document.getElementById(scrollTo)?.scrollIntoView({ behavior: "smooth" }));
  else window.scrollTo({ top: 0 });
}

const compact = new Intl.NumberFormat("es", { notation: "compact", maximumFractionDigits: 1 });

export type PortfolioNav = {
  /** /p/<slug> */
  basePath: string;
  name: string;
  photoUrl: string | null;
  niches: { slug: string; label: string }[];
  /** Id de la sección de contacto de la plantilla, o null si no hay contacto. */
  contactId: string | null;
  /** WhatsApp del creador, solo dígitos con código de país (12.6), o null. */
  whatsapp: string | null;
  /** 13.8: el género que eligió (adapta los textos de WhatsApp); null = neutro. */
  gender: Gender | null;
};

export function PortfolioViews({ about, kit, style, nav }: { about: ReactNode; kit: ReactNode; style?: CSSProperties; nav: PortfolioNav }) {
  const kitActive = useSyncExternalStore(subscribe, isKit, () => false);
  const pathname = usePathname();
  const activeNiche = pathname.startsWith(`${nav.basePath}/`) ? pathname.slice(nav.basePath.length + 1).split("/")[0] : null;
  const scroller = useRef<HTMLDivElement>(null);
  const [views, setViews] = useState<number | null>(null);
  const slug = nav.basePath.split("/").filter(Boolean).pop() ?? "";
  const firstName = nav.name.trim().split(/\s+/)[0] ?? nav.name;

  // 11.9 / 12.7 / 12.9: avisar la visita (una vez por sesión), con su ?ref= y la página; el servidor devuelve las vistas.
  useEffect(() => {
    if (!slug) return;
    let seen = false;
    try {
      const key = `pf-open:${slug}`;
      seen = Boolean(window.sessionStorage.getItem(key));
      window.sessionStorage.setItem(key, "1");
    } catch {
      // Sin sessionStorage: se avisa igual; el servidor cuenta 1 vista por persona por día.
    }
    const ref = new URLSearchParams(window.location.search).get("ref");
    const path = window.location.pathname.slice(nav.basePath.length) || "/";
    void fetch(`/api/portfolios/${slug}/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref, path, seen }),
      keepalive: true,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => typeof data?.views === "number" && setViews(data.views))
      .catch(() => {});
  }, [slug, nav.basePath]);

  // Fundidos de los chips: a la izquierda si ya se desplazó, a la derecha si quedan más (sin re-render).
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const update = () => {
      node.toggleAttribute("data-scrolled", node.scrollLeft > 2);
      node.toggleAttribute("data-more", node.scrollWidth - node.clientWidth - node.scrollLeft > 2);
    };
    update();
    node.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      node.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  function onSegmentKey(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? false : event.key === "End" ? true : !kitActive;
    show(next);
    document.getElementById(next ? "pf-tab-kit" : "pf-tab-content")?.focus();
  }

  // 13.9: "Ver media kit" de la plantilla cambia de vista como el switch (sin dejar entradas en el historial).
  function onViewsClick(event: MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target as Element | null;
    if (!target?.closest?.("[data-pf-to-kit]")) return;
    event.preventDefault();
    show(true);
  }

  const hablemos = nav.whatsapp
    ? whatsappUrl(nav.whatsapp, contactMessage(nav.gender, firstName, "talk"))
    : nav.contactId
      ? `#${nav.contactId}`
      : null;
  // 13.13: con un link de nicho, sin los chips (la página ya viene con ese nicho elegido).
  const hasNiches = nav.niches.length > 0 && activeNiche === null;

  return (
    <div
      className="pf-views"
      style={style}
      data-view={kitActive ? "kit" : "about"}
      data-has-niches={hasNiches ? "" : undefined}
      data-niche-link={activeNiche ?? undefined}
      onClick={onViewsClick}
    >
      <header className="pf-bar" data-pf-bar>
        <div className="pf-bar__row">
          <a className="pf-bar__avatar" href={nav.basePath} aria-label={`Portafolio de ${nav.name}: inicio`}>
            {nav.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- miniatura de 36 px que ya sirve /media
              <img src={nav.photoUrl} alt="" width={36} height={36} />
            ) : (
              <span aria-hidden="true">{nav.name.trim().charAt(0).toUpperCase() || "·"}</span>
            )}
          </a>
          {views !== null && views > 0 && (
            <span className="pf-bar__views" data-pf-views={views} aria-label={`${views} ${views === 1 ? "vista" : "vistas"}`}>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <span aria-hidden="true">{compact.format(views)}</span>
            </span>
          )}
          <div role="tablist" aria-label="Vista del portafolio" className="pf-seg" onKeyDown={onSegmentKey} data-pf-segment>
            <button
              type="button"
              role="tab"
              id="pf-tab-content"
              aria-selected={!kitActive}
              aria-controls="pf-panel-about"
              tabIndex={kitActive ? -1 : 0}
              onClick={() => show(false)}
            >
              Contenido
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
          {hablemos && (
            <a
              className="pf-bar__cta"
              href={hablemos}
              {...(nav.whatsapp ? { target: "_blank", rel: "noopener noreferrer", "data-whatsapp": "" } : {})}
              onClick={(event) => {
                if (nav.whatsapp || !kitActive) return;
                event.preventDefault();
                show(false, nav.contactId ?? undefined);
              }}
            >
              Hablemos
              {nav.whatsapp && <span className="sr-only"> por WhatsApp (se abre en otra pestaña)</span>}
            </a>
          )}
        </div>
        {hasNiches && (
          <div className="pf-bar__row2" aria-hidden={kitActive ? true : undefined} inert={kitActive ? true : undefined}>
            <div className="pf-bar__row2-inner">
              <div ref={scroller} className="pf-bar__chips">
                <nav aria-label={`Nichos de ${nav.name}`}>
                  <ul>
                    {nav.niches.map((niche) => (
                      <li key={niche.slug}>
                        <a className="pf-chip" href={`${nav.basePath}/${niche.slug}`} data-pf-chip={niche.slug}>
                          {niche.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
              </div>
            </div>
          </div>
        )}
      </header>
      <div role="tabpanel" id="pf-panel-about" aria-labelledby="pf-tab-content" hidden={kitActive} className="pf-views__panel">
        {about}
      </div>
      <div role="tabpanel" id="pf-panel-kit" aria-labelledby="pf-tab-kit" hidden={!kitActive} className="pf-views__panel pf-views__kit">
        {kit}
      </div>
      {/* E2 #9: compartir sutil: icono + cápsula (WhatsApp, X, Instagram, TikTok, copiar). */}
      <div className="pf-share">
        <ShareMenu basePath={nav.basePath} gender={nav.gender} tag="whatsapp" />
      </div>
      {/* 13.17 / 13.23 · 6: en todos los portafolios (aún no hay plan pago). */}
      <MadeWithBadge />
    </div>
  );
}
