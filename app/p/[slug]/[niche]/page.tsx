import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicPortfolio } from "@/components/public-portfolio";
import { NICHE_LABELS, isNiche } from "@/lib/portfolio/niches";
import { loadPublicPortfolio } from "@/lib/portfolio/public";

/*
 * Versión de un nicho (RF-04): /p/<slug>/belleza, /lifestyle o /viajes.
 * Mismos datos que la versión general, con otro acento, otro titular y primero las
 * piezas de ese nicho. Sin pestañas: cada marca recibe el link de su nicho.
 * Misma caché que la versión general (ver app/p/[slug]/page.tsx).
 */
export const revalidate = 60;

export async function generateStaticParams() {
  return []; // ninguno en el build: cada versión se genera en su primera visita
}

const NO_INDEX = { index: false, follow: false } as const;

export async function generateMetadata({ params }: PageProps<"/p/[slug]/[niche]">): Promise<Metadata> {
  const { slug, niche } = await params;
  const portfolio = isNiche(niche) ? await loadPublicPortfolio(slug) : null;
  if (!portfolio || !isNiche(niche)) return { title: "Portafolio no encontrado", robots: NO_INDEX };

  const title = `${portfolio.name} · Portafolio UGC — ${NICHE_LABELS[niche]}`;
  const description = portfolio.valueProp || portfolio.bio || "Portafolio UGC";
  return {
    title: { absolute: title },
    description,
    robots: NO_INDEX,
    openGraph: { title, description, type: "profile" },
  };
}

export default async function NichePortfolioPage({ params }: PageProps<"/p/[slug]/[niche]">) {
  const { slug, niche } = await params;
  if (!isNiche(niche)) notFound();
  const portfolio = await loadPublicPortfolio(slug);
  if (!portfolio) notFound();
  return <PublicPortfolio portfolio={portfolio} niche={niche} />;
}
