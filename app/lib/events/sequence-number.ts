// The readable numbers an event hands out — the payment's and the
// choreography's — share one width on purpose. An admin sees both numberings on
// the same screen, and a different width only invites confusing one for the
// other. They are handed out by `eventSequences`; keeping the formatting here
// means the two widths cannot drift apart.
export const eventSequenceNumberDigits = 5;

export function formatEventSequenceNumber(value: number) {
  return String(value).padStart(eventSequenceNumberDigits, "0");
}
