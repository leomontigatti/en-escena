# Finances

Canonical **current-state** description of the financial model: what the code
does today, with no history and no supersession. The rationale — why the two-rung
ladder was retired, what was rejected and on what fiscal footing — lives in
[ADR-0014](../adr/0014-arbitrary-amount-allocation-and-comprobante-amendments.md),
which ratifies [ADR-0009](../adr/0009-inscription-based-finances.md). Read those
for _why_; read this for _what_. The identifier → UI term mapping is in
[CONTEXT.md](../../CONTEXT.md).

## How to read this document

Map #547 settled a model larger than what is built. Half of it shipped (#676,
#710, #689); the invoicing half and the refund are specified and not implemented.
Every statement here is therefore one of three things, and they are never mixed
silently:

- **Unmarked prose describes the code as it runs.**
- **A `> **Specified, not built.**` callout describes the settled target**, with
  the issue that owns it. Do not read those as behaviour.
- **A `Known divergence` paragraph** records a place where the code disagrees
  with the model on purpose or by defect, with the issue tracking it.

When this document and the code disagree anywhere else, the code is right and
this document is a bug — file it, do not fix one side silently.

## Scope

- The `Inscripción` is the canonical economic unit, and `Pago` plus
  `Asignación de pago` are the operational source of truth.
- **Nothing financial is persisted.** Statuses, thresholds, owed figures and
  anomalies are all derived on read. The only stored fields on an inscription are
  `selectedPriceId` (which price row prices it) and `withdrawnAt` (roster state).
  That is ADR-0009, re-ratified rather than relaxed.
- A `Comprobante` is a document _derived_ from inscriptions, payments and
  allocations. It never governs financial state.
- Finances does not audit changes, and neither does the rest of the system.
- Persisted monetary amounts are whole Argentine pesos; the UI shows no cents.
  Percentages are integers on the event row; amounts are rounded to the nearest
  peso with `Math.round` (half up, toward `+∞`) at the point they are derived.
- `Administrador` mutates financial records; `Auditor` reads them.
- Out of scope and deliberately undefined: `Descuento administrativo` (see
  "Descuento administrativo") and the lifecycle of a choreography with no active
  inscriptions.

## The model in one statement

Money is allocated in arbitrary amounts against **two thresholds**. An
inscription holds a price row and a sum of allocations; where that sum falls
relative to `Seña` and `Total` is its status, and the difference in either
direction is what it owes or what is in excess. Nothing marks a crossing, so
every figure re-derives from money and can move in both directions.

## Inscriptions

- An `Inscripción` links one choreography to one dancer and has its own
  **stable identity** (`id`), not the composite choreography+dancer key.
- It carries `selectedPriceId` and `withdrawnAt` and nothing else financial.
  `(choreographyId, dancerId)` is unique, which is why removal chooses between a
  delete and a withdrawal rather than always soft-deleting.
- Adding a dancer to a roster creates an inscription with no money on it, so it
  is born `Seña pendiente`. Adding a dancer who was withdrawn **revives** the
  same row instead of inserting another (see "Withdrawal from the roster").

### Inscription financial status

Read from `Σ allocations` against the two thresholds, recomputed on every read.
**Nothing is written when a threshold is crossed**, in either direction.

| UI               | Value            | Definition                                    |
| ---------------- | ---------------- | --------------------------------------------- |
| `Seña pendiente` | `depositPending` | `Σ allocations < depositAmount`               |
| `Señada`         | `depositMet`     | `depositAmount ≤ Σ allocations < totalAmount` |
| `Pagada`         | `paidInFull`     | `Σ allocations ≥ totalAmount`                 |

The values are English and the field is `status`, not `state`. `paidInFull`
rather than `paid` is deliberate: the boundary is `≥`, not `=`, because passive
over-allocation is tolerated.

An inscription whose price cannot be resolved has no thresholds, and reads
`Seña pendiente`: a threshold that cannot be computed cannot have been crossed.

`Señada` is the competability signal, and it is computed **undiscounted** —
`depositAmount` comes off the price before any discount, so the threshold cannot
move under an academy when a sibling roster changes a discount tier.

### Choreography financial status

- The **minimum** over the choreography's active inscriptions on the scale
  `depositPending < depositMet < paidInFull`. One uncovered dancer pulls the
  whole choreography down, because the badge answers _can this be performed as
  choreographed_.
- It is a minimum and **not a watermark**. The watermark it replaced let a
  choreography with a straggler read `Señada`, and `deriveChoreographyNeedsAttention`
  existed only to compensate for that; both are gone.
- A choreography with no active inscriptions reads `Seña pendiente`.
- Withdrawn inscriptions are excluded from this rollup and from the
  choreography's `registrationCount`. They stay in the money rollup.
- It is not persisted, and it sorts and filters like any derived column.
- It **may drop back**: a roster change or a de-allocation can un-stick `Pagada`.
  That is accepted; nothing prevents it and nothing records that it happened.

## The four figures

Every figure is derived on read; none is persisted.

```
depositAmount       = round(selectedPrice.amount × event.requiredDepositPercentage / 100)
totalAmount         = selectedPrice.amount − liveDancerDiscountAmount
owedDepositAmount   = max(0, depositAmount − Σ allocations)
owedBalanceAmount   = max(0, totalAmount   − Σ allocations)
overAllocatedAmount = max(0, Σ allocations − totalAmount)
```

- **Scope-owned, and the academy scope is the narrow one.** `inscription`
  (`InscriptionFinancialFigures`) and `choreography`
  (`ChoreographyOperationalFinanceRow`) each carry all four —
  `depositAmount`, `totalAmount`, `owedDepositAmount`, `owedBalanceAmount`. The
  academy scope (`OperationalFinanceSummary`) carries only the two owed ones,
  alongside `availableBalanceAmount` and `totalPaidAmount`: there is **no
  academy-level `depositAmount` and no academy-level `totalAmount`**. Where a
  wider scope does carry a figure it is a plain sum of the narrower ones; there
  is no separate per-scope rule and no per-status aggregation.
- **The discount is applied once, inside `totalAmount`**, with no coalesce and no
  third subtrahend, so every consumer inherits it and none can forget it.
- **`Seña adeudada` and `Saldo adeudado` are gross.** Neither subtracts
  `Saldo disponible`, which is shown alongside as its own figure. They are also
  **not disjoint**: an inscription with no money contributes its deposit
  shortfall to one and its total shortfall to the other. They are two cuts of the
  same debt, and `Seña adeudada ≤ Saldo adeudado` always holds.
- **A registered inscription is owed in full from the moment it exists.** There
  is no "not yet due" debt.
- `requiredDepositPercentage` is an event-level `Bases del evento` setting,
  a not-null integer defaulting to `30`.
- If no price resolves for an inscription, its thresholds are `null` and the
  amounts it contributes are **pending or incomplete, not zero**. The UI shows
  `Sin precio` for that cell.

Every figure an academy reads on a **finance surface** is **exact and is exactly
what must be paid**. Those surfaces carry no tentative amounts and no
provisional-figure cue: a marking true of every figure distinguishes nothing.

The one provisional cue in the panel is outside them. The admin dancer detail —
not a finance surface — heads its column `Subtotal estimado` and disclaims that
"Los importes son estimados y no reemplazan comprobantes financieros.", and it
earns the disclaimer honestly, because it prices without the finance rules (see
"Prices").

The superseded per-inscription `Saldo de inscripción` (`base − deposit −
discount`) is **gone, not renamed**: both of its subtrahends moved.

## Descuento por bailarín

- The only automatic discount. It lives per inscription and enters `totalAmount`
  and nothing else.
- **It is always live**: recomputed on every read, before and after a comprobante
  alike. There is no freezing moment, no granted-amount column and no
  carry-forward. It cannot be gated on the financial status, because it enters
  `totalAmount` and `totalAmount` is what decides the status — gating it would be
  circular.
- **Qualifying set**: the dancer's **registered** active inscriptions in the same
  **academy and event**, whatever their status. Withdrawn inscriptions and
  inscriptions with no resolvable price are excluded.
- Tiers, by the size of that set: 1 or 2 → no discount; 3 → 10%; 4 or more → 15%.
- **The most expensive inscription of the set is left at full price.** The set is
  sorted by price descending and the first row gets nothing; every other row gets
  `round(price × percentage / 100)`. The percentage is derived from the size of
  the whole set, exempt row included.
- **On a price tie the winner is decided by the inscription's `id`**, which is a
  UUID, so the tie-break is arbitrary rather than chronological. Ties are the
  common case, not the exception: inscriptions in the same choreography share a
  price row. It does not move money — a tie means the prices are equal, so the
  academy's total is the same whichever row is exempted — but an admin asking
  "why is this one at full price?" has no answer. A date-based rule cannot be
  implemented as written: `choreography_dancer` has no `createdAt` column.
- Because the qualifying set spans an academy and an event, **registering a
  dancer in choreography B changes the total of choreography A**, whose own
  roster was untouched. The academy is told nothing; A's total is simply correct.

**Known divergence — the read path pools across academies.** The write path
scopes the qualifying set to `academyId + eventId`, as documented. The read path
buckets by `dancerId` alone over rows already restricted to the event and the
requested academies, and the admin finances list requests **every academy of the
event**. A dancer registered by two academies of the same event is therefore
pooled in that list and not at the write, so the list can display a discount the
write will refuse to grant. The single-academy readers pass one academy id and
are unaffected. This is [#584](https://github.com/leomontigatti/en-escena/issues/584)
item 2 and it is a **bug, not a documented rule**; the owner of the shared
predicate is [#489](https://github.com/leomontigatti/en-escena/issues/489).

## Descuento administrativo

`Descuento administrativo` is **reserved and deliberately undefined**. Map #547
ruled it out of scope, which is a scoping act and not an answer: its own
questions — scope, place in `totalAmount`, whether it fixes, persistence,
authority — are left standing.

Three reasons it was closed rather than decided: nothing on the map depends on it
(all twenty-one decisions were re-read and it appears in none); the common case is
already served, because an administrator can pick the price row explicitly and a
price row is where a commercial arrangement belongs; and the reason it keeps being
deferred is structural — **it is the one figure in the model with no derivation
behind it**, so it must be persisted, which is exactly the exception ADR-0009
forbids. Whoever defines it has to argue for that exception.

The term stays reserved. It is **not** tombstoned, and its absence here is a
decision rather than an oversight.

## Prices

- An inscription is priced by **one price row**, held as `selectedPriceId`.
- The **effective price** is `crossed ? stored : (current ?? stored)`: the stored
  row once the inscription has crossed its deposit threshold, and otherwise the
  currently applicable row, falling back to the stored one when no row applies at
  all. When neither resolves there is no price and the inscription's figures are
  incomplete.
- **The stored row is the one the administrator picked**, never one the system
  chose by date. An allocation write stores the row named in the dialog, and a
  preset stores its per-group-type choice. The only validation is membership of
  the choreography's candidate set — same event, same group type, and either the
  choreography's own schedule row or the general one — **with no date filter at
  all**, so a row whose `paymentDeadline` has passed can be selected and stored.
- **The business date** — today in the business time zone, never a payment's date
  — appears only on the **read** path, in `resolveEstimatedBasePriceAmount`. It
  resolves the currently applicable row, preferring the row specific to the
  choreography's schedule and group type, then the general row for that group
  type.
- **The price is fixed by the deposit threshold crossing, not by the first peso
  and not by the calendar.** Below the threshold nothing is fixed: an allocation
  write may store a different row whatever the inscription already holds, and the
  read does not treat the stored row as authoritative — it re-derives from the row
  that applies today, so a page refresh moves the effective price and so does the
  passage of time. Once `Σ allocations` reaches the seña of the row the
  inscription **stores**, that row governs: the write path refuses a different one
  with "El precio queda fijo desde que la inscripción cubre su seña…", and a
  database trigger on `choreography_dancer` refuses the same update. **Taking
  money off until the row falls back below its seña is what releases the lock** —
  not taking every peso off.
- **`crossed` is always tested against the stored row**, never against the
  incoming or the currently applicable one. The threshold is derived _from_ the
  price, so the answer would otherwise depend on which price is asked about: 1000
  allocated is crossed against a price of 3000 and un-crossed against one of 10000. Testing against what is stored is what stops the rule being circular.
- **A write that names no row leaves whatever is stored untouched, and nothing
  refreshes the stored row on its own.** Below the threshold the stored row is
  still worth writing, because it is what the read falls back to when no row
  applies at all.
- **The price list can roll down under a partly funded inscription.** Below its
  threshold an inscription follows the list, so a drop can leave it holding more
  than its `Total` and reading `Sobreasignada`. That is passive over-allocation
  and it is tolerated: it warns, it blocks nothing and nothing throws.
- The picker is filtered to the choreography's group type and schedule and to
  nothing else — no floor, no ceiling and no `paymentDeadline` — because offering
  a foreign row would be offering to create a forbidden state, whereas offering
  an expired one would not.
- A price row that any inscription references **cannot be deleted**.

> **Specified, not built.**
> The lock at the deposit threshold and the `crossed ? stored : (current ?? stored)`
> read described above are ADR-0014 §3 and are implemented. The rest of that
> section is not: it also makes `selected_price_id` `NOT NULL` and written at
> **creation**, and refreshes it on a `groupType` change regardless of the
> threshold, refusing the roster write when no row applies to the new group type.
> Today the column is nullable, no creation path writes it, and the stored row is
> never refreshed on its own. Owner:
> [#403](https://github.com/leomontigatti/en-escena/issues/403), with the
> `groupType` refresh in
> [#709](https://github.com/leomontigatti/en-escena/issues/709).

**Known divergence — a roster change can leave the price impossible.** Because
nothing refreshes `selectedPriceId`, a roster change that moves the group type or
the schedule leaves a funded inscription holding a row that no longer belongs to
what is being sold. Tracked in
[#709](https://github.com/leomontigatti/en-escena/issues/709) and
[#660](https://github.com/leomontigatti/en-escena/issues/660). The only guard in
place is the schedule-capacity one, which refuses to move a choreography's
schedule capacity while any inscription holds money.

**Known divergence — the admin dancer detail prices without the finance rules.**
`findDancerInscriptions` resolves prices with no date and hardcodes a zero
discount, so that view can show an expired row as `Subtotal estimado` and never
shows the `Descuento por bailarín`. It contradicts the finance read model for the
same inscription. Tracked in
[#584](https://github.com/leomontigatti/en-escena/issues/584).

## Payments

- Administration registers a payment before or after allocating it.
- A payment requires an academy, the active event, a date, a positive amount and
  a payment method. Corrections are made by editing or deleting the payment,
  never by registering a negative or zero one.
- **A payment is editable after the fact.** The admin payment detail carries a
  full edit form — academy, amount, date, method, reference and internal note —
  and it writes all of them. **Exactly two accounting guards stand in its way**,
  and nothing else:
  - the **academy is frozen once the payment carries allocations** ("No se puede
    cambiar la academia de un pago con asignaciones activas."), so a payment
    registered against the wrong academy is re-pointed by editing while it is
    still unallocated;
  - the **amount cannot drop below what is already allocated** ("El monto no
    puede ser menor al total ya asignado."). It rises freely, and it falls freely
    down to that floor.

  Editing a payment moves no allocation: the existing rows keep their amounts and
  the difference lands in `Saldo disponible`.

- The payment date cannot be in the future.
- Payment methods: transferencia, efectivo, mercado_pago and otro.
- A payment has a visible internal number, sequential within the event. It is not
  a fiscal number.
- Reference and internal note are optional; internal notes are not shown in the
  `Portal de academias`. Uploading receipts is not built.
- A registered payment stays in the academy's `Saldo disponible` until it is
  allocated.
- Payments and allocations do not cross academies. A payment registered against
  the wrong academy is corrected by editing it while it holds no allocations, and
  once it does, by taking its money off or deleting it.
- **Deleting a payment cascades its allocations** at the database level. There is
  no reversal order, no blocking case, and no automatic refill of what the
  deletion freed.

## Payment allocations

An `Asignación de pago` is **an amount against an inscription** — the triple
`(payment, inscription, amount)` — and mutable, deletable current state rather
than an append-only ledger.

- Stored fields, besides its own `id`: `paymentId`, `inscriptionId`, `academyId`,
  `eventId`, `amount`, `createdAt`, `updatedAt`. **The row carries no type and no
  role**: money is fungible, so an allocation is an amount and nothing else.
  There is no
  `allocation_type` and no deletion rank.
- **Unique on `(paymentId, inscriptionId)`.** At most one row per pair; a
  positive delta is an upsert that sums.
- **`amount > 0` by CHECK.** A decrement to zero **deletes the row**: a zero row
  would assert a history this table does not hold. Negatives are ruled out
  because `Σ allocations` would then be reachable by two different row sets.
- All four foreign keys cascade on delete.
- It stores no user attribution; the system does not audit.
- One inscription's money can come from several payments, and one payment can
  fund several inscriptions.

## The pool rules

Funding an inscription and unfunding it are the two halves of one invariant, and
they live in one module.

- **The invariant**: `Saldo disponible = Σ payments − Σ allocations − Σ refunds`,
  and it can never go below zero. The floor is **structural, not a clamp**: every
  allocation is capped against what is still free, and the one way to shrink the
  other side — editing a payment down — is floored at what that payment already
  funds. There is no subtraction that could overshoot.
- **Funding** — the administrator names an inscription and an amount, **never a
  payment**. The system consumes the academy's payments **oldest-first by payment
  number**, creating or incrementing the `(payment, inscription)` row until the
  amount is covered. It refuses up front when the pool holds less than the amount
  asked for.
- **Unfunding** is the exact inverse: it consumes that inscription's allocations
  **newest-first by payment number**, decrementing and deleting the row at zero.
  The round trip is exact as long as what is unwound is the last thing funded. If
  money is freed on an older payment in between, the total comes back the same
  but may be split differently — no provenance is stored, which is precisely what
  keeps a reversal order from coming back.
- **Over-allocation.** **Active** over-allocation is refused on the write path,
  with no override: a write that would push an inscription above its `Total` is
  rejected with "No se puede asignar más de lo que la inscripción adeuda.", which
  is why owed is computed on the write path and not only on read. Allocating
  against an inscription with no resolvable price is refused for the same reason
  — there is no way to know what it owes. **Passive** over-allocation already
  recorded is tolerated: it stays where it sits, stays readable, and only an
  administrator moves it.
- **Accepted cost, stated plainly**: a specific payment can no longer be lifted
  off a specific inscription. The remedy for a payment recorded in error is
  deleting the payment, which cascades its allocations.

> **Specified, not built.**
> The `− Σ refunds` term has nothing behind it: there is no refunds table and no
> refund code path, so `Saldo disponible` reads as `Σ payments − Σ allocations`.
> ADR-0014 §6 specifies a `Reembolso` mirroring `Pago` — academy, event, amount,
> date, `refundMethod` over the same method enum, `refundNumber` — that **never
> carries allocations** and is capped at `Saldo disponible`. Owner:
> [#536](https://github.com/leomontigatti/en-escena/issues/536). Note the term:
> `Devolución` is reserved for the judge's private feedback audio and must not be
> used for money.

## The money gestures

The administrator never picks a payment in either direction: they name an
inscription and an amount, and the pool rules decide which payments it comes
from. Neither is available on the academy portal, which is read-only.

### Per inscription

The choreography financial detail has **one entry point per inscription** — the
dancer's name — and the dialog behind it takes its shape from what the row holds.

| Row                       | What opens                                          |
| ------------------------- | --------------------------------------------------- |
| over-allocated            | `Liberar el excedente`: one click, nothing to type  |
| nothing owed, money on it | `Quitar plata`, prefilled with everything allocated |
| anything else             | `Asignar plata`: price and amount                   |

A row that still owes something but already holds money reaches `Quitar plata`
from inside the allocation dialog, so removal is available wherever there is
money to take off while the entry point stays single.

- **Allocating.** Any amount is allocatable; a partial allocation is an ordinary
  outcome and the row reads `Seña pendiente` with its shortfall, not as unpaid.
  The owed figure is a **placeholder, never a prefilled value**, because the
  discount is live and it moves while the dialog is open; the hint is whichever
  figure finishes the next thing. The **price is chosen inside this dialog and
  never in a table cell**, and it is a readout rather than a picker once the row
  holds money. This is the only one of the three gestures that can bounce.
- **Removing.** The amount is **prefilled with everything the inscription holds**
  and any smaller amount is accepted: what is allocated is a fact and does not
  move under the administrator. It unwinds newest-first and the released amount
  returns to `Saldo disponible`. **Removing money never blocks for a financial
  reason**: no threshold, no anomaly and no state of the pool can refuse it. It
  still refuses the two nonsensical inputs — an amount of zero or less ("El monto
  a quitar tiene que ser mayor a 0.") and an amount larger than the inscription
  holds ("La inscripción no tiene esa plata asignada.") — so a caller must still
  defend those. It is a different action from removing the inscription from the
  roster.
- **Releasing the excess.** One button that takes off exactly what the
  inscription holds above its `Total` and nothing more. The excess is computed,
  so there is nothing to pick and nothing to type.
- **Neither removal shape shows a price control**, not even a locked one. Price
  is an allocation-time concern, and taking money off until the row falls back
  below its seña is precisely what opens the lock.

**Known divergence — the dialog still locks the picker at the first peso.** The
rule locks the price at the deposit threshold, and both the write path and the
database guard hold it there, but `inscription-money-dialog.tsx` swaps the picker
for a readout as soon as `allocatedAmount > 0` and tells the administrator "Para
cambiarle el precio hay que quitarle toda la plata.". A below-threshold price
change is therefore accepted by every write path and unreachable from that
dialog, and the hint under the readout describes the retired rule.

### Per choreography

`Pagar seña` and `Pagar saldo` survive as **list actions** over the chosen
choreographies of an academy, not as rungs. They are presets over the figures:
each allocates every active inscription's `Seña adeudada` or `Saldo adeudado`
from the pool, skipping the ones that owe nothing, and the pool decides which
payments it comes from. A preset is **all or nothing** — if the pool runs dry
partway through, or any inscription is refused, the whole charge rolls back and
the administrator who sees an error can trust that nothing moved. A preset
selects and stores a price row only for inscriptions that have not covered their
seña yet; anything already past that threshold keeps the price it holds.

## Anomalies

A derived **array**, all self-clearing comparisons of current state, persisted
nowhere, acknowledged nowhere.

| Anomaly         | UI              | Predicate                     |
| --------------- | --------------- | ----------------------------- |
| `overAllocated` | `Sobreasignada` | `Σ allocations > totalAmount` |

That is the whole list. `groupTypeMismatch`, `orphanedAllocations` and
`deriveChoreographyNeedsAttention` were deleted and none of them exists in code.
A choreography re-derives `overAllocated` from the summed excess of its
inscriptions, so the **choreography-level anomaly slot is otherwise empty by
design**.

`Sobreasignada` is `destructive`, not amber: beside `Seña pendiente`, two amber
badges would read as one kind of fact. It **warns and never blocks**.

> **Specified, not built.**
> ADR-0014 §5 adds the **documented-versus-derived delta** — `derived total −
(FC + ΣND − ΣNC)` — as the second anomaly, split into two members by sign, with
> a 15-day countdown on withdrawal-driven deltas. Nothing computes it today.
> Owner: [#657](https://github.com/leomontigatti/en-escena/issues/657).

## Withdrawal from the roster

Removing a dancer from a roster is an **admin-only** action, and it chooses once
between two outcomes:

- **Physical delete** when the inscription holds neither payment allocations nor
  a `comprobante_inscription` line. Nothing to preserve, and
  `choreography_dancer_unique` keeps holding.
- **Withdrawal** otherwise: `withdrawnAt` is stamped and the row survives with
  its money and its comprobante line on it.

The choice is made at removal and **never revisited** — de-allocating a withdrawn
inscription afterwards does not delete it. **Nothing cascades**: the removal moves
no money. Adding the same dancer again **revives** the same row, because that is
what actually happened.

A withdrawn inscription is not a fourth status. `Retirada` is a derived axis of
its own, like an anomaly, and it **replaces** the status badge rather than
joining it.

**A withdrawn inscription's total is what remains allocated to it, not zero.**
The deposit may be forfeited, and the retained allocation is the record of that
retention. The consequences follow from that one rule:

- It owes nothing and cannot be over-allocated: `Saldo adeudado`, `Seña adeudada`
  and the excess are all zero, and it carries no anomalies.
- It reads `paidInFull` underneath the `Retirada` badge, because what it owes is
  exactly what it holds.
- **It keeps exposing its deposit figure**, so the row stays readable.
- It **stays in** its choreography's and its academy's money rollup.
- It **stays out of** the `financialStatus` rollup, its choreography's
  `registrationCount`, and the discount qualifying set.
- **Price resolution does not know it is withdrawn.** The threshold read resolves
  a withdrawn row's price exactly like an active one — that is what keeps its
  deposit figure readable — and so does the allocation write path. What
  withdrawal removes is the discount's qualifying set, not the price.

**Reads filter withdrawn rows by default**, behind a shared `activeInscription()`
predicate and its raw-SQL twin, so no reader restates the rule and none writes
`isNull(withdrawnAt)` by hand. The exceptions come in two kinds.

The first is the finance reads that must **show the evidence**: the money rollup
consumed by the **four finance surfaces** (`operational-summary.server.ts`), the
choreography roster the two financial details render with the `Retirada` badge
(`choreography-inscriptions.server.ts`), the threshold read that keeps a
withdrawn row's deposit figure alive (`inscription-thresholds.server.ts`), and
the comprobante emitter (`emit-factura-c.server.ts`).

The second is queries that are not about display at all and simply do not need
the predicate, because a withdrawn row answers their question as well as an
active one: `readInscriptionSelectedPrices` (the price readout behind the money
dialog) and the allocation write path's own inscription lookup
(`inscription-allocation.server.ts`), the frozen-price guard that asks whether
any inscription of a choreography holds money
(`choreography-frozen-price-guard.server.ts`), the check that refuses to delete a
price row some inscription references (`prices.server.ts`), and the roster
editor's deliberate read of the withdrawn rows themselves, which are the revival
candidates (`choreography-roster-admin.server.ts`). **Only the first kind is
four.** Do not read "four exceptions" as "four queries without the predicate" —
the second kind is at least as large, and a query touching `choreography_dancer`
without `activeInscription()` is not by itself evidence of a bug.

**Known divergence — the write path does not know a row is withdrawn.** Only the
read path derives the withdrawn figures; an allocation write against a withdrawn
inscription still computes its thresholds from the price row, so the write-path
over-allocation guard measures against a `Total` the read side does not show.

> **Specified, not built.**
> ADR-0014 §6 makes the withdrawal's fiscal consequence `NC = línea facturada −
retenido`, with the administrator choosing the retained amount in the
> de-allocation dialog, a full forfeit producing **no nota de crédito at all**,
> and the 15-day clock running from `withdrawnAt`. None of it is computed today.
> Historical withdrawals from before the soft withdrawal **cannot be
> reconstructed and are not backfillable**: the old path hard-deleted the row and
> cascaded its allocations, destroying the evidence by the very act that required
> it. How much that costs depends on how many comprobantes were emitted before
> the soft withdrawal landed, which is a question about the production database
> and cannot be answered from this repository.

## Invoicing

One `Comprobante` belongs to one choreography (`choreographyId` is not null), and
a comprobante that carries a CAE is **immutable and undeletable by fiscal
obligation**. It is emitted from the choreography's financial detail in the admin
panel.

What is implemented today is **collection-driven emission**, and it is not the
settled model:

- **Emission bills what was collected**, not the price. The only gate is that
  there is a positive amount collected and not yet billed; there is no `Señada`
  gate. Per inscription it bills `collected − already billed` where that is
  positive, so emission is **incremental and repeatable** rather than
  all-or-nothing.
- Internal lines are one row per inscription (`comprobante_inscription`), holding
  an amount and no text. If the inscription is later hard-deleted the line's
  `inscriptionId` goes null and the line survives.
- **The printed document carries exactly one line**, reading `Inscripción —
{choreography}`, at the comprobante's total. There is no per-dancer line and no
  discount line. The left-hand side is a constant: it names the service sold,
  because with `porción` gone a comprobante covers an arbitrary amount and is
  neither a seña nor a saldo.
- Status is derived, never stored, and has **two** values: `vigente` and
  `anulada`. It is derived by **existence** — a comprobante is `anulada` when
  some other comprobante of the same choreography points at it.
- **`Vigente` / `Anulada` is the only comprobante badge**, and it is the derived
  status above, shown on the global comprobante list and detail. The financial
  detail's `Seña` and `Saldo` metric cards carry **no** badge and **no** link to
  a comprobante: the `Vigente` / `Desactualizada` pair they used to carry read a
  `porción` — which vigente factura covered it and whether new money had landed
  inside it — and went with the field. A choreography's comprobantes are reached
  from the global list, which searches by choreography name.
- **`Anular comprobante` exists** as an action on the comprobante detail. It
  emits a mirror **nota de crédito** for the target's full amount, replicating
  its lines and pointing at it. A unique index caps a
  comprobante at **one** amendment ever, and annulling an already-annulled
  comprobante is refused.
- There is **no nota de débito**: only Factura C (`CbteTipo` 11) and Nota de
  Crédito C (`CbteTipo` 13) exist.
- A comprobante is emitted as a **service** (WSFEv1 `Concepto` 2) with the
  event's dates as the service period and `FchVtoPago = CbteFch`.
- Contingency and recovery when ARCA is unreachable are implemented: a failure is
  classified by phase, timeouts are wrapper-level constants, and authorization
  ambiguity is resolved by consulting ARCA rather than by asking the operator.
  The UI states what was resolved — `rejected` / `not-emitted` / `unverified` —
  never which call broke.
- **Any comprobante of a choreography blocks its physical deletion**, in any
  state, including a nota de crédito. The block is never released: a choreography
  that was ever invoiced becomes permanently undeletable. It blocks deletion
  only, not roster editing.

> **Specified, not built.** This is the largest gap in the document, and it is
> the whole of ADR-0014 §5, §6 and §7 **minus the one piece already built**: the
> deletion of `porcion` — column, enum, derivation and every reader — landed
> ahead of the rest, because the field asserted something untrue the moment #676
> replaced the ladder with two thresholds. What is still specified only:
>
> - A factura is emitted once the choreography is **`Señada` and `total > 0`**,
>   per choreography, **all-or-nothing**, and it bills the **full price** rather
>   than what was collected. Collection unlocks emission; it is never the amount.
> - Every emitter computes the same subtraction, `delta = derived total −
(FC + ΣND − ΣNC)`, and **the sign names the document**: positive → nota de
>   débito, negative → nota de crédito, zero → nothing. One function serves all
>   three, and the invariant `FC + ΣND − ΣNC = derived total` makes a roster
>   change that never got its document _detectable_.
> - Amendments form a **star anchored at the factura**, depth permanently 1, which
>   requires dropping the one-amendment unique index. `Señada` gates the first
>   document only; ND and NC have no gate at all.
> - Status becomes `vigente` / `ajustada` / `anulada`, derived **by amount** and a
>   property of the **factura alone**; total annulment is the limit case
>   `ΣNC == FC`.
> - The printed document carries **one line per inscription**, reading
>   `Inscripción — {dancer}` at the **net** amount. The discount is **never** a
>   line item — rendering `Precio / Descuento` would forfeit the fiscal argument
>   that makes the live discount lawful.
> - **`Anular comprobante` is deleted**, not rewritten: keeping it would
>   manufacture a positive delta demanding an ND for the amount just credited.
>   The comprobante detail is left with no destructive actions.
> - Refunds are **never netted into** `FC + ΣND − ΣNC`.
> - Two races get two mechanisms: an advisory lock per choreography for the
>   delta, and a correlative reservation in its own table for the series.
>
> Owner: [#657](https://github.com/leomontigatti/en-escena/issues/657);
> [#686](https://github.com/leomontigatti/en-escena/issues/686) already proved
> Nota de Crédito C and Nota de Débito C against ARCA's homologation environment.

## Roster editing and deletion

There is no per-choreography roster lock, no roster state enum, no unlock cycle
and no request actions. The restriction is **permanent and role-based**.

- **Creation (academy)** is atomic: the choreography is persisted when the last
  dialog step is confirmed, with roster and professors mandatory, and a final
  summary warning that the academy will not be able to change it afterwards.
- **Academy, post-creation:** the only thing it can modify is the audio file. It
  never edits the roster and never deletes the choreography.
- **Administrator:** the only one who can modify any choreography data, including
  the roster, and physically delete it.
- Roster editing happens in the admin panel's choreography detail, not on a new
  screen, and unlocks only dancers and professors. Changing the set of dancers
  re-resolves the group type (by count), the category (by ages) and the
  experience level (per the category); experience level and schedule become
  selectable only when the re-resolution requires it. A roster that does not
  resolve to a compatible category cannot be saved.
- **Professors have no financial dimension**: adding or removing them cascades
  into nothing.
- The **financial consequence** of a roster change is not resolved in that form.
  The form produces the membership change; the impact surfaces directly in the
  financial views, because the minimum rollup pulls the choreography's status
  down. The save confirmation is a generic notice, with no amounts and no price
  selection.
- **Hard blocks.** A choreography with an associated presentation cannot have its
  roster edited. Deletion is blocked by an associated presentation and by any
  comprobante. There is no `has_active_financial_link` column and no editing gate
  derived from financial state.

## No auditing in finances

- Finances **does not audit changes**. There are no audit entries for payments,
  allocations, inscriptions or the roster's financial dimension, and no other
  part of the system audits either — the administrative audit trail was retired.
- Roles: a single `Administrador` who edits and a single `Auditor` who reads.
- Financial records carry **no** annulment fields and **no** actor attribution.
  With a single administrator they distinguish nothing.
- Destructive actions — deleting a payment, deleting a choreography, removing an
  inscription, taking money off one — run without a reason and leave no entry.

## Surfaces

- Finance surfaces are the admin academy financial list and choreography
  financial detail, the admin payments list and detail, and the two mirrors in
  the `Portal de academias`. **"The four finance surfaces" elsewhere in this
  document names a subset of these six**: the four that consume the shared money
  rollup — the two admin financial ones and the two portal ones. The payments
  list and detail are finance surfaces too; they just read payments, not the
  rollup.
- Panel and portal read the **same derivation**, so the portal cannot disagree
  with the panel. The primary amounts on both are `Seña adeudada`, `Saldo disponible`
  and `Saldo adeudado`.
- **The `Portal de academias` is read-only**: academies do not initiate payments
  and do not upload receipts.
- **The academy is told nothing when its bill moves** — not before a comprobante
  exists and not after. It is a decision, not an omission: the total the portal
  renders is already the correct current obligation, nothing about a pending
  document is actionable by an academy, and the withdrawal signal already exists
  on the roster axis as the `Retirada` badge with the retained amount beside it.

## Retired vocabulary

These name nothing and must not come back. The glossary tombstones the ones that
had entries.

| Retired                                         | What replaced it                                    |
| ----------------------------------------------- | --------------------------------------------------- |
| `Etapa de inscripción`, `inscriptionStage`      | the two thresholds and the three statuses           |
| `Precio tentativo` / `Precio congelado`         | one `selectedPrice` per inscription                 |
| `Fecha de referencia financiera`                | the business date, on the read path only            |
| `frozenBasePriceAmount` and the nine siblings   | derivation from `selectedPrice` and `Σ allocations` |
| `allocation_type`, `allocationDeletionRank`     | nothing — money is fungible                         |
| `Saldo de inscripción`                          | `Total de inscripción`                              |
| `Cuenta corriente de academia`                  | nothing — it never named a symbol (see below)       |
| `choreographyFinancialState` (watermark)        | the minimum rollup                                  |
| `deriveChoreographyNeedsAttention`              | the minimum rollup                                  |
| `groupTypeMismatch`, `orphanedAllocations`      | nothing                                             |
| `Imputación`, choreography invoice              | `paymentAllocation`, `comprobante`                  |
| `Porción`, `comprobantePorcion`                 | nothing — a comprobante covers an amount            |
| `Desactualizada` (the `porción` currency badge) | nothing — the cards carry no badge                  |

Two of those rows retire a **concept**, not every string that spells it, and the
difference matters to anyone about to delete something:

- **`Cuenta corriente de academia`** retires the _entity_ — there is no
  account-balance record, and no `academyAccountBalance` identifier. But
  **"Cuenta corriente" is the live page title of the portal's finance page**
  (`app/features/portal/finances/view.tsx`, linked from `app/routes/portal._index.tsx`).
  That string is UI copy an academy reads and is not covered by this table.
- **`Fecha de referencia financiera`** retires the _per-inscription column_; both
  reference-date columns were dropped in #689. The words survive as a local
  variable, `financialReferenceDate` in `resolveEstimatedBasePriceAmount`, which
  holds the shared business date on the read path. It names no column, no type
  and no exported symbol, and it is not a financial concept — but it is a real
  identifier, and grep will find it.

**`Porción`** is retired as a _concept_, not as every string that spells it. The
column, its pgEnum, its derivation and its printed label are gone, and no
identifier spells it. But `readComprobantesListFilters` still calls
`searchParams.delete("porcion")`, alongside the same call for `academia`, so an
old bookmarked list URL is canonicalised rather than kept alive; that is a query
parameter being scrubbed, not a concept being read.
