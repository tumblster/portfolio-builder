import Image from "next/image";
import type { Niche } from "@/lib/portfolio/niches";
import type { StoredImage } from "@/lib/portfolio/schema";
import { NicheChip } from "./niche-chip";

type PieceRowProps = {
  title: string;
  image: StoredImage | null;
  isVideo: boolean;
  niche?: Niche | null;
};

/** Una pieza por fila (§7.5: una sola columna en móvil). */
export function PieceRow({ title, image, isVideo, niche }: PieceRowProps) {
  return (
    <li className="flex min-h-tap items-center gap-3 border-b border-line py-3 last:border-b-0">
      {image ? (
        <Image src={image.url} alt="" width={48} height={48} className="size-12 shrink-0 rounded-lg object-cover" />
      ) : (
        <span aria-hidden="true" className="size-12 shrink-0 rounded-lg bg-ink" />
      )}
      <span className="line-clamp-2 min-w-0 flex-1 break-words">{title}</span>
      {isVideo && <span className="shrink-0 text-xs text-muted">video</span>}
      {niche && <NicheChip niche={niche} />}
    </li>
  );
}
