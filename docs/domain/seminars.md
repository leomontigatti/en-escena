# Seminars

Rules for `Seminario` and `Inscripción a seminario`: a class an event offers
around the competition, created by administration and filled by academies from
their roster. The basis was decided on the wayfinder map
[#857](https://github.com/leomontigatti/en-escena/issues/857) and built in
[#881](https://github.com/leomontigatti/en-escena/pull/881); prices, payments
and the place taken by the deposit were decided on the map
[#884](https://github.com/leomontigatti/en-escena/issues/884). Each rule's
reasoning lives in the ticket that fixed it.

## How to read this document

This document reads like `finances.md`: **unmarked prose describes the code as
it runs**, and a `> **Specified, not built.**` callout describes a settled
target with the issue that owns it. Every callout below is owned by the PRD of
map #884, [#906](https://github.com/leomontigatti/en-escena/issues/906); the
slice that builds a rule promotes its callout to prose. Where a callout
contradicts the prose beside it, the callout is the target and the prose is
what runs today.

## The seminar

- A `Seminario` belongs to one `Evento`. It is **not** part of the
  `Bases del evento`: registration readiness ignores it, and it has its own admin
  section under `Operación`, beside choreographies, professors and dancers.
- It carries the instructor's name, the instructor's picture, a local date, a
  start time and a quota. **It has no name or description of its own**: the
  instructor's name plus the date and time are what an academy reads it by, and
  the same instructor at the same date and time in one event is refused.
- The instructor is free text, not a `Profesor` of any academy. Instructors are
  guests.
- The date and the start time are local business date and time, as a
  `Cronograma`'s are. "The seminar has started" is one rule, computed by
  combining both in the business time zone; no reader recombines them by hand.
  There is no end time.
- The quota is required, at least 1, with no upper bound. It is a **hard cap on
  the places, and a place is taken by covering the deposit** (see "The place"):
  registration is unlimited, there is no waitlist and no override, and when the
  covered inscriptions fill the quota administration raises it or a place frees
  up. It can never be lowered below the covered count.
- It carries a **`seminarKind`** (`Tipo de seminario`), an enum with the values
  `regular` (`Común`) and `special` (`Exclusivo`), not null, `Común` by default.
  It picks which `seminarPrice` rows price the seminar (see "Prices"). It is an
  enum rather than a boolean so a third kind is a value, not a migration.
- It carries its own **`requiredDepositPercentage`** (`Seña (%)`), a not-null
  integer from 1 to 99, 50 by default. It is the seminar's own rate, **not** the
  event's: the rate is what fixes the place, a per-seminar fact, while the price
  list is shared across the event's seminars.
- **Both are refused while any inscription of the seminar is covered** — while
  any has reached the deposit of its stored price row — because both move the
  threshold that took a place. On the form both show the shared read-only look,
  so the refusal is read on sight and not after the save; the server refuses all
  the same, for the race. Nothing is covered until seminar money exists, so
  today the pair edits freely
  (`app/lib/seminars/covered-inscriptions.server.ts`).
- The instructor's picture is optional at creation and uploaded from the
  seminar's detail, like an `eventDocument`. Until then the portal shows a
  placeholder. It is a private `uploadedAsset` of kind `seminarInstructorPicture`,
  served by `signedUrl`, one object per seminar; replacing it leaves no sibling
  behind, and removing it or the seminar removes the object. Deleting the event
  orphans it on the volume, as event documents are orphaned today.
- Administration edits every other field at any time, including after
  inscriptions exist, with two refusals, both after the submission: a seminar
  cannot be deleted while it has inscriptions, and the quota cannot drop below
  the **covered** count — an inscription that has not covered its deposit holds
  no place, so it does not hold the floor up either, and raising the quota is
  always free. Moving a seminar's date into the past simply closes its
  registration.
- **The delete guard counts withdrawn rows.** A withdrawn inscription is off the
  roster but it is still a row, holding money and, eventually, comprobante
  lines, and the seminar's foreign key cascades. Deleting a seminar is therefore
  reachable only by de-allocating every row and removing them, and is
  permanently blocked by a row that was withdrawn while it held money or was
  ever invoiced, exactly as a choreography with a comprobante is
  (`app/lib/seminars/repository.server.ts`).

## Prices

The price list was decided on
[Seminar prices as event-level rows](https://github.com/leomontigatti/en-escena/issues/904)
and its name amendment, and mirrors the choreography price list wherever the
rule fits; every difference is named.

- **A `seminarPrice` (`Precio de seminario`) is an event-level row shared by
  every seminar of the event.** It carries a free-text `name`, a `seminarKind`,
  a `forParticipants` flag (`Para participantes`), a nullable `paymentDeadline`
  and one `amount` of at least 1. There is at most one deadline-less row per
  `(kind, forParticipants)` cell of an event, the row that applies once every
  dated one has expired, exactly as a choreography `price` without a deadline —
  the unique index is created `NULLS NOT DISTINCT`, so two absent deadlines
  collide. The name is a label and is not unique. No seminar owns a price:
  there is no `seminarId` on the table, and deleting the event takes its rows
  with it.
- **The inscription stores `selectedPriceId`**, nullable, referencing a
  `seminarPrice`. It is the column the guards below read; nothing writes it yet
  (see the callout under "The inscription").
- **Guards mirror the built choreography guards verbatim.** A row referenced by
  any inscription, withdrawn included, cannot be deleted, and its amount, kind,
  participant flag and deadline cannot change; its name can. The deadline-less
  `regular` row of a participant cell cannot be deleted or restructured while
  any active seminar inscription of the event exists, even unreferenced; its
  amount and name may change. On the form the guards show on sight — the locked
  fields render through the shared read-only look, `Borrar precio` is disabled
  and its dialog opens blocked, and an `info` alert says why — and the server
  refuses all the same, for the race.
- **Readiness.** A seminar's registration is closed while the event lacks a
  deadline-less `regular` row for **either** participant cell, beside the
  "started" closure — those two are the only ones; a full seminar closes
  nothing. `Exclusivo` rows are optional because of
  the fallback. Event registration readiness keeps ignoring seminars and their
  prices: a seminar is not part of the `Bases del evento`.
- **Where the list lives**: a `Seminarios` tab of the `Precios` section,
  beside the choreography prices; `Nuevo precio` opens the active tab's form,
  and the tab travels in the URL so a link can name it. The table reads the
  name, the kind and the participant cell as two badges, the deadline and the
  amount, with a facet per axis and a warning naming the participant cell whose
  deadline-less `Común` row is missing. The seminar itself stays outside the
  bases and carries no price editor.

How a seminar inscription is priced from those rows:

- **A participant** (`Participando`) is whoever the existing per-event predicate
  says: a `dancer` with a non-withdrawn choreography inscription in the
  seminar's event, or a `professor` linked to a choreography of that event,
  **on the roster row the inscription names** and regardless of that
  choreography's money. A person dancing for academy A and registered into a
  seminar by academy B is a non-participant on B's inscription. The direction is
  choreography → seminar only: a seminar still makes nobody `Participando`.
- **Resolution.** The candidate rows for an inscription are the event's rows of
  the seminar's kind for the person's participant cell, **falling back to the
  `regular` rows** when the kind has none, as a schedule-specific choreography
  price falls back to the general row. There is **no fallback on the participant
  axis**: a participant is priced by `forParticipants = true` rows only. Among
  the candidates the business date picks as it does for choreographies. The
  effective row is `crossed ? stored : (current ?? stored)` through the same
  owner as the choreography rule (`finances.md`, "Prices").
- **What the inscription stores** is `selectedPriceId` alone. The stored row
  carries its own participant flag, so once the deposit is covered the row
  freezes both the tier and the participant fact; nothing else is persisted.
  Below the crossing the participant fact re-derives on every read, and a flip
  says nothing to anyone: the academy is told nothing when its bill moves. A
  covered row keeps its stored row with no anomaly when the person later leaves
  every choreography, or joins one.
- **The deposit** is `round(effectiveRow.amount × seminar.requiredDepositPercentage / 100)`;
  the **total** is the effective row's amount, full stop. Seminar inscriptions
  neither enter the `Descuento por bailarín` qualifying set nor receive it: the
  participant row is already the "you are also dancing" reduction.

- `selectedPriceId` is written by **the allocation dialog alone**, on the admin
  `(seminar, academy)` financial detail — never at creation and never refreshed.
  An inscription nobody has put money on therefore stores nothing and resolves
  against the row that applies today, which is exactly what makes the price
  follow the deadline until somebody says otherwise.

## The inscription

- An `Inscripción a seminario` registers **exactly one roster person**, a
  `Bailarín` or a `Profesor`, into one seminar. There is no "student": the
  people an academy can register are the people on its roster.
- **Only an academy creates one**, from the `Portal de academias`, and only
  for its own roster. Administration never creates a seminar inscription: unlike
  the choreography roster, there is no administrative registration path.
- Eligibility is `Estado de alta` alone, with the same grandfather rule as the
  choreography roster: a person can be registered when they are active, and an
  archived person already on the seminar stays on it, stays visible and stays
  deletable. Dancer verification and age do not gate a seminar.
- Unique per seminar and person. The same person may hold an inscription in any
  number of seminars; overlapping times are not checked.
- Registration is open **until the seminar starts**, independent of the event's
  `Período de inscripción`. Once started, the academy can neither add nor delete;
  the rows stay listed as read-only history while the event is active, and leave
  the portal when it is not, as choreographies do.
- **Removal goes through one chooser on both sides**
  (`app/lib/seminars/inscription-withdrawal.server.ts`): a row holding no
  allocation and no comprobante line is **physically deleted**, any other row is
  **withdrawn** — `withdrawnAt` stamped, the money, the stored price row and the
  `createdAt` all kept. Nothing cascades, withdrawal does not wait for
  de-allocation, and comprobantes gate nothing. What differs between the two
  sides is who may ask and until when, never what happens to the money.
- The academy removes its own inscription until the seminar starts;
  administration removes any inscription at any time, including after the
  seminar has started, from the seminar's detail. Administration's removal is
  the release valve for the refusal to delete a seminar that has inscriptions.
  There is no reason field, no origin flag and no audit trail.
- Removing a row with no money confirms through the shared delete dialog;
  **a funded row confirms through its own dialog**, because the shared dialog's
  `Esta acción es irreversible.` would be false of a row that keeps everything
  it has. It says
  the money stays allocated and the place is freed, and its button reads
  `Retirar inscripción`. No amount appears on either side of the portal: what a
  seminar costs is read in `Resumen financiero`.
- **Revival.** Registering the same person again revives the withdrawn row
  instead of inserting a second one: the id survives, and with it the money, the
  stored price row and the `createdAt`. It is a registration in every other
  respect — under the seminar lock, from the portal, for an **active** person, until
  the seminar starts — and it is the one registration the quota can refuse: a
  row still holding money past its stored deposit takes its place back the
  moment it is active again, so a seminar whose covered rows fill the quota
  refuses it with `Sin lugares disponibles.` and leaves the row withdrawn.
  De-allocating a withdrawn row to zero does **not** delete it; the chooser
  decides once.
- **The row gains `selectedPriceId` and `withdrawnAt`**, the same two fields a
  choreography inscription carries and nothing else financial. It gains no
  `academyId`: the academy is read through the person. Every roster surface
  lists **active rows only**, through `activeSeminarInscription()`; withdrawn
  rows are read under `Finanzas`, badged `Retirada`.
- **Registration is unlimited.** The insert counts nothing against the quota and
  there is no `full` refusal: an academy registers past the quota, and an
  uncovered inscription is intent rather than a place. The registration path
  still locks the seminar row, because the start time and the eligibility are
  read off it, and the only refusals it raises are "started" and an ineligible
  person, plus the missing-price closure above.
- The inscription dates itself by its own `createdAt`, the seminar counterpart of
  `Fecha de inscripción`.

A seminar inscription is an **`inscription`** in the finance sense — the second
kind of allocation target, beside the choreography inscription — and its money
rules live in `finances.md`. The academy therefore has an **academy-driven
withdrawal** that choreographies do not have.

## The place

**Only a deposit-covered inscription holds a place.** "Covered" is
`Σ allocations ≥ deposit of the stored row` with `Σ > 0`, on a non-withdrawn row:
the same predicate that fixes the price. One threshold, both directions, nothing
persisted — covering the deposit fixes the row and takes the place,
de-allocating below it releases both.

- **The quota is enforced on the allocation write.** Every money gesture whose
  target is a seminar inscription locks the seminar row first; the funding write
  counts the covered non-withdrawn inscriptions excluding the one being funded
  and **refuses only the write that would cross** when that count already equals
  the quota, with
  `No quedan lugares en el seminario, así que esta inscripción no puede cubrir su seña.`
  A partial allocation that stays below the deposit goes through even when the
  seminar is full. Two crossings for the last place serialise on the lock.
  Refusals are ordered: no price, then over-allocation, then quota, then
  insufficient pool.
- **Money after the start stays allowed**, and a crossing after the start takes a
  place or is refused like any other. Registration closes at the start; money
  does not.
- **Lowering the quota is refused against the covered count**, under the same
  lock and naming the floor; an uncovered inscription holds no place, so it does
  not hold the floor up either. Raising the quota is free.
- **The only way a covered row loses its place is money leaving it**: taking
  money off, or a payment deletion cascading its allocations. Deleting a payment
  never blocks; its impact list names each seminar, by its instructor, with the
  money leaving it and how many of its inscriptions drop below their deposit and
  lose their place. `Quitar dinero` stays silent about the place. Afterwards the
  row reads `Seña pendiente` like any uncovered row, with no memory of the place.
- **Counts.** `availablePlaces = quota − coveredCount`, which is the `Cupo`
  suffix on the admin list and the figure the detail reads; `registeredCount`
  (all non-withdrawn rows) is a separate figure. Withdrawn rows are in neither.
  `coveredCount ≤ quota` always holds.
- **When covered rows fill the quota**, the admin `(seminar, academy)` financial
  detail carries a non-blocking notice: new inscriptions are accepted, but a new
  inscription's deposit cannot be covered until a place frees up. There is no
  per-row "no place" state: `Señada` already means "holds a place" and
  `Seña pendiente` already means "does not".
- **The band, kept.** The badge reads against the effective row and the place
  against the stored one, exactly as the choreography badge and lock do, so a row
  can read `Señada` without holding a place when a price is lowered under money
  already on it. `finances.md` names it beside the choreography band.
- No bulk gesture over seminar inscriptions: the per-inscription dialog is the
  only money gesture for seminar money.

> **Specified, not built.** The same notice is repeated by the two surfaces that
> do not exist yet: the portal seminar detail
> ([#891](https://github.com/leomontigatti/en-escena/issues/891)) and the portal
> `(seminar, academy)` financial detail, whose copy is
> `podés inscribir igual, pero la seña de una nueva inscripción no se cubre hasta que se libere un lugar`.
> Owner: the PRD
> [#906](https://github.com/leomontigatti/en-escena/issues/906).

## What a seminar does not do

- It does not make anyone `Participando`: the badge and the admin roster filters
  ignore seminar inscriptions.
- It sends no notification on anything: not on register, not on removal, not on
  a covered deposit, not on taking a place and not on losing one.
- It does not appear on the admin dashboard; the list under `Operación` is its
  only admin surface.
- It has no price and no payment **of its own**: the price is the event's list
  in "Prices" and the payment is the academy's event pool (`finances.md`), one
  pool for both kinds of inscription.

## Surfaces

- **Portal**: a card gallery of the active event's seminars, one card per
  seminar with the instructor's picture, name, date and time, the academy's own
  inscriptions as chips, and a footer that holds either `Inscribir` or the
  one-sentence reason it is closed — the seminar started, or the event has no
  seminar price list. The card says nothing about the quota, and a full seminar
  closes nothing: places are taken by money, on administration's side.
  Registering is a dialog with one searchable
  picker over the academy's active dancers and professors in one flat list.
  Without an active event, or without seminars, the shared portal empty state.
- **Administration**: one more admin resource on the schedules' path. A list of
  instructor, date, time and quota with the places left on it (`quota −
coveredCount`); a create page; a detail
  with two tabs, `Información` (the form and the picture) and `Inscriptos` (a
  flat table of name, type and academy, where the name opens the removal
  confirmation).

> **Specified, not built.** Decided on
> [Portal surfaces for seminar money](https://github.com/leomontigatti/en-escena/issues/891)
> and [Admin surfaces for seminar money](https://github.com/leomontigatti/en-escena/issues/890).
>
> - **The portal card becomes a poster**: banner, instructor, date and time,
>   one badge with the academy's own active count, and a single `Ver detalle`.
>   No chips, no statuses, no prices, no `Inscribir`; a started seminar's card
>   is identical to an open one.
> - **A new portal seminar detail** (`/portal/seminarios/:id`) holds the
>   academy's own active inscriptions as a flat table of name and type, owns
>   registration (`Inscribir` as the page action, the built dialog unchanged,
>   with people already actively registered left out and withdrawn people
>   offered for revival) and removal (the shared delete dialog without money, a
>   `Retirar inscripción` confirmation with it), and carries the started
>   notice and the full-quota notice. **No price, deposit, deadline or
>   participant reading appears on any seminar surface**: the academy learns
>   what a seminar costs in `Resumen financiero`, where the effective price's
>   name is the only carrier of the participant fact.
> - **Administration**: the list keeps its shape, with places left counting
>   `quota − covered`; the detail keeps `Información` and `Inscriptos` and
>   gains `Tipo de seminario` and `Seña (%)`, both read-only while any row is
>   covered; there is no prices tab. Seminar prices are edited in the
>   `Seminarios` tab of `Precios`. Money for a seminar lives under `Finanzas`
>   (`finances.md`, "Surfaces").
