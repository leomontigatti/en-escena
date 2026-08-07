# Finances

Canonical doc for the financial model based on `Inscripción` and `Asignación de
pago`. It captures domain decisions; it does not define the database schema or
the screens. The architecture decision lives in
[ADR-0009](../adr/0009-inscription-based-finances.md).

## Scope

- The financial model takes `Inscripción` as the canonical economic unit.
- `Pago` and `Asignación de pago` are the operational source of truth. There is
  no `Factura de coreografía` and no `Imputación` in the operational model.
- `Imputación` is a retired concept.
- Invoices are outside the current operational scope; if they come back, they
  should be a derived document reading from payments, allocations and
  inscriptions, and never govern financial state.
- Finances does not audit changes (see "No auditing in finances"), and neither
  does the rest of the system: there is no administrative audit trail anywhere.
- Outside this scope: money refunds, administrative discount and the full
  lifecycle of choreographies without active inscriptions.
- Persisted monetary amounts are whole Argentine pesos throughout the app; the UI
  does not show cents. Percentages may use decimals internally, but amounts are
  rounded to whole pesos before persisting, with commercial rounding to the
  nearest peso.
- In V1, `Administrador` can mutate financial records and `Auditor` can read
  them.

## Inscriptions

- An `Inscripción` links a choreography with a dancer, has its own economic
  identity and a **stable identity** (its own `id`, not the composite
  choreography+dancer key).
- Financial statuses of an inscription: `depositPending`, `depositMet` and
  `paidInFull` (see "Inscription financial status"). There is no `inactiva` state.
- The status is **derived**, not persisted: it is read from `Σ allocations`
  against the deposit and total thresholds, and nothing is written when one is
  crossed.
- The `impaga`/`señada`/`pagada` **ladder stage** still exists, but only inside
  the write path of `Pagar seña` / `Pagar saldo`, derived from snapshot presence.
  It is not what any screen shows, and it dies with the `frozen_*` columns.
- Removing an inscription from a choreography (an admin-only action; see
  "Choreography editing and deletion") **physically deletes** it, regardless of
  its economic state. There is no "inactiva" state and no soft delete.
  - Its payment allocations are deleted.
  - **All** the amount it had allocated (deposit and, if it existed, balance)
    returns to the academy's `Saldo disponible` in the active event.
- Adding the same dancer again creates a **new inscription** with a new `id`,
  born `depositPending` at the current price.

## Inscription financial status

An inscription's status is read from `Σ allocations` against its two thresholds,
recomputed on read. **Nothing is written when a threshold is crossed.**

| UI               | Value            | Definition                                    |
| ---------------- | ---------------- | --------------------------------------------- |
| `Seña pendiente` | `depositPending` | `Σ allocations < depositAmount`               |
| `Señada`         | `depositMet`     | `depositAmount ≤ Σ allocations < totalAmount` |
| `Pagada`         | `paidInFull`     | `Σ allocations ≥ totalAmount`                 |

`paidInFull` rather than `paid` deliberately: the boundary is `≥`, not `=`,
because passive over-allocation is tolerated.

An inscription whose price cannot be resolved reads `Seña pendiente`: a threshold
that cannot be computed cannot have been crossed.

## Choreography financial status

- A choreography's status is the **minimum** over its inscriptions on the scale
  `depositPending < depositMet < paidInFull`. One uncovered dancer pulls the whole
  choreography down, because the badge answers _can this be performed as
  choreographed_.
- It is a minimum and **not a watermark**. The watermark it replaces let a
  choreography with a straggler inside read `Señada`, i.e. _can compete_, when it
  could not — and `deriveChoreographyNeedsAttention` existed only to compensate
  for that. Both are gone; the minimum says what to do rather than that something
  is irregular, and it still sorts and filters.
- A choreography with no inscriptions reads `Seña pendiente`: it cannot compete
  either.
- The status is not persisted on the choreography record.
- `Pagada` **may un-stick** when a sibling changes a dancer's discount tier. That
  is accepted; the anomaly makes it visible and no mechanism prevents it.
- Only choreographies that have crossed count for ordering and competition. If one
  drops status through a financial correction, it immediately stops counting.
- Being paid does not make an operationally incomplete choreography presentable.

## Anomalies

A derived **array**, all self-clearing comparisons of current state, persisted
nowhere.

| Anomaly         | UI              | Predicate                     |
| --------------- | --------------- | ----------------------------- |
| `overAllocated` | `Sobreasignada` | `Σ allocations > totalAmount` |

`Sobreasignada` is `destructive`, not amber: beside `Seña pendiente` two amber
badges would read as one kind of fact.

## Choreography editing and deletion

There is no per-choreography roster lock, no roster state enum, no unlock cycle
and no request actions. The restriction is **permanent and role-based**.

- **Creation (academy):** creation is **atomic** — the choreography is persisted
  when the last dialog step is confirmed; there is no "draft" state.
  - The initial roster and professors are **mandatory** in that dialog
    (professors move from optional to mandatory).
  - The final step's summary shows an **alert** that the data must be verified,
    because the academy will not be able to change it afterwards.
- **Academy, post-creation:** the only thing it can modify is the **audio file**.
  It never edits the roster and never deletes the choreography. There are no
  change-request or deletion-request actions.
- **Administrator:** the only one who can modify any choreography data (including
  the roster: adding or removing inscriptions) and **physically delete it**, at
  any time — with **one single exception**: the block due to an **associated tax
  receipt** (see below).
- Removing an inscription (physical delete + returning everything allocated to
  `Saldo disponible`, see "Inscriptions") is therefore an admin action.
- There is no `has_active_financial_link` column and no editing gate derived from
  active invoices; the editing restriction is role-based. (The tax receipt block
  below is different: it is not an _editing_ gate but a _deletion_ one, and it
  does not derive from the old invoice model but from an ARCA receipt with a
  CAE.)

### Deletion block due to a tax receipt

A choreography with **at least one associated ARCA receipt** (a derived receipt
with a CAE; see the ARCA electronic invoicing specification, issue #320)
**cannot be physically deleted**. A receipt with a CAE is **immutable and
undeletable by fiscal obligation**, and the model keeps the invariant that every
receipt keeps its anchor choreography alive (there are no orphan receipts).

- **Scope of the block:** **any** associated receipt counts, in **any** state —
  `vigente` **or** `anulada`, including **Nota de crédito** rows (type 13). The
  mere existence of fiscal history is enough.
- **Never released:** annulling with a Nota de crédito does **not** enable
  deletion; annulled CAEs must also be preserved. A choreography that was ever
  invoiced becomes **permanently undeletable**.
- **It only blocks deletion, not roster editing.** Adding or removing dancers is
  still allowed: the amount change is handled through the "stale receipt → annul
  with a Nota de crédito" path (see the invoicing spec, issue #320), not by
  blocking the roster. This distinguishes it from the block due to an
  **associated presentation** (provisional), which does freeze the roster.
- **Server-side enforcement (hard invariant).** The deletion rejection is
  **always applied on the server**, independently of the UI: the state can change
  between render and click (a receipt issued concurrently) and the fiscal
  invariant cannot depend on the client. How the block is **presented** in the
  admin panel (a disabled affordance with a reason, hiding it, or an error toast)
  is defined in the issuing UX design, not here.

### Roster editing from administration

- Roster editing happens in the admin panel's **choreography detail/form** (where
  the physical deletion already lives). It is not a new screen.
- From that form the admin unlocks only **dancers and professors**; the remaining
  fields stay read-only. Modifying dancers uses the same multi-combobox as
  creation.
- Changing the set of dancers **re-resolves** live the **group type** (by count),
  the **category** (by ages) and the **experience level** (per the category).
  Those fields are shown read-only and their value updates on recalculation;
  **experience level and schedule become selectable** only when the re-resolution
  requires it (a category that requires a level; a group type change forcing a
  schedule re-pick).
- If the roster does not resolve to a **compatible category**, it cannot be
  saved.
- **Professors** have no financial or resolution dimension: adding or removing
  them cascades into nothing else.
- The **financial consequence** of adding (a `depositPending` inscription) or
  removing (physical delete + return to `Saldo disponible`) **is not resolved in
  this form**: the form only produces the membership change. The impact — which a
  minimum rollup surfaces directly, by pulling the choreography's status down — is
  reflected and managed in the **financial views** —
  the academy's financial list and the choreography's financial detail. The save
  confirmation is a **generic notice** that the edit may need attention in the
  financial state, with no amounts and no price selection.
- **Provisional (to revisit):** a choreography with an **associated presentation**
  cannot edit its roster (a hard block, like the deletion block).
- Editing the **music file** from administration is out of this map for now; it
  is shown read-only in the form.

## No auditing in finances

- Finances **does not audit changes**. There are no audit entries for payments,
  allocations or inscriptions, nor for the choreography roster in its financial
  dimension. No other part of the system audits either: the administrative audit
  trail was retired.
- Roles: a single `Administrador` (edits) and a single `Auditor` (read-only). The
  auditor reads data; in finances there is no record of who changed what.
- Financial records carry **no** annulment fields (`annulled*`, `cancelled*`) and
  no actor attribution (`createdByUserId`); with a single administrator they
  distinguish nothing.
- Destructive actions (deleting a payment, deleting a choreography, removing an
  inscription, an extraordinary allocation) run without a reason and without
  leaving an audit entry.

## Prices

- The portal shows `Precio tentativo de inscripción` while the inscription is
  `impaga`.
- The **deposit allocation is the event that freezes the price**. A `señada` or
  `pagada` inscription shows its frozen price.
- For an inscription added to an already deposited or paid choreography, the
  tentative price can change while it stays `impaga`.
- An already frozen inscription is **immutable**; a roster change does not touch
  its frozen price or its snapshots.
- `Precio de coreografía` is the amount derived from the prices of its active
  inscriptions: the **sum of the base prices per inscription**. It is estimated
  while there are unfrozen inscriptions and final once all are frozen. The form
  "applicable price × number of inscriptions" is only a valid special case
  **while every inscription shares the same uniform tentative price**; as soon as
  one freezes a different price (through a price row change or the extraordinary
  flow), it stops holding and prices must be summed one by one.
- A price has historical operational dependencies when it is referenced by the
  snapshot of a `señada` or `pagada` inscription. Tentative prices do not block
  changing prices.
- If an applicable price is missing for an inscription contributing to `Seña
adeudada` or `Saldo adeudado`, the affected amount is pending or incomplete,
  not zero.
- **Known divergence: the admin dancer detail resolves prices without a
  reference date.** `readDancerInscriptions`
  (`app/lib/admin/dancers/dancers-inscriptions.server.ts`) calls
  `resolveApplicablePrice` with no `paymentDate`, and
  `selectApplicablePriceFromCandidates`
  (`app/lib/events/bases-repository/prices.server.ts`) skips deadline filtering
  entirely when the date is absent, then sorts dated rows before undated ones.
  The dancer detail can therefore show an **expired** price row as
  `Subtotal estimado`, contradicting the finance read model for the same
  inscription. That view also hardcodes `discountAmount: 0`, so the
  `Descuento por bailarín` never reaches it. Tracked in
  [#584](https://github.com/leomontigatti/en-escena/issues/584); the price
  lifecycle itself is [#583](https://github.com/leomontigatti/en-escena/issues/583).

### Selecting the price row when freezing

- The freezing reference date is the `payment.date` of the payment chosen for the
  deposit allocation.
- Normal flow (`Pagar seña` for a whole choreography): the price row is
  **derived automatically** from `payment.date` against the current price
  deadlines. Administration does not pick a row; its only lever is which payment
  it uses.
- Per-inscription flow (`Asignar plata`): administration **explicitly picks** a
  price row inside the allocation dialog, filtered to the choreography's group
  type and schedule. There is no floor and no today's-price ceiling — an
  arbitrary amount against a threshold has no rung to stay between — and the pick
  is only offered until the first allocation fixes it. See "The money dialogs of
  an inscription".

## Payments

- Administration can register a payment before or after allocating it.
- A V1 payment requires an academy, an active event, a payment date, an amount
  and a payment method. The amount must be positive; corrections are made by
  deleting the wrong payment, not by registering negative or zero amounts.
- The payment date cannot be in the future.
- V1 payment methods: transferencia, efectivo, mercado_pago and otro.
- V1 payments have a visible internal number, sequential within the event; it is
  not a fiscal number.
- The payment's reference and internal note are optional in V1. Internal notes
  are not shown in the Portal de academias. Uploading receipts is out of V1.
- A registered payment can stay as the academy's `Saldo disponible` until it is
  allocated to one or more inscriptions.
- Payments and allocations do not cross academies. A payment registered for the
  wrong academy is deleted and registered again.
- Money refunds are out of the V1 financial flows; surpluses stay as `Saldo
disponible` in the active event.

## Payment allocations

- An `Asignación de pago` applies a payment's balance to one inscription. It is
  **mutable, deletable current state**, not an append-only ledger and not an
  imputación with reversals.
- An allocation is **an amount against an inscription**, with no stage and no
  role. Any amount can be recorded, and one inscription's money can come from
  several payments.
- The same payment can be used in several allocations, even at different times,
  as long as it has enough `Saldo disponible`.
- The allocation is **minimal**: it stores the payment↔inscription money link,
  not price snapshots. The snapshots live on the inscription.
  - Fields: `paymentId`, `inscriptionId`, `academyId`, `eventId`, `amount`,
    `createdAt`, `updatedAt`. The row carries **no type**: money is fungible, so
    an allocation is an amount against an inscription and nothing else.
  - Uniqueness: `(paymentId, inscriptionId)`. The row is written by upsert
    (summing), a CHECK constraint keeps `amount > 0`, and a decrement to zero
    deletes it.
  - Deleting a payment cascades its allocations in the database; there is no
    reversal order and no blocking case.
  - It stores no user attribution (`createdByUserId`); the system does not audit.

## The pool rules

Funding an inscription and unfunding it are the two halves of one invariant, and
they live in one module (`app/lib/finances/allocation-pool.server.ts`).

- **The invariant**: `Saldo disponible = Σ payments − Σ allocations − Σ refunds`,
  and it can never go below zero. The floor is **structural, not a clamp**: every
  allocation is capped against what is still free in the payments, and a
  payment's `amount` is write-once. There is no subtraction that could overshoot.
  - The refunds term is part of the rule but **is not implemented yet**: there is
    no refunds table or column, so until [#536](https://github.com/leomontigatti/en-escena/issues/536)
    lands, `Saldo disponible` reads as `Σ payments − Σ allocations`.
- **Funding (`spreadFromPool`)**: the administrator names an inscription and an
  amount, never a payment. The system consumes the academy's payments
  **oldest-first by payment number**, creating or incrementing the
  `(payment, inscription)` row until the amount is covered.
- **Unfunding (`unwindToPool`)** is the exact inverse: it consumes that
  inscription's allocations **newest-first by payment number**, decrementing and
  deleting the row at zero. Funding an amount and immediately unfunding it
  returns the rows to their prior state.
  - The round trip is exact as long as what is unwound is the last thing funded.
    If money is freed on a payment older than one where the inscription already
    held an allocation, the total comes back the same but may be split
    differently across payments: money is fungible and no provenance is stored,
    which is precisely what keeps a reversal order from coming back.
- **Over-allocation**: **active** over-allocation is refused on the write path,
  with **no override** — a write that would push an inscription above its
  `Total` is rejected, which is why owed is computed on the write path and not
  only on read. **Passive** over-allocation already recorded is tolerated: it
  stays where it sits, stays readable, and only an administrator moves it.
- **Accepted cost, stated plainly**: a specific payment can no longer be lifted
  off a specific inscription. The remedy for a payment recorded in error is
  **deleting the payment**, which cascades its allocations.

## Normal actions and extraordinary cases

- `Pagar seña` is a normal whole-choreography action. It only appears if every
  active inscription of that choreography is `impaga`. It allocates each active
  inscription's `Seña adeudada` from the pool.
- `Pagar saldo` is a normal whole-choreography action. It only appears if every
  active inscription is `señada`. It allocates each active inscription's
  `Saldo adeudado` from the pool.
- Neither names a payment: they are **presets over the figures**. The amount is
  the owed figure, computed on the write path from the same derivation the
  screens read, and the pool decides which payments it comes from.
- A preset is **all or nothing**. If the pool runs dry partway through a
  choreography, or any inscription is refused, the whole charge rolls back:
  nothing is allocated and no snapshot is frozen. An administrator who sees an
  error can trust that nothing moved.
- The price row and the reference dates they freeze are resolved against the
  **business date**, not against a payment's date.
- An inscription that already holds money keeps the price it holds: the preset
  skips its snapshot and only tops it up to its own deposit, because the price is
  fixed from the first allocation.

## The money dialogs of an inscription

The choreography financial detail has **one entry point per inscription** — the
dancer's name — and the dialog behind it takes its shape from what the row holds.
Nothing is resolved from a payment in either direction: the administrator names
an inscription and an amount, and the pool rules pick the payments.

| Row                       | What opens                                          |
| ------------------------- | --------------------------------------------------- |
| over-allocated            | `Liberar el excedente`: one click, nothing to type  |
| nothing owed, money on it | `Quitar plata`, prefilled with everything allocated |
| anything else             | `Asignar plata`: price and amount                   |

A row that still owes something but already holds money reaches `Quitar plata`
from inside the allocation dialog, so removal is available wherever there is
money to take off while the entry point stays single.

### Allocating (`allocate-inscription`)

- **Any amount is allocatable.** A partial allocation is an ordinary outcome: the
  row reads `Seña pendiente` with its shortfall, not as unpaid.
- The owed figure is a **placeholder, never a prefilled value**, because it moves
  while the dialog is open — the discount is live. The hint is the figure that
  finishes the next thing: the seña while that threshold is unmet, the saldo once
  it is met.
- The **price is chosen inside this dialog and never in a table cell**. The picker
  is filtered to the choreography's group type and schedule; offering a foreign
  row would be offering to create a forbidden state.
- The price is **locked** — not merely warned about — from the first allocation
  on. The dialog shows it as a readout, the write path refuses a different row,
  and the database holds the same rule through the guard trigger on
  `selected_price_id`. The way to change it is to take the money off first.
- Active over-allocation is refused with **no override**, so this is the only one
  of the three gestures that can bounce.

### Removing (`remove-inscription-money`)

- The amount is **prefilled with everything the inscription holds** and any
  smaller amount is accepted. It is a real value rather than a hint, because what
  is allocated is a fact and does not move under the administrator.
- It unwinds **newest-first** through `unwindToPool`; the administrator never
  chooses a payment. The released amount returns to the academy's
  `Saldo disponible` in the active event.
- **Removing money never blocks.** The status and the figures simply re-derive
  from what remains, and the ladder snapshots are reconciled against it.
- It is a different action from **removing an inscription from the roster** (see
  "Inscriptions"), which withdraws or deletes the row itself. It runs without a
  reason and without leaving an audit entry (see "No auditing in finances").

### Releasing the excess (`release-inscription-excess`)

- One button that takes off **exactly** what the inscription holds above its
  `Total` and nothing more, leaving the rest where it is. The excess is computed,
  so there is nothing to pick and nothing to type.

### No price control on the removal shapes

Neither removal shape shows a price control, not even a locked one. Price is an
allocation-time concern: on a row whose money is leaving the price is not the
question, and taking the money off is precisely what opens the lock.

## The four figures

Every figure is derived on read; none is persisted.

```
inscription.depositAmount       = round(selectedPrice.amount × event.requiredDepositPercentage / 100)
inscription.totalAmount         = selectedPrice.amount − liveDancerDiscountAmount
inscription.owedDepositAmount   = max(0, depositAmount − Σ allocations)
inscription.owedBalanceAmount   = max(0, totalAmount  − Σ allocations)
inscription.overAllocatedAmount = max(0, Σ allocations − totalAmount)
```

- **Scope-owned**: inscription, choreography and academy each carry them.
  `choreography.*` sum over its inscriptions, `academy.*` over its choreographies.
- **`depositAmount` is computed from the undiscounted price**, so the threshold
  cannot move under the academy when the roster changes a discount tier.
- **The discount is applied once, inside `totalAmount`**, with no coalesce and no
  third subtrahend — it is always live, so every consumer inherits it and none can
  forget it.
- `owedDepositAmount` (`Seña adeudada`) is the shortfall to the deposit threshold
  and stands in strict containment: `Seña adeudada ≤ Saldo adeudado`, always.
- The deposit percentage is an event-level `Bases del evento` setting and defaults
  to 30%.
- The superseded per-inscription `Saldo de inscripción` (`base − deposit −
discount`) is **gone, not renamed**: both of its subtrahends moved.

Every figure an academy reads is **exact and is exactly what it must pay**. There
are no tentative amounts in the model: the earlier staged freeze — base price and
deposit fixed at deposit time, balance at balance time — is gone with the ladder.

## Discounts

- Within this scope, discounts apply only to the balance, never to the deposit.
- The only automatic discount within this scope is the `Descuento por bailarín`,
  which is computed automatically and lives per inscription.
- On the **read side** the `Descuento por bailarín` is always live: the qualifying
  set is the dancer's active roster in the same academy and event — every
  inscription with a resolvable price, whatever its status. It **cannot** be gated
  on the financial status, because the discount enters `totalAmount`, and
  `totalAmount` is what decides the status: gating it would be circular.
- The **freeze path** (`Pagar saldo`) still counts only `señada` or `pagada`
  inscriptions of the same dancer, academy and event. That is the ladder's own
  rule, and it dies with the snapshots.
  - **Known divergence (the code does not honour this everywhere).** The freeze
    path scopes the qualifying set to `academyId + eventId`
    (`app/lib/finances/choreography-cobro-support.server.ts`), as documented. The
    estimate path groups by `dancerId` alone over rows scoped to the event and
    the requested academies
    (`app/lib/finances/operational-summary.server.ts`), and the admin finances
    list requests **every academy of the event**
    (`app/features/admin/finances/list/server.ts`). A dancer inscribed in two
    academies of the same event is therefore pooled in that list but not at
    freeze, so the list can display a discount the freeze will then refuse to
    grant. The single-academy reader passes one academy id and is unaffected.
    Estimate-versus-freeze parity is tracked in
    [#489](https://github.com/leomontigatti/en-escena/issues/489). The standing
    recommendation on
    [#552](https://github.com/leomontigatti/en-escena/issues/552) is **per
    academy** — the freeze path and this doc are right and the estimate path is
    the bug, because the factura goes to the academy, so a per-event scope would
    move Academy A's bill on account of Academy B's inscriptions, which A cannot
    see, control or pay. That recommendation is **not confirmed**.
- `Descuento por bailarín` rule:
  - 1 or 2 active inscriptions of the same dancer in the same event and academy:
    no discount.
  - 3 active inscriptions: 10% discount.
  - 4 or more active inscriptions: 15% discount.
- The percentage is computed on the frozen price of each discounted inscription
  and applied to the balance.
- In discounted cases, one active inscription of the dancer is left without a
  discount: the most expensive one, ordering the qualifying inscriptions by base
  price descending. **On a price tie the winner is decided by the inscription's
  `id`**, which is a UUID
  (`app/lib/finances/operational-summary-calculations.server.ts`,
  `computeDancerDiscountAmounts`), so the tie-break is arbitrary and not
  chronological.
  - Ties are the common case, not the exception: inscriptions in the same
    choreography share a price row, so they share a base price.
  - The tie-break does not move money. A tie means the prices are equal, so the
    total discount is the same whichever inscription is exempted; what changes is
    only **which** inscription displays and freezes the full price. The cost is
    legibility — an admin asking "why is this one at full price?" has no answer.
  - A date-based rule cannot be implemented as-is: `choreography_dancer` has no
    `createdAt` column (`app/db/schema/choreographies.ts`), so it would need a
    schema change.
  - **Nobody currently owns the decision.** The per-dancer exclusion selection is
    in the scope of
    [#489](https://github.com/leomontigatti/en-escena/issues/489), and
    [#584](https://github.com/leomontigatti/en-escena/issues/584) records the
    divergence, but the question is not on the open list of
    [#552](https://github.com/leomontigatti/en-escena/issues/552). Until it is
    settled, this paragraph describes the code, not an endorsed rule.
- While an inscription is `señada`, the dancer discount used for pending amounts
  is **estimated dynamically**.
- When the balance is allocated, the applied dancer discount is **frozen** on the
  inscription (amount and percentage).
- The freezing is **sequential and irreversible**: each balance allocation
  freezes with the best estimate at the time and is not re-settled retroactively.
  The "ideal snapshot" of the dancer's discount is only guaranteed if the whole
  choreography's balance is paid in a single action (`Pagar saldo`).
- **Per-inscription** balance charging (extraordinary) freezes the `Descuento por
bailarín` against that dancer's `señada`/`pagada` roster **current at the moment
  that balance is paid**. This is **asymmetric** relative to sibling inscriptions
  that already paid their balance earlier: each froze with the count current at
  its own moment, so two inscriptions of the same dancer can end up with
  different frozen discounts. It is an intentional consequence of the sequential,
  irreversible freezing, not a bug.
- `Descuento administrativo` is out of scope and pending definition.

## Aggregate amounts

### Per choreography

A choreography's three metrics are **direct sums over its active
inscriptions**, tentative or fixed:

- `Seña` is the sum of the deposits of its inscriptions.
- `Saldo` is the sum of the balances of its inscriptions.
- `Pagado` is the sum of the payment allocations of its inscriptions.

`Pagado` **need not match** `Seña` or `Saldo`: it matches `Seña` when the
choreography is deposited and the roster has not changed since, and it diverges
as soon as an inscription is added or removed after a stage was paid. That
divergence is information, not a calculation error.

### Per academy

**A registered choreography is owed in full.** There is no "not yet due" debt:
from the moment the inscription exists, its total is owed, even if nothing has
been allocated to it.

- `Saldo disponible` is the total of active payments minus the total of active
  payment allocations. It **cannot go below zero structurally** — no clamp is
  involved — because every allocation is capped against the pool and a payment's
  amount is write-once.
- `Seña adeudada` and `Saldo adeudado` are **gross**: neither subtracts `Saldo
disponible`, which is shown alongside as its own metric.
- They aggregate **per inscription, never per choreography status**.
- They are **not disjoint**: an inscription with no money contributes its deposit
  shortfall to one and its total shortfall to the other. They are two different
  cuts of the same debt, not two parts of a total, and `Seña adeudada` is
  contained in `Saldo adeudado`.

The Portal de academias and the Panel de administración use the same calculation,
and the primary amounts in both are `Seña adeudada`, `Saldo disponible` and
`Saldo adeudado`. The Portal de academias is read-only in V1: academies do not
initiate payments and do not upload receipts.

## Snapshots

Snapshots live on the **Inscripción**, not on the allocation. The minimal
allocation contributes the payment's traceability.

- Deposit snapshot (set when the `deposit` allocation is created; cleared if that
  allocation is deleted, returning the inscription to `impaga`):
  - `frozenBasePriceAmount` — frozen base price.
  - `selectedPriceId` — the price row used, for historical dependencies.
  - `depositReferenceDate` — the `payment.date` used.
  - `depositPercentage` — the deposit percentage in force when freezing.
  - `depositAmount` — deposit = round(`frozenBasePriceAmount` × `depositPercentage`).
- Balance snapshot (set when the `balance` allocation is created; cleared if that
  allocation is deleted, returning the inscription to `señada`):
  - `balanceReferenceDate` — `payment.date` of the balance payment.
  - `appliedDancerDiscountPercentage` — frozen dancer discount percentage.
  - `appliedDancerDiscountAmount` — frozen dancer discount amount.
  - `finalTotalAmount` — the inscription's frozen final total.
  - `balanceAmount` — = `finalTotalAmount − depositAmount`.
  - `balanceCompletedAt` — = `payment.date` of the balance payment.

## Transition from invoices and imputaciones

- **Complete removal** of the invoices/imputaciones module in V1: the
  `academy_event_choreography_invoice` and `academy_event_invoice_imputation`
  tables, their server code and their UI are deleted. `Pago` + `Asignación` are
  the only operational source of truth.
- Future invoicing (an optional document for an amount the admin decides, not
  tied to deposit/balance/total or to the operational state) is **not built in
  V1**; if it is revisited, it is a **derived** document reading from
  payments/allocations/inscriptions and never governing the financial state.
- From finances, only the **financial choreography list and detail** and the
  **payments list** survive in the UI.
- **Existing data:** in production there are no invoices, imputaciones, payments
  or allocations (finances starts greenfield, with no backfill). There are
  inscriptions: the existing `choreography_dancer` rows are preserved and
  migrated to the new model (stable id + `null` snapshots → all `impaga`). The
  `has_active_financial_link` column is dropped.
- **Mandatory professors** is enforced through creation validation, without a
  hard retroactive constraint, so existing choreographies without a professor are
  not broken.

## Explicit open items

- Decide whether money refunds or an equivalent mechanism exist; for now, every
  released amount stays as `Saldo disponible`.
- Define `Descuento administrativo`.
- Define the lifecycle of a choreography without active inscriptions.
- Redesign future invoices, if revisited, as derived documents.
