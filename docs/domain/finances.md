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
- Economic states of an inscription: `impaga`, `señada` and `pagada`. There is no
  `inactiva` state.
- The economic state is **derived**, not persisted: it is inferred from which
  snapshots are present.
  - No deposit snapshot: `impaga`.
  - Deposit snapshot and no balance snapshot: `señada`.
  - Balance snapshot present: `pagada`.
- Removing an inscription from a choreography (an admin-only action; see
  "Choreography editing and deletion") **physically deletes** it, regardless of
  its economic state. There is no "inactiva" state and no soft delete.
  - Its payment allocations are deleted.
  - **All** the amount it had allocated (deposit and, if it existed, balance)
    returns to the academy's `Saldo disponible` in the active event.
- Adding the same dancer again creates a **new inscription** with a new `id`,
  born `impaga` at the current tentative price.

## Choreography financial state

- A choreography's financial state is derived from its active inscriptions with a
  **watermark** rule, not a minimum:
  - `impaga`: no active inscription is `señada` or `pagada`.
  - `señada`: at least one active inscription is `señada` or `pagada` and not all
    are `pagada`.
  - `pagada`: every active inscription is `pagada`.
- The financial state is not persisted on the choreography record; it is derived
  from its active inscriptions.
- A `señada` choreography **does not go back to `impaga`** when the admin changes
  the roster. Adding an `impaga` inscription to an already signed choreography
  leaves it in a mixed state, but it stays `señada`.
- A `señada` choreography can only drop state through an administrative financial
  correction (for example, deleting the `deposit` allocation of the only
  deposited inscription), not through roster changes.
- The domain state (`impaga`/`señada`/`pagada`) governs ordering, competition and
  the aggregate amounts.
- Only deposited or paid choreographies count for ordering and competition. If a
  choreography loses its deposited or paid state through a financial correction,
  it immediately stops counting for ordering and competition.
- Being paid does not make an operationally incomplete choreography presentable.

### "Needs attention" display

- The admin panel's financial choreography list shows a **"needs attention"**
  display status when the active inscriptions are **mixed** (the normal flow
  cannot resolve them in a single action).
- "Needs attention" is **display-only, derived and not persisted**; it is not a
  fourth domain state and does not affect ordering, competition or aggregates.
  Underneath, a mixed choreography is still `señada`.

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
- The **financial consequence** of adding (an `impaga` inscription) or removing
  (physical delete + return to `Saldo disponible`) **is not resolved in this
  form**: the form only produces the membership change. The impact (including the
  "needs attention" display) is reflected and managed in the **financial views** —
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
- Extraordinary flow (an inscription the admin adds later): administration
  **explicitly picks** a price row (current or an allowed historical one),
  bounded by a **floor**: it cannot pick a price lower than the lowest frozen
  price among that choreography's already `señada` or `pagada` active
  inscriptions. `payment.date` is still stored as the snapshot's reference date.

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

- An `Asignación de pago` applies a payment's balance to one inscription and one
  stage. It is **mutable, deletable current state**, not an append-only ledger
  and not an imputación with reversals.
- The inscription stages are `seña` (`deposit`) and `saldo` (`balance`).
- Each allocation pays one complete stage of one inscription.
- The same stage of an inscription cannot be split across several payments.
- The same payment can be used in several allocations, even at different times,
  as long as it has enough `Saldo disponible`.
- Balance cannot be allocated to an inscription that has no deposit.
- An already paid stage cannot be paid again.
- The allocation is **minimal**: it stores the payment↔inscription money link,
  not price snapshots. The snapshots live on the inscription.
  - Fields: `paymentId`, `inscriptionId`, `academyId`, `eventId`,
    `allocationType`, `amount`, `createdAt`, `updatedAt`.
  - Uniqueness: `(paymentId, inscriptionId, allocationType)`.
  - It stores no user attribution (`createdByUserId`); the system does not audit.

## Normal actions and extraordinary cases

- `Pagar seña` is a normal whole-choreography action. It only appears if every
  active inscription of that choreography is `impaga`. It creates a deposit
  allocation for each active inscription.
- `Pagar saldo` is a normal whole-choreography action. It only appears if every
  active inscription is `señada`. It creates a balance allocation for each active
  inscription.
- Any choreography with mixed states ("needs attention") requires extraordinary
  handling.
- Each inscription unresolved by the normal flow is handled as a separate
  extraordinary case, even when several share the same resolution. An
  extraordinary manual allocation targets a single inscription and a single
  complete stage.

### Extraordinary per-inscription charging

- Extraordinary charging is **per individual inscription**, never for a subset of
  inscriptions: the granularity is one inscription per action, even when several
  orphans share the same resolution. There is no "homogeneous subset charge".
- It covers an inscription's **full ladder**: `impaga` → `señada` (charging its
  deposit) and `señada` → `pagada` (charging its balance). The mixed `pagada` +
  `impaga` case requires walking both rungs on the orphan (deposit it first, then
  pay its balance) to bring it up to its siblings' level.
- Per-inscription deposit charging uses the **extraordinary flow** of explicit
  price row selection with a floor, described in "Selecting the price row when
  freezing". When the first orphan of a mixed choreography is deposited, its
  frozen price joins the set defining the floor for the following orphans.
- Individual charging is only offered on **mixed** choreographies. On a 100%
  `impaga` choreography, the first freeze (which sets the floor) is the one from
  the normal whole-choreography flow; the individual row offers no charging.

### Undoing an allocation per inscription (`delete-allocation`)

- From the choreography's financial view an inscription's allocation can be
  **undone** as a financial correction: dropping one stage (`saldo` → returns the
  inscription to `señada`; `seña` → returns it to `impaga`) while **keeping the
  inscription** in the roster.
- It is a different action from **removing an inscription from the roster** (see
  "Inscriptions"): removing from the roster physically deletes the inscription;
  undoing an allocation does not delete it, it only reverts a per-stage charge.
  The released amount returns to the academy's `Saldo disponible` in the active
  event.
- It is a destructive action on money and asks for confirmation. It runs without
  a reason and without leaving an audit entry (see "No auditing in finances"). If
  the deposit of an inscription that also has a paid balance is undone, the order
  is dropping `saldo` before `seña`.
- **"Uniform row only undoes" rule:** on a **uniform** choreography (all its
  active inscriptions in the same state), the per-row operation of an individual
  inscription **only allows undoing**; "paying" still lives in the
  whole-choreography flow, so the common case is not degraded into N individual
  actions.

## Deposit and balance

- The deposit is computed per inscription: a percentage of its frozen price,
  rounded to whole pesos. A choreography's total deposit is the sum of the
  deposits of its active inscriptions.
- The deposit percentage is an event-level `Bases del evento` setting and
  defaults to 30%. Changing it is not retroactive: each inscription freezes the
  percentage in force when the deposit is allocated.
- The balance is computed per inscription. Base formula:
  `inscription balance = base price - deposit - discounts applicable to that
inscription`. A choreography's total balance is the sum of the balances of its
  active inscriptions.

### Tentative and fixed amounts

An inscription's three amounts — base price, deposit and balance — **always have
a value and are always shown**. What changes with the state is whether that value
can still move. A tentative amount is not a missing amount: it serves as a
reference for administration and for the academy from day one.

They are fixed in **stages**, not all at once:

| State    | Base price | Deposit   | Balance   |
| -------- | ---------- | --------- | --------- |
| `impaga` | tentative  | tentative | tentative |
| `señada` | fixed      | fixed     | tentative |
| `pagada` | fixed      | fixed     | fixed     |

- While the inscription is `impaga`, all three follow the current tentative
  price: if the applicable price row changes, all three change.
- Paying the deposit freezes the base price and the deposit (see "Snapshots").
- The balance of a `señada` inscription **is still tentative**: the `Descuento
por bailarín` only freezes when the balance is allocated, so until that moment a
  roster change can move it (see "Discounts"). This is the only state where the
  amounts of a single inscription are mixed.
- An `impaga` inscription does not count toward the `Descuento por bailarín`, so
  its tentative balance is the plain subtraction `base price − deposit`.
- The UI shows tentative amounts in dimmed text, **per cell and not per row**,
  precisely because `señada` mixes them.

## Discounts

- Within this scope, discounts apply only to the balance, never to the deposit.
- The only automatic discount within this scope is the `Descuento por bailarín`,
  which is computed automatically and lives per inscription.
- The `Descuento por bailarín` counts only `señada` or `pagada` active
  inscriptions of the same dancer, academy and event.
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
from the moment the inscription exists, its balance is owed, even if its deposit
is unpaid. This is what makes the owed amounts comparable with the tables'
reference amounts.

- `Saldo disponible` is the total of active payments minus the total of active
  payment allocations.
- `Seña adeudada` is the sum of the deposits of the `impaga` active inscriptions,
  at the current tentative price.
- `Saldo adeudado` is the sum of the balances of the active inscriptions that are
  **not `pagada`** — that is, `impaga` and `señada`.

Three rules govern both:

- **They aggregate per inscription, never per choreography.** A choreography's
  state is a derived watermark (see "Choreography financial state"): aggregating
  over it would lose the `impaga` inscriptions living inside an already `señada`
  choreography because of a roster change.
- **They are gross**: neither subtracts `Saldo disponible`, which is shown
  alongside as its own metric.
- **They are not disjoint.** An `impaga` inscription contributes to both: its
  deposit to `Seña adeudada` and its balance to `Saldo adeudado`. They are not
  added together; they are two different cuts of the same debt, not two parts of
  a total.

| State    | Contributes its deposit to | Contributes its balance to |
| -------- | -------------------------- | -------------------------- |
| `impaga` | `Seña adeudada`            | `Saldo adeudado`           |
| `señada` | —                          | `Saldo adeudado`           |
| `pagada` | —                          | —                          |

That is why an academy's `Saldo adeudado` **need not match** the sum of the
`Saldo` column of its choreography table: that column also includes the already
`pagada` inscriptions, which are not owed. The difference is exactly what has
already been collected.

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
