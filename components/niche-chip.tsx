/** Etiqueta del nicho de una pieza. Los nichos son propios de cada portafolio: un solo estilo neutro. */
export function NicheChip({ label }: { label: string }) {
  return (
    <span className="max-w-[10rem] shrink-0 truncate rounded-full border border-ink bg-highlight px-2.5 py-0.5 text-xs text-success">
      {label}
    </span>
  );
}
