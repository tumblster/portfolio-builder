/*
 * Clases compartidas: todos los botones y campos se ven igual en cada pantalla.
 * Tap targets de 44 px (§7.4). Fase 1: sin animaciones, solo estados de hover.
 */

/** CTA principal (§7.4): degradado violeta → fucsia, texto blanco. Uno por pantalla. */
export const primaryButton =
  "bg-brand inline-flex min-h-tap items-center justify-center gap-2 rounded-button px-6 font-semibold text-white shadow-glow transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:brightness-100";

/** Píldora de borde fino que se invierte a blanco al pasar el mouse (§7.6; §7.5 es sobre fondos de pantalla). */
export const pillButton =
  "inline-flex min-h-tap items-center justify-center gap-2 rounded-full border border-line px-5 text-sm text-white transition hover:border-white hover:bg-white hover:text-ink disabled:pointer-events-none disabled:opacity-50";

export const textInput =
  "block min-h-tap w-full min-w-0 rounded-button border border-line bg-ink/70 px-4 text-base text-white transition outline-none placeholder:text-muted/70 focus:border-violet focus:shadow-glow read-only:opacity-70 aria-[invalid=true]:border-fuchsia";

export const fieldLabel = "block text-sm text-muted";

/** Mensaje de error debajo de un campo o de una acción. */
export const errorText = "text-sm text-fuchsia";
