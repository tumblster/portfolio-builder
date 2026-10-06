import type { NextRequest } from "next/server";
import { requirePortfolioEditor } from "@/lib/auth";
import { NotFoundError, errorResponse, jsonResponse } from "@/lib/errors";
import { setArchived } from "@/lib/portfolio/repository";

/** Spec 11.9: reactivar con 1 clic desde el editor (el portafolio vuelve a estar en línea). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const denied = requirePortfolioEditor(request, slug);
  if (denied) return denied;
  try {
    const doc = await setArchived(slug, false);
    if (!doc) throw new NotFoundError();
    return jsonResponse({ ok: true, archivedAt: null });
  } catch (error) {
    return errorResponse(error);
  }
}
