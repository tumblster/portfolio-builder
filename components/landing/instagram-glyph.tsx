import "./instagram-logo.css";

/*
 * Logo oficial de Instagram (r3 · 1): el wordmark (PNG de Wikimedia, 296 × 84 px, 2,8 KB, fondo transparente)
 * en lugar de la palabra "Instagram" en el texto, en las mismas posiciones que el glyph anterior. Va como fondo
 * CSS de un span con role="img": para lectores de pantalla dice "Instagram", así la frase se entiende igual.
 */
export function InstagramGlyph() {
  return <span role="img" aria-label="Instagram" className="instagram-logo" data-instagram-logo />;
}
