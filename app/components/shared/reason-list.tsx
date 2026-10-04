/**
 * Every reason a field is locked or an action is blocked, as one bulleted list:
 * the shape the lock alerts and `BlockedActionDialog`'s reasons share (style
 * guide, Detail pages). Each reason is a sentence of its own, so it is its key.
 */
export function ReasonList({ reasons }: { reasons: readonly string[] }) {
  return (
    <ul className="list-disc pl-5">
      {reasons.map((reason) => (
        <li key={reason}>{reason}</li>
      ))}
    </ul>
  );
}
