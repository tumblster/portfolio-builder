import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { Avatar } from "@/components/avatar";
import { pillButton, primaryButton } from "@/components/brand-ui";
import { CopyButton } from "@/components/copy-button";
import { EmailAccessForm } from "@/components/email-access-form";
import { LandingFooter } from "@/components/landing/landing-chrome";
import { StudioHeader } from "@/components/studio-header";
import { ACCOUNT_COOKIE, createPortfolioToken, verifyAccountToken } from "@/lib/magic-link";
import { readActivity } from "@/lib/portfolio/activity";
import { nichesWithPieces } from "@/lib/portfolio/niches";
import { getAccountByKey, getOwner } from "@/lib/portfolio/owners";
import { getPortfolio } from "@/lib/portfolio/repository";
import { resolvePortfolio } from "@/lib/portfolio/resolve";
import type { StoredImage } from "@/lib/portfolio/schema";
import { publicPath } from "@/lib/portfolio/slug";
import { originFromHeaders } from "@/lib/request";

/*
 * Panel "Mis portafolios" (ronda 6 · 13.14). El correo es la cuenta (12.1): se entra con el link de la cuenta
 * (/m/cuenta/<token>, que deja la cookie sc_account) y aquí se ven todos sus portafolios, cada uno con:
 *  - nombre y foto, estado (publicado o archivado) y sus vistas (12.7);
 *  - "Ver", "Editar" (con el magic link de ESE portafolio, el mismo de 11.8) y, si está archivado, "Reactivar" (1 clic,
 *    11.9);
 *  - sus links: el general y uno por nicho (13.13), con "Copiar".
 * Sin la cookie (o vencida), pide el correo para mandar el link. Privado: noindex y sin caché.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mis portafolios",
  robots: { index: false, follow: false },
};

type Item = {
  slug: string;
  name: string;
  photo: StoredImage | null;
  archived: boolean;
  views: number;
  publicUrl: string;
  editHref: string;
  reactivateHref: string;
  links: { label: string; path: string; url: string }[];
};

const compact = new Intl.NumberFormat("es", { notation: "compact", maximumFractionDigits: 1 });

function accountKeyFrom(token: string | undefined): string | null {
  try {
    return verifyAccountToken(token)?.accountKey ?? null;
  } catch {
    return null; // sin secreto para firmar: como si no hubiera sesión
  }
}

/** Un portafolio de la cuenta, listo para mostrar; null si ya no existe o cambió de dueño. */
async function loadItem(slug: string, email: string, origin: string): Promise<Item | null> {
  const [doc, owner, activity] = await Promise.all([getPortfolio(slug), getOwner(slug), readActivity(slug)]);
  if (!doc || owner?.email !== email) return null;
  const resolved = resolvePortfolio(doc);
  const { token } = createPortfolioToken(slug);
  const general = publicPath(slug);
  return {
    slug,
    name: resolved.name,
    photo: resolved.photo,
    archived: Boolean(doc.archivedAt),
    views: activity?.views ?? 0,
    publicUrl: new URL(general, origin).toString(),
    editHref: `/m/${token}`,
    reactivateHref: `/m/${token}?reactivar=1`,
    links: [
      { label: "General", path: general, url: new URL(general, origin).toString() },
      ...nichesWithPieces(resolved.niches, resolved.pieces).map((niche) => {
        const path = publicPath(slug, niche.slug);
        return { label: niche.label, path, url: new URL(path, origin).toString() };
      }),
    ],
  };
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="size-4" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export default async function MyPortfoliosPage() {
  const key = accountKeyFrom((await cookies()).get(ACCOUNT_COOKIE)?.value);
  const account = key ? await getAccountByKey(key) : null;
  const origin = originFromHeaders(await headers());
  const items = account
    ? (await Promise.all([...account.slugs].reverse().map((slug) => loadItem(slug, account.email, origin)))).filter(
        (item): item is Item => item !== null,
      )
    : [];

  return (
    <>
      <StudioHeader showLogout={false} />
      <main className="mx-auto w-full max-w-3xl px-5 pt-28 pb-24 sm:px-8 md:pt-32" data-my-portfolios>
        <p className="eyebrow">Tu cuenta</p>
        <h1 className="title-1 mt-5">Mis portafolios</h1>

        {!account ? (
          <>
            <p className="lead mt-5 max-w-prose">
              Entra con tu correo: te mandamos un link para ver y editar tus portafolios. Sin contraseña.
            </p>
            <EmailAccessForm />
          </>
        ) : (
          <>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <p className="min-w-0 text-muted [overflow-wrap:anywhere]">
                Con <span className="font-semibold text-ink">{account.email}</span>
              </p>
              <form action="/api/account/logout" method="post">
                <button type="submit" className={pillButton}>
                  Salir
                </button>
              </form>
            </div>

            {items.length === 0 ? (
              <p className="panel mt-8 p-5 text-muted sm:p-6">Aún no hay portafolios con este correo.</p>
            ) : (
              <ul className="mt-8 space-y-5">
                {items.map((item) => (
                  <li key={item.slug} className="panel p-5 sm:p-6" data-my-portfolio={item.slug}>
                    <div className="flex items-center gap-4">
                      <Avatar photo={item.photo} name={item.name} />
                      <div className="min-w-0 flex-1">
                        <h2 className="truncate text-lg font-semibold tracking-[-0.01em]">{item.name}</h2>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                          <span className={`font-semibold ${item.archived ? "text-accent-ink" : "text-success"}`} data-status={item.archived ? "archivado" : "publicado"}>
                            {item.archived ? "Archivado" : "Publicado"}
                          </span>
                          <span className="inline-flex items-center gap-1" data-views={item.views}>
                            <EyeIcon />
                            {compact.format(item.views)} {item.views === 1 ? "vista" : "vistas"}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {item.archived ? (
                        <a href={item.reactivateHref} className={primaryButton}>
                          Reactivar
                          <span className="sr-only"> el portafolio de {item.name}</span>
                        </a>
                      ) : (
                        <a href={item.publicUrl} target="_blank" rel="noopener noreferrer" className={pillButton}>
                          Ver
                          <span className="sr-only"> el portafolio de {item.name} (se abre en otra pestaña)</span>
                        </a>
                      )}
                      <a href={item.editHref} className={pillButton}>
                        Editar
                        <span className="sr-only"> el portafolio de {item.name}</span>
                      </a>
                    </div>

                    {/* 13.13: el link general y uno por nicho (abre con ese nicho elegido). */}
                    <ul className="mt-4 border-t border-line" aria-label={`Links de ${item.name}`}>
                      {item.links.map((link) => (
                        <li key={link.path} className="flex min-h-tap items-center gap-3 border-b border-line py-1.5">
                          <span className="w-24 shrink-0 truncate text-sm sm:w-32">{link.label}</span>
                          <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted">{link.path}</span>
                          <CopyButton
                            text={link.url}
                            label="Copiar"
                            what={link.label === "General" ? `el link de ${item.name}` : `el link de ${link.label}`}
                            className={`${pillButton} min-h-10 px-4`}
                          />
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
      <LandingFooter />
    </>
  );
}
