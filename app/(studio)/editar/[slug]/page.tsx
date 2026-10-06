import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ConfigNotice } from "@/components/config-notice";
import { CopyButton } from "@/components/copy-button";
import { extrasFromPortfolio, formFromPortfolio, type Baseline } from "@/components/editor/form-model";
import { PortfolioEditor } from "@/components/editor/portfolio-editor";
import { LandingFooter } from "@/components/landing/landing-chrome";
import { PortfolioStatus } from "@/components/editor/portfolio-status";
import { StudioHeader } from "@/components/studio-header";
import { readActivity } from "@/lib/portfolio/activity";
import { getPortfolioAccess } from "@/lib/auth";
import { getPortfolio } from "@/lib/portfolio/repository";
import { resolvePortfolio } from "@/lib/portfolio/resolve";
import { publicPath } from "@/lib/portfolio/slug";
import { originFromHeaders } from "@/lib/request";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Editar portafolio",
  robots: { index: false, follow: false },
};

/**
 * Edita cualquier portafolio (también los importados). Lo cambiado queda como dato manual.
 * Arriba, los links de la versión general y de cada nicho del portafolio, cada uno con
 * "Copiar" y "Abrir". Un nicho sin piezas conserva su link (abre mostrando todo).
 */
export default async function EditPortfolioPage({ params, searchParams }: PageProps<"/editar/[slug]">) {
  const { slug } = await params;
  // Con la clave del creador o con el magic link de este portafolio (spec 11.8).
  const access = await getPortfolioAccess(slug);
  if (access.status === "no-session") redirect(`/acceso?next=${encodeURIComponent(`/editar/${slug}`)}`);

  if (access.status === "not-configured") {
    return (
      <>
        <StudioHeader showLogout={false} />
        <main className="mx-auto w-full max-w-3xl px-5 pt-28 pb-24 sm:px-8 md:pt-32">
          <p className="eyebrow">Editor</p>
        <h1 className="title-1 mt-5">Edita el portafolio</h1>
          <ConfigNotice message={access.message} />
        </main>
        <LandingFooter />
      </>
    );
  }

  const doc = await getPortfolio(slug);
  if (!doc) notFound();
  const resolved = resolvePortfolio(doc);
  const origin = originFromHeaders(await headers());
  const links = [
    { label: "General", niche: null, empty: false, path: publicPath(doc.slug) },
    ...resolved.niches.map((niche) => ({
      label: niche.label,
      niche: niche.slug,
      empty: !resolved.pieces.some((piece) => piece.niche === niche.slug),
      path: publicPath(doc.slug, niche.slug),
    })),
  ].map((link) => ({ ...link, url: new URL(link.path, origin).toString() }));
  const query = await searchParams;
  const justCreated = query.creado === "1";
  const reactivated = query.reactivado === "1";
  const activity = await readActivity(doc.slug);
  const baseline: Baseline = {
    slug: doc.slug,
    revision: doc.revision,
    form: formFromPortfolio(resolved),
    manual: doc.manual,
    extras: extrasFromPortfolio(resolved),
  };

  return (
    <>
      <StudioHeader showLogout />
      <main className="mx-auto w-full max-w-6xl px-5 pt-28 pb-24 sm:px-8 md:pt-32">
        <p className="eyebrow">Editor</p>
        <h1 className="title-1 mt-5">Edita el portafolio</h1>
        <PortfolioStatus
          slug={doc.slug}
          archived={Boolean(doc.archivedAt)}
          views={activity?.views ?? 0}
          refs={activity?.refs ?? {}}
          reactivated={reactivated}
        />
        {justCreated && (
          <p role="status" className="mt-5 text-lg text-success">
            Listo: el portafolio de {resolved.name} ya tiene link.
          </p>
        )}
        <section aria-labelledby="links" className="mt-6 max-w-3xl">
          <h2 id="links" className="title-3">
            Links del portafolio
          </h2>
          <p className="mt-2 text-sm text-muted">El general y uno por nicho.</p>
          <ul className="mt-3 border-t border-line">
            {links.map((link) => (
              <li key={link.path} className="flex items-center gap-3 border-b border-line py-1">
                <span className="w-24 shrink-0 text-sm sm:w-32">
                  <span className="block truncate text-accent-ink">{link.label}</span>
                  {link.empty && <span className="block text-xs text-muted">sin piezas</span>}
                </span>
                {/* En el celular, solo la ruta (lo que distingue cada versión); en pantallas anchas, el link completo. */}
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted">
                  <span className="sm:hidden">{link.path}</span>
                  <span className="hidden select-all sm:inline">{link.url}</span>
                </span>
                <CopyButton
                  text={link.url}
                  label="Copiar"
                  what={link.niche ? `el link de ${link.label}` : "el link general"}
                  className="flex min-h-tap shrink-0 items-center gap-1 px-2 text-sm text-ink transition hover:text-accent-ink"
                />
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-tap shrink-0 items-center px-2 text-sm text-ink transition hover:text-accent-ink"
                >
                  Abrir<span className="sr-only"> la versión {link.label} (se abre en otra pestaña)</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
        <PortfolioEditor mode="edit" baseline={baseline} />
      </main>
      <LandingFooter />
    </>
  );
}
