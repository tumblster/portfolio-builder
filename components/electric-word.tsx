import type { ReactNode } from "react";
import "./electric-word.css";

/*
 * Palabra con electricidad sutil (v2 · M4-rev): chispitas dibujadas a mano en la tinta del sistema en las
 * esquinas de arriba de la palabra (un rayito y un estallido de tres trazos), que parpadean cada tanto. Decorativas (aria-hidden): el texto se lee igual sin ellas.
 * La palabra no se parte entre líneas. <ElectricWord>superpoderes</ElectricWord>
 */
const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function ElectricWord({ children }: { children: ReactNode }) {
  return (
    <span className="relative inline-block whitespace-nowrap text-ink" data-electric>
      {children}
      <svg viewBox="0 0 12 17" className="electric-spark electric-spark--a" aria-hidden="true" focusable="false">
        <path {...stroke} d="M7.5 1.2 3.4 7.6l4.4-.3-3.6 8" />
      </svg>
      <svg viewBox="0 0 16 16" className="electric-spark electric-spark--b" aria-hidden="true" focusable="false">
        <path {...stroke} d="M2.2 13.6l3.6-3.3M8.4 1.6l-.3 5M14.1 5.2l-3.9 2.6" />
      </svg>
    </span>
  );
}
