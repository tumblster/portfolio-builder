"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/*
 * Estado del portafolio en el editor: vistas y de dónde llegan (12.7 / 12.9: tracking propio, sin GA4) y, si se
 * archivó por inactividad (11.9), el aviso con "Reactivar" en 1 clic.
 */
export function PortfolioStatus({
  slug,
  archived,
  views,
  refs,
  reactivated,
}: {
  slug: string;
  archived: boolean;
  views: number;
  refs: Record<string, number>;
  reactivated: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label: Record<string, string> = { qr: "QR", whatsapp: "WhatsApp", directo: "Directo" };
  const sources = Object.entries(refs).sort((a, b) => b[1] - a[1]).slice(0, 5);

  async function reactivate() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/portfolios/${slug}/reactivate`, { method: "POST" }).catch(() => null);
    setBusy(false);
    if (!response?.ok) return setError("No pudimos reactivarlo. Intenta de nuevo.");
    router.refresh();
  }

  return (
    <div className="mt-6 space-y-3" data-portfolio-status>
      {reactivated && !archived && (
        <p role="status" className="text-success">
          Listo: tu portafolio volvió a estar en línea.
        </p>
      )}
      {archived && (
        <div role="alert" className="rounded-card border-2 border-ink bg-highlight p-4" data-archived-banner>
          <p className="font-semibold">Tu portafolio está archivado por inactividad.</p>
          <p className="mt-1 text-sm">Su link muestra «No disponible temporalmente». Nada se borró: vuelve con 1 clic.</p>
          <button type="button" onClick={reactivate} disabled={busy} className="mt-3 inline-flex min-h-tap items-center rounded-full bg-ink px-5 font-semibold text-cream">
            {busy ? "Reactivando…" : "Reactivar"}
          </button>
          {error && <p className="mt-2 text-sm text-accent-ink">{error}</p>}
        </div>
      )}
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted" data-portfolio-stats>
        <span>
          <strong className="text-ink">{views}</strong> {views === 1 ? "vista" : "vistas"}
        </span>
        {sources.map(([ref, count]) => (
          <span key={ref}>
            {label[ref] ?? ref}: <strong className="text-ink">{count}</strong>
          </span>
        ))}
      </p>
    </div>
  );
}
