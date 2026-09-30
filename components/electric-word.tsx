import type { ReactNode } from "react";
import "./electric-word.css";

/*
 * Palabra con electricidad (v2 · M4-rev r2, B2): rayos dentados dibujados a mano, estilo cartoon, en las esquinas
 * de arriba de la palabra, con un glow sutil del acento. Casi siempre tenues y quietos; cada 4–6 s uno se
 * "descarga": se dibuja de nuevo (stroke-dashoffset) con un flash de opacidad (~600 ms). Van en position:
 * absolute dentro del titular y son decorativos (aria-hidden, sin eventos): no mueven nada ni cambian el texto.
 * La palabra no se parte entre líneas. <ElectricWord>superpoderes</ElectricWord>
 */

/** Cada rayo: su caja (en em, relativa a la palabra), su trazo y su ritmo. pathLength=1 para dibujarlo entero. */
const BOLTS = [
  // Esquina izquierda: el rayo grande (zigzag de cuatro quiebres) y una chispa corta a su lado.
  { className: "electric-bolt--a", viewBox: "0 0 20 30", d: "M14.5 1.5 8.2 10.8l6.1.4-8.9 9.6 4.8-.2L2.3 28.6" },
  { className: "electric-bolt--b", viewBox: "0 0 14 12", d: "M12.6 1.6 8 5.2l2.6 1.3-8.9 4.1" },
  // Esquina derecha: el rayo grande, espejado y más quebrado, y un estallido de dos trazos.
  { className: "electric-bolt--c", viewBox: "0 0 22 30", d: "M4.6 1.8l6.5 8.1-5.6 1.2 9.8 7.9-4.6.9 9.2 8.4" },
  { className: "electric-bolt--d", viewBox: "0 0 14 14", d: "M2 12.2l4.1-4.6-2.4-.8 6.4-5.1M9.6 11.4l2.8-1.9" },
] as const;

export function ElectricWord({ children }: { children: ReactNode }) {
  return (
    <span className="relative inline-block whitespace-nowrap text-ink" data-electric>
      {children}
      {BOLTS.map((bolt) => (
        <svg key={bolt.className} viewBox={bolt.viewBox} className={`electric-bolt ${bolt.className}`} aria-hidden="true" focusable="false">
          <path d={bolt.d} pathLength={1} />
        </svg>
      ))}
    </span>
  );
}
