import type { Contact } from "./schema";

/*
 * Convierte el contacto guardado en links listos para la página pública.
 * Orden: primero los canales directos (WhatsApp, correo), luego redes y web.
 * Solo salen links https o mailto: nada de "javascript:" aunque un dato venga raro.
 */

export type ContactLink = { kind: keyof Contact; label: string; href: string; external: boolean };

const ORDER: (keyof Contact)[] = ["whatsapp", "email", "instagram", "tiktok", "youtube", "website"];

/** "https://www.linktr.ee/valen.ugc/" → "linktr.ee/valen.ugc" */
function readableUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.hostname.replace(/^www\./, "")}${url.pathname}`.replace(/\/+$/, "");
  } catch {
    return value;
  }
}

function toLink(kind: keyof Contact, value: string): ContactLink {
  switch (kind) {
    case "whatsapp":
      return { kind, label: "WhatsApp", href: `https://wa.me/${value.replace(/\D/g, "")}`, external: true };
    case "email":
      return { kind, label: value, href: `mailto:${value}`, external: false };
    case "instagram":
      return { kind, label: "Instagram", href: `https://www.instagram.com/${value}/`, external: true };
    case "tiktok":
      return { kind, label: "TikTok", href: `https://www.tiktok.com/@${value}`, external: true };
    case "youtube":
      return { kind, label: "YouTube", href: value, external: true };
    case "website":
      return { kind, label: readableUrl(value), href: value, external: true };
  }
}

export function contactLinks(contact: Partial<Record<keyof Contact, string>>): ContactLink[] {
  return ORDER.flatMap((kind) => {
    const value = contact[kind]?.trim();
    if (!value) return [];
    const link = toLink(kind, value);
    return /^(https:|http:|mailto:)/i.test(link.href) ? [link] : [];
  });
}
