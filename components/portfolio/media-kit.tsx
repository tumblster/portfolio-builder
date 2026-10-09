import Image from "next/image";
import { brandInitial, brandProfileUrl } from "@/lib/portfolio/brands";
import { caseMetricLabels, type ResolvedCaseStudy } from "@/lib/portfolio/case-studies";
import type { ResolvedPiece, ResolvedPortfolio } from "@/lib/portfolio/resolve";
import { NO_METRICS } from "@/lib/portfolio/stats";
import { Avatar, HireLink, PieceLink, portfolioView } from "./template-kit";
import "./media-kit.css";

/*
 * Vista MEDIA KIT del portafolio público (ronda 30/09 · 7.3; ronda 6 · 13.18 Media Kit v1).
 * Orden: cabecera (avatar, nombre, nichos) → Métricas + Engagement Rate (cada una con su base) → Brand Partners
 * (13.19: solo las marcas que la creadora confirmó) → Case studies (13.20: publicaciones reales con marca, campaña y
 * cifras) → "Trabaja conmigo" (13.8 / 13.9: WhatsApp con el mensaje según su género). El compartir es flotante,
 * al lado del badge "Hecho con Supercreador" (E2 del dueño).
 *
 * El Media kit NO repite el grid de contenido (13.18): no hay "piezas destacadas"; los case studies son tarjetas con
 * contexto, no una galería. Sin demografía de audiencia (edad, género, países): necesita OAuth de Instagram y el App
 * Review de Meta, queda para otra fase. Mismo diseño en las 4 plantillas, con su paleta (--pf-*). Componente de
 * servidor (solo el botón de compartir y el overlay de video llegan al navegador).
 */

/** Un case study como pieza, para abrirlo en el overlay igual que el contenido (13.2 / 13.3). */
function casePiece(item: ResolvedCaseStudy): ResolvedPiece {
  return {
    id: `caso-${item.postId}`,
    origin: "instagram",
    title: item.campaign || item.brand,
    niche: null,
    image: item.image,
    video: item.kind === "video" ? item.link : null,
    sourcePostId: item.postId,
    link: item.link,
    metrics: NO_METRICS,
    kind: item.kind,
  };
}

export function MediaKit({ portfolio }: { portfolio: ResolvedPortfolio }) {
  const view = portfolioView(portfolio, "page");
  const { handle } = view;
  const partners = portfolio.brandPartners ?? [];
  const cases = portfolio.caseStudies ?? [];
  // "Trabaja conmigo": WhatsApp (o su correo). Un ancla a la sección de contacto no sirve aquí: vive en Contenido.
  const canHire = view.hire !== null && !view.hire.href.startsWith("#");

  return (
    <div className="mk" data-media-kit>
      <header className="mk-head">
        <Avatar photo={portfolio.photo} name={portfolio.name} size={96} className="mk-avatar" />
        <h1 className="mk-name">{portfolio.name}</h1>
        {portfolio.tagline && <p className="mk-tagline">{portfolio.tagline}</p>}
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

      {partners.length > 0 && (
        <section aria-labelledby="mk-marcas" className="mk-section">
          <h2 id="mk-marcas" className="mk-h2">
            Brand Partners
          </h2>
          <ul className="mk-brands" data-mk-brands>
            {partners.map((partner) => (
              <li key={partner.instagram}>
                <a
                  className="mk-brand"
                  href={brandProfileUrl(partner.instagram)}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-mk-brand={partner.instagram}
                >
                  <span className="mk-brand__logo" aria-hidden="true">
                    {partner.logo ? (
                      <Image src={partner.logo.url} alt="" width={64} height={64} sizes="64px" className="mk-brand__img" />
                    ) : (
                      brandInitial(partner.name)
                    )}
                  </span>
                  <span className="mk-brand__name">{partner.name}</span>
                  <span className="sr-only"> en Instagram (se abre en otra pestaña)</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {cases.length > 0 && (
        <section aria-labelledby="mk-casos" className="mk-section">
          <h2 id="mk-casos" className="mk-h2">
            Case studies
          </h2>
          <ul className="mk-cases" data-mk-cases>
            {cases.map((item) => {
              const labels = caseMetricLabels(item.metrics);
              return (
                <li key={item.postId} className="mk-case" data-mk-case={item.postId}>
                  <PieceLink piece={casePiece(item)} className="mk-case__media-link">
                    <span className="mk-case__media" data-reel-media>
                      {item.image && (
                        <Image
                          src={item.image.url}
                          alt=""
                          fill
                          sizes="(min-width: 640px) 160px, 112px"
                          className="mk-case__img"
                        />
                      )}
                    </span>
                    <span className="sr-only">Ver {item.campaign || `el trabajo con ${item.brand}`}</span>
                  </PieceLink>
                  <div className="mk-case__body">
                    <h3 className="mk-case__brand">{item.brand}</h3>
                    {item.campaign && <p className="mk-case__campaign">{item.campaign}</p>}
                    {labels.length > 0 && (
                      <ul className="mk-case__metrics" aria-label="Resultados" data-mk-case-metrics>
                        {labels.map((label) => (
                          <li key={label}>{label}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {canHire && (
        <p className="mk-cta-wrap" data-mk-hire>
          <HireLink view={view} className="mk-cta" />
        </p>
      )}

    </div>
  );
}
