import type { ReactNode } from "react";
import "./electric-word.css";

/*
 * Palabra con electricidad (r3 · 2). Rayo propio en SVG, dibujado a mano (sin imágenes, sin JS): núcleo blanco
 * incandescente, bordes en Brasa (#FC3300) y un glow Brasa difuminado debajo (filtro estático: sus valores nunca
 * se animan), con ramificaciones y chispas. Tres variantes de trazo que se turnan en "strikes": cada una aparece,
 * se dibuja (stroke-dashoffset) mientras se desplaza sobre la palabra y se apaga rápido; la siguiente llega con
 * otro trazo y otro recorrido, a intervalos irregulares (electric-word.css).
 *
 * Overlay absoluto sobre la palabra, ~1,2 em de alto, decorativo (aria-hidden, sin eventos de puntero): no mueve
 * el texto ni lo cambia. Con "reducir movimiento": una sola variante quieta. La palabra no se parte entre líneas.
 * <ElectricWord>superpoderes</ElectricWord>
 */

type Bolt = {
  id: "a" | "b" | "c";
  /** Trazo principal y ramificaciones: se dibujan juntos. pathLength=1 para el efecto de trazado. */
  paths: string[];
  /** Chispas sueltas: [x, y, radio]. */
  sparks: [number, number, number][];
};

// Coordenadas en un lienzo de 380 × 100 (≈ el ancho de la palabra a 1,2 em de alto). Trazos irregulares, con
// quiebres de distinto largo y pequeñas curvas: nada de zigzag geométrico.
const BOLTS: Bolt[] = [
  {
    // A · rayo que baja en zigzag, de arriba a la derecha hacia abajo a la izquierda.
    id: "a",
    paths: [
      "M212 3 L203.5 19.5 Q206.5 22 214 23 L195.5 45.5 Q198.5 48.5 207 48 L183 73.5 Q186.5 76.5 193.5 75.5 L170 97",
      "M199 37.5 Q190.5 40 183 36 L176.5 41.5",
      "M188.5 63.5 L178.5 66 Q174 70.5 168 69",
    ],
    sparks: [
      [222, 13, 2.2],
      [161, 58, 1.8],
      [205, 87, 1.6],
    ],
  },
  {
    // B · arco horizontal que chisporrotea, con saltos verticales cortos.
    id: "b",
    paths: [
      "M128 52 Q137.5 44.5 146 47 L158.5 36 Q161 43.5 168.5 44 L181 30 L187.5 49.5 Q194 46 201.5 50 L214 38 Q216.5 47 224.5 51 L238 42 L251 55.5",
      "M181 30 Q184.5 22 190 18.5 L196.5 11",
      "M214 38 L221.5 30.5 Q228 29 231 24",
    ],
    sparks: [
      [133.5, 40, 1.8],
      [246.5, 36, 2.1],
      [199, 62.5, 1.6],
    ],
  },
  {
    // C · rayo con horquilla que sube de abajo a la izquierda hacia arriba a la derecha.
    id: "c",
    paths: [
      "M158 97 Q162.5 90 167 84 L176.5 66 Q171 64.5 165.5 64 L188.5 42 Q183.5 40.5 179 40 L204.5 17 Q207.5 11 212.5 5",
      "M176.5 66 L191 70.5 Q197 76 203.5 77",
      "M188.5 42 Q196 44.5 203 40 L214.5 44.5",
      "M204.5 17 L218.5 22",
    ],
    sparks: [
      [150, 82.5, 1.7],
      [223.5, 11.5, 2.2],
      [211, 52.5, 1.5],
    ],
  },
];

export function ElectricWord({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`electric-word relative inline-block whitespace-nowrap text-ink ${className}`} data-electric>
      {children}
      <svg className="electric-bolts" viewBox="0 0 380 100" aria-hidden="true" focusable="false">
        <defs>
          {/* Glow: un trazo ancho difuminado debajo del rayo. El filtro es estático (no se anima). */}
          <filter id="electric-glow" x="-30%" y="-40%" width="160%" height="180%">
            <feGaussianBlur stdDeviation="3.4" />
          </filter>
        </defs>
        {BOLTS.map((bolt) => (
          <g key={bolt.id} className={`bolt bolt--${bolt.id}`}>
            <g className="bolt__glow" filter="url(#electric-glow)">
              {bolt.paths.map((d) => (
                <path key={d} d={d} pathLength={1} />
              ))}
            </g>
            <g className="bolt__edge">
              {bolt.paths.map((d) => (
                <path key={d} d={d} pathLength={1} />
              ))}
            </g>
            <g className="bolt__core">
              {bolt.paths.map((d) => (
                <path key={d} d={d} pathLength={1} />
              ))}
            </g>
            <g className="bolt__sparks">
              {bolt.sparks.map(([cx, cy, r]) => (
                <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
              ))}
            </g>
          </g>
        ))}
      </svg>
    </span>
  );
}
