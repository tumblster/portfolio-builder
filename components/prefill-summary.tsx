import type { ManualPrefill } from "@/lib/import/events";
import { Avatar } from "./avatar";
import { PieceRow } from "./piece-row";

/** Lo que ya encontramos en Instagram y llegará lleno al formulario manual. */
export function PrefillSummary({ prefill }: { prefill: ManualPrefill }) {
  const count = prefill.pieces.length;
  return (
    <div className="mt-5">
      <div className="flex items-center gap-4">
        <Avatar photo={prefill.photo} name={prefill.name} />
        <div className="min-w-0">
          <p className="truncate text-lg">{prefill.name}</p>
          <p className="truncate text-sm text-muted">@{prefill.username}</p>
        </div>
      </div>
      {prefill.bio && <p className="mt-4 text-sm whitespace-pre-line text-muted">{prefill.bio}</p>}
      <p className="mt-4 text-sm">
        {count === 0
          ? "Sin publicaciones para usar: agregarás las piezas a mano."
          : `${count} ${count === 1 ? "publicación lista" : "publicaciones listas"} para usar como pieza.`}
      </p>
      {count > 0 && (
        <ul className="mt-2">
          {prefill.pieces.map((piece) => (
            <PieceRow key={piece.image.url} title={piece.title} image={piece.image} isVideo={piece.videoUrl !== null} />
          ))}
        </ul>
      )}
    </div>
  );
}
