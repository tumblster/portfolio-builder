import type { NextRequest } from "next/server";
import { recordOpen } from "@/lib/portfolio/activity";
import { slugSchema } from "@/lib/portfolio/slug";
import { requestOrigin } from "@/lib/request";

/*
 * Una visita al portafolio publicado (11.9, 12.7, 12.9). Público y sin datos personales: el IP solo sirve para contar
 * 1 vista por persona por día (se guarda un hash que cambia cada día). Cuerpo: { ref?, path?, seen? }.
 * Responde { views } (el ojito del portafolio). Si algo falla, responde igual: nunca molesta a quien mira.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const parsed = slugSchema.safeParse((await params).slug);
  if (!parsed.success) return Response.json({ views: 0 }, { headers: { "Cache-Control": "no-store" } });
  const body = (await request.json().catch(() => null)) as { ref?: unknown; path?: unknown; seen?: unknown } | null;
  const visitor =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "desconocido";
  try {
    const result = await recordOpen(
      parsed.data,
      { visitor, ref: body?.ref, path: body?.path, repeat: body?.seen === true },
      requestOrigin(request),
    );
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.warn(JSON.stringify({ scope: "opens", event: "failed", error: String(error) }));
    return Response.json({ views: 0 }, { headers: { "Cache-Control": "no-store" } });
  }
}
