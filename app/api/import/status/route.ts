import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireCreator } from "@/lib/auth";
import { errorResponse, jsonResponse } from "@/lib/errors";
import { getDraftStatus } from "@/lib/import/draft";

/*
 * Estado de un borrador de importación (ronda 30/09 · 7.4 b): pending, generating, stale, done o failed (con su
 * causa y hora). Sirve para ver por qué no se generó un portafolio sin mirar los logs. Requiere la clave.
 * GET /api/import/status?draftId=<uuid>
 */
export async function GET(request: NextRequest) {
  const denied = requireCreator(request);
  if (denied) return denied;
  try {
    const draftId = z.uuid({ error: "draftId no es válido." }).parse(request.nextUrl.searchParams.get("draftId"));
    return jsonResponse(await getDraftStatus(draftId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
