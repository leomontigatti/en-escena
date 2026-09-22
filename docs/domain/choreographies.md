# Choreographies

Rules for roster links, choreography registration, locks and `Bases del evento`.

## Roster

- `Profesor` belongs to an academy, not to a user account.
- `Profesor` document type and document number are treated as a pair: both may be left empty, or both must be filled in.
- If one is filled in and the other is empty, the record is invalid and is not saved.
- A professor with empty document pair is incomplete but can be used in choreographies.
- When the document pair is complete, its uniqueness is enforced within the same academy.
- Professors do not have manual admin verification.
- Professor records can be edited even when linked to paid or presented choreographies; professor links inside non-pending choreographies can be blocked.
- `Bailarín` birth date is a declared civil date without time or timezone and is compared against event local start date for competitive age.
- `Bailarín` document type and document number are treated as a pair: both may be left empty, or both must be filled in.
- If one is filled in and the other is empty, the record is invalid and is not saved.
- When the document pair is complete, its uniqueness is enforced within the same academy.
- A dancer participating with another academy is a different domain entity.
- Dancer verification states are: incompleto, no verificado, verificado.
- If any document field or image is missing, the dancer verification status is incompleto.
- A partial document pair is not a saved state: it is a form validation error.
- Dancer verification does not block participation and does not affect choreography operational state.
- Academy cannot edit identity data or document images after a dancer is verified; later corrections are administrative.
- Correcting dancer birth date can recalculate categories for signed or paid choreographies until they are evaluated; it does not change financial state.
- A birth-date correction is refused when it would leave a linked choreography without a category: nothing is written, and the message names each choreography by number and name.
- A birth-date correction also re-resolves each linked choreography's schedule with its new category. The choreography stays where it is when its schedule still accepts the category; when it does not, and exactly one schedule of the event accepts it, has room and does not change the price of money already assigned, the choreography moves there in the same transaction.
- The correction is refused whole when a choreography would be left in a schedule that does not accept its new category and there is no single schedule to move it to — none, several, one already full, or one that would change a held price. Nothing is written, the dancer's birth date included, and the message names each choreography by number and name.
- A correction that moved choreographies reports it on success, naming each choreography and the schedule it moved to.

### `Estado de alta` for roster people

- `Estado de alta` is the roster status of a dancer or a professor, with two
  values: `Activo` and `Archivado`. An academy archives the people it no longer
  works with; it is roster hygiene, not a competitive or financial act.
- Eligibility for a choreography's roster is one rule: a person can be picked
  when they are active, **or** when they are already linked to **that**
  choreography. Already linked means linked to that choreography — not to any
  choreography of the `Evento activo`, and not to any choreography ever.
- The grandfather half of that rule is what keeps an archived person from
  stranding a record: an archived person already on a choreography stays on it,
  stays visible and stays re-saveable, so a roster whose people were archived
  afterwards can still be corrected administratively and every other field of
  that choreography stays editable.
- An archived person who is not already linked cannot be added. Registration is
  the same rule evaluated with an empty linked set, which is why it always
  refuses an archived person, and it says why: either someone in the selection
  is archived and must be reactivated, or the person was not found — which is
  also the answer for a person of another academy, so that one academy is never
  told another academy's record exists. The rejection names no one: the roster
  stores no gender, so the sentence agrees with the person-kind noun
  (`Reactivá este bailarín…`) instead of with an interpolated name.
- **Archiving is never refused.** There is no guard: archiving a dancer
  registered in the `Evento activo` succeeds and the inscription is untouched. The
  archive confirmation says so before the academy confirms; the sentence is
  static and queries nothing.
- Archiving is reversible and lossless. Reactivating always succeeds, puts the
  person back in the pickers immediately and requires nothing else. There is no
  hard delete, no archive date and no archive reason.
- Archiving changes no inscription, no `Estado operativo de coreografía`, no
  `Estado financiero`, no selected price, no qualifying set for the
  `Descuento por bailarín` and no participation figure. `Estado de alta` is a
  third axis, independent of `Estado de participación` and of
  `Estado de verificación de bailarín`, and the three are shown side by side.
- An archived person is still found by name search. Search is a lookup, not an
  offer: what may be added to a roster is governed by the eligibility rule
  above, and the person's badge reads `Archivado`.

## Choreographies

- `Coreografía` belongs to one academy and one event; it is not reusable between events.
- It is registered with modality, dancers, calculated group type, category, optional experience level and schedule capacity.
- It can be created without professors, but needs at least one linked professor to be operationally complete.
- It is never confirmed without category: when no category of the modality covers the dancers' ages for the calculated group type, registration is refused and nothing is created.
- A choreography always has a category, and the database holds the invariant: `choreography.category_id` is not nullable. Every write that would resolve one to no category — registration, roster change, modality correction, birth-date correction — is refused before it is written, so there is no category-less choreography to read, to filter for or to report as incomplete.
- A choreography always has a schedule, and the database holds the invariant: `choreography.schedule_id` is not nullable. Every write that assigns one — registration, roster change, modality correction, schedule capacity reassignment — refuses when no compatible schedule resolves, and no schedule can be pulled from under a choreography, so there is no schedule-less choreography to read, to group by day or to filter for. `choreography.schedule_capacity_id` is nullable, and empty means something else: the choreography uses the schedule's total capacity, because the schedule declares no capacity row for its group type.
- Academy cannot delete a Choreography after registration; removal is an administrative action.
- `Eliminar coreografía` is **one** administrative action with **two outcomes**, the same choice roster removal makes for a single dancer. It is never refused because of money. See "Removing a choreography" below.
- An administrator can rename a choreography at any time, including when it is evaluated.
- Administrative renaming changes only the Choreography name; it does not recalculate price, capacity, category, schedule or competitive state.
- Either outcome releases the schedule capacity: a deleted choreography leaves no domain entity at all, and a withdrawn one frees its place while keeping the references a restore needs.
- The dancer roster is never academy-editable; changing it is an administrative action (see Choreography Locks). Once signed, academy also cannot edit other blocked data until admin removes the active financial link.
- Roster changes trigger automatic recalculation of group type, category, experience level and schedule.
- Professors do not trigger choreography recalculation.
- Administrative roster modification is submitted as one save operation; if a dancer change cannot be confirmed, professor changes in the same submission are not saved.

## Removing a choreography

`Eliminar coreografía` is one administrative action, never refused because of
money, and it chooses once between two outcomes — the same chooser roster
removal runs for a single dancer (`docs/domain/finances.md`, "Withdrawal from
the roster"):

- **Hard delete** when no inscription of the choreography, active or already
  withdrawn, holds a payment allocation or a `comprobante_inscription` line.
  Nothing is preserved because there is nothing to preserve.
- **Withdrawal** otherwise. The choreography is stamped `withdrawnAt`, **every**
  inscription still active is stamped with the **same** timestamp value in the
  same transaction — including the ones holding no money — and the choreography
  survives as a `Coreografía retirada`. **No money moves.** Inscriptions
  withdrawn individually beforehand keep their own earlier stamp.

The outcome is decided inside the write's transaction, under a `FOR UPDATE` on
the choreography row, so money allocated between the dialog and the click still
leads to a withdrawal instead of destroying the allocations through the cascade.
What the dialog announced is advisory.

- **The one hard lock is the evaluated presentation** — a presentation with a
  score or a disqualification (see "Choreography Locks"). It refuses **both**
  outcomes, because competitive history is never lost. Comprobantes block
  nothing: they are a reason to withdraw, not a reason to refuse (ADR-0014
  correction).
- An **unevaluated** presentation blocks neither outcome. It is deleted with
  either one, the dialog says so with its number
  (`Tiene la presentación n.º {orden}; se quitará del orden`), and the number
  stays a gap until the order is next changed (`docs/domain/judging.md`).
- The dialog **names the outcome before the admin confirms**: that the
  choreography has money allocated or comprobantes and so will be withdrawn
  rather than deleted, and that no money moves; or that it has neither and will
  be deleted outright.

### A withdrawn choreography

- It is withdrawn **if and only if** `choreographies.withdrawnAt` is set. That is
  roster state, not financial state, exactly as `choreography_dancer.withdrawnAt`
  is, so ADR-0009 is untouched.
- It **keeps its `choreographyNumber`** and it keeps `scheduleId` and
  `scheduleCapacityId`, so a restore knows where to return.
- It **occupies no schedule capacity** — not in the displayed occupancy, not in
  the locking count, and not in the event's bases guard, which asks "not
  withdrawn". Its two references are not deleted alike, and this is the one
  place that says so: deleting the `Cupo de cronograma` it points at **releases**
  its `scheduleCapacityId`, and the restore resolves the place again; the
  `Cronograma` cannot be deleted at all while **any** choreography, withdrawn or
  not, is assigned to it, because `choreographies.schedule_id` is not nullable
  and so cannot be released the same way. When withdrawn choreographies are the
  only thing holding it, the refusal says so
  (`No se puede borrar el cronograma porque tiene coreografías retiradas asignadas.`).
- It is **never revisited**: de-allocating every peso on it does not make it
  deletable, and there is no hard-delete path for it. Evidence is never destroyed
  through a side door.
- It reads as a `Retirada` badge **in place of** both the operational status
  (`Completa`/`Incompleta`) and the financial status. It is a derived axis, like
  the inscription's `Retirada`, not a new status value.
- Its money **stays in** its own and its academy's rollup, and it is **out of**
  its academy's `financialStatus` rollup and out of every choreography count
  (`docs/domain/finances.md`, "Choreography financial status"). It stops making
  its professors and its academy participating, and it stays out of the dancer
  discount qualifying set, which already skipped withdrawn inscriptions.
- **Lists:** hidden by default from the operational and portal choreography
  lists, reachable through a `Retirada` option on the existing `Estado` filter;
  **always** shown in the admin and portal financial lists, with the badge and
  the same filter option. Never shown in presentations or the program.
- The admin instance view is **read-only** — rename, roster, modality, level,
  schedule capacity and `Archivo de música` — except `Restaurar coreografía`; the
  portal is read-only too, music included. A refused save reads
  `Esta coreografía está retirada: restaurala para poder editarla.`
- **Financial actions keep working**, because handling the money is why it
  survives: de-allocating (to refund or to keep the deposit forfeited),
  `Emitir factura`, and the partial NC once it exists. Its inscriptions are
  ordinary withdrawn inscriptions and the existing rules already apply to them.

### Restoring

- `Restaurar coreografía` is admin-only and lives in the administrative instance
  view, beside nothing else — it is the one action a withdrawn choreography
  offers.
- It clears `withdrawnAt` and revives **exactly** the inscriptions whose
  `withdrawnAt` equals the choreography's. Dancers withdrawn individually before
  the choreography was stay withdrawn.
- It **re-checks the schedule capacity** under the same lock every assignment
  path takes, counting the choreography as arriving, and is **refused with a
  reason** only when the place it returns to is full. There is no inline
  reassignment.
- It **never moves the choreography to another `Cronograma`**. When the
  choreography holds no `scheduleCapacityId` — because it never had one and uses
  the schedule total as a global allowance, or because the capacity it pointed at
  was deleted — the place is resolved again on its **own** schedule exactly as
  registration resolves one: the `Cupo de cronograma` for its `Tipo de grupo` if
  one exists now, otherwise the schedule's total as a global allowance. A
  capacity resolved this way is written back to the choreography.
- The two full-capacity refusals name the place and what to do:
  `No se puede restaurar: el cupo de cronograma que ocupaba no tiene lugar disponible. Liberá un lugar o ampliá el cupo en las bases del evento.`
  and
  `No se puede restaurar: el cronograma no tiene lugar disponible. Liberá un lugar o ampliá el cupo total en las bases del evento.`
- Nothing else is re-resolved: the price is already frozen by the money held, and
  an evaluated presentation cannot exist on a withdrawn choreography. The one
  recomputed figure is each revived inscription's `ageAtEventStart`.

## Administrative Choreography Lists

- The `Panel de administración`'s operational choreography list reviews data
  completeness and consistency for the active event.
- The operational list allows administrative actions for `admin` users and is
  read-only for `auditor` users.
- The operational list links to an administrative instance view of the
  choreography; removal is an `Acción de instancia`, not a list action.
- The administrative instance view lives at `/administracion/coreografias/:id`
  and resolves only choreographies of the `Evento activo`.
- In the administrative instance view, only the name and the removal are
  mutable within this scope; dancers, professors and `Archivo de música` are shown
  read-only. A withdrawn choreography is read-only throughout and offers
  `Restaurar coreografía` instead (see "Removing a choreography").
- The `Archivo de música` in the administrative instance view uses the same visual
  upload field as the `Portal de academias`, but disabled; if a file already
  exists, it allows downloading it.
- After renaming a choreography from administration, the user stays in the
  instance view and gets a save confirmation.
- After deleting a choreography from administration, the user returns to the
  operational list with a deletion confirmation. After a withdrawal the user
  stays in the instance view, which is now the read-only one, with a
  confirmation saying the money is still allocated.
- The administrative action to remove a choreography is shown in the instance
  view; if the choreography can be neither deleted nor withdrawn, the dialog
  reports the blocking reason instead of hiding the action.
- The only block the dialog reports is the evaluated presentation. Otherwise it
  names which of the two outcomes will happen and why.
- The operational list shows only choreographies of the active event and does
  not act as a historical archive of other events.
- If there is no active event, the screen must show a specific empty state
  prompting to choose or activate an event before reviewing choreographies.
- A choreography of the active event is shown whatever the state of its academy;
  the administrative view must not hide operational records because of academy
  state. An academy carries no archive or inactive state of its own: the only
  `Estado de alta` in the product belongs to dancers and professors (see
  "`Estado de alta` for roster people").
- The operational list uses the same visible state as the `Portal de academias`:
  `Completa` or `Incompleta`, or `Retirada` in place of both for a withdrawn
  choreography. Withdrawn choreographies are hidden from it by default and shown
  by the `Retirada` option of the `Estado` filter.
- The first version does not break down pending operational data with additional
  badges. That detail can be added later without changing the semantics of the
  operational state.
- Dancer document verification does not affect a choreography's operational
  state.
- The financial choreography list and the participation choreography list are
  separate administrative views, not implicit variants of the operational list.
- The participation list is `Presentación` in the administration sidebar, a
  sibling of the operational list. It lists the active event's choreographies
  that have a presentation or are at least `Señada`: numbered rows by order
  number, then the ones without a number by choreography number. It is where the
  administrator runs `Ordenar automáticamente`, moves presentations and assigns
  judges; the rules are in `docs/domain/judging.md`.
- Its rows are grouped by event day through tabs, not by a schedule column. Its
  `Estado` column shows one badge per row, the most relevant of `Sin número`,
  `Seña pendiente`, `Separación` and `Fuera de bloque`, with every `Advertencia`
  of the row in the tooltip. It carries no operational, financial or
  `Estado de participación` badge, and no judges column: assignments are read
  and changed through the assign and remove dialogs.
- Only numbered rows can be selected, because a judge is assigned to a
  presentation.

## Choreography Registration

- `Registro de coreografía` works with temporary data and creates the choreography only on final confirmation.
- Before final confirmation it does not consume capacity, generate financial state, or leave abandoned incomplete choreographies.
- Looking up available schedule capacities does not reserve capacity.
- A schedule is compatible with a choreography when it accepts its modality **and** its accepted categories are either empty —which accepts every category— or contain the choreography's category. That is the whole rule, and every path that assigns or reassigns a schedule resolves it through the same place, so a modality run as two shows —one for the younger categories, one for the older ones— resolves each choreography to exactly one of them and the academy is never asked to choose.
- Schedule resolution prefers a schedule capacity for the calculated group type. If a compatible schedule has no specific capacity for that group type, the schedule total capacity is a global fallback option.
- Submodality step exists only when selected modality has submodalities.
- If category requires level, registration cannot advance or confirm until academy chooses one.
- Professors are selected after schedule and level, before summary; empty professors are allowed and make choreography incomplete.
- Registration summary shows operational data only, not price or financial info.
- Solo, duo and trio summaries list names and ages; group summaries show dancer count.
- Registration does not create dancers or professors inline.
- Music file is not uploaded during initial registration; it remains pending operational data.
- Backend revalidates the selected specific capacity when present and always revalidates schedule total capacity on confirmation.
- Capacity options show their occupancy and full options are offered disabled, in the portal registration and in the administrative reassignment alike. The count is a snapshot that races with any other registration: the hint does not replace the backend revalidation.
- If every compatible option is full, the registration schedule step replaces the select with a message explaining it, instead of offering a list with nothing selectable.

## Choreography Locks

- `Datos bloqueados de coreografía` include name, modality, submodality, group type and category. Modality, schedule capacity and experience level are not academy-editable either, but they are not fully blocked: the administrator can correct or reassign each of them under the conditions below.
- Delete and register again is the last resort for an unpaid choreography that is not evaluated — one holding money is withdrawn instead of deleted, so it is not a correction path at all — not the ordinary correction path: modality, submodality, experience level, schedule capacity and the roster all have their own administrative correction. It remains the answer when what has to change is none of those.
- The evaluation lock is the one hard lock of judging: a choreography is evaluated when its presentation has a score or a disqualification. Having a presentation locks nothing. Until then every administrative correction below stays open, the choreography keeps its order number, and a correction that leaves it out of place shows as an `Advertencia` on the participation list (`docs/domain/judging.md`).
- An evaluated choreography shows one alert, `Esta coreografía ya fue evaluada y no puede modificarse.`, and its locked fields read-only; the server refuses a save with the same sentence. A numbered choreography that is not evaluated shows an informational alert instead, `Esta coreografía tiene número de presentación y modificarla puede necesitar atención en esa lista.`, and stays editable, with no confirmation on save.
- Administrative renaming is not a structural correction and is allowed even when structural data is otherwise blocked.
- Admin structural correction is exceptional, instance-level, and is allowed only until the choreography is evaluated.
- Structural correction that changes modality, submodality or dancers recalculates group type, category, level and schedule.
- If recalculation needs a level, admin must choose it in same correction.
- An active financial document blocks academy edits and dancer changes, even without imputations; if it is cancelled or accredited, the choreography becomes editable again. It does **not** block removal: a comprobante is what makes the removal a withdrawal rather than a delete (see "Removing a choreography").
- Academy cannot change choreography dancers after registration. The roster is chosen once, at creation, and from then on only the administrator can change it. This is a permanent, role-based restriction, not an inscription-window rule (see `docs/domain/finances.md` → "Roster editing and deletion").
- Even the administrator cannot change the roster once the choreography is evaluated (hard lock, like the removal lock).
- A choreography roster change must keep at least one dancer before confirmation.
- Level clears when recalculation changes category. It is editable whenever the resolved category declares levels, not only after a recalculation: with no pending roster change the administrator reassigns it standalone, and a single available level still leaves the field open, because that is the only way to resolve a missing level that leaves the choreography incomplete.
- Reassigning the experience level of a registered choreography is a standalone administrative correction in the instance view, like the schedule capacity. It carries no financial guard: the level is not a price key, so changing it cannot move an amount.
- A field with no value reads `No aplica` when the category declares no levels and `Sin asignar` when it declares them and the level is missing. The second is the state that makes the choreography incomplete.
- A roster change that recalculates to a category requiring level must choose the new level before confirmation.
- `Cupo de cronograma` stays when roster change does not change group type; the form clears its selection when group type changes, and the administrator chooses again before confirmation. Nothing is ever written with no schedule.
- When roster change clears schedule capacity, confirmation follows registration schedule semantics: no compatible option blocks confirmation, one compatible option is assigned automatically, and multiple compatible options require choosing one.
- Roster change can recalculate price on confirmation, but the administrative roster edit flow remains operational and does not show price amounts before confirming.
- Reassigning the schedule capacity of a registered choreography is a standalone administrative correction in the instance view, one choreography at a time. It is not an edit of the capacity's declared capacity and it is not a side effect of a roster change.
- The reassignment offers only compatible capacities (same event, modality, accepted category and calculated group type), plus the currently assigned one, so an assignment that drifted out of compatibility stays visible instead of disappearing from the list.
- The administrator can reassign only when all of these hold: the user is `admin` (the `auditor` sees the field read-only), the choreography is not evaluated, no active inscription has a registered deposit, and there is more than one compatible capacity to choose from. Otherwise the schedule is shown read-only.
- A registered deposit blocks the whole field, never single options: schedule capacity is an input of price selection, so every option offered moves the price of the choreography, and there is no financially inert reassignment to exempt. The reason is reported in the page alert, also for the `auditor`.
- The evaluation lock is a hard lock for the schedule capacity too, like the roster and the removal; renaming stays allowed.
- Reassignment enforces capacity capacity on confirmation: a capacity that filled up in the meantime is rejected, and re-selecting the capacity the choreography already occupies is a no-op that is never reported as full.
- When there is a pending roster change, the roster form's schedule select wins over the standalone reassignment: a group type change clears the capacity and the replacement must be chosen together with the confirmation.
- The roster save path enforces the same two guards as the standalone reassignment, on the capacity axis only: it locks and re-counts the destination capacity (excluding the choreography being saved) and rejects when any inscription of the choreography holds money, using the same message. Both fire only when the save would actually change `scheduleId`/`scheduleCapacityId` from their current value — a roster edit that keeps the same capacity (e.g. a same-count dancer swap, or a name-only save) is never blocked by either check, even on a choreography that has money on it. A dancer add/remove that recalculates group type and, with it, lands on a different capacity of the same schedule is a change on this axis and is guarded like any other move.
- Correcting the modality of a registered choreography is a compound administrative correction in the instance view: one select re-resolves everything the modality determines — submodality, category, experience level and schedule capacity — and a single confirmation writes all of it in one transaction, or writes nothing. It is a correction of its own, not a field of the roster form —its own intent, its own guards— and the two are mutually exclusive on screen: while one has unsaved changes the other is read-only. They share the page's single `Guardar`, which submits whichever of the two is pending.
- The submodality is always re-chosen and never carried over: nothing in the database ties `choreography.submodality_id` back to its modality, so carrying it would leave the choreography pointing at a submodality of another modality, invisible in every list and corrupting for judging.
- The correction offers every modality of the event, with the assigned one preselected rather than excluded. Re-selecting it is a successful no-op.
- A modality no schedule of the event accepts is offered disabled, with the reason on the option: it is a structural dead end, because a choreography with no schedule cannot exist. A modality whose capacities merely happen to be full is not disabled — occupancy is a racing snapshot and is resolved at the capacity step, where full options are offered disabled and an entirely full set replaces the select with the reason.
- When the destination modality resolves exactly one compatible capacity it is preselected and read-only, like registration. With several, choosing one is required and holds `Guardar` disabled until it is answered, like every other field the resolution leaves to be chosen and like the roster form's own schedule select.
- The experience level survives when the resolved category does not change and is cleared when it does; when the resolved category declares levels, choosing one is required in the same correction. When no category resolves for the destination modality, the correction is refused: the form shows the reason beside the select, keeps the confirmation closed, and the server refuses it too and writes nothing.
- Confirming re-resolves the correction against the current bases and rejects it when the outcome diverges from what was previewed, because the preview is older than the write by construction.
- A registered deposit does not close the modality: it rejects the correction only when the correction would actually move `scheduleId`/`scheduleCapacityId`, since modality is not a price key and a destination modality that keeps the current schedule is financially inert. The rejection names the modality, not the capacity. The deposit is reported in the page alert as a blocker-in-waiting, also for the `auditor`.
- The destination capacity is locked and re-counted on confirmation, excluding the choreography being corrected, exactly like the standalone reassignment.
- The evaluation lock is a hard lock for the modality too, and the `auditor` sees the field read-only.
- **Known gap**: group type is also a price key, and the roster save path recalculates and writes it unconditionally, with no financial guard of its own. Guarding it directly would block ordinary dancer add/remove on choreographies that already have money on them — the most common roster operation on exactly the choreographies most likely to have paid — so it is deliberately left unguarded pending a dedicated decision with its own business case.
- `Datos operativos pendientes de coreografía` include music and professors. They do not change calculation, capacity or competitive placement.
- Music and professor links can be edited until the choreography is evaluated, even if registration is closed or the choreography has an active financial link.
- Music/professor links stop being editable once the choreography is evaluated.
- `Archivo de música` is stored as a private audio file for a choreography and is not uploaded during initial registration.
- A choreography can have at most one current `Archivo de música`.
- Replacing the `Archivo de música` uploads the new file first, then removes the previous object when the upload succeeds.
- Removing the `Archivo de música` is allowed until the choreography is evaluated and makes music pending again for operational status.
- V1 accepts MP3, M4A/AAC, WAV and OGG audio files up to 50 MB.
- The `Portal de academias` exposes the current `Archivo de música` through a short-lived signed download URL, not a public URL.

## `Bases del evento`

- `Modalidad` can have submodalities.
- `Submodalidad` is selected only when modality has related submodalities.
- `Tipo de grupo` is calculated from dancer count: solo, duo, trio or grupal.
- `Tipo de grupo` determines available schedule capacities and price rules.
- `Categoría` is calculated from ages against event start date.
- Category applies to one or more group types and either all modalities or selected modalities.
- Category duplication uses exact competitive identity: same minimum age, maximum age, group type set and modality set. It ignores category name and experience levels.
- Category ranges cannot overlap for the same group type and modality.
- A category's age range and its experience level set cannot change while any choreography references it, withdrawn inscriptions included: moving the range would drop those choreographies into a gap and editing the levels would invalidate the level they hold. Renaming stays allowed, and so does every edit to a category no choreography references.
- Solo, duo and trio use oldest dancer age.
- Grupal allows up to 20% older dancers; above that, it uses average age.
- Category calculation returns one category or refuses the write.
- If recalculation changes category and new category has levels, choreography becomes incomplete until academy chooses level.
- `Nivel de experiencia` is selected only when calculated category has levels.
