/*
 * Glyph de Instagram (B4): solo la cámara redondeada, sin el nombre. Reemplaza la palabra "Instagram" en el
 * texto: mide ~1 em, se apoya en la línea de base y toma el color del texto. Para lectores de pantalla dice
 * "Instagram" (aria-label), así la frase se sigue entendiendo igual.
 */
export function InstagramGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      role="img"
      aria-label="Instagram"
      className="mx-[0.06em] inline-block h-[0.92em] w-[0.92em] align-baseline"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.1}
      data-instagram-glyph
    >
      <rect x="2.6" y="2.6" width="18.8" height="18.8" rx="5.4" />
      <circle cx="12" cy="12" r="4.4" />
      <circle cx="17.35" cy="6.65" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}
