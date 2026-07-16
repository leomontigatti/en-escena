# Inscription-based finances with payment assignments

**Status**: accepted

**Date**: 2026-07-16

## Context

Administration needs to know, per choreography and per dancer, what was actually
paid and what remains to collect. It also needs to correct a choreography's
roster after creation without a financial gate blocking the edit, and it needs
payment screens for the Panel de administración and a read-only financial view
for the Portal de academias.

The financial state of a choreography should reflect what was effectively paid
for each dancer, not the existence of manually issued documents. There is a
single administrator operating finances, and the system does not audit financial
changes, so per-record annulment/attribution fields buy nothing in this domain.

## Decision

Model finances around two domain concepts:

- **Inscripción**: the canonical economic unit, with a stable identity (`id` of
  its own, not the composite choreography+dancer key) and economic snapshots for
  seña (deposit) and saldo (balance). Its state (`impaga`/`señada`/`pagada`) is
  **derived** from which snapshots are present, never persisted.
- **Asignación de pago**: applies a `Pago`'s available balance to one complete
  stage (`seña` or `saldo`) of one inscription. It is current mutable, deletable
  state — not an append-only ledger or an imputation with reversals. It stores
  the money link only; the price snapshots live on the inscription.

`Pago` + `Asignación de pago` are the single operational source of truth.
`Factura de coreografía` and `Imputación` are removed from the operational
model; the `academy_event_choreography_invoice` and
`academy_event_invoice_imputation` tables, their server code and their UI are
deleted. If invoicing returns, it is a **derived** optional document that reads
from payments/assignments/inscriptions and never drives financial state.

A choreography's financial state is derived from its active inscriptions with a
**high-water-mark** rule (not a minimum): `impaga` when no active inscription is
señada or pagada, `pagada` when all are pagada, otherwise `señada`. A `señada`
choreography does not fall back to `impaga` on roster edits; it only drops state
through an administrative financial correction. Mixed rosters surface a
display-only "necesita atención" status that is not a fourth domain state.

Roster editing is restricted **by role**, not by a financial gate: only the
administrator edits the roster (and physically deletes the choreography), from
the admin choreography detail. The dead `has_active_financial_link` column and
the invoice-derived edit gate are removed. Removing an inscription is a
**physical delete**: its assignments are deleted and the full assigned amount
(seña and, if present, saldo) returns to the academy's `Saldo disponible`. There
is no `inactiva` inscription state.

Price is frozen by the seña assignment: an `impaga` inscription shows a tentative
price that can still change; a señada/pagada inscription shows its frozen price
and is immutable. In the normal `Pagar seña` flow the price row is derived from
the chosen payment's date; in the extraordinary flow (an inscription the
administrator adds later) the administrator picks a price row bounded by a floor
(no lower than the lowest frozen price among the choreography's already
señada/pagada inscriptions).

Finances does not audit changes. This scoping is limited to finances; the rest
of the system keeps its audit until the corresponding follow-up. Financial
records carry no annulment (`annulled*`, `cancelled*`) or actor-attribution
(`createdByUserId`) fields.

## Considered Options

- Manual invoice + imputation model (the previous approach): financial state
  derived from active invoices and imputations, with per-record annulment and a
  cached `has_active_financial_link` flag. Rejected: state tracks documents
  instead of what was paid per dancer, and the invoice-derived gate blocks roster
  corrections that should be a role restriction.
- Inscription as the economic unit with a composite key: simpler persistence,
  but re-adding a dancer would collide with historical economic data. Rejected in
  favor of a stable own `id` so re-adding creates a fresh inscription.
- Assignment as an append-only ledger with reversals: full audit trail, but the
  domain has one administrator and no audit requirement. Rejected in favor of
  mutable, deletable current-state assignments.

## Consequences

- Financial state is derived from active inscriptions and their snapshots, not
  from documents or a stored flag.
- Editing the roster is a role restriction, not a financial gate. Adding an
  inscription creates an `impaga` unit; removing one physically deletes it and
  returns its assigned amount to `Saldo disponible`.
- `Pagar seña` and `Pagar saldo` are whole-choreography actions available only
  when all active inscriptions share the required state; mixed rosters need
  extraordinary per-inscription handling.
- Deposit/balance snapshots live on the inscription and are cleared when their
  assignment is deleted, returning the inscription to the prior state.
- Refunds, `Descuento administrativo` and the lifecycle of a choreography with no
  active inscriptions are explicitly out of scope and pending definition.
- Domain detail lives in [docs/domain/finanzas.md](../domain/finanzas.md), the
  single canonical finance doc.
