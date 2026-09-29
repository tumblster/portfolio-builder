import type { SVGProps } from "react";
import type { ContactLink } from "@/lib/portfolio/contact-links";
import type { VideoLink } from "@/lib/portfolio/schema";

/* Íconos simples y propios (trazos de 1,8 px, 24×24). Decorativos: siempre van con texto al lado. */

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...props }: IconProps) {
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

export const InstagramIcon = (props: IconProps) => (
  <Svg {...props}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
    <circle cx="12" cy="12" r="3.8" />
    <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" stroke="none" />
  </Svg>
);

export const TikTokIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M13.5 4v10.6a3.4 3.4 0 1 1-3.4-3.4" />
    <path d="M13.5 4c.4 2.6 2.3 4.4 5 4.6" />
  </Svg>
);

export const YouTubeIcon = (props: IconProps) => (
  <Svg {...props}>
    <rect x="2.8" y="5.5" width="18.4" height="13" rx="4" />
    <path d="M10.4 9.6v4.8l4-2.4z" fill="currentColor" stroke="none" />
  </Svg>
);

export const WhatsAppIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4.5 19.5l1.1-3.6A7.8 7.8 0 1 1 8.4 18.6z" />
    <path d="M9.3 9.2c.3 2 1.7 3.5 3.7 4.1l1-1 1.6.7-.3 1.4c-2.9.3-6.6-2.9-6.9-6l1.3-.5.8 1.5z" fill="currentColor" stroke="none" />
  </Svg>
);

export const MailIcon = (props: IconProps) => (
  <Svg {...props}>
    <rect x="3.5" y="5.5" width="17" height="13" rx="3" />
    <path d="M4.5 7.5l7.5 5.5 7.5-5.5" />
  </Svg>
);

export const GlobeIcon = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.4 2.6 3.5 5.4 3.5 8.5s-1.1 5.9-3.5 8.5c-2.4-2.6-3.5-5.4-3.5-8.5S9.6 6.1 12 3.5z" />
  </Svg>
);

export const PlayIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" width={props.size ?? 18} height={props.size ?? 18} aria-hidden="true" focusable="false">
    <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
  </svg>
);

export const ArrowIcon = ({ direction, ...props }: IconProps & { direction: "left" | "right" }) => (
  <Svg {...props}>{direction === "left" ? <path d="M19 12H5m6-6l-6 6 6 6" /> : <path d="M5 12h14m-6-6l6 6-6 6" />}</Svg>
);

export const PLATFORM_LABEL: Record<VideoLink["platform"], string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
};

export function PlatformIcon({ platform, ...props }: IconProps & { platform: VideoLink["platform"] }) {
  if (platform === "tiktok") return <TikTokIcon {...props} />;
  if (platform === "youtube") return <YouTubeIcon {...props} />;
  return <InstagramIcon {...props} />;
}

export function ContactIcon({ kind, ...props }: IconProps & { kind: ContactLink["kind"] }) {
  switch (kind) {
    case "whatsapp":
      return <WhatsAppIcon {...props} />;
    case "email":
      return <MailIcon {...props} />;
    case "instagram":
      return <InstagramIcon {...props} />;
    case "tiktok":
      return <TikTokIcon {...props} />;
    case "youtube":
      return <YouTubeIcon {...props} />;
    case "website":
      return <GlobeIcon {...props} />;
  }
}
