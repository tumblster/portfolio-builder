import type { ReactNode } from "react";
import "./phone-frame.css";

/*
 * Parte 2 · 3: la vista previa del editor dentro de un marco de teléfono fijo en pantallas anchas (390 px de pantalla,
 * borde y radio de dispositivo, alto definido y scroll interno). En pantallas angostas ocupa el ancho disponible, sin
 * marco. Adentro va la página real (los mismos componentes), no una imagen.
 */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="phone-frame" data-phone-frame>
      <div className="phone-frame__screen">{children}</div>
    </div>
  );
}
