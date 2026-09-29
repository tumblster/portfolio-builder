import type { ManualPrefill } from "@/lib/import/events";
import { LEGACY_NICHES, type NicheDef } from "@/lib/portfolio/niches";
import type { PieceLink, ResolvedPortfolio } from "@/lib/portfolio/resolve";
import {
  LIMITS,
  contactSchema,
  createPortfolioInputSchema,
  parseVideoLink,
  updatePortfolioInputSchema,
  type ManualData,
  type Service,
  type StoredImage,
} from "@/lib/portfolio/schema";
import { NO_METRICS, type PieceMetrics, type ProfileStat } from "@/lib/portfolio/stats";

/*
 * Modelo del formulario (crear y editar). Funciones puras: sin React ni red.
 *
 * Al editar, solo lo que la persona cambió de verdad se guarda como dato manual.
 * Lo que no tocó sigue heredando de la IA o de Instagram (regla manual → IA → Instagram),
 * así que abrir y guardar sin cambios no "congela" nada.
 *
 * v2: los nichos son propios de cada portafolio (los de la IA, o Belleza/Lifestyle/Viajes en
 * los creados a mano y en los de la v1). En M1 no se editan: el formulario los usa para el
 * selector de cada pieza y los conserva tal cual al guardar. Los servicios sí se editan.
 */

export const CONTACT_KEYS = ["email", "whatsapp", "instagram", "tiktok", "youtube", "website"] as const;
export type ContactKey = (typeof CONTACT_KEYS)[number];
export type ContactDraft = Record<ContactKey, string>;

export type PieceDraft = {
  /** Clave estable para React y para los ids de los campos. */
  key: string;
  /** Solo en piezas ya guardadas. */
  id?: string;
  title: string;
  /** Slug de uno de los nichos del portafolio; null = solo en "Todo". */
  niche: string | null;
  image: StoredImage | null;
  /** "upload" nunca se reemplaza sola; "auto" y "saved" sí, si cambia el link del video. */
  imageSource: "upload" | "auto" | "saved" | null;
  videoUrl: string;
  /** Piezas importadas de Instagram (fotos): link a su post, para la vista previa. */
  postLink: PieceLink | null;
};

export type ServiceDraft = { key: string; title: string; description: string };

export type FormState = {
  name: string;
  bio: string;
  valueProp: string;
  photo: StoredImage | null;
  contact: ContactDraft;
  /** Nichos disponibles para las piezas (no se editan en M1). */
  niches: NicheDef[];
  services: ServiceDraft[];
  pieces: PieceDraft[];
};

/**
 * Lo que la vista previa muestra pero el formulario no edita: las cifras de Instagram
 * (del perfil y de cada pieza importada, por id de pieza).
 */
export type PreviewExtras = { stats: ProfileStat[]; metrics: Record<string, PieceMetrics> };
export const NO_EXTRAS: PreviewExtras = { stats: [], metrics: {} };

/** Lo que estaba guardado al abrir (o al último guardado): para saber qué cambió. */
export type Baseline = { slug: string; revision: number; form: FormState; manual: ManualData; extras: PreviewExtras };

/** Errores por campo: "name", "contact.email", "pieces.2.title", "pieces"… */
export type FieldErrors = Record<string, string>;

let sequence = 0;
/** Solo se llama en el navegador (piezas nuevas). No usa crypto.randomUUID: no existe en http por la red local. */
export const newPieceKey = () => `nueva-${(sequence += 1)}-${Math.random().toString(36).slice(2, 8)}`;

const emptyContact = (): ContactDraft => ({ email: "", whatsapp: "", instagram: "", tiktok: "", youtube: "", website: "" });

export function emptyPiece(key: string = newPieceKey()): PieceDraft {
  return { key, title: "", niche: null, image: null, imageSource: null, videoUrl: "", postLink: null };
}

export function serviceDraft(service: Partial<Service> = {}, key: string = newPieceKey()): ServiceDraft {
  return { key, title: service.title ?? "", description: service.description ?? "" };
}

export function emptyForm(): FormState {
  return {
    name: "",
    bio: "",
    valueProp: "",
    photo: null,
    contact: emptyContact(),
    niches: LEGACY_NICHES.map((niche) => ({ ...niche })),
    services: [],
    pieces: Array.from({ length: LIMITS.minPieces }, () => emptyPiece()),
  };
}

/** Datos que dejó la importación (perfil privado o con pocas publicaciones). */
export function formFromPrefill(prefill: ManualPrefill): FormState {
  const pieces: PieceDraft[] = prefill.pieces.map((piece) => ({
    ...emptyPiece(),
    title: piece.title,
    image: piece.image,
    imageSource: "saved",
    videoUrl: piece.videoUrl ?? "",
  }));
  while (pieces.length < LIMITS.minPieces) pieces.push(emptyPiece());
  return {
    name: prefill.name,
    bio: prefill.bio,
    valueProp: "",
    photo: prefill.photo,
    contact: { ...emptyContact(), instagram: prefill.contact.instagram, website: prefill.contact.website ?? "" },
    niches: LEGACY_NICHES.map((niche) => ({ ...niche })),
    services: [],
    pieces,
  };
}

/** Un portafolio guardado, tal como se muestra (ya resuelto). Determinista: sirve en el servidor. */
export function formFromPortfolio(resolved: ResolvedPortfolio): FormState {
  return {
    name: resolved.name,
    bio: resolved.bio,
    valueProp: resolved.valueProp,
    photo: resolved.photo,
    contact: { ...emptyContact(), ...resolved.contact },
    niches: resolved.niches.map((niche) => ({ ...niche })),
    // Claves deterministas (servidor y navegador iguales): el índice basta para los guardados.
    services: resolved.services.map((service, index) => serviceDraft(service, `servicio-${index}`)),
    pieces: resolved.pieces.map((piece) => ({
      key: piece.id,
      id: piece.id,
      title: piece.title,
      niche: piece.niche,
      image: piece.image,
      imageSource: piece.image ? "saved" : null,
      videoUrl: piece.video?.url ?? "",
      postLink: !piece.video && piece.link ? piece.link : null,
    })),
  };
}

/** Cifras de Instagram del portafolio guardado, para la vista previa. */
export function extrasFromPortfolio(resolved: ResolvedPortfolio): PreviewExtras {
  return {
    stats: resolved.stats,
    metrics: Object.fromEntries(resolved.pieces.map((piece) => [piece.id, piece.metrics])),
  };
}

const pieceInput = (piece: PieceDraft) => ({
  ...(piece.id ? { id: piece.id } : {}),
  title: piece.title,
  niche: piece.niche,
  image: piece.image,
  videoUrl: piece.videoUrl.trim() || null,
});

const serviceInput = (service: ServiceDraft): Service => ({ title: service.title, description: service.description });

export function toCreatePayload(form: FormState) {
  return {
    name: form.name,
    bio: form.bio,
    photo: form.photo,
    valueProp: form.valueProp,
    contact: form.contact,
    services: form.services.map(serviceInput),
    pieces: form.pieces.map(pieceInput),
  };
}

const sameImage = (a: StoredImage | null, b: StoredImage | null) => (a?.url ?? null) === (b?.url ?? null);

const servicesKey = (services: ServiceDraft[]) =>
  JSON.stringify(services.map((service) => [service.title.trim(), service.description.trim()]));

export function toUpdatePayload(form: FormState, baseline: Baseline) {
  const text = (key: "name" | "bio" | "valueProp") =>
    form[key].trim() !== baseline.form[key].trim() ? form[key] : baseline.manual[key];

  const contact: Partial<ContactDraft> = {};
  for (const key of CONTACT_KEYS) {
    const value =
      form.contact[key].trim() !== baseline.form.contact[key].trim() ? form.contact[key] : baseline.manual.contact?.[key];
    if (value !== undefined) contact[key] = value;
  }

  const services =
    servicesKey(form.services) !== servicesKey(baseline.form.services)
      ? form.services.map(serviceInput)
      : baseline.manual.services;

  const manual: ManualData = {
    name: text("name"),
    bio: text("bio"),
    valueProp: text("valueProp"),
    photo: sameImage(form.photo, baseline.form.photo) ? baseline.manual.photo : form.photo,
    ...(Object.keys(contact).length > 0 ? { contact } : {}),
    // Los nichos no se editan en M1: se conservan tal como estaban guardados.
    ...(baseline.manual.niches !== undefined ? { niches: baseline.manual.niches } : {}),
    ...(services !== undefined ? { services } : {}),
  };
  return { revision: baseline.revision, manual, pieces: form.pieces.map(pieceInput) };
}

type Issue = { path: string; message: string };

/** Errores del servidor o de zod → por campo (el primero de cada campo). */
export function issuesToErrors(issues: Issue[] | undefined): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues ?? []) {
    const key = issue.path.replace(/^manual\./, "");
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return errors;
}

/**
 * La misma validación que hace el servidor, antes de enviar. Además marca de una vez
 * las piezas sin imagen ni video: zod solo revisa eso cuando el resto de la pieza ya
 * está bien, y así la persona no corrige en dos rondas.
 */
export function validateForm(form: FormState, baseline: Baseline | null): FieldErrors {
  const result = baseline
    ? updatePortfolioInputSchema.safeParse(toUpdatePayload(form, baseline))
    : createPortfolioInputSchema.safeParse(toCreatePayload(form));
  const errors = result.success
    ? {}
    : issuesToErrors(result.error.issues.map((issue) => ({ path: issue.path.map(String).join("."), message: issue.message })));
  form.pieces.forEach((piece, index) => {
    const key = `pieces.${index}.image`;
    if (!piece.image && !piece.videoUrl.trim() && !errors[key]) errors[key] = "Agrega una imagen o un link de video.";
  });
  return errors;
}

/** Lo que muestra la vista previa: la misma forma que la página pública. */
export function toPreview(form: FormState, extras: PreviewExtras = NO_EXTRAS): ResolvedPortfolio {
  const contact: ResolvedPortfolio["contact"] = {};
  for (const key of CONTACT_KEYS) {
    const parsed = contactSchema.shape[key].safeParse(form.contact[key]);
    if (parsed.success && parsed.data) contact[key] = parsed.data;
  }
  return {
    slug: "vista-previa",
    name: form.name.trim() || "Nombre de tu clienta",
    bio: form.bio.trim(),
    photo: form.photo,
    valueProp: form.valueProp.trim(),
    contact,
    niches: form.niches,
    services: form.services
      .filter((service) => service.title.trim())
      .map((service) => ({ title: service.title.trim(), description: service.description.trim() })),
    stats: extras.stats,
    pieces: form.pieces.map((piece, index) => {
      const video = piece.videoUrl.trim() ? parseVideoLink(piece.videoUrl) : null;
      return {
        id: piece.key,
        origin: "manual",
        title: piece.title.trim() || `Pieza ${index + 1}`,
        niche: piece.niche,
        image: piece.image,
        video,
        link: video ?? piece.postLink,
        metrics: extras.metrics[piece.key] ?? NO_METRICS,
      };
    }),
  };
}
