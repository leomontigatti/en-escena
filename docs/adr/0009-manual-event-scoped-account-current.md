# Use manual event-scoped account currents for V1 finances

**Status**: proposed

**Date**: 2026-06-27

## Context

The Portal de academias and Panel de administracion need payment screens, and
the account-current report needs academy-level totals. The straightforward
implementation would be to create invoices automatically when a coreografia is
confirmed, but that would remove the academy's unpaid correction window and
would create many invoices for coreografias or academies that may never
participate.

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
invoice first and balance invoice after the down-payment invoice is fully
covered.

The down-payment amount uses the event down-payment percentage over the base
price frozen by the down-payment date. Individual dancer discounts apply only
to the balance. The balance remains estimated until administration issues the
balance invoice; issuing it fixes the amount.

The Portal de academias financial screen is read-only in V1. The Panel de
administracion financial workflow is organized by `Cuenta corriente de
academia`, with coreografias as invoice and imputation targets inside that
account.

## Considered Options

- Automatic invoice on choreography confirmation: simpler to derive debt, but
  blocks unpaid roster corrections too early and creates collectible documents
  for participation that may never happen.
- Global academy account current across events: more complete accounting, but
  requires cross-event carryover rules before V1 has selectable event contexts.
- Manual event-scoped account current: matches the operational flow where
  administration receives money, creates invoices and imputes payments, while
  staying aligned with the Evento activo V1 constraint.

## Consequences

- Financial state is derived from active invoices and active imputations, not
  from choreography confirmation alone.
- Active financial blocking is derived from active invoices, not from a
  separate flag stored on the choreography record.
- Partial imputations are allowed, but a coreografia becomes `señada` only
  when its down-payment invoice is fully covered.
- V1 needs traceable correction mechanics for invoices, payments and
  imputations through cancellation or annulment with an administrative reason.
- Account-current reporting must distinguish `Saldo disponible` from `Saldo
adeudado`.
- Internal invoice and payment numbers should be generated from event-scoped
  sequence rows inside the same transaction that creates the financial record,
  not by querying `max(number) + 1`.
