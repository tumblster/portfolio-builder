import type { NextRequest } from "next/server";
import { z } from "zod";
import { requirePortfolioEditor } from "@/lib/auth";
import { InvalidInputError, NotFoundError, errorResponse, jsonResponse } from "@/lib/errors";
import { sendOwnerAccessMail } from "@/lib/portfolio/owner-mail";
import { saveOwner } from "@/lib/portfolio/owners";
import { getPortfolio } from "@/lib/portfolio/repository";
import { resolvePortfolio } from "@/lib/portfolio/resolve";
import { requestOrigin } from "@/lib/request";

/*
 * Spec 11.8: el creador recibe un magic link para volver a su link o editarlo (sin usuario, sin contraseña). El link
 * vale 30 días y solo para este portafolio. Spec 12.1: el correo ES la cuenta: se guarda (solo para los magic links y
 * los avisos). Ronda 6 · 13.15: el correo ya se pide al inicio; esta ruta queda para "Reenviar el correo" (y para
 * clientes sin onboarding). El correo trae también el link a "Mis portafolios" (13.14). Sin SMTP: modo mock.
 * POST /api/portfolios/<slug>/magic-link  { email }
 */
const inputSchema = z.object({ email: z.email({ error: "Escribe un correo válido." }).max(254) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const denied = requirePortfolioEditor(request, slug);
  if (denied) return denied;
  try {
    const parsed = inputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new InvalidInputError(parsed.error.issues[0]?.message ?? "Escribe un correo válido.");
    const doc = await getPortfolio(slug);
    if (!doc) throw new NotFoundError();
    const email = parsed.data.email.trim().toLowerCase();
    await saveOwner(slug, email);
    const sent = await sendOwnerAccessMail({
      origin: requestOrigin(request),
      slug,
      email,
      name: resolvePortfolio(doc).name,
      reason: "resend",
    });
    return jsonResponse({ ok: true, sent }, { headers: { "X-Mail": sent } });
  } catch (error) {
    return errorResponse(error);
  }
}
