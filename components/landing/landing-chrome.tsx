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

/** Lockup: la sonrisa (30 px de alto) + el wordmark, separados por más de un diente (15 px a esta escala).
 *  En móvil (compact) va solo la sonrisa: el wordmark no aporta a 360 px y compite con el CTA. */
export function LandingLogo({ mascotTarget = false, compact = false }: { mascotTarget?: boolean; compact?: boolean }) {
  return (
    <Link href="/" className="flex min-h-11 shrink-0 items-center gap-4 text-[1.0625rem] font-semibold tracking-[-0.02em]">
      <SupercreadorMark className="h-[30px] w-auto text-ink" mascotTarget={mascotTarget} />
      {/* Header en móvil (compact): solo la sonrisa, para que quepan "Acceso" y el CTA; el
          nombre sigue ahí para lectores de pantalla. */}
      <span className={compact ? "max-md:sr-only" : undefined}>Supercreador</span>
    </Link>
  );
}

/** Lockup del producto (13.16): "Payfolio" + byline "by Supercreador". Sin el mark de Supercreador: la landing es
 *  la del producto, con navegación propia mínima. En móvil, solo "Payfolio" (E2: sin la palabra Supercreador). */
export function PayfolioLockup() {
  return (
    <Link href="/" className="flex min-h-11 shrink-0 items-center gap-2 text-[1.0625rem] font-semibold tracking-[-0.02em]">
      Payfolio
      <span className="hidden text-sm font-medium text-muted md:inline">by Supercreador</span>
    </Link>
  );
}

/**
 * `nav`: reemplaza la navegación de la landing (anclas + CTA del piloto) por otra, p. ej. en /crear, donde quien
 * entra ya es del piloto y solo necesita "Salir".
 * `brand`: "payfolio" en la landing del producto (13.16); "supercreador" en el resto (default, sin cambios).
 */
export function LandingHeader({ base = "", nav, below, brand = "supercreador" }: { base?: "" | "/"; nav?: ReactNode; below?: ReactNode; brand?: "supercreador" | "payfolio" }) {
  return (
    <header className="landing-glass fixed inset-x-0 top-0 z-40">
      <div className={`${landingContainer} flex h-16 items-center justify-between gap-2 sm:gap-4`}>
        {brand === "payfolio" ? <PayfolioLockup /> : <LandingLogo compact />}
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

/** `mascotTarget`: el mark del footer es donde aterriza la carita viajera (solo en la landing).
 *  `brand`: "payfolio" usa el footer del producto (13.16): "Hecho por Supercreador" + link; conserva el mark para
 *  que la viajera tenga dónde aterrizar. */
export function LandingFooter({ mascotTarget = false, brand = "supercreador" }: { mascotTarget?: boolean; brand?: "supercreador" | "payfolio" }) {
  if (brand === "payfolio") {
    return (
      <footer>
        <div className={`${landingContainer} flex flex-col gap-4 py-10 sm:flex-row sm:items-center sm:justify-between`}>
          <p className="flex items-center gap-3 text-sm text-muted">
            <SupercreadorMark className="h-[26px] w-auto text-ink" mascotTarget={mascotTarget} />
            <span>
              Hecho por{" "}
              <a
                href="https://supercreador.tech"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-ink underline decoration-accent decoration-2 underline-offset-4 hover:text-accent-ink"
              >
                Supercreador
              </a>{" "}
              — el hub para creadores de contenido
            </span>
          </p>
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
