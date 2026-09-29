/*
 * Clases compartidas del studio (v2 · M4): todos los botones y campos se ven igual en cada pantalla.
 * Píldoras con borde de tinta y sombra dura desplazada; al pasar el mouse se levantan y al tocarlas
 * se "hunden". Tap targets de 44 px o más. Colores y contraste: ver app/globals.css.
 */

/** CTA principal: píldora de tinta, texto crema (17,7:1), sombra dura naranja. Uno por pantalla. */
export const primaryButton =
  "inline-flex min-h-13 items-center justify-center gap-2 rounded-full border-2 border-ink bg-ink px-7 text-base font-semibold text-cream shadow-accent transition-[translate,box-shadow] duration-150 hover:-translate-0.5 hover:shadow-[6px_6px_0_0_var(--color-accent)] active:translate-0.5 active:shadow-[1px_1px_0_0_var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-0 disabled:hover:shadow-accent";

/** Secundario: píldora blanca con borde y sombra de tinta. */
export const pillButton =
  "inline-flex min-h-tap items-center justify-center gap-2 rounded-full border-2 border-ink bg-paper px-5 text-sm font-semibold text-ink shadow-hard-sm transition-[translate,box-shadow] duration-150 hover:-translate-px hover:shadow-hard active:translate-0.5 active:shadow-none disabled:pointer-events-none disabled:opacity-50";

/** Link de texto dentro de un párrafo. */
export const textLink =
  "font-semibold underline decoration-accent decoration-2 underline-offset-4 transition-colors hover:text-accent-ink";

const fieldBase =
  "block min-h-13 min-w-0 rounded-field border-2 border-ink bg-paper text-ink transition-shadow outline-none focus:shadow-accent read-only:bg-sand aria-[invalid=true]:border-accent-ink aria-[invalid=true]:shadow-[4px_4px_0_0_var(--color-accent-ink)]";

/** Campo de ancho completo. */
export const textInput = `${fieldBase} w-full px-4 text-base`;

/** Selector compacto que comparte fila con otras cosas: el ancho lo pone quien lo usa. */
export const compactSelect = `${fieldBase} px-3 text-sm`;

export const fieldLabel = "block text-sm font-semibold text-ink";

/** Mensaje de error debajo de un campo o de una acción. */
export const errorText = "text-sm font-semibold text-accent-ink";
