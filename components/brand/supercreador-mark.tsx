import { CHISPA_SMILE } from "@/components/mascot/chispa";

/*
 * La marca de Supercreador: la sonrisa de Chispa, nada más. Es la boca de la expresión "carcajada" (la del hero),
 * con el mismo path (CHISPA_SMILE, el mismo dato que dibuja la cara), la misma tinta y el mismo grosor de trazo:
 * sin ojos, sin nariz, sin rellenos de color. Monocromo: toma el color del texto (en el sitio, la tinta).
 *
 * Tamaños: header 28–32 px de alto (se usa a 30); favicon 16/32 px (app/icon.svg, con el interior simplificado
 * a 3 líneas de diente para que se lea a 16 px); avatar social 180 px (app/apple-icon.png). Espacio de seguridad mínimo alrededor de la marca: la
 * altura de un diente (MARK_CLEARANCE, el diente central), a la escala en que se use.
 */

/** Caja exacta de la sonrisa en el lienzo de la mascota (x, y, ancho, alto). */
export const MARK_BOX = { x: 66.1, y: 135.8, width: 198.3, height: 109.9 };
/** Espacio de seguridad: la altura del diente central, en las mismas unidades (≈ 49 % del alto de la marca). */
export const MARK_CLEARANCE = 54;

/**
 * `mascotTarget`: marca este mark como el punto donde aterriza la carita viajera de la landing
 * (components/mascot/mascot-traveler.tsx). La cara se alinea con él usando MARK_BOX.
 */
export function SupercreadorMark({ className, mascotTarget = false }: { className?: string; mascotTarget?: boolean }) {
  return (
    <svg
      viewBox={`${MARK_BOX.x} ${MARK_BOX.y} ${MARK_BOX.width} ${MARK_BOX.height}`}
      className={className}
      fill="currentColor"
      fillRule="evenodd"
      aria-hidden="true"
      data-brand-mark
      data-mascot-target={mascotTarget ? "" : undefined}
    >
      <path d={CHISPA_SMILE} />
    </svg>
  );
}
