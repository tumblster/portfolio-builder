import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicPortfolio } from "@/components/public-portfolio";
import { loadPublicPortfolio } from "@/lib/portfolio/public";

/*
 * Página pública del portafolio (RF-03): abierta, sin clave. Es la versión general
 * (acento violeta); las de cada nicho viven en /p/<slug>/<nicho>.
 * Se genera en su primera visita y queda en caché (ISR): las siguientes cargas
 * salen directo de la CDN. Al crear o editar un portafolio se invalida al
 * instante (lib/portfolio/repository.ts); `revalidate` es solo la red de seguridad.
 */
export const revalidate = 60;

export async function generateStaticParams() {
  return []; // ninguno en el build: cada portafolio se genera en su primera visita
}

const NO_INDEX = { index: false, follow: false } as const; // se comparte por link, no por Google

export async function generateMetadata({ params }: PageProps<"/p/[slug]">): Promise<Metadata> {
  const portfolio = await loadPublicPortfolio((await params).slug);
  if (!portfolio) return { title: "Portafolio no encontrado", robots: NO_INDEX };

  const title = `${portfolio.name} · Portafolio UGC`;
  const description = portfolio.valueProp || portfolio.bio || "Portafolio UGC";
  return {
    title: { absolute: title },
    description,
    robots: NO_INDEX,
    openGraph: { title, description, type: "profile" },
  };
}

export default async function PublicPortfolioPage({ params }: PageProps<"/p/[slug]">) {
  const portfolio = await loadPublicPortfolio((await params).slug);
  if (!portfolio) notFound();
  return <PublicPortfolio portfolio={portfolio} />;
}
