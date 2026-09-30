import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ElectricWord } from "@/components/electric-word";
import { PortfolioMock } from "@/components/landing/hero-visual";
import { InstagramGlyph } from "@/components/landing/instagram-glyph";
import { LandingFooter, LandingHeader, landingContainer as container, landingPrimary as primary } from "@/components/landing/landing-chrome";
import { PilotFloat } from "@/components/landing/pilot-float";
import { PilotSignup } from "@/components/landing/pilot-signup";
import { Chispa, type Expression } from "@/components/mascot/chispa";
import { MascotTraveler } from "@/components/mascot/mascot-traveler";

/*
 * Landing pública "/" (v2 · M4-rev r2). Tres bloques: hero → roadmap de producto ("For you page") → cierre con la
 * captura de correo del programa piloto. Chispa es la protagonista: en el hero se ríe (carcajada) y, al bajar,
 * viaja con quien lee cambiando de expresión en cada tramo (data-mascot-zone) hasta que el logo del footer la
 * absorbe. Estática y `noindex`.
 */

export const metadata: Metadata = {
  title: "Supercreador · Portafolios web para creadoras UGC",
  description:
    "Convierte tu Instagram en un portafolio con link propio, uno por nicho y tu Engagement Rate a la vista.",
  robots: { index: false, follow: false },
};

type RoadmapItem = {
  name: string;
  status: "Disponible ahora" | "En construcción" | "Próximo";
  text: ReactNode;
  cta: { label: string; href: string } | null;
  zone: Expression;
};

const ROADMAP: RoadmapItem[] = [
  {
    name: "Portfolio Builder",
    status: "Disponible ahora",
    text: (
      <>
        Convierte tu <InstagramGlyph /> en un portafolio web profesional en minutos.
      </>
    ),
    cta: { label: "Probarlo", href: "/crear" },
    zone: "sorprendida",
  },
  {
    name: "Tablero de oportunidades",
    status: "En construcción",
    text: "Las marcas publican oportunidades reales; tú postulas con tu portafolio.",
    cta: null,
    zone: "picara",
  },
  {
    name: "Tarifar sin fricción",
    status: "Próximo",
    text: "Descubre cuánto cobrar por cada colaboración según tu nicho y tus métricas.",
    cta: null,
    zone: "estrella",
  },
];

/** Estilo de cada estado: lo disponible en tinta, lo que viene en contorno. */
const STATUS_PILL: Record<RoadmapItem["status"], string> = {
  "Disponible ahora": "bg-ink text-cream",
  "En construcción": "border border-ink bg-sand text-ink",
  Próximo: "border border-line bg-paper text-ink",
};

/** Expresiones de la carita viajera, en el orden en que aparecen al bajar (las mismas zonas de la página). */
const TRAVELER: Expression[] = ["guino", "sorprendida", "picara", "estrella", "carcajada"];

/** Después del hero, el contenido deja libre el costado derecho: por ahí baja la carita viajera. */
const column = "landing-column";
const eyebrow = "text-xs font-semibold tracking-[0.16em] text-muted uppercase";
const textLink = "group inline-flex h-12 items-center gap-1.5 font-medium hover:underline hover:decoration-accent hover:decoration-2 hover:underline-offset-4";

function Chevron() {
  return (
    <span aria-hidden="true" className="inline-block transition-transform group-hover:translate-x-1">
      ›
    </span>
  );
}

export default function LandingPage() {
  return (
    <>
      <LandingHeader />

      <main className="overflow-x-clip">
        {/* 1 · Hero: copy, Chispa protagonista y la mini-mock */}
        <section className={`${container} landing-hero pt-20 pb-20 md:pt-40 md:pb-32 lg:pb-40`} data-hero>
          {/* En el celular el stack de texto va centrado bajo la cara; desde tablet, a la izquierda. */}
          <div className="landing-hero__copy text-center md:text-left">
            <h1 className="text-[2.375rem] leading-[1.06] font-medium tracking-[-0.03em] sm:text-5xl lg:text-[3.75rem]">
              Dale <ElectricWord>superpoderes</ElectricWord> a tu marca personal
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-[1.0625rem] leading-relaxed text-muted md:mx-0 md:mt-6">
              Convierte tu <InstagramGlyph /> en un portafolio web profesional, listo para enviar a las marcas
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 md:mt-9 md:justify-start">
              <a href="#piloto" className={primary}>
                Únete al programa piloto
              </a>
              <a href="#como-funciona" className={`${textLink} text-[0.9375rem]`}>
                Ver cómo funciona <Chevron />
              </a>
            </div>
          </div>
          <div className="landing-hero__face" data-hero-mascot>
            <Chispa expression="carcajada" id="chispa-hero" className="block h-auto w-full text-ink" />
          </div>
          <div className="landing-hero__mock">
            <PortfolioMock />
          </div>
        </section>

        {/* 2 · Roadmap de producto: lo que ya se puede usar y lo que viene */}
        <section id="como-funciona" aria-labelledby="como-funciona-titulo" className="py-24 md:py-32 lg:py-40">
          <div className={container}>
            <div className={column} data-mascot-zone="guino">
              <p className={eyebrow}>For you page</p>
              <h2
                id="como-funciona-titulo"
                className="mt-5 text-[2rem] leading-[1.1] font-medium tracking-[-0.025em] sm:text-[2.75rem]"
              >
                Estamos construyendo herramientas para ti
              </h2>
            </div>
            <ol className={`${column} landing-roadmap mt-12 md:mt-16`}>
              {ROADMAP.map((item) => (
                <li key={item.name} className="landing-roadmap__item" data-mascot-zone={item.zone} data-roadmap-status={item.status}>
                  <span className="landing-roadmap__node" aria-hidden="true" />
                  <div className="reveal-on-scroll rounded-[1.75rem] border border-line bg-paper p-7 sm:p-9">
                    <p>
                      <span className={`inline-flex h-7 items-center rounded-full px-3 text-xs font-semibold ${STATUS_PILL[item.status]}`}>
                        {item.status}
                      </span>
                    </p>
                    <h3 className="mt-4 text-xl leading-snug font-medium tracking-[-0.015em] sm:text-2xl">{item.name}</h3>
                    <p className="mt-3 max-w-2xl leading-relaxed text-muted">{item.text}</p>
                    <div className="mt-6">
                      {item.cta ? (
                        <Link href={item.cta.href} className={primary}>
                          {item.cta.label}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="inline-flex h-12 cursor-not-allowed items-center justify-center rounded-full border border-line bg-cream px-6 text-[0.9375rem] font-medium text-muted"
                        >
                          Próximamente
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* 3 · Cierre: captura de correo del programa piloto */}
        <section id="piloto" aria-labelledby="piloto-titulo" className="pb-28 md:pb-32 lg:pb-40">
          <div className={container}>
            <div
              className={`${column} landing-ember rounded-[2rem] px-6 py-14 text-center text-cream sm:px-12 md:py-20`}
              data-mascot-zone="carcajada"
            >
              <p className="text-xs font-semibold tracking-[0.16em] text-sand uppercase">Programa piloto</p>
              <h2 id="piloto-titulo" className="mt-5 text-[2.5rem] leading-[1.05] font-medium tracking-[-0.03em] sm:text-[3.25rem]">
                Únete al programa piloto
              </h2>
              <p className="mx-auto mt-6 max-w-xl text-[1.0625rem] leading-relaxed text-sand">
                Estamos sumando pocas creadoras UGC. Durante el piloto entras con una clave de acceso y armas tu portafolio en
                minutos.
              </p>
              <PilotSignup />
              <Link href="/acceso" className={`${textLink} mt-4 text-[0.9375rem] hover:decoration-cream`}>
                ¿Ya tienes clave? Entrar <Chevron />
              </Link>
            </div>
          </div>
        </section>

        <PilotFloat />
        <MascotTraveler>
          {TRAVELER.map((expression) => (
            <span key={expression} data-face={expression} data-active={expression === "carcajada" ? "" : undefined}>
              <Chispa expression={expression} />
            </span>
          ))}
        </MascotTraveler>
      </main>

      <LandingFooter mascotTarget />
    </>
  );
}
