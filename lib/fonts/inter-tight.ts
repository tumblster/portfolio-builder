import { Inter_Tight } from "next/font/google";

/*
 * Inter Tight SemiBold (r3 · 3): titulares. En la landing, el H1 (salvo "superpoderes", que va en TMJ); en /crear,
 * sus títulos. Un solo peso (600). Combina con TMJ y tiene una altura de x parecida (0,55 em contra 0,57 em).
 */
export const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: "600",
  display: "swap",
  variable: "--font-inter-tight",
});
