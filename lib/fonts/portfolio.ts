import { DM_Sans } from "next/font/google";

/*
 * Única familia de la página pública (plantilla Creator, lenguaje Starlet): DM Sans
 * variable, un solo archivo para todos los pesos. Se precarga: es la del titular.
 */
export const dmSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-dm-sans",
});
