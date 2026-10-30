/**
 * The two kinds of `Movimiento` (GLOSSARY.md): money in and money out of an
 * owner's pool. Every list of movements tells them apart by this badge, with
 * the amount always positive.
 */
export const movementKinds = ["payment", "refund"] as const;

export type MovementKind = (typeof movementKinds)[number];

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

/** Where a movement is read and corrected: each kind has its own page. */
export function movementDetailPath(movement: {
  id: string;
  kind: MovementKind;
}) {
  return movement.kind === "payment"
    ? `/administracion/movimientos/pagos/${movement.id}`
    : `/administracion/movimientos/reembolsos/${movement.id}`;
}
