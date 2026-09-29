"use client";

/** Si falla la lectura del portafolio (p. ej. el almacenamiento no responde). Mismo estilo claro que la página. */
export default function PortfolioError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="pf" data-template="creator">
      <main className="pf-shell pf-state">
        <p className="pf-eyebrow">
          <span className="pf-eyebrow__star" aria-hidden="true">
            ✦
          </span>
          Portafolio
        </p>
        <h1 className="pf-h1">No pudimos cargar este portafolio.</h1>
        <p className="pf-lead">Suele ser algo momentáneo. Intenta de nuevo en unos segundos.</p>
        <div className="pf-actions">
          <button type="button" onClick={() => retry()} className="pf-btn pf-btn--solid">
            Intentar de nuevo
          </button>
        </div>
      </main>
    </div>
  );
}
