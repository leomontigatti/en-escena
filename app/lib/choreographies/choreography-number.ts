// Deliberately the same width as the payment number: an admin sees both
// numberings on the same screen, and a different width only invites confusing
// one for the other.
export const choreographyNumberDigits = 5;

export function formatChoreographyNumber(value: number) {
  return String(value).padStart(choreographyNumberDigits, "0");
}
