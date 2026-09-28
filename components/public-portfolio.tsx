import Image from "next/image";
import { contactLinks } from "@/lib/portfolio/contact-links";
import { NICHE_LABELS, orderForNiche, type Niche } from "@/lib/portfolio/niches";
import type { ResolvedPiece, ResolvedPortfolio } from "@/lib/portfolio/resolve";
import type { StoredImage } from "@/lib/portfolio/schema";
import { pillButton, primaryButton } from "./ui";

/*
 * Página pública del portafolio (RF-03), también usada como vista previa del editor.
 * No manda JavaScript propio al navegador en la página pública. En el celular, sin
 * hacer scroll se ven foto, nombre, propuesta de valor y 3 piezas (§7.4); las piezas
 * van en una tira horizontal deslizable (una sola fila, §7.5); en pantallas anchas, grilla.
 *
 * Se adapta al ANCHO DE SU CONTENEDOR (container queries), no al de la ventana: así la
 * vista previa del editor, en una columna angosta, se ve igual que en un celular.
 *
 * Versión por nicho (RF-04): data-niche cambia el acento (globals.css) y se ve en el
 * resplandor de fondo, el titular, el anillo de la foto, la marca de video y los
 * "Ver en …"; además las piezas de ese nicho pasan primero. Sin nicho: versión general, violeta.
 */

const PLATFORM_LABEL = { instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube" } as const;

type PublicPortfolioProps = {
  portfolio: ResolvedPortfolio;
  /** "preview": dentro del editor (sin <main> ni <h1> propios). */
  variant?: "page" | "preview";
  /** Versión de un nicho; null o ausente = versión general. */
  niche?: Niche | null;
};

export function PublicPortfolio({ portfolio, variant = "page", niche = null }: PublicPortfolioProps) {
  const { name, bio, photo, valueProp, contact } = portfolio;
  const pieces = orderForNiche(portfolio.pieces, niche);
  const links = contactLinks(contact);
  const isPage = variant === "page";
  const Root = isPage ? "main" : "div";
  const NameHeading = isPage ? "h1" : "h2";
  const SectionHeading = isPage ? "h2" : "h3";

  return (
    <div className="@container relative isolate" data-niche={niche ?? undefined}>
      {/* Resplandor del color del nicho detrás del encabezado (violeta en la versión general). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[26rem]"
        style={{
          background:
            "radial-gradient(70% 60% at 12% 0%, color-mix(in oklab, var(--accent) 32%, transparent), transparent 72%)",
        }}
      />
      <Root className="mx-auto w-full max-w-3xl px-5 pt-6 pb-12 @min-[40rem]:px-8 @min-[40rem]:pt-14">
        {niche ? (
          <p className="font-mono text-sm text-accent-soft">{`portafolio ugc — ${NICHE_LABELS[niche].toLowerCase()}`}</p>
        ) : (
          <p className="font-mono text-xs text-muted">portafolio ugc</p>
        )}

        <header className="mt-4 flex items-center gap-4 @min-[40rem]:mt-6 @min-[40rem]:gap-6">
          <ProfilePhoto photo={photo} name={name} preload={isPage} />
          <div className="min-w-0">
            <NameHeading className="font-serif text-4xl leading-[1.05] tracking-[-0.02em] break-words @min-[40rem]:text-6xl">
              {name}
            </NameHeading>
            {contact.instagram && <p className="mt-1 truncate text-sm text-muted">@{contact.instagram}</p>}
          </div>
        </header>

        {valueProp && (
          <p className="mt-5 max-w-2xl font-serif text-[1.375rem] leading-snug @min-[40rem]:text-3xl">{valueProp}</p>
        )}
        {bio && (
          <p className="mt-3 line-clamp-3 max-w-xl text-sm whitespace-pre-line text-muted @min-[40rem]:text-base">{bio}</p>
        )}

        <section aria-labelledby="trabajos" className="mt-7 @min-[40rem]:mt-10">
          <SectionHeading id="trabajos" className="font-mono text-xs font-normal tracking-normal text-muted">
            trabajos
          </SectionHeading>
          <div
            role="region"
            aria-labelledby="trabajos"
            tabIndex={0}
            // relative: contiene a los textos para lector de pantalla (absolute) de las piezas fuera de vista;
            // sin esto se escapan del recorte y la página entera se desliza de lado en el celular.
            className="relative -mx-5 mt-3 snap-x snap-mandatory scroll-px-5 overflow-x-auto overscroll-x-contain px-5 pb-2 [scrollbar-width:none] @min-[40rem]:-mx-8 @min-[40rem]:scroll-px-8 @min-[40rem]:px-8 @min-[64rem]:mx-0 @min-[64rem]:overflow-visible @min-[64rem]:px-0 [&::-webkit-scrollbar]:hidden"
          >
            <ul className="flex gap-3 @min-[64rem]:grid @min-[64rem]:grid-cols-3 @min-[64rem]:gap-5">
              {pieces.map((piece, index) => (
                <li
                  key={piece.id}
                  className="w-[calc((100cqw_-_4.5rem)/3)] shrink-0 snap-start @min-[40rem]:w-44 @min-[64rem]:w-auto"
                >
                  <PieceCard piece={piece} eager={index < 3} />
                </li>
              ))}
            </ul>
          </div>
        </section>

        {links.length > 0 && (
          <section aria-labelledby="contacto" className="mt-12 @min-[40rem]:mt-16">
            <SectionHeading id="contacto" className="font-serif text-4xl @min-[40rem]:text-5xl">
              hablemos.
            </SectionHeading>
            <ul className="mt-5 flex flex-wrap gap-2">
              {links.map((link, index) => (
                <li key={link.kind}>
                  <a
                    href={link.href}
                    {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className={index === 0 ? primaryButton : pillButton}
                  >
                    {link.label}
                    {link.external && <span className="sr-only"> (se abre en otra pestaña)</span>}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="mt-16 font-mono text-xs text-muted">hecho con supercreador</footer>
      </Root>
    </div>
  );
}

function ProfilePhoto({ photo, name, preload }: { photo: StoredImage | null; name: string; preload: boolean }) {
  if (!photo) {
    return (
      <span
        aria-hidden="true"
        className="flex size-18 shrink-0 items-center justify-center rounded-full bg-panel font-serif text-3xl text-accent-soft ring-2 ring-accent @min-[40rem]:size-24"
      >
        {name.trim().charAt(0).toLocaleUpperCase("es")}
      </span>
    );
  }
  return (
    <Image
      src={photo.url}
      alt={`Foto de ${name}`}
      width={96}
      height={96}
      sizes="96px"
      preload={preload}
      className="size-18 shrink-0 rounded-full object-cover ring-2 ring-accent @min-[40rem]:size-24"
    />
  );
}

function PieceCard({ piece, eager }: { piece: ResolvedPiece; eager: boolean }) {
  const content = (
    <>
      <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-panel ring-1 ring-line">
        {piece.image ? (
          <Image
            src={piece.image.url}
            alt=""
            fill
            sizes="(min-width: 1024px) 240px, (min-width: 640px) 176px, 34vw"
            loading={eager ? "eager" : "lazy"}
            className="object-cover"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center p-2 text-center text-xs text-muted">
            {piece.link ? `Video de ${PLATFORM_LABEL[piece.link.platform]}` : ""}
          </span>
        )}
        {piece.video && <PlayBadge />}
      </div>
      <p className="mt-2 line-clamp-2 text-[0.8125rem] leading-snug break-words @min-[40rem]:text-sm">{piece.title}</p>
      {piece.link && (
        <p className="mt-1 text-[0.6875rem] text-accent-soft @min-[40rem]:text-xs">Ver en {PLATFORM_LABEL[piece.link.platform]}</p>
      )}
    </>
  );

  if (!piece.link) return <div>{content}</div>;
  return (
    <a href={piece.link.url} target="_blank" rel="noopener noreferrer" className="block rounded-xl">
      {content}
      <span className="sr-only"> (se abre en otra pestaña)</span>
    </a>
  );
}

/** Marca de video sobre la miniatura. */
function PlayBadge() {
  return (
    <span
      aria-hidden="true"
      className="absolute right-1.5 bottom-1.5 flex size-6 items-center justify-center rounded-full bg-accent text-ink"
    >
      <svg viewBox="0 0 12 12" className="ml-px size-2.5" fill="currentColor">
        <path d="M3 1.5v9l7.5-4.5z" />
      </svg>
    </span>
  );
}
