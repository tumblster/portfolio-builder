import { NICHE_LABELS, type Niche } from "@/lib/portfolio/niches";

/** El color sale del acento del nicho (data-niche en globals.css). */
export function NicheChip({ niche }: { niche: Niche }) {
  return (
    <span
      data-niche={niche}
      className="shrink-0 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-xs text-accent"
    >
      {NICHE_LABELS[niche]}
    </span>
  );
}
