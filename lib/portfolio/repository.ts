import "server-only";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { ConflictError, NotFoundError } from "@/lib/errors";
import { getStorage } from "@/lib/storage";
import { LEGACY_NICHES, resolveNiches } from "./niches";
import { SCHEMA_VERSION, portfolioSchema, type Piece, type PieceInput, type Portfolio } from "./schema";
import { publicPaths, slugCandidates, slugify, slugSchema } from "./slug";

/*
 * Capa de guardado y lectura. Todo lo que se escribe pasa antes por
 * portfolioSchema: nunca se guarda un portafolio inválido.
 */

const docPath = (slug: string) => `portfolios/${slug}.json`;
const nowUtc = () => new Date().toISOString();

/**
 * Las páginas públicas (/p/<slug> y sus versiones por nicho) quedan en caché (ISR).
 * Tras cada escritura se invalidan todas para que el cambio se vea al instante: las de
 * los nichos de antes y de después del cambio, y siempre las tres de la v1.
 * Va sin el segundo argumento ("page" / "layout"): ese solo aplica a rutas con
 * [segmentos], no a una URL concreta.
 */
function refreshPublicPages(slug: string, ...docs: Portfolio[]): void {
  const niches = [...LEGACY_NICHES, ...docs.flatMap((doc) => resolveNiches(doc))].map((niche) => niche.slug);
  for (const path of publicPaths(slug, niches)) {
    try {
      revalidatePath(path);
    } catch (error) {
      // Fuera de una petición de Next (scripts): no hay caché que invalidar.
      console.warn(`[portfolio] no se pudo invalidar ${path}:`, error);
      return;
    }
  }
}

/** Valida lo leído del almacenamiento. Si está dañado es un error del servidor, no de quien lo pide. */
function parseStored(data: unknown, slug: string): Portfolio {
  const parsed = portfolioSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(`El portafolio "${slug}" guardado no cumple el modelo de datos: ${parsed.error.message}`);
  }
  return parsed.data;
}

export type NewPortfolio = Pick<Portfolio, "source" | "instagram" | "generated" | "manual" | "pieces"> &
  Partial<Pick<Portfolio, "design" | "insights">>;

/**
 * Crea el portafolio y le reserva un link único a partir del nombre o usuario:
 * valentina-ruiz, y si ya existe, valentina-ruiz-2, valentina-ruiz-3…
 */
export async function createPortfolio(data: NewPortfolio, slugFrom: string): Promise<Portfolio> {
  const storage = getStorage();
  const timestamp = nowUtc();

  for (const slug of slugCandidates(slugify(slugFrom))) {
    const portfolio = portfolioSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      slug,
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...data,
    });
    if (await storage.createJson(docPath(slug), portfolio)) {
      refreshPublicPages(slug, portfolio);
      return portfolio;
    }
  }
  throw new Error(`No se pudo reservar un link único a partir de "${slugFrom}".`);
}

/** Lee la última versión guardada, o null si no existe. */
export async function getPortfolio(slug: string): Promise<Portfolio | null> {
  if (!slugSchema.safeParse(slug).success) return null;
  const stored = await getStorage().readJson(docPath(slug));
  return stored ? parseStored(stored.data, slug) : null;
}

export type PortfolioChanges = Partial<Pick<Portfolio, "manual" | "pieces" | "instagram" | "generated">>;

/**
 * Guarda cambios solo si nadie más guardó desde la revisión que se estaba editando.
 * `apply` recibe la versión actual y devuelve las secciones que cambian.
 */
export async function updatePortfolio(
  slug: string,
  expectedRevision: number,
  apply: (current: Portfolio) => PortfolioChanges,
): Promise<Portfolio> {
  if (!slugSchema.safeParse(slug).success) throw new NotFoundError();
  const storage = getStorage();

  const stored = await storage.readJson(docPath(slug));
  if (!stored) throw new NotFoundError();
  const current = parseStored(stored.data, slug);
  if (current.revision !== expectedRevision) throw new ConflictError();

  const next = portfolioSchema.parse({
    ...current,
    ...apply(current),
    revision: current.revision + 1,
    updatedAt: nowUtc(),
  });
  if (!(await storage.replaceJson(docPath(slug), next, stored.etag))) throw new ConflictError();
  refreshPublicPages(slug, current, next);
  return next;
}

/** Pasa las piezas del formulario al formato guardado, conservando id y origen de las que ya existían. */
export function toStoredPieces(inputs: PieceInput[], existing: Piece[] = []): Piece[] {
  const byId = new Map(existing.map((piece) => [piece.id, piece]));
  return inputs.map((input) => {
    const previous = input.id ? byId.get(input.id) : undefined;
    return {
      id: previous?.id ?? randomUUID(),
      origin: previous?.origin ?? "manual",
      title: input.title,
      niche: input.niche,
      image: input.image,
      video: input.video,
      ...(previous?.sourcePostId ? { sourcePostId: previous.sourcePostId } : {}),
    };
  });
}
