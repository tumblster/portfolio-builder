import type { NextRequest } from "next/server";
import { z } from "zod";
import { InvalidInputError, errorResponse, jsonResponse } from "@/lib/errors";
import { sendMail } from "@/lib/mail";
import { createPortfolioToken } from "@/lib/magic-link";
import { slugsForEmail } from "@/lib/portfolio/owners";
import { getPortfolio } from "@/lib/portfolio/repository";
import { resolvePortfolio } from "@/lib/portfolio/resolve";
import { absoluteUrl } from "@/lib/request";

/*
 * Spec 12.1: entrar solo con el correo (estilo Substack). Si ese correo tiene portafolios, le llega un magic link por
 * cada uno (11.8). La respuesta es siempre la misma (no revela si el correo existe). Sin SMTP: modo mock (logs).
 * POST /api/account/magic-link  { email }
 */
const inputSchema = z.object({ email: z.email({ error: "Escribe un correo válido." }).max(254) });

export async function POST(request: NextRequest) {
  try {
    const parsed = inputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new InvalidInputError(parsed.error.issues[0]?.message ?? "Escribe un correo válido.");
    const links: { name: string; edit: string; open: string }[] = [];
    for (const slug of (await slugsForEmail(parsed.data.email)).slice(0, 10)) {
      const doc = await getPortfolio(slug);
      if (!doc) continue;
      links.push({
        name: resolvePortfolio(doc).name,
        edit: absoluteUrl(request, `/m/${createPortfolioToken(slug).token}${doc.archivedAt ? "?reactivar=1" : ""}`),
        open: absoluteUrl(request, `/p/${slug}`),
      });
    }
    if (links.length > 0) {
      const sent = await sendMail({
        to: parsed.data.email,
        subject: "Tu acceso a Supercreador",
        text: links.map((link) => `${link.name}\n  Ver: ${link.open}\n  Editar: ${link.edit}`).join("\n\n") + "\n\nCada link vale 30 días.",
        html:
          links
            .map((link) => `<p><strong>${link.name}</strong><br><a href="${link.open}">${link.open}</a><br><a href="${link.edit}">Editar mi portafolio</a></p>`)
            .join("") + `<p style="color:#4b4e44;font-size:13px">Cada link vale 30 días.</p>`,
      });
      if (sent === "mock") console.info(JSON.stringify({ scope: "magic-link", event: "mock", links: links.map((link) => link.edit) }));
    }
    return jsonResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
