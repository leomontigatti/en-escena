# Juzgamiento

Rules for presentations, judging, ranking, results, scores and feedback.

## Participation And Judging

- `Presentación` is one-to-one with a coreografía and has unique order number within event.
- Order is generated for signed or paid coreografías with category, even if operationally incomplete.
- Order is assigned by block date/time, category age order, then group type order: solo, duo, trio, grupal.
- Presentations with scores or disqualification are not reorderable.
- If coreografía returns to unpaid before evaluation, its presentation is removed or invalidated.
- A judge can disqualify during evaluation. That closes the presentation for all judges and removes it from ranking.
- Admin can reverse disqualification only with explicit reason and traceability.
- If results are published, admin must unpublish before disqualifying, reversing disqualification, correcting or annulling scores.
- `Estado de participación` values include sin presentación, pendiente, evaluada, descalificada and ausente inferida.
- `Asignación de juez` creates an empty score for presentation and judge.
- Reassigning same judge to same presentation must not create duplicates.
- Admin can remove assignment only while score is unconfirmed and empty.

## Ranking And Results

- `Ranking` uses non-disqualified presentations with at least one non-annulled score value.
- Ranking groups by category, modality, submodality when relevant, group type and experience level when relevant.
- Competitive average is rounded to two decimals and that rounded value orders positions.
- Ties are real competition ties, e.g. 1, 1, 3.
- Final award ranking requires every presentation in the competitive group to be resolved.
- `Cronograma` does not define competitive grouping.
- Public results require all competitive groups resolved and are visible without login.
- Public results do not include dancers, audio feedback or private judge detail.
- Publishing results also enables academy results; unpublishing hides both.
- Program can be published before results and reflects current order; it does not freeze a copy.
- Program shows non-competitive data only and hides scores, averages, awards, disqualifications and inferred absences.

## Scores And Feedback

- A `Puntaje` belongs to one judge assignment for one presentation.
- Score is created empty and unconfirmed when admin assigns judge.
- Saving confirms the score even if value stays empty.
- Score value can be empty or between 0 and 100 with up to two decimals.
- Empty confirmed score means judge contributes no value to average.
- Judge flow looks for next unconfirmed score, not next score without value.
- `Corrección de puntaje` records previous value, new value, who corrected and required reason.
- `Anulación de puntaje` excludes confirmed score from average without deleting traceability.
- Annulled scores remain visible to administration, not to academy in published results.
- `Devolución` is optional private audio tied to evaluation or disqualification.
