/*
 * Importador de Canva v2 · R8: nombre de fuente de Canva → fuente de Google Fonts.
 *
 * - Si el nombre está en el catálogo (fuentes de Google Fonts verificadas), se carga ESA
fuente.
 * - Si no, se busca su equivalente curado (The Seasons → Cormorant Garamond, Howell
→ Dancing Script, …).
 * - Si tampoco, se intenta cargar el nombre tal cual desde Google Fonts ("unverified"): si no
existe,
 * el navegador cae a la familia genérica del rol, sin romper nada.
 *
 * Cada familia va en su propia hoja: el endpoint css2 de Google responde 400 a TODO el
pedido si una
 * sola familia no existe. Para ampliar la tabla, agregá filas a GOOGLE_FONTS o
EQUIVALENTS.
 * Archivo puro: lo usan el parser (para reconocer nombres) y la plantilla clonada (para
cargarlas).
 */

export type FontRole = "display" | "headings" | "body";
export type FontCategory = "script" | "handwriting" | "serif" | "sans" | "display";

type GoogleFont = {
  family: string;
  category: FontCategory;
  /** Ejes para el uso normal ("" = solo el peso 400). */
  axes: string;
  /** Ejes con itálica, si la familia la tiene en Google Fonts. */
  italicAxes: string | null;
};

const GOOGLE_FONTS: readonly GoogleFont[] = [
 // Las del fixture (Aisha Kick)
 { family: "Pinyon Script", category: "script", axes: "", italicAxes: null },
  { family: "Radley", category: "serif", axes: "", italicAxes: "ital@0;1" },
  { family: "Cormorant Garamond", category: "serif", axes: "wght@400;600", italicAxes:
"ital,wght@0,400;0,600;1,400;1,600" },
  { family: "Arimo", category: "sans", axes: "wght@400;700", italicAxes:
"ital,wght@0,400;0,700;1,400;1,700" },
  { family: "Open Sans", category: "sans", axes: "wght@400;600;700", italicAxes:
"ital,wght@0,400;0,600;0,700;1,400;1,600" },
  { family: "Carlito", category: "sans", axes: "wght@400;700", italicAxes:
"ital,wght@0,400;0,700;1,400;1,700" },
  { family: "Be Vietnam Pro", category: "sans", axes: "wght@400;600", italicAxes:
"ital,wght@0,400;0,600;1,400;1,600" },
  { family: "Quicksand", category: "sans", axes: "wght@400;600", italicAxes: null },
  { family: "Caveat", category: "handwriting", axes: "wght@400;600", italicAxes: null },
  // Frecuentes en plantillas de Canva
  { family: "Great Vibes", category: "script", axes: "", italicAxes: null },
  { family: "Alex Brush", category: "script", axes: "", italicAxes: null },
  { family: "Dancing Script", category: "handwriting", axes: "wght@400;700", italicAxes: null },
  { family: "Playfair Display", category: "serif", axes: "wght@400;700", italicAxes:
"ital,wght@0,400;0,700;1,400;1,700" },
  { family: "Lora", category: "serif", axes: "wght@400;600", italicAxes:
"ital,wght@0,400;0,600;1,400;1,600" },
  { family: "Libre Baskerville", category: "serif", axes: "wght@400;700", italicAxes:
"ital,wght@0,400;0,700;1,400" },
  { family: "Cinzel", category: "serif", axes: "wght@400;700", italicAxes: null },
  { family: "Montserrat", category: "sans", axes: "wght@400;600;700", italicAxes:
"ital,wght@0,400;0,600;1,400;1,600" },
  { family: "Poppins", category: "sans", axes: "wght@400;600", italicAxes:
"ital,wght@0,400;0,600;1,400;1,600" },
  { family: "League Spartan", category: "sans", axes: "wght@400;700", italicAxes: null },
  { family: "DM Sans", category: "sans", axes: "wght@400;700", italicAxes:
"ital,wght@0,400;0,700;1,400;1,700" },
  { family: "Questrial", category: "sans", axes: "", italicAxes: null },
  { family: "Inter", category: "sans", axes: "wght@400;600", italicAxes: null },
  { family: "Bebas Neue", category: "display", axes: "", italicAxes: null },
  { family: "Abril Fatface", category: "display", axes: "", italicAxes: null },
];

/** Fuentes de Canva que NO están en Google Fonts → su equivalente más cercano del
catálogo. */
const EQUIVALENTS: readonly { canva: string; google: string }[] = [
  { canva: "The Seasons", google: "Cormorant Garamond" },
  // Howell es una script pincel (verificado renderizando su .woff del fixture:
  // el título del hero de Aisha sale en Howell). Su par es Dancing Script.
  { canva: "Howell", google: "Dancing Script" },
  { canva: "Marykate", google: "Caveat" },
  { canva: "Be Vietnam", google: "Be Vietnam Pro" },
  { canva: "Canva Sans", google: "DM Sans" },
  { canva: "Glacial Indifference", google: "Questrial" },
  // Del fixture de María (presentación beige): Perandory es una serif display
  // condensada; Hagrid, una sans display pesada; Anastasia Script, caligrafía.
  { canva: "Perandory", google: "Playfair Display" },
  { canva: "Hagrid", google: "League Spartan" },
  { canva: "Anastasia Script", google: "Great Vibes" },
];
const BY_NAME = new Map(GOOGLE_FONTS.map((font) => [font.family.toLowerCase(),
font]));
const EQUIVALENT_BY_NAME = new Map(EQUIVALENTS.map((item) =>
[item.canva.toLowerCase(), item.google]));

/** Nombres que el parser reconoce como fuente aunque aparezcan sueltos en el
documento. */
export const KNOWN_CANVA_FONTS: readonly string[] = [
  ...GOOGLE_FONTS.map((font) => font.family),
  ...EQUIVALENTS.map((item) => item.canva),
];

/** Nombre seguro para CSS y para la URL de Google Fonts. */
const SAFE_FAMILY = /^[A-Za-z0-9 ]{1,60}$/;

const GENERIC: Record<FontCategory, string> = {
  script: "cursive",
  handwriting: "cursive",
  serif: "serif",
  sans: "sans-serif",
  display: "serif",
};
const ROLE_GENERIC: Record<FontRole, string> = { display: "serif", headings: "serif",
body: "sans-serif" };

export type ResolvedFont = {
  family: string;
  category: FontCategory | null;
  source: "exact" | "equivalent" | "unverified";
  font: GoogleFont | null;
};

export function resolveCanvaFont(name: string | null | undefined): ResolvedFont | null {
  const clean = (name ?? "").trim().replace(/\s+/g, " ");
  if (!SAFE_FAMILY.test(clean)) return null;
  const lower = clean.toLowerCase();
  const exact = BY_NAME.get(lower);
  if (exact) return { family: exact.family, category: exact.category, source: "exact", font: exact
};
  const equivalent = EQUIVALENT_BY_NAME.get(lower);
  const font = equivalent ? BY_NAME.get(equivalent.toLowerCase()) : undefined;
  if (font) return { family: font.family, category: font.category, source: "equivalent", font };
  return { family: clean, category: null, source: "unverified", font: null };
}

export type FontPlan = {
 /** Una hoja de Google Fonts por familia usada (display=swap). */
 stylesheets: string[];
  /** font-family listo por rol (null = tipografía actual del sitio). */
  stacks: Record<FontRole, string | null>;
  /** Títulos de sección en itálica: cuando su fuente es serif (como los de la fixture). */
  headingsItalic: boolean;
};

const ROLES: readonly FontRole[] = ["display", "headings", "body"];

export function fontPlan(fonts: Partial<Record<FontRole, string | null>>): FontPlan {
 const resolved = {
   display: resolveCanvaFont(fonts.display),
   headings: resolveCanvaFont(fonts.headings),
   body: resolveCanvaFont(fonts.body),
 } satisfies Record<FontRole, ResolvedFont | null>;
 const headingsItalic = resolved.headings?.category === "serif";

    const families = new Map<string, { font: GoogleFont | null; italic: boolean }>();
    for (const role of ROLES) {
      const item = resolved[role];
      if (!item) continue;
      const italic = role === "headings" && headingsItalic;
      const previous = families.get(item.family);
      families.set(item.family, { font: item.font, italic: (previous?.italic ?? false) || italic });
    }

 const stacks = {} as Record<FontRole, string | null>;
 for (const role of ROLES) {
   const item = resolved[role];
   stacks[role] = item ? `"${item.family}", ${item.category ? GENERIC[item.category] :
ROLE_GENERIC[role]}` : null;
 }

    return {
      stylesheets: [...families].map(([family, { font, italic }]) => googleFontsUrl(family, font, italic)),
      stacks,
      headingsItalic,
    };
}

function googleFontsUrl(family: string, font: GoogleFont | null, italic: boolean): string {
  const axes = font ? (italic && font.italicAxes ? font.italicAxes : font.axes) : "";
  return `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}${axes ?
`:${axes}` : ""}&display=swap`;
}
