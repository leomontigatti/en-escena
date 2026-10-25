/**
 * The two kinds of `Movimiento` (GLOSSARY.md): money in and money out of an
 * owner's pool. Every list of movements tells them apart by this badge, with
 * the amount always positive.
 */
export type MovementKind = "payment" | "refund";

export const movementKindLabels = {
  payment: "Pago",
  refund: "Reembolso",
} as const satisfies Record<MovementKind, string>;

const movementKindBadgeVariants = {
  payment: "secondary",
  refund: "warning",
} as const satisfies Record<MovementKind, string>;

export function getMovementKindBadgeVariant(kind: MovementKind) {
  return movementKindBadgeVariants[kind];
}
