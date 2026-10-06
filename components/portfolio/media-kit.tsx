import Image from "next/image";
import type { ResolvedPortfolio } from "@/lib/portfolio/resolve";
import { Avatar, ContactPill, PieceLink, pieceMeta, portfolioView } from "./template-kit";
import "./media-kit.css";

/*
 * Vista MEDIA KIT del portafolio público (ronda 30/09 · 7.3; benchmark: el media kit de Beacons).
 * Cabecera (avatar, nombre, tag de nicho) → las 3 métricas (Seguidores, Interacciones promedio, ER, cada una con su
 * base) → plataformas → piezas destacadas → párrafo "Sobre mí" → "Trabaja conmigo". El ER vive aquí, no en
 * "Sobre mí". Mismo diseño para las 4 plantillas, con los colores de su paleta (--pf-*). Componente de servidor.
 * Fuera de alcance (a propósito): demografía de audiencia, tarifas y conexión con Meta.
 */

const FEATURED = 6;
const SOCIAL = new Set(["instagram", "tiktok", "youtube"]);

export function MediaKit({ portfolio }: { portfolio: ResolvedPortfolio }) {
  const view = portfolioView(portfolio, "page");
  const { links, email, handle } = view;
  const about = portfolio.valueProp || portfolio.bio;
  const followers = portfolio.metrics.find((metric) => metric.kind === "followers");
  const platforms = links.filter((link) => SOCIAL.has(link.kind));
  const contact = email ?? links[0] ?? null;
  const featured = portfolio.pieces.slice(0, FEATURED);

  return (
    <div className="mk" data-media-kit>
      <header className="mk-head">
        <Avatar photo={portfolio.photo} name={portfolio.name} size={96} className="mk-avatar" />
        <h1 className="mk-name">{portfolio.name}</h1>
        {portfolio.niches.length > 0 && (
          <ul className="mk-tags" aria-label="Nichos">
            {portfolio.niches.map((niche) => (
              <li key={niche.slug}>{niche.label}</li>
            ))}
          </ul>
        )}
        {handle && <p className="mk-handle">{handle}</p>}
      </header>

      {portfolio.metrics.length > 0 && (
        <section aria-labelledby="mk-metricas" className="mk-section">
          <h2 id="mk-metricas" className="mk-h2">
            Métricas
          </h2>
          <dl className="mk-metrics" data-mk-metrics>
            {portfolio.metrics.map((metric) => (
              <div key={metric.kind} className="mk-metric" data-metric={metric.kind}>
                <dt>{metric.label}</dt>
                <dd className="mk-metric__value">{metric.display}</dd>
                {metric.basis && <dd className="mk-metric__basis">{metric.basis}</dd>}
              </div>
            ))}
          </dl>
        </section>
      )}

      {platforms.length > 0 && (
        <section aria-labelledby="mk-plataformas" className="mk-section">
          <h2 id="mk-plataformas" className="mk-h2">
            Plataformas
          </h2>
          <ul className="mk-platforms">
            {platforms.map((link) => (
              <li key={link.kind}>
                <ContactPill link={link} className="mk-platform" />
                {link.kind === "instagram" && followers && (
                  <span className="mk-platform__meta">{followers.display} seguidores</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {featured.length > 0 && (
        <section aria-labelledby="mk-piezas" className="mk-section">
          <h2 id="mk-piezas" className="mk-h2">
            Piezas destacadas
          </h2>
          <ul className="mk-pieces">
            {featured.map((piece) => {
              const { platform } = pieceMeta(piece);
              return (
                <li key={piece.id}>
                  <PieceLink piece={piece} className="mk-piece">
                    <span className="mk-piece__media" data-reel-media>
                      {piece.image && (
                        <Image
                          src={piece.image.url}
                          alt=""
                          fill
                          sizes="(min-width: 640px) 220px, 45vw"
                          className="mk-piece__img"
                        />
                      )}
                    </span>
                    <span className="mk-piece__title">{piece.title}</span>
                    {platform && <span className="mk-piece__meta">{platform}</span>}
                  </PieceLink>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {about && (
        <section aria-labelledby="mk-sobre" className="mk-section">
          <h2 id="mk-sobre" className="mk-h2">
            Sobre mí
          </h2>
          <p className="mk-about">{about}</p>
        </section>
      )}

      {contact && (
        <p className="mk-cta-wrap">
          <a
            className="mk-cta"
            href={contact.href}
            {...(contact.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            data-mk-contact
          >
            Trabaja conmigo
            {contact.external && <span className="sr-only"> (se abre en otra pestaña)</span>}
          </a>
        </p>
      )}
    </div>
  );
}
