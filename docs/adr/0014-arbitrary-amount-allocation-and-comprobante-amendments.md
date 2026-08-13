# ADR-0014: Arbitrary-amount allocation, the live discount, and the comprobante amendment star

**Status**: accepted

**Supersedes**: ADR-0011, ADR-0012

Date: 2026-08-07

Finances stopped being a two-rung ladder. Money is now allocated in arbitrary
amounts from a pool, competing is gated by a **threshold** rather than by a
stage, the base price is fixed by **crossing** that threshold rather than by the
calendar, the `Descuento por bailarín` is **always live**, and every movement of
an already-invoiced choreography is documented by a nota de débito or a nota de
crédito derived from a single subtraction. This ADR records **why**, once, for
the whole of map #547 and its twenty-one decisions.

It is deliberately a single decision record rather than an amendment per
overturned decision, following the convention #625 adopted and ADR-0013's
precedent: an amending ADR leaves topically identical documents of which one is
true, discriminated only by a `Status` field that semantic retrieval does not
honour. `docs/adr/` is append-only, so the wrong ADR cannot be undone, only
superseded.

**This ADR carries rationale only.** The model as it stands — entities, derived
figures, states, formulas — lives in
[docs/domain/finances.md](../domain/finances.md) and must be read there. An ADR
that also carried current state would reproduce the defect #625 documents.

## Why both ADR-0011 and ADR-0012 are superseded, and ADR-0009 is not

**ADR-0011 (_Invoicing concept, derived portion, and comprobante surfaces_) does
not survive as a document.** Its organising concept is `porción`, and #554
deleted `porcion` outright — column, pgEnum, `derivePorcion`,
`formatComprobantePorcionLabel` and every reader. Its §4 one-synthesized-line
print contract is replaced by **one line per inscription**, and its §5 binary
`vigente` / `desactualizada` currency is replaced by `vigente` / `ajustada` /
`anulada`, derived by amount. An ADR stripped of the concept in its own title is
not that ADR amended. What is still live in it is restated below.

**ADR-0012 (_ARCA unreachable contingency and recovery_) is amended past the
point where leaving it standing is safe.** #578 **repaired its decision 4** — the
`(impTotal, cbteFch)` recovery matcher, whose defence was that amounts derived
from collected payments make a collision unreachable, and both of whose premises
this map removed — and **reversed its decision 5**. Its decisions 1, 2, 3 and 6
stand and are restated below. Leaving a live ADR with two contradicted decisions
is exactly the failure #625 diagnosed.

**ADR-0009 (_Inscription-based finances_) is ratified, not superseded.** Map
decision 11 re-tested it against a deliberate attack — the permanently live
discount looked like it needed a cache — and sized the fully derived read at an
event's largest: ~500 choreographies, a dancer in no more than five or six of
them, ≈4.000 inscriptions. That is a few MB. `Pago` + `Asignación de pago` stay
the single operational source of truth, with no persisted financial state, no
audit and no attribution fields, because that is the correct model at this
scale and not a compromise. Both exceptions asked of it were denied; see below.

## 1. The ladder retired for a threshold

An inscription is competable when `Σ allocations ≥ requiredDepositPercentage ×
price`. `Etapa de inscripción` is replaced by a threshold reading, not by
nothing. The old model — transact exactly one rung's worth or nothing — could
not express a partial payment, which is what the business actually receives.

**There is no freeze event.** Crossing is a pure derivation over money,
recomputed on read; nothing is written to mark it. This was re-tested when the
base price came to be fixed at the crossing (§3), which looked like it required a
write there. It does not: crossing means the refresh simply **stops** on
subsequent allocation writes.

`allocation_type` is dropped with the ladder. An allocation is `(payment,
inscription, amount)`. Any stored typing is order-dependent and goes stale when
an earlier allocation is deleted, so `allocationDeletionRank` and the
"Borrá primero la asignación de saldo" guard disappear — money is fungible, so
there is no reversal order. Provenance still matters (deleting a payment can
un-cross a threshold); only the money's _role_ is fungible.

Rejected:

- **The two-rung model itself**, kept with a wider vocabulary. It cannot
  represent an arbitrary amount without inventing a third rung, and then a
  fourth.
- **A freeze event** writing the crossing. It is persisted financial state
  ADR-0009 forbids, and everything it would buy is derivable.
- **A ledger allocation table**, append-only with reversals. It contradicts
  ADR-0009's mutable, deletable current-state assignments, and it reintroduces
  the ordering decision 5 killed _inside_ the `(payment, inscription)` pair —
  "take $3000 back" has no determinate answer across three rows.

## 2. Arbitrary-amount allocation and its consequences

The allocation row is **unique on `(payment_id, inscription_id)` with a mutable
`amount`**, written via `ON CONFLICT DO UPDATE`, deleted at zero (a zero row
asserts a history this table does not hold) and guarded by `amount > 0` — the
first CHECK constraint in the repo. Negatives are ruled out because
`Σ allocations` would then be reachable by two different row-sets.

**The admin never picks a payment.** This question was dissolved rather than
answered: nothing in the settled model reads the payment→inscription link. The
price does not (§3), the threshold does not, the discount does not, and the
factura does not — RG 1415/2003 art. 8º discharges the duty to invoice
"con independencia de la modalidad de pago utilizada". An allocation is drawn
from `Saldo disponible`; `spreadFromPool` consumes payments **oldest-first by
`paymentNumber`** and deallocation unwinds **newest-first**, the exact inverse.
Accepted with eyes open: a payment's coverage becomes system-authored, and
deleting a payment punches holes in an arbitrary-looking set.

**Over-allocation is passive.** The excess stays where it is and surfaces as a
derived per-inscription anomaly. Returning it automatically by _writing_ is the
freeze event this map abolished; returning it by _derivation_
(`totalPaid − Σ min(allocated, owed)`) would make the same money exist twice.

Rejected:

- **The payment picker**, on both the allocation and the deallocation dialog.
  Nothing reads the link it would let the admin author. Accepted cost: an admin
  can no longer lift one specific payment off one inscription; the remedy is to
  delete the payment.
- **Auto-refill** after a payment deletion. An automatic financial mutation with
  no admin behind it is the shape ADR-0009 exists to avoid.
- **Active over-allocation on the write path** (warn-and-allow). The resulting
  anomaly would be indistinguishable from the passive one, and the two need
  opposite responses. Accepted cost: permissibility becomes order-dependent.
- **Append-only price rows.** The existing freeze already has a natural release
  valve plus useful friction.
- **Blocking a downward threshold crossing** on deallocation. A guard there is
  `paymentDeletionBlockers` reborn. Payment deletion is unconditional.

## 3. The base price is fixed by crossing the threshold, not by time

Below the threshold, `selectedPriceId` is refreshed to the currently applicable
row **on every allocation write**; at or above it the refresh stops and the price
is fixed. The admin's pick is therefore a **confirmable default**, not a blank
choice, and the price list stops being enforced only _after_ crossing. Reads
derive `effective = crossed ? stored : (current ?? stored)`.

**The load-bearing subtlety: `crossed` is always tested against `stored`.** That
is what keeps #583's circularity broken — evaluating the threshold needs a price,
and deriving the price needs the threshold. There is no fixed point to solve,
because it is the **write path** that refreshes, not a read-time derivation, and
the displayed figure therefore equals what the next write will use. The `??
stored` fallback exists because `selectApplicablePriceFromCandidates` has no
fallback to an expired row, so `current` can be null; falling back to the last
row the price list actually offered keeps every figure non-null and real rather
than fabricated.

The fix holds against the passage of **time**, not against a change in **what is
being sold**: a roster write that changes `groupType` refreshes
`selectedPriceId`, threshold or no threshold. `deriveGroupType` is a pure
function of roster size, so one dancer entering a settled duo makes it a trio and
would otherwise leave both originals holding a duo price — a figure that is not
in the price list at all. If no row applies to the new `groupType`, **the roster
write is refused**.

`selectedPriceId` is never null and is written at **creation**: portal creation
is already gated on price coverage by `event-not-ready`, so `missingPrice` stops
being a state an inscription can be in, and the signal moves to event readiness.

Rejected:

- **Reference-date derivation** of the price row, and the today's-price ceiling
  and `resolveInscriptionDepositFloor` that supported it.
- **A blank price pick** (decision 3 as originally taken). It made the price list
  a menu from the first allocation.
- **A cron keeping the stored row current.** It would re-materialise a value the
  read already derives, add its own staleness window, and write financial state
  in the background — three things ADR-0009 forbids.
- **A nullable `selected_price_id`.** It buys nothing portal readiness does not
  already give, and revives `orphanedAllocations` and `Sin precio`.
- **Blocking or warning on a `groupType` mismatch.** Blocking demands tearing
  down real money to fix a price; warning bills a duo price to trio members.
- **Keeping any estimate marking.** #618 applied the test — _is there a figure of
  which it can be said it no longer moves?_ — and found none. A marking true of
  every cell distinguishes nothing, so the muting is deleted rather than re-keyed
  and replaced by an unconditional, column-level decorative style. The hard rule:
  the muting can never vary per row, because the moment one cell is muted and its
  neighbour is not, the grey means something again.

## 4. The dancer discount is always live

The `Descuento por bailarín` is recomputed on every read, before and after
emission alike. There is no freezing moment, no `grantedDancerDiscountAmount`,
and no carry-forward. Its qualifying set is **per academy and per event**, and
counts **registered** active inscriptions rather than threshold-crossed ones,
which collapses two clocks into one and makes totals order-independent.

The fiscal argument is the densest part of the map, and it is what the rejected
option founders on. Freezing the discount at emission and carrying the
unrealised remainder forward was justified by "a comprobante documents cash
received, not amount owed". That is wrong on the law: **RG 1415/2003 art. 8º**
makes the duty to invoice independent of the payment modality, and **art. 10 inc.
d)** says recibos are expressly not valid as facturas. The replacement
justification — that the discount is never an invoice line item, so **RG
4540/2019** has nothing to bite on, and the improvement lands on the next bill as
a _bonificación on the next operación_ — survived longer but was also given up:
with the discount live, every adjustment carries **its own document**, which is
what RG 4540/2019 asks for directly. There is no third door: a discount is either
determinable at emission or it is a nota de crédito.

This is why the printed line reads `Inscripción — {dancer}` at the **net
amount, with no discount item**. That is not cosmetic — rendering
`Precio / Descuento` would forfeit the argument above. The word `Inscripción`
stays because RG 1415 wants a description identifying the service.

Rejected:

- **Freezing at emission and carrying forward.** Three mechanisms existing solely
  to paper over the freeze, on a fiscal footing that had already been demolished
  once and rebuilt once.
- **Recording what was granted** on the inscription (§9).
- **A discount line on the printed comprobante.**

## 5. The invoice as obligation, and the delta

A factura is emitted once a choreography is `Señada` and `total > 0`, never
before, and it bills the **full price** rather than the collected deposit.
Collection is what unlocks emission; it is never the amount. From there, every
emitter — factura, nota de débito, nota de crédito — computes the same
subtraction:

    delta = derived total − documented,  where documented = FC + ΣND − ΣNC

and **the sign names the document**. One function serves all three. This buys a
**reconciliation invariant the previous model could not express**: for any
choreography, `FC + ΣND − ΣNC` must equal its currently derived total, so a
roster change that never got its document is _detectable_ instead of silently
drifting.

The gate is **per choreography, all-or-nothing**, and the deciding argument is
structural rather than operational: the invariant only detects anything if
emission leaves the delta at **zero**, and billing only the crossed subset would
make every factura born with a normal positive delta. Accepted cost: one unpaid
dancer blocks the whole choreography's factura. `Señada` gates the **first**
document only — ND and NC have no gate whatsoever, else a newly added unpaid
dancer would forbid the very ND the delta demands while the 15-día clock runs.
`overAllocated` and the delta **warn, never block**, because a choreography with
an unresolved withdrawal must be able to emit the NC that withdrawal requires.

**The amendment structure is a star, not a chain.** Every ND and NC anchors at
the factura and depth is permanently 1. The chain's premise failed: the delta is
computed per choreography, so removing two dancers at once — one billed on the
FC, one on a later ND — yields a single NC spanning two parents. The singular
`associatedComprobanteId` FK survives _because_ of the star; what had to go is the
`comprobante_associated_unique` index, which capped a choreography at one
amendment ever.

The star's fiscal footing is textual. **RG 4540/2019 art. 3, 2nd paragraph**
carries the individual-identification duty (RG 1415 art. 3 is not about this — it
regulates who must use a Controlador Fiscal), and every article of RG 4540 names
the adjustment's target as _"factura o documento equivalente"_. **A nota de
débito is not a "documento equivalente"** under RG 1415: art. 9 defines that as
an instrument _substituting_ the factura or remito, and the ND appears separately
at art. 8 inc. a) point 5, distinct from "documentos equivalentes" at point 8. RG
4540 therefore never contemplates an ND as an adjustable target, and **no
nearest-document rule exists** to violate. Secondarily, §2 opens _"No obstante lo
indicado en el párrafo precedente"_, so _"individualmente"_ contrasts with
_período_, not with nearest-versus-anchor.

`CbteFch` defaults to today and is admin-overridable within ARCA's window.
**10016 is excluding** and enforces monotonicity, so backdating is a permanent
ratchet; the floor is `max(last authorized CbteFch in that series, today − 10)`,
computable locally. RG 4540 art. 3 requires the NC/ND within **15 días corridos**
from the adjusting event — a deadline counted _from the event_ only makes sense
if the document's date is the **emission** date, which makes lateness a
compliance fact legible on the document rather than an error state.

`deriveComprobanteStatus` becomes `vigente` / `ajustada` / `anulada`, derived by
amount on the factura alone; NDs and NCs carry no status. Total annulment is the
limit case (`ΣNC == FC`).

Rejected:

- **Billing the crossed subset.** Destroys the reconciliation invariant, as above.
- **Annul-and-re-emit instead of the ND**, which would have reused proven
  machinery. Rejected deliberately, accepting a new document type (Nota de Débito
  C, `CbteTipo` 12) and the derivation cost.
- **A chain of amendments**, and its two variants: splitting an NC per parent,
  and a `comprobante_association` join table.
- **`Anular comprobante` as an action.** It is deleted, not rewritten: keeping it
  would manufacture a positive delta demanding an ND for the amount just
  credited. The comprobante detail has no destructive actions left.
- **`Estado` on the printed document.** A mutable field on an immutable
  document; RG 1415 does not require it, and ARCA has no such concept — an
  annulled factura's CAE stays valid, and the NC is what documents the
  annulment.
- **A storage-level constraint** alongside the advisory lock (§7). A trigger
  fires _after_ the CAE exists, so refusing the insert would leave an authorized
  voucher with no row — strictly worse.

Costs accepted: **WSFEv1 10237** fires whenever ΣNC exceeds the _factura's_
importe even though it never exceeds `FC + ΣND`. It is **non-excluding**, so it
is noise rather than a block; it is one-directional, firing only when the NC
exceeds its associated comprobante, and no WSFEv1 validation requires
`ΣNC = FC`. **10197 is excluding** (an NC/ND needs `PeriodoAsoc` or at least one
associated comprobante) and **10210 is excluding** once backdating exists.
**10040** confirms an NC C may associate an ND C, and **10060** forbids repeats
in `CbtesAsoc`. The repo held no empirical evidence of 10237's behaviour, so it
was routed to homologación with the ND emitter (#686).

## 6. Soft withdrawal, refunds, and the forfeited seña

Roster removal became a **conditional soft withdrawal**: it hard-deletes when the
inscription has neither allocations nor a `comprobante_inscription` line, and
sets `withdrawnAt` otherwise. The condition _is_ the justification — the previous
hard delete destroyed, by the very act that required it, the evidence needed to
emit the NC. Nothing cascades; the admin deallocates and emits deliberately. The
decision is taken once, at removal, and never revisited. Re-adding **revives**
the row, because that is what actually happened. `withdrawnAt` is roster state,
not financial state, so **ADR-0009 is untouched**.

A withdrawn inscription does **not** owe zero. Its derived total is **what
remains allocated to it**, and `NC = línea facturada − retenido`. The seña of a
withdrawn dancer may be forfeited — there is a reglamento, outside the repo,
under which the seña is lost unless a medical certificate excuses it, and the
model's answer-by-omission of a total return, documented in four places, was
never the business rule but the absence of one. The admin chooses the amount in
the deallocation dialog. The partial NC is therefore the shape of **every**
withdrawal, and a full forfeit produces **no NC at all** — which is also what
makes the 15-día clock run exactly when an NC is owed.

The decisive argument for that shape is internal: under it, the remaining
allocation **is** the obligation. The alternative — a withdrawn row owing zero —
leaves money allocated to a row that owes nothing, so the entity holds **income
with no document behind it**: the allocation says _money is retained here_ and
the document says _nothing is owed_, two contradictory statements.

The clause-level fiscal finding is worth preserving because it is the opposite of
what was assumed. **The retained seña is not consideration as the reglamento
currently reads.** The seña is _confirmatoria_ by default (CCyC art. 1059 — the
trigger for _penitencial_ is an express exit right), but _"se pierde salvo
certificado médico"_ reads as a **cláusula penal**, because art. 792's template
is "debe la pena si no prueba la causa extraña" and requiring a justification
presupposes the withdrawal is wrongful. Either way the money is not price:
cláusula penal → indemnización (art. 793); seña penitencial → precio del
arrepentimiento. Only _confirmatoria_ plus a **reducción parcial convenida**
makes it price. Hence **Opción B, precio desagregado**: a reglamento clause
splitting the price into a _derecho de inscripción y gestión de cupo_ devengado
in the act of inscription and a _derecho de participación_ devengado with the
event, with the anticipo expressly seña confirmatoria and _pago a cuenta de
precio_, no facultad de arrepentimiento, expressly not a pena, and the baja as a
**reducción parcial de la operación** (CCyC arts. 1077 y 1081 inc. b). Four
drafting rules: never write _pierde_ / _penalidad_ / _multa_; state the negations
expressly; name a **real divisible service**; and do not condition the retention
on the absence of an excuse. The abusiveness caution stands not on consumer law
but on the reglamento being a **contrato por adhesión** (CCyC arts. 987, 988,
989): re-labelling a forfeit as price with no real divisible service behind it
remains the risk.

Two corrections to earlier citations belong on the record: **RG 4540 art. 2 is
silent** on both the partial amount and the penalty characterisation, so
"a direct reading of art. 2" was withdrawn and replaced by _not prohibited by any
relevado norm, and made accurate by the reglamento's precio-desagregado clause_ —
form B's legitimacy comes from the reglamento, not from the RG. And **RG 1415
art. 13, not art. 8, is the timing article**; art. 8 is the correct cite only for
_"con independencia de la modalidad de pago"_.

The **10-día irrenunciable revocation window does not apply**, and nothing was
built for it. Ley 24.240 art. 1 defines the consumidor as whoever acquires or
uses as _destinatario final_; an academia contracting a roster for its own
dancers buys an input to its professional activity, so there is no relación de
consumo, CCyC art. 1105 never engages and arts. 1110/1111 have nothing to attach
to. The consumidor-equiparado door (art. 1092 §2) does not open it either, since
equiparación presupposes a relación de consumo and a non-party cannot revoke a
contract they are not party to. **This holds because the counterparty is always
an academia**, which portal registration structurally guarantees
(`requireAcademyUser`). If that ever changes, the remedy is
`withdrawnAt − createdAt ≤ 10 días` forcing the withdrawn row's derived total to
zero — no new column, ADR-0009 intact.

A **refund** (`Reembolso`; `Devolución` is reserved for the judge's private
feedback audio) is a separate, explicit operation mirroring `Pago`: academy,
event, amount, date, `refundMethod` reusing the existing `paymentMethod` enum,
`refundNumber` from `nextRefundNumber`, **never with allocations**, capped at
`Saldo disponible`. `Saldo disponible` becomes `paid − allocated − refunded`. The
NC reduces what is _owed_, the refund moves _money_, and either can happen
without the other — with one bounded exception: on a **withdrawn** row, moving
money does move the obligation, which is the direct consequence of the paragraph
above.

Rejected:

- **A universal soft withdrawal.** It would force relaxing
  `choreography_dancer_unique` and accumulate phantom rows for no gain.
- **The full-line NC.** It leaves income with no document behind it, as above.
- **Modelling a refund as a negative `Pago`.** It poisons every `sum(amount)` in
  `operational-summary.server.ts`, and allocations of a negative payment are
  meaningless. Counter-movement rows were rejected for reintroducing the ledger
  ADR-0009 declined.
- **Netting refunds into `FC + ΣND − ΣNC`.**
- **A brake on inaction.** An anomaly would fire eternally on the legitimate
  case, and distinguishing deliberate retention from a pending release needs the
  ADR-0009 exception denied in §9. Accepted, stated plainly: **inaction is the
  harshest outcome** — withdraw and touch nothing and the seña is fully
  forfeited, silently, with no NC.

## 7. Two races, two mechanisms

They are different races and neither mechanism closes the other.

**The delta race is per choreography.** Two concurrent emissions on the same
choreography would each read the same `documented` and each bill the same delta.
It is closed by a session-level `pg_try_advisory_lock` on the choreography id,
held across the ARCA round-trip, fail-fast, with the `ΣNC ≤ FC + ΣND` check moved
**pre-ARCA, inside the lock**.

**The correlative race is per series**, because the correlative is global per
`(ptoVta, cbteTipo)` — nothing about a choreography scopes it. #599's claim that
the advisory lock also closed it was **withdrawn**; it cannot. It is closed
instead by reserving the correlative **before** the ARCA round-trip (lookup →
compute → insert-and-commit the reservation → `FECAESolicitar`) behind a unique
index on `(ptoVta, cbteTipo, cbteNro)`. Emission therefore stops being one
transaction.

The reservation lives in its **own table**, not in `comprobantes`, because
`cae` / `caeVto` are `notNull` there and an unauthorized row would silently enter
`FC + ΣND − ΣNC` and report phantom drift. A live reservation holds its
correlative and **blocks its series** — releasing buys nothing, since a
re-submission would eat a 10016 rejection anyway — and **the block is the
surface**: no worklist, no periodic sweep. Resolved reservations are **deleted**,
because a table accumulating failed attempts is an audit log, which ADR-0009
forbids.

This reframes what #578 was actually about: the problem was never that
`(impTotal, cbteFch)` is a weak matcher, but that **the app kept no record of
what it had attempted**. Strengthening the matcher was rejected as impossible in
principle — `FECompConsultar` returns nothing identifying the submitter. A
mismatch now gets its own terminal state, `number-taken`, distinct from
`unverified`: re-checking it is futile, and it is resolved by abandoning the
reservation, which is safe because a foreign voucher at N means
`FECompUltimoAutorizado ≥ N`. Reconciliation **persists what was submitted and
re-checks nothing**, because preconditions gate _emission_, not _recording_, and
any resulting drift is already the delta of §5.

## 8. Carried from ADR-0011 and ADR-0012 without change

Restated here because the documents that held them are superseded.

From **ADR-0011**:

- **`Concepto` is services (WSFEv1 concepto 2), not products.** An inscription to
  a dance competition is a locación/prestación. ARCA accepted `Concepto: 1` in
  the homologation spike only because WSFEv1 validates field coherence, not the
  nature of the operation. `Concepto: 2` obliges informing `FchServDesde` /
  `FchServHasta` / `FchVtoPago` and widens the `CbteFch` tolerance to N±10 days.
- **Service dates map to the event** (`events.startsAt` / `events.endsAt`) — the
  only truthful period, and identical across a choreography's documents, which a
  nota de crédito must be able to mirror. WSFEv1's only hard rule is
  `Hasta >= Desde`; future service dates are valid.
- **`FchVtoPago` = `CbteFch`**, which WSFEv1 requires to be `>= CbteFch`. The
  price-tier `payment_deadline` is always in the past and would produce
  rejections. **Caveat, recorded and not re-decided here:** ADR-0011 justified
  this as "due today, paid today", which held because it never invoiced before
  collecting. Under §5 the factura bills the full price at `Señada`, so a balance
  may be outstanding at emission and that justification no longer applies. The
  value stays valid under the WSFEv1 rule; only its rationale is now the weaker
  one that no truthful alternative is available.
- **One factura per choreography.** `comprobantes.choreographyId` stays
  `notNull`; ADR-0011's paragraph on this is upheld rather than overturned. The
  multi-choreography voucher is dropped — the gate is per choreography and
  choreographies reach it at different moments, so a single voucher was never
  achievable, and the amendment star is per choreography, so a shared voucher
  would degrade the reconciliation invariant from per-obligation to
  per-voucher-group. `Emitir facturas` survives as a **bulk trigger emitting N
  facturas**.
- **Consequent-action dialogs use `AlertDialog` without a confirmation
  checkbox.** They are confirmations, not forms.

From **ADR-0012**, decisions 1, 2, 3 and 6 in full:

1. **A communication failure is classified by phase**, because the risk is
   asymmetric: losing the connection during `FECompUltimoAutorizado` proves
   nothing was authorized, while losing it during `FECAESolicitar` leaves open
   whether a CAE was granted. `@arcasdk/core` declares no error classes and no
   error codes, so phase is the only reliable discriminator available.
2. **Timeouts are imposed at our wrapper, as code constants** — 15s for lookup,
   30s for authorization, deliberately generous because WSFEv1 routinely takes
   double-digit seconds under load and every premature cutoff manufactures
   ambiguity. Racing a timeout **does not cancel the in-flight request**.
3. **Authorization ambiguity is resolved by consulting ARCA**, not by asking the
   operator, who has no information to contribute and no judgment to exercise.
   `null` from `FECompConsultar` only proves nothing was emitted if the
   authorization request **finished**: a transport failure ends it, our own
   timeout does not, so a timed-out authorization with a `null` consult falls
   through to unresolved rather than to "safe to retry".
4. **The UI states what was resolved, not which call broke** — `rejected` /
   `not-emitted` / `unverified`. Phase is an input to the server's recovery
   logic and never reaches the client.

Decision 4 is superseded by §7's reservation, which identifies the submission by
construction instead of matching on `(impTotal, cbteFch)`. Decision 5 is
reversed: attempts _are_ persisted, as reservations, and deleted on resolution.

## 9. Two exceptions to ADR-0009, both asked for and both denied

Both will be asked for again, so they are recorded as rejected options rather
than left as absences.

- **`grantedDancerDiscountAmount`** (ui _Descuento otorgado_). Won as map
  decision 8 — a column on the inscription recording the discount already
  granted, to prevent a removed-and-re-added dancer being granted it twice — and
  **revoked** when the discount became always live (§4): with nothing frozen
  there is nothing to record, what was _billed_ is carried by the
  `comprobante_inscription` lines, and the double-grant it defended against is
  answered by the soft withdrawal of §6, which stops destroying the link in the
  first place.
- **`Descuento administrativo`.** Closed as out of scope of the map, which is a
  scoping act and not an answer — its own questions are left standing. Three
  reasons. Nothing on the map depends on it: all twenty-one decisions were
  re-read and it appears in none. The 80% case is already covered, because §3
  lets the admin pick the price row explicitly and a price row is where a
  commercial arrangement belongs. And the reason it keeps being deferred is
  structural: it is **the one figure in the model with no derivation behind it**,
  so it must be persisted, which is precisely the exception ADR-0009 forbids.
  Whoever defines it must argue for that exception — the same one
  `grantedDancerDiscountAmount` won and lost. The term stays **reserved and
  deliberately undefined**, not tombstoned.

## 10. The academy is told nothing when its bill moves

No signal, on either side of emission. The academy is not told that its total
moved and is not told that a nota de débito or nota de crédito is coming. This is
a decision, not an inheritance from the estimate marking having been deleted.

Before a factura exists there is nothing to compare against, and recording the
"before" is the ADR-0009 exception denied in §9. The only expressible signal is a
permanent property — _"this figure can still change"_ — true of every figure at
every moment, which is the failure §3 already diagnosed.

After emission the delta is derivable at zero cost, so cheapness was never the
question; whether it tells the academy anything is. It does not, on three
independent grounds. **Nothing is actionable in either direction**: the derived
total the portal renders is already the correct current obligation, and the
pending document adds no fact the academy can act on — an academy cannot resolve
a nota de crédito. **The withdrawal signal already exists on the roster axis**,
where the withdrawn row stays visible with a `Retirada` badge and the retained
amount in the money column — a signal keyed to an actual event, naming the money.
The map's framing that "the academy has nothing" was true only on the fiscal
axis. And **there is no invoice in the academy's hands to reconcile against**:
there is no delivery channel at all, and the receptor is an anonymous consumidor
final, so two numbers are never in view and there is no discrepancy to explain.

One case does not explain itself: because the discount's qualifying set is per
academy and per event, a dancer registering in choreography B moves the tier and
changes the total of choreography A, whose own roster was untouched. It still
gets nothing. A's total is correct, the composition tooltip already renders in the
portal, and a banner on A explaining a change caused elsewhere is the provenance
surface ruled out of scope (#663) entering through the window, on the wrong
choreography.

Recorded so it is not re-run: had a signal been owed it would have been
**passive**, on the portal's finance surfaces. An active outbound message has
nowhere to fire — there is no scheduler, queue, worker or SSE, and the delta is
derived on read, so the moment it becomes non-zero is a moment nobody observes.
The academy and admin registers are **asymmetric by design**: the admin gets the
delta with sign and amount because the admin emits the document.

## Consequences

- ADR-0011 and ADR-0012 are superseded and point here. Nothing is deleted: the
  rationale in those files is the record the append-only rule exists to protect.
  What is still live in them is restated in §8 rather than left to be retrieved
  from a superseded document.
- ADR-0009 stands, cited and re-ratified rather than amended. Any future request
  to persist a financial figure has to answer §9, not merely assert convenience.
- The current-state model is not here. It is
  [docs/domain/finances.md](../domain/finances.md), rewritten for this map by
  #666, and the identifier → UI term mapping is in
  [CONTEXT.md](../../CONTEXT.md).
- #625 item 1 — moving superseded ADRs into `docs/adr/superseded/` — is still
  open, and this ADR adds two more documents to its case. It was deliberately not
  done here: `app/lib/shared/domain-docs.test.ts` synchronises a non-recursive
  `readdir("docs/adr")` against a README link regex requiring `./` followed
  immediately by four digits, so moving files breaks that test and the naive fix
  makes it pass **by omission**, green over a partial set.
- The bulk emitter is **N single emissions driven in sequence by the client**,
  because ARCA's 10016 forces sequentiality wherever the loop runs. A durable job
  was rejected on what it buys: the process cannot finish without a human present
  anyway, since an `unverified` outcome requires an admin. Closing the tab stops
  the batch, and `Detener` stops after the choreography in flight —
  cancellation is not available and never will be, per §8 decision 2.
- The choreography-level anomaly slot is empty by design.
  `deriveChoreographyNeedsAttention` and then `groupTypeMismatch` were both
  deleted, and refilling the slot was declined: the delta of §5 is the anomaly,
  split into two members by sign, and it subsumes the pending-resolution anomaly
  the soft withdrawal originally carried.
- The 15-día clock is a countdown on that existing anomaly, scoped to
  withdrawal-driven deltas, because the clock's start is not derivable in general
  and `withdrawnAt` is the only movement date the system persists. There is no
  worklist and no notification.

## Correction (2026-08-13): `porcion` was still live when this was written

Appended, not edited in place: `docs/adr/` is append-only, so the claim below
stays where it was made and this is the record that it was wrong.

The supersession section above — "Why both ADR-0011 and ADR-0012 are superseded,
and ADR-0009 is not" — argues that ADR-0011 does not survive as a document and
gives as its ground that **"#554 deleted `porcion` outright — column, pgEnum,
`derivePorcion`, `formatComprobantePorcionLabel` and every reader."**

**That was never true.** #554 closed as a map decision, not as an implementation:
no code changed under it. Every symbol the sentence names was live on `master`
the day this ADR was accepted and stayed live for six days after it — the
`en_escena_comprobante_porcion` pgEnum, a `NOT NULL DEFAULT 'total'` column,
`derivePorcion`, `formatComprobantePorcionLabel`, the `Porción` field on the
comprobante detail, the printed `{Porción} — {Coreografía}` line, and the
`Vigente` / `Desactualizada` badges on the financial detail's two portion cards.
#712 was still repairing the derivation in `emit-factura-c.server.ts` afterwards,
which a deleted field cannot have.

The conclusion the sentence supports is unaffected: ADR-0011's organising concept
is `porción` and it is superseded either way. What was wrong is the tense.

The deletion is real as of the PR that appends this paragraph, and it is the
whole of it — column, pgEnum, derivation, label, filter, printed label and the
two portion badges. Two decisions it forced, neither settled here:

- The printed line reads `Inscripción — {coreografía}` rather than the
  choreography name alone. A bare proper noun would repeat the receptor block and
  describe no service; the noun is the one §5 gives the settled per-dancer line,
  so only its right-hand side moves when #657 lands.
- The `Vigente` / `Desactualizada` badges were read and removed. They derived
  from `porcion` outright, which the two-badge shape gives away: there was one
  per portion. The identically-labelled `Vigente` on the comprobante list and
  detail is a different badge — the derived `vigente` / `anulada` status — and it
  survives untouched.

The rest of §5, §6 and §7 remains specified and not built. Owner: #657.
