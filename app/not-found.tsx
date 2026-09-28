import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "No encontrado",
  robots: { index: false, follow: false },
};

/** 404 en español para links que no existen (en vez de la página en inglés de Next). */
export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 pt-16 pb-16 sm:px-8 sm:pt-24">
      <p className="font-mono text-xs text-muted">error 404</p>
      <h1 className="mt-5 text-5xl sm:text-7xl">no encontramos este portafolio.</h1>
      <p className="mt-5 max-w-prose text-muted sm:text-lg">
        Revisa que el link esté completo. Si te lo compartieron hace poco, pide que te lo envíen de nuevo.
      </p>
    </main>
  );
}
