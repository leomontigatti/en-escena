# Use manual event-scoped account currents for V1 finances

**Status**: superseded

**Date**: 2026-06-27

**Superseded by**:
[docs/domain/pagos-inscripciones.md](../domain/pagos-inscripciones.md) captures
the later inscription-based payment assignment model. This ADR remains as
history for the invoice/imputation approach that the redesign no longer uses as
the operational source of truth.

## Context

The Portal de academias and Panel de administracion need payment screens, and
the account-current report needs academy-level totals. The straightforward
implementation would be to create invoices automatically when a coreografia is
confirmed, but that would remove the academy's unpaid correction window and
would create many invoices for coreografias or academies that may never
participate.

Administration and academies also need to know what should be paid or collected
before every invoice exists, because payments can be registered before
administration issues the matching choreography invoices.

## Decision

Use an event-scoped `Cuenta corriente de academia` for V1 finances. Payments,
choreography invoices and imputations belong to one academy and the Evento
activo; balances do not carry across events in V1.

Administration issues `Factura de coreografia` manually and can register a
payment before or after issuing invoices. A payment can remain as `Saldo
disponible` until administration imputes it to one or more invoices.

Do not issue choreography invoices automatically when a coreografia is
confirmed. Do not allow arbitrary-amount choreography invoices. Each
coreografia can only be invoiced through the required sequence of down-payment
invoice first and balance invoice after the down-payment invoice is paid in
full.

The down-payment amount uses the event down-payment percentage over the base
price fixed by the down-payment invoice issue date. Administration can choose
that issue date intentionally to fix the price for a choreography before
payment is imputed. Paying the down-payment invoice in full makes the
coreografia `señada`; individual dancer discounts apply only to the balance.
The balance remains estimated until administration issues the balance invoice;
issuing it fixes the amount.

Choreography invoices store the selected price identifier alongside amount and
deadline snapshots so future price edits can distinguish historical dependencies
from unsigned choreography estimates. Older invoices without that identifier are
treated conservatively by inferring the historical price from their stored
snapshot values.

Invoice snapshots remain authoritative for active pending invoices even when
the source price changes later. Repricing a pending invoice requires canceling
and reissuing it rather than silently changing the document.

Only paid choreography invoices create historical price dependencies. Pending
invoices can be canceled and reissued when prices move, and canceled invoices
remain audit records rather than blockers for future pricing.

The Portal de academias financial screen is read-only in V1. The Panel de
administracion financial workflow is organized by `Cuenta corriente de
academia`, with coreografias as invoice and imputation targets inside that
account.

Use operational finance terms in the Portal de academias and Panel de
administracion summaries. `Saldo adeudado` means the net operational amount
still pending to collect or pay for the active event, not only unpaid issued
invoices. An active down-payment invoice fixes the price used by an unsigned
choreography from its issue date, while choreographies without an active
down-payment invoice use the current expected price. Pending invoices remain
visible as documents, and `Saldo disponible` discounts the result globally.
`Saldo adeudado` never becomes negative.

Show `Seña adeudada` separately as the gross down-payment amount still needed
for choreographies that are not signed or paid. It uses the event down-payment
percentage over the price fixed by an active down-payment invoice when one
exists; otherwise it uses the current expected price. `Seña adeudada` does not
discount `Saldo disponible`.

Keep `Monto total pagado` as a payment detail and audit amount, not as a
primary operational summary amount. The primary summary amounts are `Seña
adeudada`, `Saldo disponible` and `Saldo adeudado`.

## Considered Options

- Automatic invoice on choreography confirmation: simpler to derive debt, but
  blocks unpaid roster corrections too early and creates collectible documents
  for participation that may never happen.
- Global academy account current across events: more complete accounting, but
  requires cross-event carryover rules before V1 has selectable event contexts.
- Manual event-scoped account current: matches the operational flow where
  administration receives money, creates invoices and imputes payments, while
  staying aligned with the Evento activo V1 constraint.
- Invoice-only debt language: simpler accounting vocabulary, but it hides the
  amount administration and academies need before invoices are issued.

## Consequences

- Financial state is derived from active invoices and active imputations, not
  from choreography confirmation alone.
- Active financial blocking is derived from active invoices, not from a
  separate flag stored on the choreography record.
- Imputations are all-or-nothing for each invoice: a choreography invoice is
  either `pendiente` or `pagada`, never partial. A coreografia becomes `señada`
  only when its down-payment invoice is paid in full.
- V1 needs traceable correction mechanics for invoices, payments and
  imputations through cancellation or annulment with an administrative reason.
- Account-current reporting must distinguish `Seña adeudada`, `Saldo
disponible` and `Saldo adeudado`.
- Future code must not use `Saldo adeudado` as a synonym for unpaid issued
  invoices. If a screen needs invoice-only pending amounts, calculate that as a
  local invoice detail rather than changing the domain meaning of `Saldo
adeudado`.
- Existing persistence currently names the invoice amount column
  `deposit_amount`; application code should alias that value as `invoiceAmount`
  where it represents the amount of any choreography invoice. A database column
  migration can be evaluated separately.
- Internal invoice and payment numbers should be generated from event-scoped
  sequence rows inside the same transaction that creates the financial record,
  not by querying `max(number) + 1`.
