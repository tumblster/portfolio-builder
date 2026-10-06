import "server-only";

/*
 * Spec 12.2: UN aviso por Instagram (@supercreador.tech) en la última semana antes de archivar. La API de mensajería
 * de Meta solo deja escribir a cuentas que ya conversaron con la nuestra, y pide su id de esa conversación (IGSID),
 * no su usuario. Sin token (IG_MESSAGING_TOKEN) o sin IGSID conocido, se OMITE sin romper nada: el correo es el canal
 * garantizado.
 */
export async function sendInstagramNotice(igsid: string | undefined, text: string): Promise<"sent" | "skipped"> {
  const token = process.env.IG_MESSAGING_TOKEN?.trim();
  if (!token || !igsid) return "skipped";
  try {
    const response = await fetch(`https://graph.instagram.com/v21.0/me/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ recipient: { id: igsid }, message: { text } }),
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok ? "sent" : "skipped";
  } catch {
    return "skipped";
  }
}
