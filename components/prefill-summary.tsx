"use client";

import { useId } from "react";
import type { ManualPrefill } from "@/lib/import/events";
import { Avatar } from "./avatar";
import { PieceRow } from "./piece-row";
import { ShowMoreButton, useShowMore } from "./show-more";

/**
 * Lo que ya encontramos (Instagram o Canva) y llegará lleno al formulario manual.
 * Ronda 15 · D1: la lista muestra las primeras 6 piezas y "Ver más" despliega el resto; el conteo total se mantiene.
 */
export function PrefillSummary({ prefill }: { prefill: ManualPrefill }) {
  const count = prefill.pieces.length;
  const listId = useId();
  const more = useShowMore(count);
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
        <>
          <ul id={listId} className="mt-2">
            {prefill.pieces.slice(0, more.limit).map((piece, index) => (
              <PieceRow
                key={`${index}-${piece.image.url}`}
                title={piece.title}
                image={piece.image}
                isVideo={piece.videoUrl !== null}
              />
            ))}
          </ul>
          {more.hasMore && (
            <div className="mt-2">
              <ShowMoreButton
                expanded={more.expanded}
                hidden={more.hidden}
                onToggle={() => more.setExpanded((value) => !value)}
                controls={listId}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
