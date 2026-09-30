import type { ReactNode } from "react";
import "./electric-word.css";

/*
 * Palabra con electricidad (ronda 30/09 · 8.2), fiel a la referencia del dueño: arcos eléctricos finos que envuelven
 * las letras (tres lazos alrededor de "sup", "erpo" y "deres", con hebras finas que los cruzan), con glow y flicker.
 * - Bordes dentados: filtro de turbulencia (feTurbulence → feDisplacementMap) sobre los trazos.
 * - Flicker irregular: la misma forma en 3 capas, cada una con OTRA semilla de turbulencia (otro dentado); se turnan
 *   con opacidad en pasos irregulares (electric-word.css), así la electricidad "se mueve" sin animar ningún filtro.
 * - Glow: un trazo ancho difuminado debajo, estático, que solo baja y sube su opacidad.
 * Solo SVG + CSS: sin imágenes ni JS. Overlay absoluto sobre la palabra (aria-hidden, sin eventos de puntero): no
 * mueve ni cambia el texto. Con "reducir movimiento": una capa, quieta. La palabra no se parte entre líneas.
 * <ElectricWord>superpoderes</ElectricWord>
 */

// Lienzo de 460 × 140 sobre una palabra de ~400 de ancho: línea base en y ≈ 96, altura de x en y ≈ 46.
const LOOPS = [
  // "sup"
  "M22 104C13 72 36 36 70 30 104 25 129 45 131 72 133 101 112 124 79 124 49 124 29 116 22 104Z",
  // "erpo"
  "M117 62C125 31 169 17 210 22 247 26 263 52 258 85 254 112 222 127 183 124 145 122 111 104 117 62Z",
  // "deres"
  "M250 79C244 42 290 19 341 22 393 25 437 47 440 79 444 109 404 127 351 126 299 126 256 112 250 79Z",
];
const THREADS = [
  "M40 129C80 101 110 61 151 33",
  "M236 29C271 60 300 101 331 129",
  "M330 18C361 50 392 90 453 97",
  "M6 91C15 83 20 97 31 88",
];
const LAYERS = [
  { n: 1, seed: 3, scale: 7 },
  { n: 2, seed: 8, scale: 8 },
  { n: 3, seed: 14, scale: 6 },
] as const;

function Jitter({ id, seed, scale, blur }: { id: string; seed: number; scale: number; blur?: number }) {
  return (
    <filter id={id} x="-10%" y="-25%" width="120%" height="150%">
      <feTurbulence type="turbulence" baseFrequency="0.035 0.07" numOctaves={2} seed={seed} result="noise" />
      <feDisplacementMap in="SourceGraphic" in2="noise" scale={scale} xChannelSelector="R" yChannelSelector="G" result="jagged" />
      {blur ? <feGaussianBlur in="jagged" stdDeviation={blur} /> : null}
    </filter>
  );
}

export function ElectricWord({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`electric-word relative inline-block whitespace-nowrap text-ink ${className}`} data-electric>
      {children}
      <svg className="electric-arcs electric-arcs--glow" viewBox="0 0 460 140" aria-hidden="true" focusable="false">
        <defs>
          <Jitter id="arcs-glow" seed={3} scale={7} blur={3.2} />
        </defs>
        <g filter="url(#arcs-glow)" className="arcs-glow">
          {[...LOOPS, ...THREADS].map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
      </svg>
      {LAYERS.map(({ n, seed, scale }) => (
        <svg key={n} className={`electric-arcs electric-arcs--${n}`} viewBox="0 0 460 140" aria-hidden="true" focusable="false">
          <defs>
            <Jitter id={`arcs-jitter-${n}`} seed={seed} scale={scale} />
          </defs>
          <g filter={`url(#arcs-jitter-${n})`}>
            <g className="arcs-ribbon">
              {LOOPS.map((d) => (
                <path key={d} d={d} />
              ))}
            </g>
            <g className="arcs-thread">
              {THREADS.map((d) => (
                <path key={d} d={d} />
              ))}
            </g>
            <g className="arcs-core">
              {LOOPS.map((d) => (
                <path key={d} d={d} />
              ))}
            </g>
          </g>
        </svg>
      ))}
    </span>
  );
}
