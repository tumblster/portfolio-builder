import { CASE_METRIC_KEYS, type CaseMetricKey, type CaseStudyMetrics, type ResolvedCaseStudy } from "./case-studies";
import type { BrandPartner, CaseStudy, StoredImage } from "./schema";

/*
 * Borradores del Media kit (ronda 6 · 13.19 / 13.20): cómo se editan los Brand partners y los case studies en el
 * studio, y cómo se convierten a lo que guarda el servidor. Funciones puras, sin React ni "use client": las usan el
 * servidor (formFromPortfolio en la página del editor), el formulario y la revisión antes de generar.
 */

/** Los mismos topes que el servidor (LIMITS en schema.ts), sin cargar zod en la pantalla de revisión. */
export const BRAND_NAME_MAX = 60;
export const BRAND_PARTNERS_MAX = 12;
export const CAMPAIGN_MAX = 80;
export const CASE_STUDIES_MAX = 6;

export type BrandPartnerDraft = {
  key: string;
  name: string;
  /** Usuario de Instagram de la marca, sin @ y en minúsculas. */
  instagram: string;
  logo: StoredImage | null;
  source: BrandPartner["source"];
  /** Búsqueda del logo en su Instagram: en curso, o terminó sin encontrarlo. */
  lookup?: "loading" | "none";
};

export function partnerDraftsFrom(partners: readonly BrandPartner[], prefix = "marca"): BrandPartnerDraft[] {
  return partners.map((partner, index) => ({
    key: `${prefix}-${index}`,
    name: partner.name,
    instagram: partner.instagram,
    logo: partner.logo,
    source: partner.source,
  }));
}

/** Lo que se guarda. Sin nombre, se usa su usuario (nunca queda una tarjeta vacía). */
export function partnersPayload(drafts: readonly BrandPartnerDraft[]): BrandPartner[] {
  return drafts.map((draft) => ({
    name: draft.name.trim() || draft.instagram,
    instagram: draft.instagram,
    logo: draft.logo,
    source: draft.source,
  }));
}

export type CaseStudyDraft = {
  postId: string;
  brand: string;
  campaign: string;
  /** Miniatura propia; null = la de la publicación. */
  image: StoredImage | null;
  /** Como texto (son campos del formulario). "" = no mostrar esa cifra. */
  metrics: Record<CaseMetricKey, string>;
};

const toText = (value: number | null) => (value === null ? "" : String(value));

export function metricsText(metrics: CaseStudyMetrics): Record<CaseMetricKey, string> {
  return { views: toText(metrics.views), likes: toText(metrics.likes), comments: toText(metrics.comments) };
}

/** "12.400" o "12400" → 12400; vacío → null. */
export function metricNumber(text: string): number | null {
  const digits = text.replace(/\D/g, "");
  return digits ? Number(digits) : null;
}

export function caseDraftsFrom(cases: readonly ResolvedCaseStudy[]): CaseStudyDraft[] {
  return cases.map((item) => ({
    postId: item.postId,
    brand: item.brand,
    campaign: item.campaign,
    image: item.customImage,
    metrics: metricsText(item.metrics),
  }));
}

export function caseStudiesPayload(drafts: readonly CaseStudyDraft[]): CaseStudy[] {
  return drafts.map((draft) => ({
    postId: draft.postId,
    brand: draft.brand,
    campaign: draft.campaign,
    image: draft.image,
    metrics: Object.fromEntries(CASE_METRIC_KEYS.map((key) => [key, metricNumber(draft.metrics[key])])) as CaseStudyMetrics,
  }));
}
