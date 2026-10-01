import type { NextRequest } from "next/server";
import { requireCreator } from "@/lib/auth";
import { errorResponse, jsonResponse } from "@/lib/errors";
import { runInactivity } from "@/lib/portfolio/activity";
import { requestOrigin } from "@/lib/request";

/*
 * Spec 11.9: cron diario (vercel.json, 06:00 UTC). Los portafolios sin actividad en 30 días se ARCHIVAN (no se
 * borran) y se avisa por correo a los 21 y 7 días previos y el día del archivado (más un aviso por IG, 12.2).
 * Lo llama Vercel con Authorization: Bearer <CRON_SECRET>; también a mano con la clave del creador.
 * Con ?dry=1 solo dice qué haría, sin archivar ni mandar nada.
 */
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const fromCron = Boolean(cronSecret) && request.headers.get("authorization") === `Bearer ${cronSecret}`;
  if (!fromCron) {
    const denied = requireCreator(request);
    if (denied) return denied;
  }
  try {
    const dryRun = request.nextUrl.searchParams.get("dry") === "1";
    return jsonResponse(await runInactivity({ dryRun, origin: requestOrigin(request) }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
