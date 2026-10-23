# Seminars

Rules for `Seminario` and `Inscripción a seminario`: a class an event offers
around the competition, created by administration and filled by academies from
their roster.

## How to read this document

This document reads like `finances.md`: **unmarked prose describes the code as
it runs**, and a `> **Specified, not built.**` callout describes a settled
target with the issue that owns it. Where a callout
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
  the places, and a place is taken by a live reservation or by covering the
  deposit** (see "The place"): registration is unlimited, there is no waitlist and no override,
  and when the covered and reserved inscriptions fill the quota administration
  raises it or a place frees up. It can never be lowered below the covered
  count.
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
  and an `info` alert above the tabs says why, in the same sentence the server
  refuses with, so the refusal is read on sight and not after the save; the
  server refuses all the same, for the race. An inscription is covered once its
  allocations reach that deposit
  (`app/lib/seminars/covered-inscriptions.server.ts`).
- The instructor's picture is optional at creation and uploaded from the
  seminar's detail, like an `eventDocument`. Until then the portal shows a
  placeholder. It is a private `uploadedAsset` of kind `seminarInstructorPicture`,
  served by `signedUrl`, one object per seminar; replacing it leaves no sibling
  behind, and removing it or the seminar removes the object. Deleting the event
  orphans it on the volume, as event documents are orphaned today.
- Administration edits every other field at any time, including after
  inscriptions exist, with two refusals: a seminar cannot be deleted while it
  has inscriptions (`Eliminar` opens the blocked delete dialog, which says what
  it takes, covered inscription or not), and, after the submission, the quota
  cannot drop below
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

The price list mirrors the choreography price list wherever the
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
  fields render through the shared read-only look under an `info` alert that
  says why, and `Eliminar` opens the blocked delete dialog with the reason —
  and the server refuses all the same, for the race. The
  sentences are the choreography list's, shared in `app/lib/prices/guards.ts`,
  and the choreography price form shows its guards the same way.
- **Readiness.** A seminar's registration is closed while the event lacks a
  deadline-less `regular` row for **either** participant cell, beside the
  "started" closure — those two are the only ones; a full seminar closes
  nothing. `Exclusivo` rows are optional because of
  the fallback. The screens say it before the submission, and the
  registration service refuses with the same sentence, from either side, a
  request that skips them (`registerSeminarInscription`). Event registration readiness keeps ignoring seminars and their
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
  seminar by academy B is a non-participant on B's inscription (#615 is where
  that could change). An **individual's** inscription is participant when any
  row its `Vinculado` link reaches meets the same predicate, in any academy and
  whatever that row's `Estado de alta`; without a confirmed link it is priced as
  a non-participant (ADR-0019,
  `app/lib/finances/seminar-participation.server.ts`). The direction is
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

- `selectedPriceId` is written by **the allocation dialog**, on the admin
  `(seminar, academy)` financial detail, and by the **`Pagar seña` /
  `Pagar saldo` presets** over the selected seminars of an academy's finance
  page — never at creation and never refreshed. The dialog stores the row
  picked; a preset stores the row that applies today on an inscription that
  holds none, and in place of a held row of the other participant cell below
  the deposit, never replacing a row of the person's current cell
  (`finances.md`, "Per seminar"). An
  inscription nobody has charged therefore stores nothing and resolves against
  the row that applies today, which is exactly what makes the price follow the
  deadline until somebody says otherwise.

## The inscription

- An `Inscripción a seminario` registers **exactly one person** into one
  seminar: a roster person, a `Bailarín` or a `Profesor`, or an `individual`
  (`Particular`) registering itself (ADR-0019). There is no "student": the
  people an academy can register are the people on its roster. The individual
  is an inscription person kind, not a roster kind: no roster table holds it.
- **An academy creates one** from the `Portal de academias`, only for its own
  roster; **an individual creates its own** from its area's `Seminarios`, owned
  by its owner row, under the same quota, reservation, deposit, cut-off and
  removal rules. Administration never creates a seminar inscription: unlike
  the choreography roster, there is no administrative registration path.
  Administration lists and exports an individual's inscription beside the
  academies' ones, as `Particular`, badges it `Particular` on its seminar
  financial lists, and removes it as any other.
- **An academy sees a linked individual's inscription, read-only.** When the
  individual's confirmed link reaches an **active** `Bailarín` or `Profesor` of
  the academy, its non-withdrawn inscriptions show on the academy's seminar
  detail with the `Particular` kind, no `Estado` and no removal, and on its
  seminar financial detail at `$0` badged `Particular`, after the unit's
  figures, its `Saldo disponible` and the presets were derived without them.
  Nothing of the individual's money reaches the academy, and the row names the
  person as the academy's own row does. Archiving or deleting that row, or
  revoking the link, takes it away
  (`app/lib/seminars/linked-individual-inscriptions.server.ts`). A seminar the
  academy itself registered nobody in has no financial unit of its own, so its
  finances list it anyway at zero, badged `Particular` and outside every
  total, and its financial detail opens with those rows alone. The unit's
  `Inscriptos` counts them, as it counts the rows its detail lists; it is the
  only figure of the unit they reach. Administration's academy finances count
  them in the same `Inscriptos` without listing their rows, whose money it
  reads on each individual's own page.
- Eligibility is `Estado de alta` alone, with the same grandfather rule as the
  choreography roster: a person can be registered when they are active, and an
  archived person already on the seminar stays on it, stays visible and stays
  deletable. Dancer verification and age do not gate a seminar.
- One row on the roster per seminar and person, beside any withdrawn ones. The
  same person may hold an inscription in any
  number of seminars; overlapping times are not checked.
- **One person, one side.** Once an individual's link is `Vinculado`, the
  individual and the rows its link reaches are one person to a seminar
  (`app/lib/seminars/linked-person-refusals.server.ts`, under the seminar's
  lock): the individual is refused when a reached row holds an inscription on
  the roster, by a message naming that row's academy, and an academy is refused
  `Ya está inscripto como particular` when the row it registers is reached by an
  individual holding one. Without a confirmed link neither is refused; a
  duplicate made before the confirmation is administration's to remove. The
  individual's `Seminarios` lists the academies' inscriptions of the rows its
  link reaches read-only, with the academy that made them, and its registration
  says `Tu academia verá esta inscripción` while the link reaches an active
  row, the only case in which an academy sees it.
- Registration is open **until the seminar starts**, independent of whether any
  `Cronograma` of the event has `Inscripciones abiertas`. Once started, the academy can neither add nor delete;
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
  `Retirar inscripción`. No amount appears on a registered row on either side
  of the portal: what it costs is read in `Resumen financiero`. Two places quote
  a price, because that is where the registration is decided: the registration
  dialog on both sides quotes today's price in the person's participant cell
  (on the academy's side once a person is picked) with its split into
  `Derecho de inscripción` and `Derecho de participación` (#1705), and the
  individual's `Seminarios` list shows what each seminar costs it (its
  inscription's effective price, or today's price before it registers).
- **A withdrawal is final** (#1496). Registering the same person again is an
  ordinary registration: it inserts a new row, with its own `createdAt`, no
  money and the ordinary quota rule — a reservation when a place is free, none
  in a full seminar, never a refusal for fullness. The withdrawn row keeps its
  money, its stored price row and its date as the record of the drop. The
  unique indexes count only rows on the roster, so the two coexist.
  De-allocating a withdrawn row to zero does **not** delete it; the chooser
  decides once.
- **The row gains `selectedPriceId` and `withdrawnAt`**, the same two fields a
  choreography inscription carries and nothing else financial. It gains no
  `academyId`: the academy is read through the person —an individual's through
  its owner row of kind `individual`— by every reader through
  `app/lib/seminars/inscription-person.server.ts`. Every roster surface
  lists **active rows only**, through `activeSeminarInscription()`; withdrawn
  rows are read under `Finanzas`, badged `Retirada`.
- **Registration is unlimited.** The insert counts nothing against the quota and
  there is no `full` refusal: an academy registers past the quota. A new row
  reserves a place when one is free (see "The place"); one that finds none is
  intent rather than a place. The registration path
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

**A place is held by a covered inscription, or for a while by a reserved one.**
"Covered" is `Σ allocations ≥ deposit of the stored row` with `Σ > 0`, on a
non-withdrawn row: the same predicate that fixes the price. One threshold, both
directions, nothing persisted — covering the deposit fixes the row and takes the
place for good, de-allocating below it releases both.

- **A registration reserves a place** (`seminarReservation`, `Reservada`): the
  insert stores `reservedUntil`, **72 hours on, never past the seminar's
  start**, when the covered rows and the live reservations leave a place free
  — read under the seminar lock, so two registrations cannot both take the
  last one — and stores nothing otherwise. An active uncovered row whose
  `reservedUntil` has not passed holds a place. A lapsed reservation deletes
  nothing and hands nothing on: the row reads `Seña pendiente` again, and a row
  registered into a full seminar never gains a reservation later, holding a
  place only by covering its deposit. The migration that brought the rule in
  gave the rows registered in the 72 hours before it, oldest first, the places
  their seminar had free.
- **The academy is told 48 hours.** The registration dialog says it has 48
  hours to send the deposit, or until the seminar starts when that comes first;
  the remaining 24 are administration's to record the payment, and only the 72
  are enforced. The dialog promises nothing in a full seminar, where the page's
  `Cupo completo` notice speaks instead.
- **The quota is enforced on the allocation write.** Every money gesture whose
  target is a seminar inscription locks the seminar row first; the funding write
  counts the covered non-withdrawn inscriptions excluding the one being funded,
  plus the places **other** rows reserve — a reservation never blocks its own
  deposit — and **refuses only the write that would cross** when that count
  already reaches the quota, with
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
- **Counts.** `availablePlaces = quota − coveredCount − reservedCount`, which is
  the `Cupo` suffix on the admin list and the figure the detail reads;
  `registeredCount` (all non-withdrawn rows) is a separate figure. Withdrawn rows
  are in none. `coveredCount ≤ quota` always holds.
- **When covered and reserved rows fill the quota**, the admin
  `(seminar, academy)` financial detail, the portal seminar detail and the
  portal `(seminar, academy)` financial detail each carry a non-blocking notice:
  new inscriptions are accepted, but a new inscription reserves nothing and its
  deposit cannot be covered until a place frees up. The portal's wording is
  `podés inscribir igual, pero la seña de una nueva inscripción no se cubre hasta que se libere un lugar`.
  The row's badge says which it is: `Señada` holds a place, `Reservada` holds one
  for now, and `Seña pendiente` holds none.
- **The band, kept.** The badge reads against the effective row and the place
  against the stored one, exactly as the choreography badge and lock do, so a row
  can read `Señada` without holding a place when a price is lowered under money
  already on it. `finances.md` names it beside the choreography band.
- The money gestures over seminar inscriptions are the per-inscription dialog
  and the `Pagar seña` / `Pagar saldo` presets over a selection of seminars
  (`finances.md`, "Per seminar"); both run the place check above.

## What a seminar does not do

- It does not make anyone `Participando`: the badge and the admin roster filters
  ignore seminar inscriptions.
- It sends no notification on anything: not on register, not on removal, not on
  a covered deposit, not on taking a place and not on losing one — a lapsed
  reservation included.
- It does not appear on the admin dashboard; the list under `Operación` is its
  only admin surface.
- It has no price and no payment **of its own**: the price is the event's list
  in "Prices" and the payment is the academy's event pool (`finances.md`), one
  pool for both kinds of inscription.

## Surfaces

- **Portal**: a gallery of **posters** for the active event's seminars, one per
  seminar with the instructor's picture, name, date and time, a badge with the
  academy's own active inscription count, and a single `Ver detalle`. The poster
  carries no state at all — no chips, no prices, no quota, no started sentence
  and no `Inscribir` — so a started seminar's card reads exactly like an open
  one. Without an active event, or without seminars, the shared portal empty
  state.
- **The portal seminar detail** (`/portal/seminarios/:id`) is where the poster
  leads and where everything the card gave up lives: the instructor as the
  title, `{fecha} · {hora}` as the subtitle, `Inscribir` as the page action, and
  the academy's own **active** inscriptions as a flat table of name, type and
  `Estado` (the finance badge: `Reservada`, `Seña pendiente`, `Señada`,
  `Pagada`), with the name as the only row action, or the portal empty state
  while there are none. Registering is a dialog with one
  searchable picker over the academy's active dancers and professors in one flat
  list, with the people it already has actively registered left out and people
  whose row was withdrawn offered again. A started seminar carries a
  `warning` notice and offers neither registration nor removal; an unpriced
  event closes registration the same way. Removal is the shared delete dialog on
  a row without money and a `Retirar inscripción` confirmation on a row with it,
  which says the money stays assigned, the place is freed and the withdrawal is
  final: re-registering creates a new inscription with no money. **No amount
  or participant reading appears on any of these surfaces** except the
  registration dialog's price for the picked person, split into its two
  components, and the only deadline is the registration dialog's 48 hours: what
  a registered seminar costs is read in `Resumen financiero`.
- **Administration**: one more admin resource on the schedules' path. A list of
  instructor, date, time and quota with the places left on it
  (`quota − coveredCount − reservedCount`); a create page; a detail with two tabs, `Información`
  (the form and the picture) and `Inscriptos` (a flat table of name, type and
  academy, where the name opens the removal confirmation). The form carries
  `Tipo de seminario` and `Seña (%)`, both read-only while any inscription of the
  seminar is covered, and there is **no prices tab**: seminar prices are edited
  in the `Seminarios` tab of `Precios`, and money for a seminar lives
  under `Finanzas` (`finances.md`, "Surfaces").
