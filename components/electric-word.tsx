import type { ReactNode } from "react";
import "./electric-word.css";

/*
 * Electricidad sobre una palabra (ajuste 1). Pensado para sentirse como una descarga real, no como un dibujo:
 * - Cada arco es un rayo generado por desplazamiento de punto medio (el algoritmo clásico del relámpago): fino,
 *   quebrado a todas las escalas, con ramificaciones cortas. Arcos por encima de las letras, envolviendo los extremos
 *   de la palabra y por debajo; ninguno es un óvalo.
 * - 7 fotogramas, cada uno con arcos y dentado distintos. Se encienden en ráfagas cortas e irregulares (30–90 ms) con
 *   pausas de oscuridad: la descarga "tartamudea" como un arco de verdad. Un resplandor ambiente late con las ráfagas.
 * - Brasa #FC3300 con núcleo incandescente y glow. Grosor fijo en píxeles (non-scaling-stroke): fino a cualquier tamaño.
 * Todo sale de una semilla fija: se genera igual en el servidor y en cada visita. Solo SVG + CSS (se anima solo la
 * opacidad de capas ya dibujadas), sin JS en el navegador ni imágenes. Decorativo (aria-hidden, sin eventos de
 * puntero). Con "reducir movimiento": un fotograma quieto.
 */

type Point = [number, number];

/** PRNG determinista (mulberry32). */
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rayo de a → b: curva base (combada `bulge`) y desplazamiento de punto medio perpendicular, en `depth` pasadas. */
function bolt(a: Point, b: Point, bulge: number, rnd: () => number, depth = 3, rough = 0.34): Point[] {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const nx = -(b[1] - a[1]) / length;
  const ny = (b[0] - a[0]) / length;
  const control: Point = [(a[0] + b[0]) / 2 + nx * bulge, (a[1] + b[1]) / 2 + ny * bulge];
  let points: Point[] = [0, 0.25, 0.5, 0.75, 1].map((t) => [
    (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * control[0] + t * t * b[0],
    (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * control[1] + t * t * b[1],
  ]);
  for (let pass = 0; pass < depth; pass += 1) {
    const next: Point[] = [points[0]];
    for (let i = 0; i < points.length - 1; i += 1) {
      const [p, q] = [points[i], points[i + 1]];
      const seg = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      const offset = (rnd() - 0.5) * seg * rough * 2;
      next.push([(p[0] + q[0]) / 2 + (-(q[1] - p[1]) / seg) * offset, (p[1] + q[1]) / 2 + ((q[0] - p[0]) / seg) * offset], q);
    }
    points = next;
  }
  return points;
}

const toPath = (points: Point[]) => points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");

/** Ramificaciones: rayitos cortos que salen del arco hacia afuera de la palabra. */
function branches(points: Point[], rnd: () => number, count: number, away: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const from = points[4 + Math.floor(rnd() * (points.length - 8))];
    const angle = (rnd() - 0.5) * 1.6 + (away > 0 ? Math.PI / 2 : -Math.PI / 2);
    const len = 9 + rnd() * 16;
    const to: Point = [from[0] + Math.cos(angle) * len * (rnd() > 0.5 ? 1 : -1), from[1] + Math.sin(angle) * len];
    out.push(toPath(bolt(from, to, (rnd() - 0.5) * 6, rnd, 2, 0.45)));
  }
  return out;
}

// Lienzo 460 × 150 sobre la palabra (~400 de ancho): línea base ≈ 100, altura de x ≈ 55, ascendentes ≈ 36.
const TOP_X = [44, 92, 140, 186, 232, 278, 326, 372, 418];
const FRAMES = 7;

function frame(index: number): string[] {
  const rnd = random(0x5eed + index * 7919);
  const paths: string[] = [];
  const pick = () => Math.floor(rnd() * (TOP_X.length - 2));
  // 2–3 arcos por encima: saltan de la punta de una letra a otra, bien combados hacia arriba.
  for (let k = 0, n = 2 + Math.floor(rnd() * 2); k < n; k += 1) {
    const i = pick();
    const j = Math.min(TOP_X.length - 1, i + 2 + Math.floor(rnd() * 3));
    const a: Point = [TOP_X[i] + (rnd() - 0.5) * 10, 44 + rnd() * 10];
    const b: Point = [TOP_X[j] + (rnd() - 0.5) * 10, 42 + rnd() * 12];
    const main = bolt(a, b, -(34 + rnd() * 30), rnd);
    paths.push(toPath(main), ...branches(main, rnd, 1 + Math.floor(rnd() * 2), -1));
  }
  // Siempre un arco que envuelve un extremo de la palabra (izquierda o derecha)…
  if (rnd() < 0.5) {
    const main = bolt([56 + rnd() * 8, 36 + rnd() * 8], [44 + rnd() * 10, 114 + rnd() * 8], -(30 + rnd() * 18), rnd);
    paths.push(toPath(main), ...branches(main, rnd, 1, -1));
  } else {
    const main = bolt([402 + rnd() * 10, 38 + rnd() * 8], [418 + rnd() * 10, 112 + rnd() * 8], 30 + rnd() * 18, rnd);
    paths.push(toPath(main), ...branches(main, rnd, 1, 1));
  }
  // …y a veces otro por debajo.
  if (rnd() < 0.5) {
    const i = pick();
    const main = bolt([TOP_X[i], 112 + rnd() * 6], [TOP_X[Math.min(TOP_X.length - 1, i + 3)], 114 + rnd() * 6], 18 + rnd() * 14, rnd);
    paths.push(toPath(main), ...branches(main, rnd, 1, 1));
  }
  // A veces, un chispazo corto que cruza entre dos letras.
  if (rnd() < 0.45) {
    const x = TOP_X[1 + Math.floor(rnd() * (TOP_X.length - 3))] + 20;
    paths.push(toPath(bolt([x, 46 + rnd() * 6], [x + (rnd() - 0.5) * 18, 72 + rnd() * 10], (rnd() - 0.5) * 8, rnd, 2, 0.5)));
  }
  return paths;
}

const ARC_FRAMES = Array.from({ length: FRAMES }, (_, index) => frame(index));

/*
 * Ritmo de la descarga (ms dentro de un ciclo de 2,1 s): [fotograma, inicio, duración]. Ráfagas cortas y huecos
 * de distinto largo: nunca un parpadeo mecánico.
 */
const CYCLE_MS = 2100;
const BURSTS: [number, number, number][] = [
  [0, 0, 70], [1, 70, 40], [2, 150, 90], [0, 240, 30], [3, 380, 60], [4, 440, 80], [5, 690, 50], [1, 740, 70],
  [6, 810, 40], [2, 1010, 60], [3, 1070, 90], [4, 1160, 40], [6, 1420, 70], [5, 1490, 60], [0, 1550, 50],
  [1, 1830, 80], [3, 1910, 50],
];
const pct = (ms: number) => `${((ms / CYCLE_MS) * 100).toFixed(2)}%`;

function keyframes(): string {
  const frames = Array.from({ length: FRAMES }, (_, index) => {
    const windows = BURSTS.filter(([f]) => f === index).map(([, start, duration]) => [start, start + duration]);
    const steps = [`0%{opacity:${windows.some(([s]) => s === 0) ? 1 : 0}}`];
    for (const [start, end] of windows) {
      if (start > 0) steps.push(`${pct(start)}{opacity:1}`);
      steps.push(`${pct(end)}{opacity:0}`);
    }
    return `@keyframes arc-f${index}{${steps.join("")}100%{opacity:0}}`;
  });
  // El resplandor ambiente sube con cada ráfaga y cae en los huecos.
  const glow = ["0%{opacity:.6}", ...BURSTS.flatMap(([, s, d]) => [`${pct(s)}{opacity:.6}`, `${pct(s + d)}{opacity:.22}`])];
  return `@media (prefers-reduced-motion:no-preference){${frames.join("")}@keyframes arc-glow{${glow.join("")}100%{opacity:.22}}${Array.from(
    { length: FRAMES },
    (_, i) => `.electric-arcs__frame--${i}{animation:arc-f${i} ${CYCLE_MS}ms steps(1,end) infinite}`,
  ).join("")}.electric-glow{animation:arc-glow ${CYCLE_MS}ms steps(1,end) infinite}}`;
}
const KEYFRAMES = keyframes();

export function ElectricWord({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`electric-word relative inline-block whitespace-nowrap text-ink ${className}`} data-electric>
      {children}
      <span className="electric-glow" aria-hidden="true" />
      {ARC_FRAMES.map((paths, index) => (
        <svg
          key={index}
          className={`electric-arcs__frame electric-arcs__frame--${index}`}
          viewBox="0 0 460 150"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <filter id={`arc-glow-${index}`} x="-10%" y="-20%" width="120%" height="140%">
              <feGaussianBlur stdDeviation="2.4" />
            </filter>
          </defs>
          <g className="electric-arcs__glow" filter={`url(#arc-glow-${index})`}>
            {paths.map((d) => (
              <path key={d} d={d} vectorEffect="non-scaling-stroke" />
            ))}
          </g>
          <g className="electric-arcs__bolt">
            {paths.map((d) => (
              <path key={d} d={d} vectorEffect="non-scaling-stroke" />
            ))}
          </g>
          <g className="electric-arcs__core">
            {paths.map((d) => (
              <path key={d} d={d} vectorEffect="non-scaling-stroke" />
            ))}
          </g>
        </svg>
      ))}
      {/* React 19 sube este <style> al <head> (y no lo repite): el titular queda solo con su texto. */}
      <style href="electric-word-arcs" precedence="default">
        {KEYFRAMES}
      </style>
    </span>
  );
}
