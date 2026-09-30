import { memo, useState, type CSSProperties } from "react";
import type { Palette } from "@/lib/palette/palettes";
import type { TemplateId } from "@/lib/portfolio/design";
import "./template-preview.css";

/*
 * Vista previa grande de una plantilla (v2 · M4-rev r2, C1 + C4). Se usa al importar, en los pasos Plantilla y
 * Paleta. Es la parte de arriba del portafolio en un celular, dibujada con HTML: la estructura de cada plantilla,
 * los datos reales de la creadora (nombre, nichos, Engagement Rate como métrica principal), miniaturas de video
 * 16:9 con play y los textos largos como skeleton (barras con brillo).
 *
 * La paleta se aplica con los MISMOS roles que usan las plantillas reales (app/portfolio*.css), así lo que se ve
 * es lo que sale: fondo, tinta del texto y de los botones (el acento nunca lleva texto: regla 7:1), bloques
 * claro/oscuro/de servicios y el acento en badges y decoraciones (estrella, puntos, degradado de la portada).
 * Decisión 29/09: los botones mantienen la tinta; el acento se luce en badges y decoraciones.
 */

export type PreviewData = {
  name: string;
  handle: string;
  /** Nichos confirmados (nombres), en orden. */
  niches: string[];
  /** Engagement Rate ya formateado ("6,2 %"), o null si no hay. */
  er: string | null;
};

function previewStyle(p: Palette): CSSProperties {
  return {
    "--pv-bg": p.bg,
    "--pv-ink": p.ink,
    "--pv-muted": p.muted,
    "--pv-soft": p.soft,
    "--pv-display": p.display,
    "--pv-deep": p.deep,
    "--pv-deep-card": p.deepCard,
    "--pv-deep-muted": p.deepMuted,
    "--pv-band": p.band,
    "--pv-band-muted": p.bandMuted,
    "--pv-accent": p.accent,
    "--pv-accent-soft": p.accentSoft,
  } as CSSProperties;
}

/** Línea de texto de relleno (skeleton con brillo). */
function Line({ width, tone }: { width: string; tone?: "light" }) {
  return <span className="tpv-sk" data-tone={tone} style={{ width }} />;
}

function Video({ tone }: { tone?: "deep" }) {
  return (
    <span className="tpv-video" data-tone={tone}>
      <span className="tpv-play">
        <svg viewBox="0 0 10 10" focusable="false">
          <path d="M3.4 2.3v5.4L8 5z" />
        </svg>
      </span>
    </span>
  );
}

function Avatar({ name, size }: { name: string; size: "sm" | "md" | "lg" }) {
  return (
    <span className="tpv-av" data-size={size}>
      {name.trim().charAt(0).toUpperCase() || "·"}
    </span>
  );
}

function Pills({ niches }: { niches: string[] }) {
  return (
    <span className="tpv-pills">
      <span className="tpv-pill" data-on="">
        Todo
      </span>
      {niches.map((niche) => (
        <span key={niche} className="tpv-pill">
          {niche}
        </span>
      ))}
    </span>
  );
}

function Er({ value, tone }: { value: string; tone?: "light" }) {
  return (
    <span className="tpv-er" data-tone={tone}>
      <span className="tpv-er__value">{value}</span>
      <span className="tpv-er__label">
        <i className="tpv-dot" />
        Engagement Rate
      </span>
    </span>
  );
}

function Body({ template, data }: { template: TemplateId; data: PreviewData }) {
  const { name, handle, niches, er } = data;
  const firstName = name.split(/\s+/)[0] || name;
  const kicker = ["Creadora UGC", ...niches].join(" · ");
  switch (template) {
    case "creator":
      return (
        <div className="tpv-page">
          <div className="tpv-nav">
            <Avatar name={name} size="sm" />
            <span className="tpv-nav__name">{firstName}</span>
            <Pills niches={niches} />
            <span className="tpv-nav__cta">Hablemos</span>
          </div>
          <div className="tpv-cover">
            <span className="tpv-glass">
              <Avatar name={name} size="sm" />
              <span className="tpv-glass__who">
                <b>{name}</b>
                <small>{handle}</small>
              </span>
              <span className="tpv-live">Disponible</span>
            </span>
          </div>
          <p className="tpv-eyebrow">
            <span className="tpv-star">★</span>
            {kicker}
          </p>
          <p className="tpv-h1">Hola, soy {name}.</p>
          <Line width="94%" />
          <Line width="68%" />
          <span className="tpv-actions">
            <span className="tpv-btn" data-kind="solid">
              Trabajemos juntos
            </span>
            <span className="tpv-btn" data-kind="ghost">
              Ver mi trabajo
            </span>
          </span>
          {er && <Er value={er} />}
          <div className="tpv-block" data-tone="deep">
            <span className="tpv-block__title">Trabajo seleccionado</span>
            <span className="tpv-grid2">
              <Video tone="deep" />
              <Video tone="deep" />
            </span>
            <Line width="60%" tone="light" />
          </div>
          <div className="tpv-block" data-tone="band">
            <span className="tpv-block__title">Formas de colaborar</span>
            <Line width="80%" tone="light" />
          </div>
        </div>
      );
    case "bio":
      return (
        <div className="tpv-page" data-center="">
          <div className="tpv-mesh" />
          <span className="tpv-bio-avatar">
            <Avatar name={name} size="lg" />
          </span>
          <p className="tpv-h1" data-size="md">
            {name}
          </p>
          <p className="tpv-handle">{handle}</p>
          {er && (
            <span className="tpv-chip">
              <i className="tpv-dot" />
              <b>{er}</b> ER
            </span>
          )}
          <span className="tpv-links">
            <span className="tpv-link" data-kind="solid">
              Trabajemos juntos
            </span>
            <span className="tpv-link">
              <Line width="46%" />
            </span>
          </span>
          {[0, 1].map((row) => (
            <span key={row} className="tpv-row">
              <Video />
              <span className="tpv-row__text">
                <Line width="90%" />
                <Line width="55%" />
              </span>
            </span>
          ))}
          <span className="tpv-bar">
            <Pills niches={niches} />
          </span>
        </div>
      );
    case "minimal":
      return (
        <div className="tpv-page">
          <Avatar name={name} size="md" />
          <p className="tpv-h1" data-size="lg">
            {name}
          </p>
          <Line width="96%" />
          <Line width="88%" />
          <Line width="52%" />
          <span className="tpv-live" data-plain="">
            Disponible para colaborar
          </span>
          <span className="tpv-actions">
            <span className="tpv-btn" data-kind="solid">
              Escríbeme
            </span>
          </span>
          {er && (
            <span className="tpv-rule">
              <Er value={er} />
            </span>
          )}
          <Pills niches={niches} />
          <span className="tpv-grid2" data-gap="tight">
            <Video />
            <Video />
            <Video />
            <Video />
          </span>
        </div>
      );
    case "editorial":
      return (
        <div className="tpv-page" data-tone="deep">
          <span className="tpv-ed-top">
            <b>{firstName}</b>
            <span className="tpv-ed-cta">Hablemos</span>
          </span>
          <p className="tpv-ed-kicker">
            <i className="tpv-dot" />
            {kicker}
          </p>
          <p className="tpv-ed-display">{name}</p>
          <Line width="86%" tone="light" />
          <Line width="60%" tone="light" />
          {er && <Er value={er} tone="light" />}
          {["01", "02", "03"].map((number) => (
            <span key={number} className="tpv-ed-row">
              <span className="tpv-ed-num">{number}</span>
              <span className="tpv-row__text">
                <Line width="92%" tone="light" />
                <Line width="48%" tone="light" />
              </span>
              <Video tone="deep" />
            </span>
          ))}
        </div>
      );
  }
}

/** Una plantilla con una paleta, sin transición. Memoizada: solo se vuelve a dibujar si cambia algo. */
export const TemplatePreview = memo(function TemplatePreview({
  template,
  palette,
  data,
}: {
  template: TemplateId;
  palette: Palette;
  data: PreviewData;
}) {
  return (
    <div className="tpv" data-template={template} style={previewStyle(palette)} aria-hidden="true">
      <Body template={template} data={data} />
    </div>
  );
});

/**
 * El marco de la vista previa. Al cambiar de plantilla hace un fundido cruzado (~300 ms, con un leve
 * desplazamiento y escala): la anterior sale encima mientras la nueva entra. Cambiar de paleta solo recolorea.
 */
export function TemplatePreviewStage({
  template,
  palette,
  data,
  caption,
}: {
  template: TemplateId;
  palette: Palette;
  data: PreviewData;
  caption: string;
}) {
  const [shown, setShown] = useState(template);
  const [leaving, setLeaving] = useState<TemplateId | null>(null);
  if (template !== shown) {
    // Ajuste de estado al cambiar la prop (patrón de React, sin efectos): la de antes pasa a "saliendo".
    setLeaving(shown);
    setShown(template);
  }
  return (
    <figure className="tpv-stage" data-template-preview>
      <div className="tpv-frame">
        <div key={shown} className="tpv-layer" data-enter={leaving ? "" : undefined}>
          <TemplatePreview template={shown} palette={palette} data={data} />
        </div>
        {leaving && (
          <div key={`${leaving}-out`} className="tpv-layer" data-leave="" onAnimationEnd={() => setLeaving(null)}>
            <TemplatePreview template={leaving} palette={palette} data={data} />
          </div>
        )}
      </div>
      <figcaption className="mt-3 text-center text-sm text-muted">{caption}</figcaption>
    </figure>
  );
}
