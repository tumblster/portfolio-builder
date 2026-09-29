import type { Metadata } from "next";
import Link from "next/link";
import { SupercreadorMark } from "@/components/brand/supercreador-mark";
import { ElectricWord } from "@/components/electric-word";
import { PortfolioMock } from "@/components/landing/hero-visual";
import { PilotSignup } from "@/components/landing/pilot-signup";
import { Chispa, ChispaEcho, type Expression } from "@/components/mascot/chispa";
import { MascotCompanion } from "@/components/mascot/mascot-companion";

/*
 * Landing pública "/" (v2 · M4-rev). Tres bloques: hero → cómo funciona en 3 cards → cierre con la captura de
 * correo del programa piloto. Chispa es la protagonista: en el hero se ríe (carcajada) y, al bajar, acompaña a
 * quien lee cambiando de expresión en cada tramo (data-mascot-zone). Estática y `noindex`.
 */

export const metadata: Metadata = {
  title: "Supercreador · Portafolios web para creadoras UGC",
  description:
    "Convierte tu Instagram en un portafolio con link propio, uno por nicho y tu Engagement Rate a la vista.",
  robots: { index: false, follow: false },
};

const STEPS: { title: string; text: string; zone: Expression }[] = [
  {
    title: "Importa tu Instagram",
    text: "Pega tu perfil. Leemos tu foto, tu bio y tus mejores publicaciones, y la IA propone tus nichos y tus textos.",
    zone: "sorprendida",
  },
  {
    title: "Confirma tus nichos y elige el diseño",
    text: "Corriges lo que sugirió la IA, eliges una de las 4 plantillas y una paleta. Nada se genera a ciegas.",
    zone: "picara",
  },
  {
    title: "Comparte tu link",
    text: "Un link general y uno por nicho, que abre ya filtrado. Listo para mandarlo a marcas por DM o por correo.",
    zone: "estrella",
  },
];

/** Expresiones de la Chispa acompañante, en el orden en que aparecen al bajar. */
const COMPANION: Expression[] = ["guino", "sorprendida", "picara", "estrella", "carcajada"];

const container = "mx-auto w-full max-w-[75rem] px-5 sm:px-8";
/** Después del hero, el contenido deja libre el costado derecho: ahí flota la Chispa acompañante. */
const column = "landing-column";
const eyebrow = "text-xs font-semibold tracking-[0.16em] text-muted uppercase";
const primary =
  "inline-flex h-12 items-center justify-center rounded-full bg-ink px-6 text-[0.9375rem] font-medium text-cream transition-colors hover:bg-[#2a2e24]";
const textLink = "group inline-flex h-12 items-center gap-1.5 font-medium hover:underline hover:decoration-accent hover:decoration-2 hover:underline-offset-4";

function Chevron() {
  return (
    <span aria-hidden="true" className="inline-block transition-transform group-hover:translate-x-1">
      ›
    </span>
  );
}

function Logo() {
  return (
    // Lockup: la sonrisa (30 px de alto) + el wordmark, separados por más de un diente (15 px a esta escala).
    <Link href="/" className="flex min-h-11 items-center gap-4 text-[1.0625rem] font-semibold tracking-[-0.02em]">
      <SupercreadorMark className="h-[30px] w-auto text-ink" />
      Supercreador
    </Link>
  );
}

export default function LandingPage() {
  return (
    <>
      {/* Navegación fija */}
      <header className="fixed inset-x-0 top-0 z-40 border-b border-line bg-cream/85 backdrop-blur-md">
        <div className={`${container} flex h-16 items-center justify-between gap-4`}>
          <Logo />
          <nav aria-label="Principal" className="flex items-center gap-1 md:gap-2">
            {[
              ["#como-funciona", "Cómo funciona"],
              ["#piloto", "Piloto"],
            ].map(([href, label]) => (
              <a key={href} href={href} className="hidden min-h-11 items-center rounded-full px-3 text-sm font-medium hover:bg-ink/5 md:flex">
                {label}
              </a>
            ))}
            <a
              href="#piloto"
              className="ml-1 inline-flex h-11 items-center rounded-full bg-ink px-4 text-sm font-medium whitespace-nowrap text-cream transition-colors hover:bg-[#2a2e24] md:ml-3 md:px-5"
            >
              Únete al<span className="hidden sm:inline">&nbsp;programa</span>&nbsp;piloto
            </a>
          </nav>
        </div>
      </header>

      <main className="overflow-x-clip">
        {/* 1 · Hero: copy, Chispa protagonista y la mini-mock */}
        <section className={`${container} landing-hero pt-20 pb-20 md:pt-40 md:pb-32 lg:pb-40`} data-hero>
          {/* En el celular el stack de texto va centrado bajo la cara; desde tablet, a la izquierda. */}
          <div className="landing-hero__copy text-center md:text-left">
            <h1 className="text-[2.375rem] leading-[1.06] font-medium tracking-[-0.03em] sm:text-5xl lg:text-[3.75rem]">
              Dale <ElectricWord>superpoderes</ElectricWord> a tu marca personal
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-[1.0625rem] leading-relaxed text-muted md:mx-0 md:mt-6">
              Convierte tu Instagram en un portafolio web profesional, listo para enviar a las marcas
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

        {/* 2 · Cómo funciona: 3 cards */}
        <section id="como-funciona" aria-labelledby="como-funciona-titulo" className="py-24 md:py-32 lg:py-40">
          <div className={container}>
            <div className={column} data-mascot-zone="guino">
              <p className={eyebrow}>Cómo funciona</p>
              <h2
                id="como-funciona-titulo"
                className="mt-5 text-[2rem] leading-[1.1] font-medium tracking-[-0.025em] sm:text-[2.75rem]"
              >
                De tu Instagram a tu link, en tres pasos
              </h2>
            </div>
            <ol className={`${column} mt-12 flex flex-col gap-6 md:mt-16 md:gap-8`}>
              {STEPS.map((step, index) => (
                <li
                  key={step.title}
                  className="reveal-on-scroll rounded-[1.75rem] border border-line bg-paper p-7 sm:p-9"
                  data-mascot-zone={step.zone}
                >
                  <p className="text-sm font-medium text-muted">Paso {index + 1}</p>
                  <h3 className="mt-3 text-xl leading-snug font-medium tracking-[-0.015em] sm:text-2xl">{step.title}</h3>
                  <p className="mt-3 max-w-2xl leading-relaxed text-muted">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* 3 · Cierre: captura de correo del programa piloto */}
        <section id="piloto" aria-labelledby="piloto-titulo" className="pb-28 md:pb-32 lg:pb-40">
          <div className={container}>
            <div
              className={`${column} rounded-[2rem] bg-(--landing-ember) px-6 py-14 text-center text-cream sm:px-12 md:py-20`}
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

        <MascotCompanion>
          {COMPANION.map((expression, index) => (
            <span key={expression} data-face={expression} data-active={index === 0 ? "" : undefined}>
              {expression === "carcajada" ? <ChispaEcho of="chispa-hero" expression={expression} /> : <Chispa expression={expression} />}
            </span>
          ))}
        </MascotCompanion>
      </main>

      <footer>
        <div className={`${container} flex flex-col gap-4 py-10 sm:flex-row sm:items-center sm:justify-between`}>
          <Logo />
          <p className="text-sm text-muted">Portafolios web para creadoras UGC · Programa piloto</p>
          <Link
            href="/acceso"
            className="flex min-h-11 items-center text-sm font-medium hover:underline hover:decoration-accent hover:decoration-2 hover:underline-offset-4"
          >
            Entrar
          </Link>
        </div>
      </footer>
    </>
  );
}
