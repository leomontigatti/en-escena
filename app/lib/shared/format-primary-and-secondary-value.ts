/**
 * Joins two related values into the single cell a table column shows, so that a
 * pair such as `Categoría` and `Tipo de grupo` reads as `Juvenil · Solo`.
 *
 * A missing secondary value leaves the primary one alone, without a trailing
 * separator. The caller decides the fallback for a missing primary value.
 */
export function formatPrimaryAndSecondaryValue(
  primaryValue: string,
  secondaryValue: string | null,
) {
  return secondaryValue ? `${primaryValue} · ${secondaryValue}` : primaryValue;
}
