# Judging

Rules for presentations, judging, ranking, results, scores and feedback.

## Participation And Judging

- `Presentación` is one-to-one with a choreography and has a unique order number within the event. It is a row of its own that holds the order number and nothing else about the choreography: no copy of its schedule, category or group type, so everything shown beside the number is the choreography's current data.
- A presentation is created in two ways only: by `Ordenar automáticamente`, and, once the event has at least one presentation, by placing a late choreography by hand. It is never a side effect of a payment, an allocation or a registration.
- Getting an order number requires the choreography to be at least `Señada`, derived on read as `docs/domain/finances.md` defines it, even if it is operationally incomplete. Nothing else is required: a choreography always has a category and a schedule (`docs/domain/choreographies.md`).
- Keeping an order number has no condition. A choreography that drops below `Señada` after it was numbered keeps its presentation, its number and its judge assignments, survives a new automatic ordering, and stays in every list, the public program included. The administrative list and the portal mark it `Seña pendiente`; the public program does not.
- The automatic ordering sorts in blocks: schedule (date, time, then name), then experience level in the order nudo, amateur, profesional, pre elite, elite, pro-am, with a choreography that declares no level last, then category age order (minimum age, maximum age, then name), then group type in the order solo, duo, trio, grupal. The level order is a fixed rule of the domain, not an event setting, and a schedule whose choreographies declare no level is ordered as if the key were not there. Modality and submodality play no part; a schedule already restricts the modalities it accepts, and optionally the categories too.
- Inside a block the order follows the choreography number, corrected by `Separación de bailarines`: two presentations that share an active dancer need at least four others between them, counted within one schedule. The ordering places rows one at a time and takes the first remaining choreography, by number, that shares no dancer with the previous four positions; when every remaining one conflicts, it places the lowest number and the clash is flagged. It never breaks the block sequence to satisfy the gap. Only dancers count, never professors, with the same rule for every group type; the four is fixed, not an event setting.
- `Ordenar automáticamente` always asks for confirmation and renumbers the whole event from scratch, discarding every manual change. It renumbers existing presentations in place, so their judge assignments survive, adds every choreography that is at least `Señada` and has no number yet, and deletes nothing. It is refused when there is nothing to order and when any presentation has a score or a disqualification.
- The administrator changes the order by dragging a row or typing its number. Both persist immediately, without confirmation, and leave the numbers contiguous from 1. Neither is available before the first automatic ordering. A late choreography takes its number the same way, which creates its presentation and shifts the later ones down.
- A row may be moved across blocks: the choreography's schedule stays the capacity truth, and the order is the administrator's.
- `Advertencia` is derived on read, never stored, and blocks nothing: not the ordering, not a judge assignment, not publishing the program. Its kinds are `Seña pendiente`, `Separación` (both presentations of a clash, each naming the other's number and the shared dancer), `Fuera de bloque` (the smallest set of presentations that, taken out, leaves the rest in block order) and `Sin nivel` (a choreography whose category admits experience levels and which declares none, numbered or not — the ordering sorts it last and only administration can repair it). `Separación`, `Fuera de bloque` and `Sin nivel` are shown to administration only; the portal shows `Seña pendiente` and nothing else, the public program shows none.
- A numbered choreography stays correctable until it is evaluated (`docs/domain/choreographies.md`, "Choreography Locks"). The correction keeps the number and surfaces as `Fuera de bloque` when it changes the category, the schedule or the group type, or as `Separación` when it changes the dancers.
- Deleting a numbered choreography before it is evaluated deletes its presentation and its judge assignments. The number is left as a gap until the next move or automatic ordering closes it.
- Presentations with scores or disqualification are not reorderable.
- Any assigned judge can disqualify a presentation while its judging day is open. That closes it for the whole panel, takes it out of the results and shows as `Descalificada` in every assigned judge's list; the scores already saved are kept, and a judge may still leave a `Devolución` on it so the academy hears why.
- Any assigned judge reinstates it, from the same place, with no confirmation and no reason. Who disqualified is not stored: the panel settles that out loud in the theatre, and the scores saved before come back exactly as they were.
- Administration disqualifies and reinstates from a presentation's scores view at any time, with no window and no reason, so a disqualification can be settled long after the judges' day has closed.
- `Estado de participación` values include `sin presentación`, `pendiente`, `evaluada`, `descalificada` and `ausente inferida`. `Descalificada` means disqualified, `evaluada` means evaluated and not disqualified, and the administrative list shows those two as badges, each replacing the row's `Advertencia` badge, and nothing for the rest.
- `Asignación de juez` relates one judge to one presentation, so a choreography without a number cannot be assigned. Any internal user with the `judge` role who is not suspended can be assigned; the role is global, with no per-event membership.
- Judges are assigned to, and removed from, many presentations at once. Reassigning same judge to same presentation must not create duplicates.
- An assignment survives the judge's suspension or a change of role, a new automatic ordering and any manual move. Nothing marks it and nothing removes it automatically.
- Assigning a judge creates the assignment only. The score row is created on the judge's first save, so an assignment with no score is a judge who has not scored yet.
- Removing a judge assignment is refused once that judge has a score row for that presentation, so no score is ever orphaned. A bulk removal removes the rest and reports how many it kept.

## Ranking And Results

- `Ranking` uses non-disqualified presentations with at least one non-annulled score value.
- Ranking groups by category, modality, submodality when relevant, group type and experience level when relevant.
- Competitive average is rounded to two decimals and that rounded value orders positions.
- Ties are real competition ties, e.g. 1, 1, 3.
- Final award ranking requires every presentation in the competitive group to be resolved.
- `Cupo de cronograma` does not define competitive grouping.
- Public results require all competitive groups resolved and are visible without login.
- Public results do not include dancers, audio feedback or private judge detail.
- Publishing results also enables academy results; unpublishing hides both.
- Program can be published before results and reflects current order; it does not freeze a copy.
- Program is public, without login, at `/programa`. It shows the active event only and only while the event's program is visible; with the program hidden, or with no active event, the page says that no program is published and does not reveal which of the two it is.
- Program lists every presentation in order, with no gaps, and shows non-competitive data only: it hides scores, averages, awards, disqualifications, inferred absences and every `Advertencia`. It names the dancers of a solo and of a duo, and of no other group type.
- Program has its own print layout, one run of pages per schedule. The academy's list of its own presentations on the portal does not print.
- The portal lists the academy's own choreographies that have a number or can get one: numbered ones in order, and late ones, at least `Señada` and not placed yet, as `Sin número`. It is read-only and links to the public program while it is visible.

## Scores And Feedback

- A `Puntaje` belongs to one judge assignment for one presentation, and its row is created on the judge's first save. Nothing creates it empty, and administration never creates one on a judge's behalf: the answer to a judge who never scored is to remove the assignment.
- A score value is between 0 and 100 and moves in steps of 0.5, which is what the panel works in. The same applies to a criterion value, between 0 and its own maximum. Both are enforced in validation and as check constraints.
- Every score, sheet total and average the app writes uses a decimal point, on every surface: the judge's screens, administration, the academy portal and the results print. It is a deliberate exception to es-AR formatting, and it covers scores only — money and dates keep their es-AR form. The number input accepts a point and nothing else, and a score has to read the same on the tablet that typed it and on the page that reviews it.
- A presentation is scored with a single 0-100 value, unless its submodality has criteria, in which case it is scored on a sheet (`Planilla`) of one field per criterion. A submodality with no criteria, and a modality with no submodalities, score with a single value.
- A `Criterio` belongs to one submodality and has a name, a maximum that is a whole number from 1, and a kind that either adds or deducts. Its name is unique within its submodality.
- The adding maxima total exactly 100, so a sheet can always reach 100. Deduction maxima sit outside that total, because a deduction is a penalty and not a share of the score.
- A submodality's criteria are saved as a whole, and are locked once any presentation of that submodality has a score, so scores already given keep meaning the same thing.
- A sheet's total is the additions minus the deductions, clamped to 0 and 100. It is stored as the score's single value and recomputed on every save and on every administrative edit, so an average never re-derives a sheet.
- `Jornada` is the business date of three hours before now: a show runs past midnight, so the judges' day starts with its date and closes at 03:00 the next morning. It is computed on read, with no stored flag and no job.
- A presentation is open for its judges only while its choreography's schedule date is the current judging day. Before that day it is not on any judge's list; after 03:00 the next morning every judge write on it is refused. Within it a judge sees, scores and corrects only their own work.
- Reopening a presentation a judge already scored opens their own score, their own sheet lines and their own `Devolución` in the form, so a correction is an edit and not a retype — and re-recording a `Devolución` on a scored presentation never asks for the number again. The list itself still shows no number: only the form the judge opens does.
- Administration edits any score at any time, with no window, no reason asked and no trace kept. What it stores goes through the same validation as a judge's own save.
- `Anulación de puntaje` excludes a score from the average without deleting it, and is reversed with the same toggle. An annulled score keeps its value and stays visible to administration, and is not shown to the academy in published results.
- A presentation is **evaluated** when it is disqualified or when any score row exists for it. That single fact is what locks a choreography for correction and deletion, refuses automatic ordering and manual reordering, and guards judge-assignment removal.
- The average is the mean of the non-annulled values of a non-disqualified presentation, rounded to two decimals. A presentation with nothing left to count has no average, and a disqualified one has none either.
- `Medalla` is read off that rounded average, in bands fixed by the domain:

  | Rounded average | Medal               |
  | --------------- | ------------------- |
  | below 60        | `Mención especial`  |
  | 60 to below 80  | `Medalla de bronce` |
  | 80 to below 90  | `Medalla de plata`  |
  | 90 or more      | `Medalla de oro`    |

  There are no positions, no ties and no competitive grouping in it: two presentations that average the same take the same medal.

- `Devolución` is one optional private audio recorded by the judge for the academy, saved with the score that carries it and replaced or removed by the same save. It is allowed on a disqualified presentation, where it is stored with no value, so the academy still hears why.
- A judge's own status on a presentation is one of `Pendiente`, `Completa`, `Sin devolución` and `Descalificada`: pending while there is no value, complete with a value and a `Devolución`, without feedback with a value and none, and disqualified whenever the presentation is. It is shown to that judge only, and it is not the presentation's `Estado de participación`, which answers for the whole panel.
