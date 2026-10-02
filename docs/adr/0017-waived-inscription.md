# ADR-0017: A free inscription is a waiver, not a zero price or a discount

**Status**: accepted

Date: 2026-09-29

Some choreographies compete for free: the host academy, a scholarship dancer, a
sponsor agreement. They must still reach `Señada` for a `presentation`, and
every rung of that ladder is derived from `Σ paymentAllocation` against thresholds
computed from a positive price — so without money there is no path to a number.
We decided that a free place is a **`waivedInscription`** (`Bonificada`): a
yes/no fact on the choreography inscription, set by administration case by case,
that zeroes both thresholds and reads as its own status `waived`, outside the
`depositPending < depositMet < paidInFull` scale. It is roster-side state like
`withdrawnAt`, not a persisted money figure, so ADR-0009's rule that every figure
is derived still holds.

## Considered Options

- **A price row of zero.** Rejected: `selectedPrice` is only written on an
  allocation, an allocation must be positive, and below the deposit threshold the
  read re-derives from the price that applies today — a zero row the administrator
  picked would be silently replaced by the general price. It would also make a
  free place read `Pagada`, indistinguishable from one paid in full.
- **A 100% `administrativeDiscount`.** Rejected: that term is reserved for partial
  reductions and would be the one persisted figure with no derivation behind it
  (ADR-0014 §9). Nothing here needs an amount — only all-or-nothing.

## Consequences

- A waived inscription holds no money: waiving is refused while it carries
  allocations, and nothing can be allocated to it.
- It is left out of its choreography's minimum; a choreography with every active
  inscription waived reads `Bonificada` and can get a `presentation`.
- It is outside the `dancerDiscount` qualifying set and produces no `comprobante`.
- Choreography inscriptions only; a seminar inscription, whose deposit crossing
  also takes a quota place, would need its own rule.

## Amendment 2026-10-02: a `presentation` no longer needs `Señada`

The motivation above says a free place had no path to a number because
`Señada` was required for a `presentation`. That requirement was dropped:
every choreography of the event is numbered by the automatic ordering and
listed, whatever it owes, and `Seña pendiente` is a warning on the row only
(`docs/domain/judging.md`, "Participation And Judging"). The waiver stays for
what it still does: reading a free place as `Bonificada` rather than `Pagada`
or `Seña pendiente`, holding no money, and staying out of the choreography's
minimum.
