/** Etiqueta del nicho de una pieza. Los nichos son propios de cada portafolio: un solo estilo neutro. */
export function NicheChip({ label }: { label: string }) {
  return (
    <span className="max-w-[10rem] shrink-0 truncate rounded-full border border-lilac/40 bg-lilac/10 px-2.5 py-0.5 text-xs text-lilac">
      {label}
    </span>
  );
}
