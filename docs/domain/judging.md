# Judging

Rules for presentations, judging, ranking, results, scores and feedback.

## Participation And Judging

- `Presentación` is one-to-one with a choreography and has a unique order number within the event. It is a row of its own that holds the order number and nothing else about the choreography: no copy of its schedule, category or group type, so everything shown beside the number is the choreography's current data.
- A presentation is created in two ways only: by `Ordenar automáticamente`, and, once the event has at least one presentation, by placing a late choreography by hand. It is never a side effect of a payment, an allocation or a registration.
- Getting an order number requires the choreography to be at least `Señada`, derived on read as `docs/domain/finances.md` defines it, even if it is operationally incomplete. Nothing else is required: a choreography always has a category and a schedule (`docs/domain/choreographies.md`).
- Keeping an order number has no condition. A choreography that drops below `Señada` after it was numbered keeps its presentation, its number and its judge assignments, survives a new automatic ordering, and stays in every list, the public program included. The administrative list and the portal mark it `Seña pendiente`; the public program does not.
- The automatic ordering sorts in blocks: schedule (date, time, then name), then experience level in the order nudo, amateur, profesional, pre elite, elite, pro-am, with a choreography that declares no level last, then category age order (minimum age, maximum age, then name), then group type in the order solo, duo, trio, grupal. The level order is a fixed rule of the domain, not an event setting, and a schedule whose choreographies declare no level is ordered as if the key were not there. Modality and submodality play no part; a schedule already restricts the modalities it accepts.
- Inside a block the order follows the choreography number, corrected by `Separación de bailarines`: two presentations that share an active dancer need at least four others between them, counted within one schedule. The ordering places rows one at a time and takes the first remaining choreography, by number, that shares no dancer with the previous four positions; when every remaining one conflicts, it places the lowest number and the clash is flagged. It never breaks the block sequence to satisfy the gap. Only dancers count, never professors, with the same rule for every group type; the four is fixed, not an event setting.
- `Ordenar automáticamente` always asks for confirmation and renumbers the whole event from scratch, discarding every manual change. It renumbers existing presentations in place, so their judge assignments survive, adds every choreography that is at least `Señada` and has no number yet, and deletes nothing. It is refused when there is nothing to order and when any presentation has a score or a disqualification.
- The administrator changes the order by dragging a row or typing its number. Both persist immediately, without confirmation, and leave the numbers contiguous from 1. Neither is available before the first automatic ordering. A late choreography takes its number the same way, which creates its presentation and shifts the later ones down.
- A row may be moved across blocks: the choreography's schedule stays the capacity truth, and the order is the administrator's.
- `Advertencia` is derived on read, never stored, and blocks nothing: not the ordering, not a judge assignment, not publishing the program. Its kinds are `Seña pendiente`, `Separación` (both presentations of a clash, each naming the other's number and the shared dancer), `Fuera de bloque` (the smallest set of presentations that, taken out, leaves the rest in block order) and `Sin nivel` (a choreography whose category admits experience levels and which declares none, numbered or not — the ordering sorts it last and only administration can repair it). `Separación`, `Fuera de bloque` and `Sin nivel` are shown to administration only; the portal shows `Seña pendiente` and nothing else, the public program shows none.
- A numbered choreography stays correctable until it is evaluated (`docs/domain/choreographies.md`, "Choreography Locks"). The correction keeps the number and surfaces as `Fuera de bloque` when it changes the category, the schedule or the group type, or as `Separación` when it changes the dancers.
- Deleting a numbered choreography before it is evaluated deletes its presentation and its judge assignments. The number is left as a gap until the next move or automatic ordering closes it.
- Presentations with scores or disqualification are not reorderable.
- A judge can disqualify during evaluation. That closes the presentation for all judges and removes it from ranking.
- Admin can reverse disqualification only with explicit reason and traceability.
- If results are published, admin must unpublish before disqualifying, reversing disqualification, correcting or annulling scores.
- `Estado de participación` values include `sin presentación`, `pendiente`, `evaluada`, `descalificada` and `ausente inferida`.
- `Asignación de juez` relates one judge to one presentation, so a choreography without a number cannot be assigned. Any internal user with the `judge` role who is not suspended can be assigned; the role is global, with no per-event membership.
- Judges are assigned to, and removed from, many presentations at once. Reassigning same judge to same presentation must not create duplicates.
- An assignment survives the judge's suspension or a change of role, a new automatic ordering and any manual move. Nothing marks it and nothing removes it automatically.
- Assigning a judge creates the assignment only. Whether the score row is created empty at that moment or on the judge's first evaluation is a decision of the judging effort.
- Admin can remove assignment only while score is unconfirmed and empty.

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

- A `Puntaje` belongs to one judge assignment for one presentation.
- Score starts empty and unconfirmed. Whether it is created when admin assigns the judge or on the judge's first evaluation is a decision of the judging effort.
- Saving confirms the score even if value stays empty.
- Score value can be empty or between 0 and 100 with up to two decimals.
- Empty confirmed score means judge contributes no value to average.
- Judge flow looks for next unconfirmed score, not next score without value.
- `Corrección de puntaje` records previous value, new value, who corrected and required reason.
- `Anulación de puntaje` excludes confirmed score from average without deleting traceability.
- Annulled scores remain visible to administration, not to academy in published results.
- `Devolución` is optional private audio tied to evaluation or disqualification.
