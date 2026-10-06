import "server-only";
import nodemailer from "nodemailer";

/*
 * Correo saliente (spec 11.8): SMTP de Zoho Mail desde una dirección @supercreador.tech. Todo por variables de entorno
 * (las genera el dueño; ver DEPLOY.md): SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD y MAIL_FROM (opcional).
 * Sin SMTP (desarrollo o un Preview sin configurar): MODO MOCK, el correo (con su link) queda en los logs.
 */

export type MailResult = "smtp" | "mock";

export const smtpConfigured = () =>
  Boolean(process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim() && process.env.SMTP_PASSWORD?.trim());

export async function sendMail(message: { to: string; subject: string; text: string; html: string }): Promise<MailResult> {
  if (!smtpConfigured()) {
    console.info(JSON.stringify({ scope: "mail", event: "mock", to: message.to, subject: message.subject, text: message.text }));
    return "mock";
  }
  const port = Number(process.env.SMTP_PORT?.trim() || 465);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST!.trim(),
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER!.trim(), pass: process.env.SMTP_PASSWORD!.trim() },
  });
  await transporter.sendMail({
    from: process.env.MAIL_FROM?.trim() || `Supercreador <${process.env.SMTP_USER!.trim()}>`,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
  return "smtp";
}
