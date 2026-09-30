import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { ConflictError, GenerationFailedError, InvalidInputError, NotFoundError } from "@/lib/errors";
import { titleFromCaption } from "@/lib/instagram/snapshot";
import { computeEngagementRate } from "@/lib/portfolio/engagement";
import { creatorMetrics } from "@/lib/portfolio/metrics";
import { nicheFromLabel, type NicheDef } from "@/lib/portfolio/niches";
import { createPortfolio, getPortfolio } from "@/lib/portfolio/repository";
import { slugCandidates, slugify } from "@/lib/portfolio/slug";
import {
  LIMITS,
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
 *
 * Estado fallido (ronda 30/09 · 7.4 b): si la generación lanza una excepción, o si la escritura condicional del
 * candado falla sin que otra petición lo haya tomado (el almacenamiento no respeta el etag), el borrador queda
 * FALLIDO: se registra en drafts/<id>.failure.json (se crea sin condición, así se puede registrar aunque la
 * escritura condicional sea justo lo que falla) y desde ahí el servidor responde un error terminal, no 409.
 * El creador puede pedir otro intento a propósito (retry). El estado se consulta en GET /api/import/status.
 */

const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
/** Un candado sin slug más viejo que esto es de una ejecución que murió (maxDuration 60 s + margen): se libera. */
export const CLAIM_STALE_MS = 75 * 1000;
const draftPath = (id: string) => `drafts/${id}.json`;
const failurePath = (id: string) => `drafts/${id}.failure.json`;

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
  /** Cuándo el creador pidió reintentar tras un fallo: los fallos anteriores a esto ya no cuentan. */
  retriedAt: z.iso.datetime().nullable().default(null),
});
const failureSchema = z.object({ at: z.iso.datetime(), code: z.string(), message: z.string() });
type DraftFailure = z.infer<typeof failureSchema>;
type StoredDraft = z.infer<typeof storedDraftSchema>;

export async function saveDraft(input: {
  username: string;
  snapshot: InstagramSnapshot;
  generated: GeneratedContent | null;
  pieces: Piece[];
  warnings: string[];
}): Promise<DraftPreview> {
  const draft: StoredDraft = { id: randomUUID(), createdAt: new Date().toISOString(), claim: null, retriedAt: null, ...input };
  if (!(await getStorage().createJson(draftPath(draft.id), draft))) throw new Error("No se pudo guardar el borrador.");
  return toPreview(draft);
}

/** Id estable de una pieza que sale de una publicación del perfil que la IA no eligió (7.1). */
export function profilePieceId(draftId: string, postId: string): string {
  return `ig-${createHash("sha256").update(`${draftId}:${postId}`).digest("hex").slice(0, 24)}`;
}

/**
 * Todo lo que el creador puede elegir como pieza (7.1): las que eligió la IA y el resto de sus publicaciones con
 * imagen ("De tu perfil"), en ese orden. Las del perfil llevan el título que sale de su texto, igual que al importar.
 */
function piecePool(draft: StoredDraft): Map<string, Piece> {
  const pool = new Map(draft.pieces.map((piece) => [piece.id, piece]));
  const used = new Set(draft.pieces.map((piece) => piece.sourcePostId).filter(Boolean));
  for (const post of draft.snapshot.posts) {
    if (!post.image || used.has(post.id)) continue;
    const id = profilePieceId(draft.id, post.id);
    pool.set(id, {
      id,
      origin: "instagram",
      title: titleFromCaption(post.caption, post.type),
      niche: null,
      image: post.image,
      video: post.type === "video" ? { platform: "instagram", url: post.url } : null,
      sourcePostId: post.id,
    });
  }
  return pool;
}

function toPreview(draft: StoredDraft): DraftPreview {
  const { snapshot, generated, pieces } = draft;
  const used = new Set(pieces.map((piece) => piece.niche));
  const selectedIds = new Set(pieces.map((piece) => piece.id));
  const engagementRate = computeEngagementRate(snapshot);
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
    profilePosts: [...piecePool(draft).values()]
      .filter((piece) => !selectedIds.has(piece.id))
      .map((piece) => ({ id: piece.id, title: piece.title, image: piece.image, niche: null, isVideo: piece.video !== null })),
    engagementRate,
    metrics: creatorMetrics(snapshot, engagementRate),
    pieceLimits: { min: LIMITS.minPieces, max: LIMITS.maxPieces },
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
 * Se reconoce por sus piezas: sus ids (los de la IA y los estables del perfil) pasan tal cual al portafolio.
 * Solo mira los links que createPortfolio pudo haber tomado (base, base-2…) hasta el primero libre:
 * los portafolios no se borran, así que el suyo está antes de ese hueco.
 */
async function findDraftPortfolio(draft: StoredDraft): Promise<Portfolio | null> {
  const pieceIds = new Set(piecePool(draft).keys());
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

/** El fallo vigente del borrador (7.4 b), o null. Los anteriores a un "reintentar" ya no cuentan. */
async function readFailure(draft: StoredDraft): Promise<DraftFailure | null> {
  const stored = await getStorage().readJson(failurePath(draft.id));
  const failure = stored ? failureSchema.safeParse(stored.data) : null;
  if (!failure?.success) return null;
  return draft.retriedAt && Date.parse(failure.data.at) <= Date.parse(draft.retriedAt) ? null : failure.data;
}

/**
 * Deja el borrador en estado fallido: registra el fallo (sin escritura condicional, para que quede aunque sea esa
 * justamente la que falla) y, si se puede, suelta el candado. Nunca lanza: el error que se devuelve es el terminal.
 */
async function markFailed(draft: StoredDraft, code: string, message: string): Promise<DraftFailure> {
  const storage = getStorage();
  const failure: DraftFailure = { at: new Date().toISOString(), code, message: message.slice(0, 500) };
  try {
    if (!(await storage.createJson(failurePath(draft.id), failure))) {
      const previous = await storage.readJson(failurePath(draft.id));
      if (previous) await storage.replaceJson(failurePath(draft.id), failure, previous.etag);
    }
    logConfirm("error", "draft.failed", draft.id, { code, message: failure.message });
  } catch (error) {
    logConfirm("error", "draft.failed_unrecorded", draft.id, { code, error: String(error) });
  }
  try {
    const current = await storage.readJson(draftPath(draft.id));
    const released = current ? await storage.replaceJson(draftPath(draft.id), { ...(current.data as StoredDraft), claim: null }, current.etag) : false;
    logConfirm(released ? "info" : "warn", "claim.rollback", draft.id, { released });
  } catch (error) {
    logConfirm("error", "claim.rollback", draft.id, { released: false, error: String(error) });
  }
  return failure;
}

const failedError = (failure: DraftFailure) =>
  new GenerationFailedError(failure.message || undefined, { failedAt: failure.at, reason: failure.code });

/** Las piezas elegidas (7.1), en el orden de los chips; o, si el cliente es anterior, todas las del borrador. */
function selectedPieces(draft: StoredDraft, input: ConfirmImportInput, slugs: Set<string>): Piece[] {
  if (!input.selection) {
    const pieceNiches = input.pieceNiches ?? {};
    return draft.pieces.map((piece): Piece => {
      const chosen = Object.hasOwn(pieceNiches, piece.id) ? pieceNiches[piece.id] : piece.niche;
      if (chosen !== null && !slugs.has(chosen)) {
        // Lo que mandó el creador tiene que ser uno de sus nichos; lo de la IA sin confirmar va a "Todo".
        if (Object.hasOwn(pieceNiches, piece.id)) invalidAt(["pieceNiches", piece.id], "Esa pieza apunta a un nicho que no confirmaste.");
        return { ...piece, niche: null };
      }
      return { ...piece, niche: chosen };
    });
  }
  const { selection } = input;
  if (selection.length < LIMITS.minPieces) invalidAt(["selection"], `Elige al menos ${LIMITS.minPieces} piezas.`);
  if (selection.length > LIMITS.maxPieces) invalidAt(["selection"], `Puedes elegir hasta ${LIMITS.maxPieces} piezas.`);
  const pool = piecePool(draft);
  const seen = new Set<string>();
  return selection.map(({ id, niche }, index): Piece => {
    const piece = pool.get(id);
    if (!piece || seen.has(id)) invalidAt(["selection", index, "id"], "Esa pieza no es de este perfil. Vuelve a importarlo.");
    seen.add(id);
    if (niche !== null && !slugs.has(niche)) invalidAt(["selection", index, "niche"], "Esa pieza apunta a un nicho que no confirmaste.");
    return { ...piece, niche };
  });
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

  // Ya se confirmó: se devuelve el mismo portafolio (doble toque o reintento), aunque antes haya fallado algo.
  if (draft.claim?.slug) {
    const existing = await getPortfolio(draft.claim.slug);
    if (existing) {
      logConfirm("info", "decision.return_existing", draft.id, { slug: existing.slug, via: "claim" });
      return outcome(existing, false);
    }
  }
  const unclaimed = draft.claim && !draft.claim.slug ? await findDraftPortfolio(draft) : null;
  if (unclaimed && draft.claim) {
    const healed = await recordSlug(draft, stored.etag, draft.claim.at, unclaimed.slug);
    logConfirm("info", "decision.return_existing", draft.id, { slug: unclaimed.slug, via: "lookup", claimHealed: healed });
    return outcome(unclaimed, false);
  }

  // Fallido (7.4 b): error terminal, nunca más 409, hasta que el creador pida otro intento a propósito.
  const failure = await readFailure(draft);
  if (failure && !input.retry) {
    logConfirm("info", "decision.failed", draft.id, { failedAt: failure.at, reason: failure.code });
    throw failedError(failure);
  }

  if (draft.claim) {
    if (draft.claim.slug) {
      // Tiene slug pero el portafolio no está: no debería pasar (no se borran). Es un fallo, no una espera.
      throw failedError(await markFailed(draft, "claimed_slug_missing", `El borrador apunta a /${draft.claim.slug}, que no existe.`));
    }
    if (claimAgeMs !== null && claimAgeMs < CLAIM_STALE_MS && !failure) {
      throw busy(draft.id, "claim_in_progress", draft.claim.at, { claimAgeMs });
    }
    // Vencido (o el creador pidió reintentar): la ejecución que lo reclamó ya no existe. Se libera y se sigue.
    logConfirm("warn", "decision.release_stale", draft.id, { claimAt: draft.claim.at, claimAgeMs, retry: Boolean(input.retry) });
  } else {
    logConfirm("info", "decision.continue", draft.id, { retry: Boolean(input.retry && failure) });
  }

  if (Date.now() - Date.parse(draft.createdAt) > DRAFT_TTL_MS) {
    throw new InvalidInputError("Pasaron más de 24 horas desde que se importó este perfil. Vuelve a importarlo.", 410);
  }

  const niches = confirmedNiches(input.niches);
  const slugs = new Set(niches.map((niche) => niche.slug));
  const pieces = selectedPieces(draft, input, slugs);

  // Se reclama el borrador antes de crear: si llegan dos confirmaciones a la vez, solo una genera.
  // Con el etag de la lectura: si otra petición reclamó (o liberó un candado vencido) en medio, esta pierde.
  const claimAt = new Date().toISOString();
  const claimed: StoredDraft = {
    ...draft,
    claim: { at: claimAt, slug: null },
    retriedAt: failure ? claimAt : draft.retriedAt,
  };
  if (!(await storage.replaceJson(draftPath(draft.id), claimed, stored.etag))) {
    // ¿Carrera de verdad, o la escritura condicional falló sin que nadie más tocara el borrador?
    const current = await storage.readJson(draftPath(draft.id)).catch(() => null);
    const currentClaim = current ? storedDraftSchema.safeParse(current.data) : null;
    const other = currentClaim?.success ? currentClaim.data.claim : null;
    if (other && other.at !== draft.claim?.at) throw busy(draft.id, "claim_lost_race", other.at);
    // Nadie más lo tomó: esperar no lo va a arreglar (era el 409 eterno). Queda fallido, con su causa.
    throw failedError(
      await markFailed(draft, "storage_conflict", "La escritura condicional del borrador falló sin que otra petición lo tomara (etag)."),
    );
  }
  logConfirm("info", "claim.acquired", draft.id, { claimAt, replacedStale: draft.claim !== null, retry: Boolean(failure) });

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
    // Estado terminal (7.4 b): nada de volver a responder 409. El creador puede pedir otro intento.
    throw failedError(await markFailed(draft, "create_failed", String(error)));
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

export type DraftStatus = {
  draftId: string;
  /** pending: sin confirmar · generating: alguien lo está generando · stale: el candado venció (se libera al
   *  confirmar) · done: portafolio creado · failed: la generación falló (terminal hasta reintentar). */
  state: "pending" | "generating" | "stale" | "done" | "failed";
  slug: string | null;
  claimAt: string | null;
  failure: DraftFailure | null;
  expiresAt: string;
};

/** Estado consultable del borrador (7.4 b: "el draft queda en estado fallido consultable"). */
export async function getDraftStatus(draftId: string): Promise<DraftStatus> {
  const stored = await getStorage().readJson(draftPath(draftId));
  if (!stored) throw new NotFoundError("Esta importación ya no existe.");
  const draft = storedDraftSchema.parse(stored.data);
  const failure = await readFailure(draft);
  const claimAge = draft.claim ? Date.now() - Date.parse(draft.claim.at) : null;
  const state: DraftStatus["state"] = draft.claim?.slug
    ? "done"
    : failure
      ? "failed"
      : draft.claim
        ? (claimAge ?? 0) < CLAIM_STALE_MS
          ? "generating"
          : "stale"
        : "pending";
  return {
    draftId: draft.id,
    state,
    slug: draft.claim?.slug ?? null,
    claimAt: draft.claim?.at ?? null,
    failure,
    expiresAt: new Date(Date.parse(draft.createdAt) + DRAFT_TTL_MS).toISOString(),
  };
}
