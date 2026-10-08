import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireCreator } from "@/lib/auth";
import { errorResponse, jsonResponse, readJsonBody } from "@/lib/errors";
import { confirmDraft } from "@/lib/import/draft";
import type { ImportResult } from "@/lib/import/events";
import { GENDERS } from "@/lib/portfolio/gender";
import { sendOwnerAccessMail } from "@/lib/portfolio/owner-mail";
import { saveOwner } from "@/lib/portfolio/owners";
import { resolvePortfolio } from "@/lib/portfolio/resolve";
import { confirmImportInputSchema } from "@/lib/portfolio/schema";
import { publicPath } from "@/lib/portfolio/slug";
import { absoluteUrl, requestOrigin } from "@/lib/request";

/*
 * Genera el portafolio de una importación (v2 · M2), con los nichos que confirmó el creador y la
 * plantilla y paleta que eligió. 201 si lo creó; 200 con el mismo portafolio si ya estaba creado.
 * 409 solo mientras otra petición lo está generando (el candado se cura solo: lib/import/draft.ts).
 *
 * Ronda 6 · 13.15 / 13.11 / 13.23 · 1: llega también el onboarding (`owner`: correo + género, pedidos al inicio).
 * El género queda en el portafolio (manual.gender, textos de WhatsApp); el correo queda como su cuenta (owners/ y
 * accounts/) y, si el portafolio se acaba de crear, le llega un correo con su link, "Editar este portafolio" y "Mis
 * portafolios". Si guardar la cuenta o mandar el correo falla, el portafolio igual se entrega (se avisa en `owner`).
 */

// Tope explícito: garantiza que un candado vencido ya no tiene ninguna ejecución viva detrás.
export const maxDuration = 60;

const ownerSchema = z.object({
  email: z.email({ error: "Escribe un correo válido." }).max(254),
  gender: z.enum(GENDERS, { error: "Elige una de las opciones: Hombre, Mujer, Otro o Prefiero no decirlo." }),
});
const inputSchema = confirmImportInputSchema.extend({ owner: ownerSchema.optional() });

export async function POST(request: NextRequest) {
  const denied = requireCreator(request);
  if (denied) return denied;

  try {
    const { owner, ...input } = inputSchema.parse(await readJsonBody(request));
    const { portfolio, username, warnings, created } = await confirmDraft(input, { gender: owner?.gender });
    const resolved = resolvePortfolio(portfolio);

    let ownerResult: ImportResult["owner"] = null;
    if (owner) {
      const email = owner.email.trim().toLowerCase();
      let mail: "smtp" | "mock" | "failed" | null = null;
      try {
        await saveOwner(portfolio.slug, email);
        if (created) {
          mail = await sendOwnerAccessMail({
            origin: requestOrigin(request),
            slug: portfolio.slug,
            email,
            name: resolved.name,
            reason: "created",
          });
        }
      } catch (error) {
        console.error(JSON.stringify({ scope: "import.confirm", event: "owner.failed", slug: portfolio.slug, error: String(error) }));
        mail = "failed";
      }
      ownerResult = { email, mail };
    }

    const result: ImportResult = {
      url: absoluteUrl(request, publicPath(portfolio.slug)),
      slug: portfolio.slug,
      username,
      revision: portfolio.revision,
      resolved,
      warnings,
      owner: ownerResult,
    };
    return jsonResponse(result, { status: created ? 201 : 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
