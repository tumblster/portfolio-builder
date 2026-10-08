import "server-only";
import { createAccountToken, createPortfolioToken } from "@/lib/magic-link";
import { sendMail, type MailResult } from "@/lib/mail";
import { accountKey } from "./owners";
import { publicPath } from "./slug";

/*
 * Correos de acceso (11.8 · 12.1 · ronda 6 13.14 / 13.15). Sin contraseña: cada correo trae magic links firmados que
 * valen 30 días.
 *  - De un portafolio (al generarlo con el correo del onboarding, o con "Reenviar"): su link público, "Editar este
 *    portafolio" (solo ese) y "Mis portafolios" (el panel de la cuenta).
 *  - De la cuenta ("Entra con tu correo"): solo el panel "Mis portafolios".
 * Sin SMTP: modo mock, el correo (con sus links) queda en los registros del servidor.
 */

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);

const button = (href: string, label: string) =>
  `<a href="${href}" style="display:inline-block;margin:4px 0;padding:12px 20px;border-radius:999px;background:#0e110b;color:#f5f5e7;text-decoration:none;font-weight:600">${label}</a>`;

/** Link al panel "Mis portafolios" de ese correo (token de cuenta). */
export function accountPanelLink(origin: string, email: string): string {
  return new URL(`/m/cuenta/${createAccountToken(accountKey(email)).token}`, origin).toString();
}

export async function sendOwnerAccessMail({
  origin,
  slug,
  email,
  name,
  reason,
}: {
  origin: string;
  slug: string;
  email: string;
  name: string;
  /** "created": recién generado (bienvenida); "resend": lo pidió de nuevo. */
  reason: "created" | "resend";
}): Promise<MailResult> {
  const { token, expiresAt } = createPortfolioToken(slug);
  const editLink = new URL(`/m/${token}`, origin).toString();
  const panelLink = accountPanelLink(origin, email);
  const publicLink = new URL(publicPath(slug), origin).toString();
  const until = expiresAt.toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" });
  const safeName = escapeHtml(name);
  const subject = reason === "created" ? `Tu portafolio de ${name} está listo` : `Tu portafolio de ${name} en Supercreador`;
  const sent = await sendMail({
    to: email,
    subject,
    text: [
      reason === "created" ? `¡Tu portafolio está listo! ${publicLink}` : `Tu portafolio: ${publicLink}`,
      ``,
      `Editar este portafolio: ${editLink}`,
      `Mis portafolios: ${panelLink}`,
      ``,
      `Los links valen hasta el ${until}. Tu correo es tu cuenta: sin contraseña.`,
      `Si nadie abre tu portafolio en 30 días, lo archivamos y te avisamos por correo.`,
    ].join("\n"),
    html: `<p>${reason === "created" ? "¡Tu portafolio está listo!" : "Tu portafolio:"} <a href="${publicLink}">${publicLink}</a></p>
<p>${button(editLink, `Editar el portafolio de ${safeName}`)}<br>${button(panelLink, "Mis portafolios")}</p>
<p style="color:#4b4e44;font-size:14px">Los links valen hasta el ${until}. Tu correo es tu cuenta: sin contraseña.</p>
<p style="color:#4b4e44;font-size:13px">Si nadie abre tu portafolio en 30 días, lo archivamos y te avisamos por correo.</p>`,
  });
  if (sent === "mock") console.info(JSON.stringify({ scope: "magic-link", event: "mock", slug, link: editLink, panel: panelLink }));
  return sent;
}

export async function sendAccountAccessMail({ origin, email }: { origin: string; email: string }): Promise<MailResult> {
  const panelLink = accountPanelLink(origin, email);
  const sent = await sendMail({
    to: email,
    subject: "Tu acceso a Supercreador",
    text: `Entra a «Mis portafolios»: ${panelLink}\n\nEl link vale 30 días. Tu correo es tu cuenta: sin contraseña.`,
    html: `<p>${button(panelLink, "Entrar a Mis portafolios")}</p><p style="color:#4b4e44;font-size:13px">El link vale 30 días. Tu correo es tu cuenta: sin contraseña.</p>`,
  });
  if (sent === "mock") console.info(JSON.stringify({ scope: "magic-link", event: "mock", panel: panelLink }));
  return sent;
}
