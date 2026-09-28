import Link from "next/link";
import { LogoutButton } from "./logout-button";

/** `wide`: para pantallas con formulario y vista previa lado a lado. */
export function SiteHeader({ showLogout = false, wide = false }: { showLogout?: boolean; wide?: boolean }) {
  return (
    <header
      className={`mx-auto flex w-full items-center justify-between px-5 pt-4 sm:px-8 sm:pt-6 ${wide ? "max-w-6xl" : "max-w-2xl"}`}
    >
      <Link href="/" className="flex min-h-tap items-center font-mono text-xs text-muted transition hover:text-white">
        supercreador / portafolios
      </Link>
      {showLogout && <LogoutButton />}
    </header>
  );
}
