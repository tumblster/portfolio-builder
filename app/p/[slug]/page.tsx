import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicPortfolio } from "@/components/public-portfolio";
import { portfolioMetadata } from "@/lib/portfolio/metadata";
import { loadPublicPortfolio } from "@/lib/portfolio/public";

/*
 * Página pública del portafolio (RF-03): abierta, sin clave. Es la versión general ("Todo");
 * cada nicho tiene además su propio link, /p/<slug>/<nicho>, con la misma página filtrada.
 * Se genera en su primera visita y queda en caché (ISR): las siguientes cargas
 * salen directo de la CDN. Al crear o editar un portafolio se invalida al
 * instante (lib/portfolio/repository.ts); `revalidate` es solo la red de seguridad.
 */
export const revalidate = 60;

export async function generateStaticParams() {
  return []; // ninguno en el build: cada portafolio se genera en su primera visita
}

export async function generateMetadata({ params }: PageProps<"/p/[slug]">): Promise<Metadata> {
  return portfolioMetadata(await loadPublicPortfolio((await params).slug), null);
}

export default async function PublicPortfolioPage({ params }: PageProps<"/p/[slug]">) {
  const portfolio = await loadPublicPortfolio((await params).slug);
  if (!portfolio) notFound();
  return <PublicPortfolio portfolio={portfolio} />;
}
