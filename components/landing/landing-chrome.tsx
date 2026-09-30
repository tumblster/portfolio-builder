import Link from "next/link";
import type { ReactNode } from "react";
import { SupercreadorMark } from "@/components/brand/supercreador-mark";
import "./brand.css";

/*
 * Header y footer de la landing (v2 · M4-rev r2). Los comparten "/" y "/acceso" (B8): mismo sistema visual.
 * `base` = "" en la landing (anclas de la misma página) y "/" fuera de ella (vuelven a la landing).
 */

export const landingContainer = "mx-auto w-full max-w-[75rem] px-5 sm:px-8";

/** Botón primario de la landing: píldora de tinta con borde 3D en el acento (B9). */
export const landingPrimary =
  "landing-btn-3d inline-flex h-12 items-center justify-center rounded-full bg-ink px-6 text-[0.9375rem] font-medium text-cream transition-colors hover:bg-[#2a2e24]";

/** Lockup: la sonrisa (30 px de alto) + el wordmark, separados por más de un diente (15 px a esta escala). */
export function LandingLogo({ mascotTarget = false, compact = false }: { mascotTarget?: boolean; compact?: boolean }) {
  return (
    <Link href="/" className="flex min-h-11 shrink-0 items-center gap-4 text-[1.0625rem] font-semibold tracking-[-0.02em]">
      <SupercreadorMark className="h-[30px] w-auto text-ink" mascotTarget={mascotTarget} />
      {/* Header en pantallas de menos de 400 px (compact): solo la sonrisa, para que quepan "Acceso" y el CTA; el
          nombre sigue ahí para lectores de pantalla. */}
      <span className={compact ? "max-[399px]:sr-only" : undefined}>Supercreador</span>
    </Link>
  );
}

/**
 * `nav`: reemplaza la navegación de la landing (anclas + CTA del piloto) por otra, p. ej. en /crear, donde quien
 * entra ya es del piloto y solo necesita "Salir".
 */
export function LandingHeader({ base = "", nav, below }: { base?: "" | "/"; nav?: ReactNode; below?: ReactNode }) {
  return (
    <header className="landing-glass fixed inset-x-0 top-0 z-40">
      <div className={`${landingContainer} flex h-16 items-center justify-between gap-2 sm:gap-4`}>
        <LandingLogo compact />
        {nav !== undefined ? (
          nav
        ) : (
        <nav aria-label="Principal" className="flex items-center gap-1 md:gap-2">
          {[
            [`${base}#como-funciona`, "Roadmap"],
            [`${base}#piloto`, "Piloto"],
          ].map(([href, label]) => (
            <a key={href} href={href} className="hidden min-h-11 items-center rounded-full px-3 text-sm font-medium hover:bg-ink/5 md:flex">
              {label}
            </a>
          ))}
          <Link
            href="/acceso"
            className="flex min-h-11 items-center rounded-full px-2.5 text-sm font-medium hover:bg-ink/5 sm:px-3"
            data-nav-access
          >
            Acceso
          </Link>
          <a
            href={`${base}#piloto`}
            className="landing-btn-3d ml-1 inline-flex h-11 items-center rounded-full bg-ink px-4 text-sm font-medium whitespace-nowrap text-cream transition-colors hover:bg-[#2a2e24] md:ml-3 md:px-5"
          >
            Únete al<span className="hidden sm:inline">&nbsp;programa</span>&nbsp;piloto
          </a>
        </nav>
        )}
      </div>
      {below}
    </header>
  );
}

/** `mascotTarget`: el mark del footer es donde aterriza la carita viajera (solo en la landing). */
export function LandingFooter({ mascotTarget = false }: { mascotTarget?: boolean }) {
  return (
    <footer>
      <div className={`${landingContainer} flex flex-col gap-4 py-10 sm:flex-row sm:items-center sm:justify-between`}>
        <LandingLogo mascotTarget={mascotTarget} />
        <p className="text-sm text-muted">El hub para creadores de contenido</p>
        <Link
          href="/acceso"
          className="flex min-h-11 items-center text-sm font-medium hover:underline hover:decoration-accent hover:decoration-2 hover:underline-offset-4"
        >
          Entrar
        </Link>
      </div>
    </footer>
  );
}
