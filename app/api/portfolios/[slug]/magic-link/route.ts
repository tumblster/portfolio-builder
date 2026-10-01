import type { NextRequest } from "next/server";
import { z } from "zod";
import { requirePortfolioEditor } from "@/lib/auth";
import { InvalidInputError, NotFoundError, errorResponse, jsonResponse } from "@/lib/errors";
import { sendMail } from "@/lib/mail";
import { createPortfolioToken } from "@/lib/magic-link";
import { saveOwner } from "@/lib/portfolio/owners";
import { getPortfolio } from "@/lib/portfolio/repository";
import { resolvePortfolio } from "@/lib/portfolio/resolve";
import { publicPath } from "@/lib/portfolio/slug";
import { absoluteUrl } from "@/lib/request";

/*
 * Spec 11.8: desde "Portafolio listo", el creador deja su correo y le llega un magic link para volver a su link o
 * editarlo (sin usuario, sin contraseña). El link vale 30 días y solo para este portafolio. Sin SMTP: modo mock, el
 * link queda en los logs. Spec 12.1: el correo ES la cuenta: se guarda (solo para los magic links y los avisos).
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
    const { name } = resolvePortfolio(doc);
    await saveOwner(slug, parsed.data.email);
    const { token, expiresAt } = createPortfolioToken(slug);
    const editLink = absoluteUrl(request, `/m/${token}`);
    const publicLink = absoluteUrl(request, publicPath(slug));
    const until = expiresAt.toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" });
    const sent = await sendMail({
      to: parsed.data.email,
      subject: `Tu portafolio de ${name} en Supercreador`,
      text: [
        `Tu portafolio: ${publicLink}`,
        ``,
        `Para editarlo, abre este link (vale hasta el ${until} y solo para este portafolio):`,
        editLink,
        ``,
        `Si nadie abre tu portafolio en 30 días, lo archivamos y te avisamos por correo.`,
      ].join("\n"),
      html: `<p>Tu portafolio: <a href="${publicLink}">${publicLink}</a></p>
<p><a href="${editLink}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#0e110b;color:#f5f5e7;text-decoration:none;font-weight:600">Editar mi portafolio</a></p>
<p style="color:#4b4e44;font-size:14px">El link vale hasta el ${until} y solo para este portafolio.</p>
<p style="color:#4b4e44;font-size:13px">Si nadie abre tu portafolio en 30 días, lo archivamos y te avisamos por correo.</p>`,
    });
    if (sent === "mock") console.info(JSON.stringify({ scope: "magic-link", event: "mock", slug, link: editLink }));
    return jsonResponse({ ok: true, sent }, { headers: { "X-Mail": sent } });
  } catch (error) {
    return errorResponse(error);
  }
}
