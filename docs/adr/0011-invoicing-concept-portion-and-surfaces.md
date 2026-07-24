# ADR-0011: Invoicing concept, derived portion, and comprobante surfaces

**Status**: accepted

Date: 2026-07-23

This ADR records the design decisions taken while aligning the invoicing UI and
ARCA payload with the #339 verdict (issue #474). It revisits and, in places,
corrects prior decisions from the closed issues #323 (billing trigger and
granularity) and #326 (comprobante data model), because implementation surfaced
facts those tickets could not have known.

We invoice electronic **Factura C** vouchers against ARCA WSFEv1 for a
choreography, aggregating the paid portions of its inscriptions. Invoicing is a
derived, immutable document that never governs financial state (see ADR-0009).

## Decisions

### 1. `Concepto` is services (WSFEv1 concepto 2), not products

An inscription to a dance competition is a service (locación/prestación), not a
sale of movable goods. The code shipped `Concepto: 1` (products); ARCA accepted
it in the homologation spike only because WSFEv1 cannot know what is being sold —
it validates field coherence, not the nature of the operation. This restores the
value #323 point 6 had already fixed.

`Concepto: 2` obliges informing `FchServDesde` / `FchServHasta` / `FchVtoPago`,
and widens the `CbteFch` tolerance from N±5 to N±10 days.

### 2. Service dates map to the event, payment-due date collapses to the voucher date

- `FchServDesde` / `FchServHasta` = the event dates (`events.startsAt` /
  `events.endsAt`). This is the only truthful period, and it is identical on the
  deposit voucher and the balance voucher of the same choreography — which a
  credit note must be able to mirror. WSFEv1's only hard rule on these two fields
  is `Hasta >= Desde`; future service dates are valid. A deposit invoiced in June
  will legitimately carry an October service period (an advance on a service to be
  rendered).
- `FchVtoPago` = `CbteFch`. WSFEv1 requires `FchVtoPago >= CbteFch`. Because the
  system invoices only what is already paid, the payment is settled at emission
  and the price-tier `payment_deadline` is always in the past — using it would
  produce ARCA rejections. `= CbteFch` states the truth: due today, paid today.

This holds only because we never invoice before collecting (decision 4). If that
rule were ever relaxed, `FchVtoPago` would become a real datum and this would no
longer be true.

### 3. The comprobante snapshot persists service dates (nullable) and portion (not-null)

- **Service dates**: nullable. The one voucher already emitted went out without
  them (as `Concepto: 1`); a nullable column lets an old voucher tell the truth
  ("carried no service period") instead of being backfilled with dates never sent
  to ARCA. The invariant "if `Concepto = 2` then all three are present" is
  enforced by the payload builder, where it matters.
- **Portion**: a not-null `porcion` enum `{seña, saldo, total}`. Unlike service
  dates, portion is internal (never sent to ARCA), so there is no "lie about what
  was sent" risk; the single existing row backfills deterministically. It is
  not-null because the comprobante is immutable while payment allocations are not:
  deriving portion on the fly would let a three-month-old voucher change from
  "seña" to "saldo" because someone re-imputed a payment today — exactly what a
  snapshot exists to prevent.

### 4. Portion is derived from collection, not chosen

RG 1415 art. 13: for consumer-final operations, partial perception of the price
perfects the operation and triggers the obligation to invoice — not before, not
after. Portion is therefore a consequence of what has been collected, not a user
decision. `resolveBillableLines` already computes the billable remainder per
inscription; it only lacks a name for the result.

Consequences:

- A single `Emitir factura` action, enabled when there is a collected,
  not-yet-invoiced remainder. The preview shows the computed portion and amount
  before confirming.
- This supersedes the three-action habilitation matrix of #323 and dissolves the
  three-forms-vs-two contradiction between #323 and the #339 prototype: nobody
  chooses, so there is no matrix to keep and the three portions are just possible
  results of one button.
- We lose the ability to split an already-complete collection into two invoices.
  Accepted: choreography collection is atomic (all inscriptions `impaga` to take a
  deposit, all `señada` to take a balance), so a mixed remainder is unreachable and
  `{seña, saldo, total}` covers the real case space.

### 5. Comprobante surfaces: a read-only list, a new detail view, and the print document

- ARCA authorizes but does not return a printable document; WSFEv1 yields only the
  CAE. Per RG 1415 (obligation to make the comprobante available to the receiver,
  with the Anexo II data set), the app-owned print document is the only possible
  delivery, not an optional nicety.
- **New comprobante detail view** (`administracion.comprobantes_.$comprobanteId.tsx`,
  which does not exist yet): hosts the actions menu (print, annul). The
  choreography financial detail's per-portion buttons navigate here.
- **Global list** carries no inline action affordances (no app table does):
  columns `# · Tipo · Academia · Coreografía · Estado · Fecha · Importe`, `#`
  links to the comprobante detail, `Coreografía` to the choreography financial
  view. Facets: estado / tipo / academia / porción. Portion is a facet, not a
  column.
- **Choreography financial detail**: the comprobantes section is removed; portion
  MetricCards (`Seña`, `Saldo`) carry a `Vigente`/`Desactualizada` badge plus a
  button (replacing the icon) to the covering comprobante. There is no `Anulado`
  state — on annulment the badge and button disappear. Annulment happens from the
  comprobante detail, not here.

### 6. Consequent-action dialogs use `AlertDialog` without a confirmation checkbox

The emission and annulment dialogs are confirmations, not forms, so per #453 they
belong on `AlertDialog`. The confirmation checkbox is ceremony of the kind #453
removed, and its copy ("irreversible, cannot be undone") is false: annulment via
credit note exists. Copy states what happens and the real escape hatch instead.

## Consequences

- The one existing `Concepto: 1` voucher stays as historical fact; nullable
  service-date columns and a deterministic portion backfill keep it truthful.
- Within the #474 branch the comprobante dialogs are the only `AlertDialog`
  confirmations while deletions remain on `Dialog`; the #453 sweep (on a parallel
  branch) never inventoried these files. This is transient and merge-safe (disjoint
  files).
- Out of scope, recorded: invoicing several choreographies in one voucher (would
  require relaxing the not-null `choreography_id` anchor); adding a dancer to an
  already-señada choreography leaves it unpayable through the atomic collection
  guards.

Supersedes the granularity portion of #323 (three actions → one derived action)
and refines the portion axis of #326 (derived and frozen, not chosen).
