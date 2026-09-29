/*
 * Mini-mock del portafolio del hero (v2 · M4-rev): un dibujo (no un screenshot) en línea limpia, tinta sobre
 * blanco y arena, con sus textos a ≥ 7:1. Para lectores de pantalla es una imagen con su descripción.
 */

const INK = "#0e110b";
const MUTED = "#3f4236";
const SAND = "#efe8dc";

export function PortfolioMock() {
  return (
    <svg
      viewBox="166 20 270 394"
      className="block h-auto w-full"
      role="img"
      aria-label="Ejemplo de portafolio: Valeria Campos, creadora UGC de recetas y fitness, con 6,2 % de Engagement Rate, sus nichos y sus videos."
      data-hero-mock
    >
      <defs>
        <clipPath id="mock-avatar">
          <circle cx="295" cy="146" r="30" />
        </clipPath>
      </defs>
      <rect x="180" y="36" width="250" height="372" rx="24" fill="#e3ddd0" />
      <rect x="170" y="24" width="250" height="372" rx="24" fill="#fff" stroke={INK} strokeWidth="3" />
      <g fill="none" stroke={INK} strokeWidth="2">
        <circle cx="190" cy="46" r="3.5" />
        <circle cx="202" cy="46" r="3.5" />
        <circle cx="214" cy="46" r="3.5" />
      </g>
      <rect x="226" y="38" width="176" height="16" rx="8" fill={SAND} />
      <rect x="182" y="66" width="226" height="78" rx="14" fill={SAND} />
      <circle cx="295" cy="146" r="32" fill="#e5dacb" stroke={INK} strokeWidth="3" />
      <g clipPath="url(#mock-avatar)" fill="#9c9082">
        <circle cx="295" cy="139" r="11" />
        <path d="M271 178q24-30 48 0z" />
      </g>
      <text x="295" y="203" textAnchor="middle" fontSize="17" fontWeight="600" fill={INK}>
        Valeria Campos
      </text>
      <text x="295" y="221" textAnchor="middle" fontSize="11.5" fill={MUTED}>
        Creadora UGC · recetas y fitness
      </text>
      <rect x="245" y="232" width="100" height="26" rx="13" fill="#fff" stroke={INK} strokeWidth="2" />
      <text x="295" y="249.5" textAnchor="middle" fontSize="12.5" fontWeight="600" fill={INK}>
        6,2 % ER
      </text>
      <rect x="196" y="270" width="52" height="22" rx="11" fill={INK} />
      <text x="222" y="285" textAnchor="middle" fontSize="11" fontWeight="600" fill="#f5f5e7">
        Todo
      </text>
      {[
        { x: 254, w: 66, label: "Recetas" },
        { x: 326, w: 62, label: "Fitness" },
      ].map((pill) => (
        <g key={pill.label}>
          <rect x={pill.x} y="270" width={pill.w} height="22" rx="11" fill={SAND} />
          <text x={pill.x + pill.w / 2} y="285" textAnchor="middle" fontSize="11" fontWeight="600" fill={INK}>
            {pill.label}
          </text>
        </g>
      ))}
      {[189, 261, 333].map((x) => (
        <g key={x}>
          <rect x={x} y="306" width="68" height="74" rx="10" fill={SAND} stroke={INK} strokeWidth="2" />
          <circle cx={x + 14} cy="320" r="8" fill="#fff" stroke={INK} strokeWidth="1.5" />
          <path d={`M${x + 11.5} 315.5v9l7-4.5z`} fill={INK} />
        </g>
      ))}
    </svg>
  );
}
