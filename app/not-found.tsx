import type { Metadata } from "next";
import { notFoundFontClasses } from "@/lib/fonts/not-found";

export const metadata: Metadata = {
  title: "No encontrado",
  robots: { index: false, follow: false },
};

/** 404 en español para links que no existen (en vez de la página en inglés de Next). */
export default function NotFound() {
  return (
    <div className={`${notFoundFontClasses} studio min-h-dvh bg-cream font-sans text-ink`}>
      <main className="mx-auto w-full max-w-3xl px-5 pt-16 pb-16 sm:px-8 sm:pt-24">
        <p className="eyebrow">Error 404</p>
        <h1 className="title-1 mt-5">No encontramos este portafolio</h1>
        <p className="lead mt-5 max-w-prose">
          Revisa que el link esté completo. Si te lo compartieron hace poco, pide que te lo envíen de nuevo.
        </p>
      </main>
    </div>
  );
}
