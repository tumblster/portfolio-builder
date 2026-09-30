import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ConflictError, InvalidInputError, NotFoundError } from "@/lib/errors";
import { computeEngagementRate } from "@/lib/portfolio/engagement";
import { nicheFromLabel, type NicheDef } from "@/lib/portfolio/niches";
import { createPortfolio, getPortfolio } from "@/lib/portfolio/repository";
import { slugCandidates, slugify } from "@/lib/portfolio/slug";
import {
  generatedContentSchema,
  instagramSnapshotSchema,
  pieceSchema,
  type ConfirmImportInput,
  type GeneratedContent,
  type InstagramSnapshot,
  type Piece,
  type Portfolio,
} from "@/lib/portfolio/schema";
import { getStorage } from "@/lib/storage";
import type { DraftPreview } from "./events";

/*
 * Borrador de importación (v2 · M2). Importar ya no crea el portafolio a ciegas:
 *   1. /api/import scrapea, copia las imágenes y le pide a la IA textos y nichos → guarda un borrador;
 *   2. el creador confirma los nichos y elige plantilla y paleta;
 *   3. /api/import/confirm genera el portafolio con esas decisiones.
 * El borrador vive en el servidor (drafts/<id>.json): las cifras de Instagram nunca pasan por el
 * navegador, así que nadie las puede retocar. Confirmar dos veces (doble toque, reintento) devuelve
 * el mismo portafolio. Un borrador vale 24 h.
 *
 * El candado (claim): al confirmar se marca { at, slug: null } ANTES de crear el portafolio, para que dos
 * confirmaciones a la vez no generen dos. Si la ejecución muere en medio (timeout, pestaña cerrada, error al
 * guardar el slug), el candado queda puesto. Por eso se cura solo: un candado sin slug con más de
 * CLAIM_STALE_MS ya no tiene a nadie detrás (la función tiene maxDuration 60 s, ver la ruta), así que se
 * revisa si el portafolio llegó a crearse (se devuelve) y, si no, se vuelve a reclamar y se genera normal.
 */

const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
/** Un candado sin slug más viejo que esto es de una ejecución que murió: se libera. */
export const CLAIM_STALE_MS = 5 * 60 * 1000;
const draftPath = (id: string) => `drafts/${id}.json`;

const storedDraftSchema = z.object({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
  username: z.string().min(1),
  snapshot: instagramSnapshotSchema,
  generated: generatedContentSchema.nullable(),
  pieces: z.array(pieceSchema).min(1),
  warnings: z.array(z.string()),
  /** Se marca al confirmar: primero se reclama (slug null) y al terminar queda el slug. */
  claim: z.object({ at: z.iso.datetime(), slug: z.string().nullable() }).nullable(),
});
type StoredDraft = z.infer<typeof storedDraftSchema>;

export async function saveDraft(input: {
  username: string;
  snapshot: InstagramSnapshot;
  generated: GeneratedContent | null;
  pieces: Piece[];
  warnings: string[];
}): Promise<DraftPreview> {
  const draft: StoredDraft = { id: randomUUID(), createdAt: new Date().toISOString(), claim: null, ...input };
  if (!(await getStorage().createJson(draftPath(draft.id), draft))) throw new Error("No se pudo guardar el borrador.");
  return toPreview(draft);
}

function toPreview(draft: StoredDraft): DraftPreview {
  const { snapshot, generated, pieces } = draft;
  const used = new Set(pieces.map((piece) => piece.niche));
  return {
    draftId: draft.id,
    username: draft.username,
    name: snapshot.fullName || draft.username,
    photo: snapshot.profilePhoto,
    // Lo que sugirió la IA (solo nichos con alguna pieza): el punto de partida de los chips.
    suggestedNiches: (generated?.niches ?? []).filter((niche) => used.has(niche.slug)),
    pieces: pieces.map((piece) => ({
      id: piece.id,
      title: piece.title,
      image: piece.image,
      niche: piece.niche,
      isVideo: piece.video !== null,
    })),
    engagementRate: computeEngagementRate(snapshot),
    aiWritten: generated !== null,
    warnings: draft.warnings,
  };
}

function invalidAt(path: (string | number)[], message: string): never {
  throw new z.ZodError([{ code: "custom", path, message, input: undefined }]);
}

/** Nichos confirmados → { slug, label }: el slug sale del nombre, igual que en el navegador. */
function confirmedNiches(input: ConfirmImportInput["niches"]): NicheDef[] {
  const niches: NicheDef[] = [];
  input.forEach(({ label }, index) => {
    const niche = nicheFromLabel(label);
    if (!niche) invalidAt(["niches", index, "label"], "Ese nombre no sirve para un link: usa letras o números (y no \"Todo\").");
    if (niches.some((existing) => existing.slug === niche.slug)) {
      invalidAt(["niches", index, "label"], "Ya hay un nicho con ese nombre.");
    }
    niches.push(niche);
  });
  return niches;
}

export type ConfirmOutcome = { portfolio: Portfolio; username: string; warnings: string[]; created: boolean };

/** Log estructurado (una línea JSON) del confirmado: se filtra por draftId en los logs de Vercel. */
function logConfirm(level: "info" | "warn" | "error", event: string, draftId: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ scope: "import.confirm", event, draftId, at: new Date().toISOString(), ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

const WAIT_MESSAGE =
  "Tu portafolio se está generando. Espera unos segundos y vuelve a tocar «Generar portafolio»: si ya quedó listo, te lo mostramos.";

/**
 * 409 "se está generando". `retryAt` = cuándo vence el candado: a partir de esa hora un reintento ya no
 * espera (o devuelve el portafolio, o lo genera de nuevo). null si el candado no se cura solo.
 */
function busy(draftId: string, reason: string, claimAt: string | null, fields: Record<string, unknown> = {}): ConflictError {
  const retryAt = claimAt ? new Date(Date.parse(claimAt) + CLAIM_STALE_MS).toISOString() : null;
  logConfirm(reason === "claimed_slug_missing" ? "error" : "info", "decision.wait", draftId, { reason, retryAt, ...fields });
  return new ConflictError(WAIT_MESSAGE, { retryAt });
}

/**
 * El portafolio que salió de este borrador, aunque el slug no alcanzó a guardarse en el candado.
 * Se reconoce por sus piezas: sus ids (UUID) se crean al importar y pasan tal cual al portafolio.
 * Solo mira los links que createPortfolio pudo haber tomado (base, base-2…) hasta el primero libre:
 * los portafolios no se borran, así que el suyo está antes de ese hueco.
 */
async function findDraftPortfolio(draft: StoredDraft): Promise<Portfolio | null> {
  const pieceIds = new Set(draft.pieces.map((piece) => piece.id));
  // El último candidato lleva un sufijo al azar: no se puede adivinar, se omite.
  for (const slug of slugCandidates(slugify(draft.username)).slice(0, -1)) {
    const portfolio = await getPortfolio(slug);
    if (!portfolio) return null;
    if (portfolio.pieces.some((piece) => pieceIds.has(piece.id))) return portfolio;
  }
  return null;
}

/** Anota el slug en el candado (reparación de un confirmado que no alcanzó a guardarlo). Si falla, no pasa nada. */
async function recordSlug(draft: StoredDraft, etag: string, claimAt: string, slug: string): Promise<boolean> {
  try {
    return await getStorage().replaceJson(draftPath(draft.id), { ...draft, claim: { at: claimAt, slug } }, etag);
  } catch (error) {
    logConfirm("warn", "claim.slug_write_failed", draft.id, { slug, error: String(error) });
    return false;
  }
}

export async function confirmDraft(input: ConfirmImportInput): Promise<ConfirmOutcome> {
  const storage = getStorage();
  const stored = await storage.readJson(draftPath(input.draftId));
  if (!stored) throw new NotFoundError("Esta importación ya no existe. Vuelve a importar el perfil.");
  const draft = storedDraftSchema.parse(stored.data);
  const outcome = (portfolio: Portfolio, created: boolean): ConfirmOutcome => ({
    portfolio,
    username: draft.username,
    warnings: draft.warnings,
    created,
  });

  const claimAgeMs = draft.claim ? Date.now() - Date.parse(draft.claim.at) : null;
  logConfirm("info", "claim.read", draft.id, { claimAt: draft.claim?.at ?? null, claimSlug: draft.claim?.slug ?? null, claimAgeMs });

  if (draft.claim) {
    // Ya se confirmó: se devuelve el mismo portafolio (doble toque o reintento).
    if (draft.claim.slug) {
      const existing = await getPortfolio(draft.claim.slug);
      if (existing) {
        logConfirm("info", "decision.return_existing", draft.id, { slug: existing.slug, via: "claim" });
        return outcome(existing, false);
      }
      // Tiene slug pero el portafolio no está: no debería pasar (no se borran). Se deja como estaba.
      throw busy(draft.id, "claimed_slug_missing", null, { slug: draft.claim.slug });
    }

    // Candado sin slug: o se está generando ahora, o murió a medias. Primero, ¿el portafolio llegó a crearse?
    const existing = await findDraftPortfolio(draft);
    if (existing) {
      const healed = await recordSlug(draft, stored.etag, draft.claim.at, existing.slug);
      logConfirm("info", "decision.return_existing", draft.id, { slug: existing.slug, via: "lookup", claimHealed: healed });
      return outcome(existing, false);
    }
    if (claimAgeMs !== null && claimAgeMs < CLAIM_STALE_MS) {
      throw busy(draft.id, "claim_in_progress", draft.claim.at, { claimAgeMs });
    }
    // Más de 5 minutos y sin portafolio: la ejecución que lo reclamó ya no existe. Se libera y se sigue.
    logConfirm("warn", "decision.release_stale", draft.id, { claimAt: draft.claim.at, claimAgeMs });
  } else {
    logConfirm("info", "decision.continue", draft.id);
  }

  if (Date.now() - Date.parse(draft.createdAt) > DRAFT_TTL_MS) {
    throw new InvalidInputError("Pasaron más de 24 horas desde que se importó este perfil. Vuelve a importarlo.", 410);
  }

  const niches = confirmedNiches(input.niches);
  const slugs = new Set(niches.map((niche) => niche.slug));
  const pieces = draft.pieces.map((piece): Piece => {
    const chosen = Object.hasOwn(input.pieceNiches, piece.id) ? input.pieceNiches[piece.id] : piece.niche;
    if (chosen !== null && !slugs.has(chosen)) {
      // Lo que mandó el creador tiene que ser uno de sus nichos; lo de la IA sin confirmar va a "Todo".
      if (Object.hasOwn(input.pieceNiches, piece.id)) invalidAt(["pieceNiches", piece.id], "Esa pieza apunta a un nicho que no confirmaste.");
      return { ...piece, niche: null };
    }
    return { ...piece, niche: chosen };
  });

  // Se reclama el borrador antes de crear: si llegan dos confirmaciones a la vez, solo una genera.
  // Con el etag de la lectura: si otra petición reclamó (o liberó un candado vencido) en medio, esta pierde.
  const claimAt = new Date().toISOString();
  const claimed: StoredDraft = { ...draft, claim: { at: claimAt, slug: null } };
  if (!(await storage.replaceJson(draftPath(draft.id), claimed, stored.etag))) {
    // Otra petición reclamó en medio: su candado es de ahora mismo, así que vence en ~5 min.
    throw busy(draft.id, "claim_lost_race", claimAt);
  }
  logConfirm("info", "claim.acquired", draft.id, { claimAt, replacedStale: draft.claim !== null });

  let portfolio: Portfolio;
  const startedAt = Date.now();
  logConfirm("info", "create.start", draft.id);
  try {
    portfolio = await createPortfolio(
      {
        source: "instagram",
        instagram: draft.snapshot,
        generated: draft.generated,
        // Los nichos confirmados son la fuente de verdad (mandan sobre los de la IA, que quedan en `generated`).
        manual: { niches },
        pieces,
        design: input.design,
        insights: { engagementRate: computeEngagementRate(draft.snapshot), computedAt: new Date().toISOString() },
      },
      draft.username,
    );
  } catch (error) {
    logConfirm("error", "create.failed", draft.id, { durationMs: Date.now() - startedAt, error: String(error) });
    // Se libera para que se pueda reintentar. Si liberar también falla, el candado se cura solo en 5 minutos.
    try {
      const current = await storage.readJson(draftPath(draft.id));
      const released = current ? await storage.replaceJson(draftPath(draft.id), { ...draft, claim: null }, current.etag) : false;
      logConfirm(released ? "info" : "warn", "claim.rollback", draft.id, { released });
    } catch (rollbackError) {
      logConfirm("error", "claim.rollback", draft.id, { released: false, error: String(rollbackError) });
    }
    throw error;
  }
  logConfirm("info", "create.end", draft.id, { slug: portfolio.slug, durationMs: Date.now() - startedAt });

  // El portafolio ya existe: pase lo que pase al anotar el slug, se devuelve. Si no se anota, el próximo
  // reintento lo encuentra igual por sus piezas (findDraftPortfolio).
  try {
    const current = await storage.readJson(draftPath(draft.id));
    const saved = current
      ? await storage.replaceJson(draftPath(draft.id), { ...claimed, claim: { at: claimAt, slug: portfolio.slug } }, current.etag)
      : false;
    logConfirm(saved ? "info" : "warn", "claim.finalized", draft.id, { slug: portfolio.slug, saved });
  } catch (error) {
    logConfirm("warn", "claim.finalized", draft.id, { slug: portfolio.slug, saved: false, error: String(error) });
  }
  return outcome(portfolio, true);
}
