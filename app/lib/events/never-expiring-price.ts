// A row with no `paymentDeadline` is the tail of its tier: while one exists,
// the tier resolves at any date. Readiness asks this to admit an event, and the
// price write guard asks it to keep the answer true, so both read it from here:
// a gate and the guard that protects it must not drift apart.
export function hasNeverExpiringPrice(
  candidates: Array<{ paymentDeadline: string | null }>,
) {
  return candidates.some((price) => price.paymentDeadline === null);
}
