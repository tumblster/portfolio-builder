/*
 * Números para la página pública: "48,2 mil", "1,4 M", "4,8 %".
 * Se formatean en el servidor al resolver el portafolio (no en el navegador), así la
 * vista previa del editor y la página muestran exactamente el mismo texto.
 */

const compact = new Intl.NumberFormat("es", { notation: "compact", maximumFractionDigits: 1 });
const oneDecimal = new Intl.NumberFormat("es", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const formatCompact = (value: number) => compact.format(Math.round(value));

export const formatPercent = (value: number) => `${oneDecimal.format(value)} %`;
