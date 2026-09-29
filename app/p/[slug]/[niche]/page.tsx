import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicPortfolio } from "@/components/public-portfolio";
import { portfolioMetadata } from "@/lib/portfolio/metadata";
import { findNiche, isNicheSlug } from "@/lib/portfolio/niches";
import { loadPublicPortfolio } from "@/lib/portfolio/public";

/*
 * Link directo a un nicho: /p/<slug>/<nicho> (p. ej. /p/valentina-ruiz/fitness).
 * Es la misma página que la versión general, con ese nicho ya elegido en las píldoras: cada
 * marca recibe el link de su nicho y, si quiere, puede ver todo lo demás sin recargar.
 * Solo existen los nichos del portafolio (los de la IA, o Belleza/Lifestyle/Viajes en los de
 * la v1); cualquier otro da 404. Si un nicho se quedó sin piezas, el link sigue abriendo y
 * muestra todo.
 * Misma caché que la versión general (ver app/p/[slug]/page.tsx).
 */
export const revalidate = 60;

export async function generateStaticParams() {
  return []; // ninguno en el build: cada versión se genera en su primera visita
}

async function load(params: PageProps<"/p/[slug]/[niche]">["params"]) {
  const { slug, niche } = await params;
  if (!isNicheSlug(niche)) return null;
  const portfolio = await loadPublicPortfolio(slug);
  const def = portfolio ? findNiche(portfolio.niches, niche) : null;
  return portfolio && def ? { portfolio, niche: def } : null;
}

export async function generateMetadata({ params }: PageProps<"/p/[slug]/[niche]">): Promise<Metadata> {
  const found = await load(params);
  return portfolioMetadata(found?.portfolio ?? null, found?.niche ?? null);
}

export default async function NichePortfolioPage({ params }: PageProps<"/p/[slug]/[niche]">) {
  const found = await load(params);
  if (!found) notFound();
  return <PublicPortfolio portfolio={found.portfolio} />;
}
