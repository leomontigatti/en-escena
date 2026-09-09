# Seminars

Rules for `Seminario` and `Inscripción a seminario`: a class an event offers
around the competition, created by administration and filled by academies from
their roster. Decided on the wayfinder map
[#857](https://github.com/leomontigatti/en-escena/issues/857); each rule's
reasoning lives in the ticket that fixed it.

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
- The quota is required, at least 1, with no upper bound. It is a **hard cap,
  first come first served**: there is no waitlist and no override. When a
  seminar is full, administration raises the quota; nobody registers past it.
- The instructor's picture is optional at creation and uploaded from the
  seminar's detail, like an `eventDocument`. Until then the portal shows a
  placeholder. It is a private `uploadedAsset` of kind `seminarInstructorPicture`,
  served by `signedUrl`, one object per seminar; replacing it leaves no sibling
  behind, and removing it or the seminar removes the object. Deleting the event
  orphans it on the volume, as event documents are orphaned today.
- Administration edits every field at any time, including after inscriptions
  exist, with two refusals, both after the submission: a seminar with
  inscriptions cannot be deleted, and the quota cannot drop below the current
  inscription count. Moving a seminar's date into the past simply closes its
  registration.

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
- The academy deletes its own inscription until the seminar starts. It is a
  physical delete: the inscription carries no money, so there is nothing to
  withdraw. Every destructive action confirms through the shared delete dialog.
- Administration removes any inscription at any time, including after the
  seminar has started, from the seminar's detail. This is the release valve for
  the refusal to delete a seminar that has inscriptions. There is no reason
  field, no origin flag and no audit trail.
- The quota is enforced under a lock on the seminar row: two academies taking
  the last place at once are refused one at a time, with the same feedback as a
  plain refusal.
- The inscription dates itself by its own `createdAt`, the order the quota was
  consumed in and the seminar counterpart of `Fecha de inscripción`.

## What a seminar does not do

- It does not make anyone `Participando`: the badge and the admin roster filters
  ignore seminar inscriptions.
- It sends no notification on register, delete or filling up.
- It does not appear on the admin dashboard; the list under `Operación` is its
  only admin surface.
- It has no price and no payment. Prices and payments for seminars are a later
  effort, whose first question is whether the academy's delete becomes a
  withdrawal once money exists.

## Surfaces

- **Portal**: a card gallery of the active event's seminars, one card per
  seminar with the instructor's picture, name, date and time, the academy's own
  inscriptions as chips, and a footer that holds either `Inscribir` or the
  one-sentence reason it is closed. The card says nothing about the quota;
  places surface only as a refusal. Registering is a dialog with one searchable
  picker over the academy's active dancers and professors in one flat list.
  Without an active event, or without seminars, the shared portal empty state.
- **Administration**: one more admin resource on the schedules' path. A list of
  instructor, date, time and quota with places left; a create page; a detail
  with two tabs, `Información` (the form and the picture) and `Inscriptos` (a
  flat table of name, type and academy, where the name opens the removal
  confirmation).
