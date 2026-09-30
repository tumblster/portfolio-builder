import Link from "next/link";
import { SupercreadorMark } from "@/components/brand/supercreador-mark";

/*
 * Header y footer de la landing (v2 · M4-rev r2). Los comparten "/" y "/acceso" (B8): mismo sistema visual.
 * `base` = "" en la landing (anclas de la misma página) y "/" fuera de ella (vuelven a la landing).
 */

export const landingContainer = "mx-auto w-full max-w-[75rem] px-5 sm:px-8";

/** Botón primario de la landing: píldora de tinta con borde 3D en el acento (B9). */
export const landingPrimary =
  "landing-btn-3d inline-flex h-12 items-center justify-center rounded-full bg-ink px-6 text-[0.9375rem] font-medium text-cream transition-colors hover:bg-[#2a2e24]";

/** Lockup: la sonrisa (30 px de alto) + el wordmark, separados por más de un diente (15 px a esta escala). */
export function LandingLogo({ mascotTarget = false }: { mascotTarget?: boolean }) {
  return (
    <Link href="/" className="flex min-h-11 items-center gap-4 text-[1.0625rem] font-semibold tracking-[-0.02em]">
      <SupercreadorMark className="h-[30px] w-auto text-ink" mascotTarget={mascotTarget} />
      Supercreador
    </Link>
  );
}

export function LandingHeader({ base = "" }: { base?: "" | "/" }) {
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-line bg-cream/85 backdrop-blur-md">
      <div className={`${landingContainer} flex h-16 items-center justify-between gap-4`}>
        <LandingLogo />
        <nav aria-label="Principal" className="flex items-center gap-1 md:gap-2">
          {[
            [`${base}#como-funciona`, "Roadmap"],
            [`${base}#piloto`, "Piloto"],
          ].map(([href, label]) => (
            <a key={href} href={href} className="hidden min-h-11 items-center rounded-full px-3 text-sm font-medium hover:bg-ink/5 md:flex">
              {label}
            </a>
          ))}
          <a
            href={`${base}#piloto`}
            className="landing-btn-3d ml-1 inline-flex h-11 items-center rounded-full bg-ink px-4 text-sm font-medium whitespace-nowrap text-cream transition-colors hover:bg-[#2a2e24] md:ml-3 md:px-5"
          >
            Únete al<span className="hidden sm:inline">&nbsp;programa</span>&nbsp;piloto
          </a>
        </nav>
      </div>
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
