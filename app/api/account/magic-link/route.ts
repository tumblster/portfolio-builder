import type { NextRequest } from "next/server";
import { z } from "zod";
import { InvalidInputError, errorResponse, jsonResponse } from "@/lib/errors";
import { sendAccountAccessMail } from "@/lib/portfolio/owner-mail";
import { slugsForEmail } from "@/lib/portfolio/owners";
import { requestOrigin } from "@/lib/request";

/*
 * Spec 12.1 · ronda 6 13.14: entrar solo con el correo (estilo Substack). Si ese correo tiene portafolios, le llega UN
 * link al panel "Mis portafolios" (desde ahí ve, edita y reactiva cada uno). La respuesta es siempre la misma (no
 * revela si el correo existe). Sin SMTP: modo mock (logs).
 * POST /api/account/magic-link  { email }
 */
const inputSchema = z.object({ email: z.email({ error: "Escribe un correo válido." }).max(254) });

export async function POST(request: NextRequest) {
  try {
    const parsed = inputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new InvalidInputError(parsed.error.issues[0]?.message ?? "Escribe un correo válido.");
    const email = parsed.data.email.trim().toLowerCase();
    if ((await slugsForEmail(email)).length > 0) {
      await sendAccountAccessMail({ origin: requestOrigin(request), email });
    }
    return jsonResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
