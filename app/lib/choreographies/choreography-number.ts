// Mismo ancho que el número de pago, a propósito: el administrador ve las dos
// numeraciones en la misma pantalla y un ancho distinto solo invita a
// confundirlas.
export const choreographyNumberDigits = 5;

export function formatChoreographyNumber(value: number) {
  return String(value).padStart(choreographyNumberDigits, "0");
}
