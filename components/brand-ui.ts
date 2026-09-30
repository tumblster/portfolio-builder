import "./landing/brand.css";

/*
 * Clases de la capa visual de marca (r3 · 7): el sistema de la landing aplicado a /crear. Mismos nombres que
 * components/ui.ts (el studio clásico, que siguen usando el editor y /crear/manual), así los componentes que
 * solo vive /crear cambian de look sin tocar su lógica. Tinta y crema; el acento #FC3300 solo como gráfico
 * (el borde 3D de los primarios y el foco).
 */

/** CTA principal: píldora de tinta con borde 3D en el acento (landing-btn-3d). Uno por pantalla. */
export const primaryButton =
  "landing-btn-3d inline-flex min-h-13 max-w-full items-center justify-center gap-2 rounded-full bg-ink px-7 py-2 text-center text-base leading-snug font-semibold text-cream hover:bg-[#2a2e24] disabled:cursor-not-allowed disabled:opacity-60";

/** Secundario: píldora blanca con borde fino de tinta. */
export const pillButton =
  "inline-flex min-h-tap max-w-full items-center justify-center gap-2 rounded-full border border-ink/60 bg-paper px-5 py-2 text-center text-sm leading-snug font-semibold text-ink transition-colors hover:border-ink disabled:pointer-events-none disabled:opacity-50";

/** Link de texto dentro de un párrafo. */
export const textLink =
  "font-semibold underline decoration-accent decoration-2 underline-offset-4 transition-colors hover:text-accent-ink";

const fieldBase =
  "block min-h-13 min-w-0 rounded-field border border-ink/60 bg-paper text-ink transition-shadow outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-accent read-only:bg-sand aria-[invalid=true]:border-accent-ink aria-[invalid=true]:shadow-[0_0_0_1px_var(--color-accent-ink)]";

/** Campo de ancho completo. */
export const textInput = `${fieldBase} w-full px-4 text-base`;

/** Selector compacto que comparte fila con otras cosas: el ancho lo pone quien lo usa. */
export const compactSelect = `${fieldBase} px-3 text-sm`;

export const fieldLabel = "block text-sm font-semibold text-ink";

/** Mensaje de error debajo de un campo o de una acción. */
export const errorText = "text-sm font-semibold text-accent-ink";
