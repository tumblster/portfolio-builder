"use client";

import { useEffect, useRef, useState, type SVGProps } from "react";
import { showToast } from "@/components/ui/toast";
import { shareMessage, whatsappUrl, type Gender } from "@/lib/portfolio/gender";
import { InstagramIcon, TikTokIcon, WhatsAppIcon } from "./icons";

/*
 * E2 del dueño (#9): compartir sutil. Un icono de share que abre una cápsula con WhatsApp, X, Instagram, TikTok y
 * copiar link. WhatsApp y X usan intents web; Instagram y TikTok no tienen intent web, así que copian el link
 * (con toast que dice dónde pegarlo). Reemplaza al botón "Compartir por WhatsApp" a todo ancho.
 */

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 18, children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

const ShareIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 14.5V4m0 0L8 8m4-4l4 4" />
    <path d="M5.5 12.5v6a2.5 2.5 0 0 0 2.5 2.5h8a2.5 2.5 0 0 0 2.5-2.5v-6" />
  </Svg>
);

const XIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" width={props.size ?? 18} height={props.size ?? 18} aria-hidden="true" focusable="false">
    <path
      d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3l-4.9-6.4L6.4 22H3.3l7.3-8.3L1.6 2H8l4.4 5.9L18.9 2zm-1.1 17.8h1.7L7.1 3.9H5.3l12.5 16z"
      fill="currentColor"
    />
  </svg>
);

const CopyIcon = (props: IconProps) => (
  <Svg {...props}>
    <rect x="9" y="9" width="11" height="11" rx="2.5" />
    <path d="M5.5 15v-8.5a2 2 0 0 1 2-2H16" />
  </Svg>
);

type Props = {
  /** /p/<slug> */
  basePath: string;
  gender: Gender | null;
  hash?: string;
  tag?: string;
};

export function ShareMenu({ basePath, gender, hash = "", tag = "share" }: Props) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  /** La URL completa solo existe en el navegador: se calcula al abrir el menú o al copiar, nunca en el render. */
  function pageUrl() {
    if (url) return url;
    const full = `${window.location.origin}${basePath}?ref=${encodeURIComponent(tag)}${hash}`;
    setUrl(full);
    return full;
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onTap = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onTap);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onTap);
    };
  }, [open ]);

  async function copyLink(notice: string) {
    const link = pageUrl();
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const area = document.createElement("textarea");
      area.value = link;
      document.body.append(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setOpen(false);
    showToast(notice);
  }

  function toggle() {
    pageUrl();
    setOpen((value) => !value);
  }

  const message = shareMessage(gender, url);
  const itemClass = "share-menu__item";

  return (
    <div ref={rootRef} className="share-menu">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Compartir portafolio"
        className="share-menu__trigger"
        data-pf-share
      >
        <ShareIcon size={20} />
      </button>
      {open && (
        <div role="menu" aria-label="Compartir portafolio" className="share-menu__pop">
          <a
            role="menuitem"
            className={itemClass}
            href={whatsappUrl(null, message)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
          >
            <WhatsAppIcon size={18} />
            WhatsApp
          </a>
          <a
            role="menuitem"
            className={itemClass}
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
          >
            <XIcon size={18} />
            X
          </a>
          <button type="button" role="menuitem" className={itemClass} onClick={() => copyLink("Link copiado — pégalo en tu publicación de Instagram.")}>
            <InstagramIcon size={18} />
            Instagram
          </button>
          <button type="button" role="menuitem" className={itemClass} onClick={() => copyLink("Link copiado — pégalo en tu video de TikTok.")}>
            <TikTokIcon size={18} />
            TikTok
          </button>
          <button type="button" role="menuitem" className={itemClass} onClick={() => copyLink("Link copiado.")}>
            <CopyIcon size={18} />
            Copiar link
          </button>
        </div>
      )}
    </div>
  );
}
