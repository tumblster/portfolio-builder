import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ConfigNotice } from "@/components/config-notice";
import { CopyButton } from "@/components/copy-button";
import { extrasFromPortfolio, formFromPortfolio, type Baseline } from "@/components/editor/form-model";
import { PortfolioEditor } from "@/components/editor/portfolio-editor";
import { SiteHeader } from "@/components/site-header";
import { fieldLabel } from "@/components/ui";
import { getCreatorAccess } from "@/lib/auth";
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
  const access = await getCreatorAccess();
  if (access.status === "no-session") redirect(`/acceso?next=${encodeURIComponent(`/editar/${slug}`)}`);

  if (access.status === "not-configured") {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto w-full max-w-2xl px-5 pt-10 pb-16 sm:px-8 sm:pt-16">
          <h1 className="text-5xl sm:text-7xl">editar portafolio.</h1>
          <ConfigNotice message={access.message} />
        </main>
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
  const justCreated = (await searchParams).creado === "1";
  const baseline: Baseline = {
    slug: doc.slug,
    revision: doc.revision,
    form: formFromPortfolio(resolved),
    manual: doc.manual,
    extras: extrasFromPortfolio(resolved),
  };

  return (
    <>
      <SiteHeader showLogout wide />
      <main className="mx-auto w-full max-w-6xl px-5 pt-10 pb-16 sm:px-8 sm:pt-16">
        <h1 className="text-5xl sm:text-7xl">editar portafolio.</h1>
        {justCreated && (
          <p role="status" className="mt-5 text-lg text-lilac">
            Listo: el portafolio de {resolved.name} ya tiene link.
          </p>
        )}
        <section aria-labelledby="links" className="mt-6 max-w-3xl">
          <h2 id="links" className={`${fieldLabel} font-sans leading-normal tracking-normal`}>
            Links del portafolio: el general y uno por nicho
          </h2>
          <ul className="mt-2 border-t border-line">
            {links.map((link) => (
              <li key={link.path} className="flex items-center gap-3 border-b border-line py-1">
                <span className="w-24 shrink-0 text-sm sm:w-32">
                  <span className="block truncate text-accent-soft">{link.label}</span>
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
                  className="flex min-h-tap shrink-0 items-center gap-1 px-2 text-sm text-white transition hover:text-lilac"
                />
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-tap shrink-0 items-center px-2 text-sm text-white transition hover:text-lilac"
                >
                  Abrir<span className="sr-only"> la versión {link.label} (se abre en otra pestaña)</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
        <PortfolioEditor mode="edit" baseline={baseline} />
      </main>
    </>
  );
}
