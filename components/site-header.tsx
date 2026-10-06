import Link from "next/link";
import { LogoutButton } from "./logout-button";

/** Marca del studio: la misma en la landing y en cada pantalla interior. */
export function Wordmark() {
  return (
    <Link href="/" className="flex min-h-tap items-center gap-2.5" aria-label="Supercreador Portafolios, inicio">
      <span className="font-display text-[1.625rem] leading-none tracking-[0.01em] uppercase">Supercreador</span>
      <span className="hidden rounded-full border-2 border-ink px-2 py-0.5 text-[0.6875rem] font-bold tracking-[0.12em] uppercase sm:inline-flex">
        Portafolios
      </span>
    </Link>
  );
}

/** Encabezado de las pantallas interiores (acceso, crear, editar). */
export function SiteHeader({ showLogout = false, wide = false }: { showLogout?: boolean; wide?: boolean }) {
  return (
    <header className="border-b-2 border-ink">
      <div className={`mx-auto flex w-full items-center justify-between gap-4 px-5 py-2 sm:px-8 ${wide ? "max-w-6xl" : "max-w-3xl"}`}>
        <Wordmark />
        {showLogout && (
          <nav aria-label="Studio" className="flex items-center gap-1 sm:gap-3">
            <Link
              href="/crear"
              className="flex min-h-tap items-center px-2 text-sm font-semibold underline-offset-4 hover:underline hover:decoration-accent hover:decoration-2"
            >
              Crear
            </Link>
            <LogoutButton />
          </nav>
        )}
      </div>
    </header>
  );
}
