"use client";

import { primaryButton } from "@/components/ui";

/** Si falla la lectura del portafolio (p. ej. el almacenamiento no responde). */
export default function PortfolioError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 pt-16 pb-16 sm:px-8 sm:pt-24">
      <h1 className="text-5xl sm:text-7xl">no pudimos cargar este portafolio.</h1>
      <p className="mt-5 max-w-prose text-muted sm:text-lg">
        Suele ser algo momentáneo. Intenta de nuevo en unos segundos.
      </p>
      <button type="button" onClick={() => retry()} className={`${primaryButton} mt-8`}>
        Intentar de nuevo
      </button>
    </main>
  );
}
