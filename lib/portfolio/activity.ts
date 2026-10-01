import "server-only";
import { createHash } from "node:crypto";
import { sendInstagramNotice } from "@/lib/instagram-notice";
import { sendMail } from "@/lib/mail";
import { createPortfolioToken } from "@/lib/magic-link";
import { getStorage } from "@/lib/storage";
import { getOwner } from "./owners";
import { getPortfolio, setArchived } from "./repository";
import { resolvePortfolio } from "./resolve";
import { publicPath } from "./slug";

/*
 * Actividad y tracking propio de cada portafolio, en opens/<slug>.json (server-side: sin cookies, sin banner, sin
 * GA4/Mixpanel; los adblockers no lo bloquean).
 * - 11.9: última apertura → archivado por inactividad (30 días; actividad = aperturas + creación + última edición),
 *   con avisos por correo a 21 y 7 días y el día del archivado (y UN aviso por IG en la última semana, 12.2).
 *   El registro empieza de cero: sin registro, empieza a contar el día en que se crea (nada se archiva por falta de
 *   datos).
 * - 12.7: vistas públicas, 1 por persona por día (un hash del IP con la fecha: nunca se guarda el IP).
 * - 12.8: correos de hito a las 10/50/100/500 vistas.
 * - 12.9: de dónde llegan (?ref=, p. ej. qr o whatsapp) y qué página vieron (/, /<nicho>).
 */

export const INACTIVITY_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;
const NOTICE_DAYS = { d21: INACTIVITY_DAYS - 21, d7: INACTIVITY_DAYS - 7 } as const; // días de inactividad al avisar
export const MILESTONES = [10, 50, 100, 500] as const;
const openPath = (slug: string) => `opens/${slug}.json`;

export type Activity = {
  trackingSince: string;
  lastOpenedAt: string | null;
  views: number;
  day: { date: string; visitors: string[] } | null;
  refs: Record<string, number>;
  paths: Record<string, number>;
  milestones: number[];
  notices: { d21?: string; d7?: string; archived?: string; ig?: string };
};

const fresh = (at: string): Activity => ({
  trackingSince: at,
  lastOpenedAt: null,
  views: 0,
  day: null,
  refs: {},
  paths: {},
  milestones: [],
  notices: {},
});
const normalize = (data: unknown, at: string): Activity => ({ ...fresh(at), ...((data as Partial<Activity>) ?? {}) });

export async function readActivity(slug: string): Promise<Activity | null> {
  const stored = await getStorage().readJson(openPath(slug));
  return stored ? normalize(stored.data, new Date().toISOString()) : null;
}

/** Cambia el registro con escritura condicional (reintenta si otra visita escribió en medio). */
async function update(slug: string, change: (record: Activity) => Activity | null): Promise<Activity | null> {
  const storage = getStorage();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const stored = await storage.readJson(openPath(slug));
    const at = new Date().toISOString();
    const current = stored ? normalize(stored.data, at) : fresh(at);
    const next = change(current);
    if (!next) return current;
    if (stored ? await storage.replaceJson(openPath(slug), next, stored.etag) : await storage.createJson(openPath(slug), next)) return next;
  }
  return null;
}

const cleanKey = (value: unknown, fallback: string) =>
  typeof value === "string" && /^[a-z0-9_\/-]{1,40}$/i.test(value) ? value.toLowerCase() : fallback;

/**
 * Una visita al portafolio publicado. `visitor` = IP (solo para deduplicar: se guarda un hash que cambia cada día).
 * `repeat` = el navegador ya avisó en esta sesión: solo se devuelven las vistas, sin contar nada.
 */
export async function recordOpen(
  slug: string,
  { visitor, ref, path, repeat }: { visitor: string; ref?: unknown; path?: unknown; repeat?: boolean },
  origin?: string,
): Promise<{ views: number }> {
  if (repeat) return { views: (await readActivity(slug))?.views ?? 0 };
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const hash = createHash("sha256").update(`${visitor}|${date}|${slug}`).digest("hex").slice(0, 16);
  let crossed: number | null = null;
  const record = await update(slug, (current) => {
    const day = current.day?.date === date ? current.day : { date, visitors: [] };
    const isNew = !day.visitors.includes(hash);
    const views = current.views + (isNew ? 1 : 0);
    const refKey = cleanKey(ref, "directo");
    const pathKey = cleanKey(path, "/");
    crossed = isNew ? (MILESTONES.find((m) => views >= m && !current.milestones.includes(m)) ?? null) : null;
    return {
      ...current,
      lastOpenedAt: now.toISOString(),
      views,
      day: isNew ? { date, visitors: [...day.visitors, hash].slice(-5000) } : day,
      refs: { ...current.refs, [refKey]: (current.refs[refKey] ?? 0) + 1 },
      paths: { ...current.paths, [pathKey]: (current.paths[pathKey] ?? 0) + 1 },
      milestones: crossed ? [...current.milestones, crossed] : current.milestones,
    };
  });
  if (crossed && origin) await milestoneMail(slug, crossed, origin).catch(() => {});
  return { views: record?.views ?? 0 };
}

async function milestoneMail(slug: string, views: number, origin: string) {
  const owner = await getOwner(slug);
  if (!owner) return;
  const link = new URL(publicPath(slug), origin).toString();
  await sendMail({
    to: owner.email,
    subject: `¡Tu portafolio llegó a ${views} vistas!`,
    text: `¡Tu portafolio llegó a ${views} vistas! Compártelo de nuevo: ${link}`,
    html: `<p><strong>¡Tu portafolio llegó a ${views} vistas!</strong></p><p>Compártelo de nuevo: <a href="${link}">${link}</a></p>`,
  });
}

export type InactivityReport = {
  dryRun: boolean;
  checked: number;
  startedTracking: string[];
  notified: { d21: string[]; d7: string[]; ig: string[] };
  archived: string[];
  alreadyArchived: number;
  kept: number;
};

/** Cron diario (11.9): avisa y archiva. Con dryRun solo dice qué haría. `origin`: para los links de los correos. */
export async function runInactivity({ dryRun, origin, now = new Date() }: { dryRun: boolean; origin: string; now?: Date }): Promise<InactivityReport> {
  const storage = getStorage();
  const report: InactivityReport = { dryRun, checked: 0, startedTracking: [], notified: { d21: [], d7: [], ig: [] }, archived: [], alreadyArchived: 0, kept: 0 };
  const slugs = (await storage.list("portfolios/"))
    .map((path) => /^portfolios\/([^/]+)\.json$/.exec(path)?.[1])
    .filter((slug): slug is string => Boolean(slug));
  for (const slug of slugs) {
    report.checked += 1;
    const doc = await getPortfolio(slug);
    if (!doc) continue;
    if (doc.archivedAt) {
      report.alreadyArchived += 1;
      continue;
    }
    const activity = await readActivity(slug);
    if (!activity) {
      if (!dryRun) await update(slug, (current) => current);
      report.startedTracking.push(slug);
      continue;
    }
    const lastActivity = Math.max(
      Date.parse(activity.trackingSince),
      activity.lastOpenedAt ? Date.parse(activity.lastOpenedAt) : 0,
      Date.parse(doc.updatedAt),
      Date.parse(doc.createdAt),
    );
    const idleDays = (now.getTime() - lastActivity) / DAY;
    // Un aviso ya mandado solo cuenta si fue después de la última actividad (si volvió a usarse, se reinicia).
    const sent = (key: keyof Activity["notices"]) => {
      const at = activity.notices[key];
      return Boolean(at && Date.parse(at) >= lastActivity);
    };
    const { name } = resolvePortfolio(doc);
    const owner = await getOwner(slug);
    const notices: Activity["notices"] = {};
    if (idleDays >= INACTIVITY_DAYS) {
      report.archived.push(slug);
      if (!dryRun) {
        await setArchived(slug, true);
        if (owner && !sent("archived")) await notify(owner.email, slug, name, 0, origin);
        notices.archived = now.toISOString();
      }
    } else if (idleDays >= NOTICE_DAYS.d7) {
      if (!sent("d7")) {
        report.notified.d7.push(slug);
        if (!dryRun && owner) await notify(owner.email, slug, name, 7, origin);
        notices.d7 = now.toISOString();
      }
      if (!sent("ig")) {
        report.notified.ig.push(slug);
        if (!dryRun) {
          await sendInstagramNotice(
            owner?.igsid,
            `Hola ${name}: tu portafolio de Supercreador se archiva en unos días si nadie lo abre. Ábrelo o compártelo para mantenerlo activo: ${new URL(publicPath(slug), origin)}`,
          );
        }
        notices.ig = now.toISOString(); // una sola vez (se haya podido mandar o no)
      }
    } else if (idleDays >= NOTICE_DAYS.d21) {
      if (!sent("d21")) {
        report.notified.d21.push(slug);
        if (!dryRun && owner) await notify(owner.email, slug, name, 21, origin);
        notices.d21 = now.toISOString();
      }
    } else {
      report.kept += 1;
    }
    if (!dryRun && Object.keys(notices).length > 0) {
      await update(slug, (current) => ({ ...current, notices: { ...current.notices, ...notices } }));
    }
  }
  console.info(JSON.stringify({ scope: "inactivity", event: dryRun ? "dry-run" : "run", ...report }));
  return report;
}

/** Correo de aviso: a los 21 y 7 días previos y el día del archivado (0), con el link para reactivar o abrir. */
async function notify(email: string, slug: string, name: string, daysLeft: 21 | 7 | 0, origin: string) {
  const { token } = createPortfolioToken(slug);
  const reactivate = new URL(`/m/${token}?reactivar=1`, origin).toString();
  const link = new URL(publicPath(slug), origin).toString();
  const subject =
    daysLeft === 0 ? `Archivamos tu portafolio de ${name} (se reactiva con 1 clic)` : `Tu portafolio de ${name} se archiva en ${daysLeft} días`;
  const lead =
    daysLeft === 0
      ? "Nadie abrió tu portafolio en 30 días, así que lo archivamos: no se borró nada y vuelve a estar en línea con 1 clic."
      : `Nadie abre tu portafolio hace un tiempo. Si sigue así, en ${daysLeft} días lo archivamos (no se borra: se reactiva con 1 clic). Ábrelo o compártelo para mantenerlo activo.`;
  await sendMail({
    to: email,
    subject,
    text: `${lead}\n\nTu portafolio: ${link}\n${daysLeft === 0 ? "Reactivarlo" : "Editarlo"}: ${reactivate}`,
    html: `<p>${lead}</p><p>Tu portafolio: <a href="${link}">${link}</a></p><p><a href="${reactivate}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#0e110b;color:#f5f5e7;text-decoration:none;font-weight:600">${daysLeft === 0 ? "Reactivar mi portafolio" : "Abrir mi portafolio"}</a></p>`,
  });
}
