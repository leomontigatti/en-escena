# Choreographies

Rules for roster links, choreography registration, locks and Bases del evento.

## Roster

- `Profesor` belongs to an academy, not to a user account.
- `Profesor` document type and document number are treated as a pair: both may be left empty, or both must be filled in.
- If one is filled in and the other is empty, the record is invalid and is not saved.
- A professor with empty document pair is incomplete but can be used in coreografías.
- When the document pair is complete, its uniqueness is enforced within the same academy.
- Professors do not have manual admin verification.
- Professor records can be edited even when linked to paid or presented coreografías; professor links inside non-pending coreografías can be blocked.
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
- Correcting dancer birth date can recalculate categories for signed or paid choreographies while their presentation is still pending; it does not change financial state.

### Estado de alta de personas del elenco

- `Estado de alta` is the alta state of a bailarín or a profesor, with two
  values: `Activo` and `Archivado`. An academy archives the people it no longer
  works with; it is roster hygiene, not a competitive or financial act.
- Eligibility for a coreografía's elenco is one rule: a person can be picked
  when they are active, **or** when they are already linked to **that**
  coreografía. Already linked means linked to that coreografía — not to any
  coreografía of the Evento activo, and not to any coreografía ever.
- The grandfather half of that rule is what keeps an archived person from
  stranding a record: an archived person already on a coreografía stays on it,
  stays visible and stays re-saveable, so a roster whose people were archived
  afterwards can still be corrected administratively and every other field of
  that coreografía stays editable.
- An archived person who is not already linked cannot be added. Registration is
  the same rule evaluated with an empty linked set, which is why it always
  refuses an archived person, and it says why: either someone in the selection
  is archived and must be reactivated, or the person was not found — which is
  also the answer for a person of another academy, so that one academy is never
  told another academy's record exists. The rejection names no one: the roster
  stores no gender, so the sentence agrees with the person-kind noun
  ("Reactivá este bailarín…") instead of with an interpolated name.
- **Archiving is never refused.** There is no guard: archiving a bailarín
  inscripto en el Evento activo succeeds and the inscription is untouched. The
  archive confirmation says so before the academy confirms; the sentence is
  static and queries nothing.
- Archiving is reversible and lossless. Reactivating always succeeds, puts the
  person back in the pickers immediately and requires nothing else. There is no
  hard delete, no archive date and no archive reason.
- Archiving changes no inscription, no Estado operativo de coreografía, no
  Estado financiero, no precio seleccionado, no conjunto que califica para el
  Descuento por bailarín and no cifra de participación. `Estado de alta` is a
  third axis, independent of Estado de participación and of Estado de
  verificación de bailarín, and the three are shown side by side.
- An archived person is still found by name search. Search is a lookup, not an
  offer: what may be added to an elenco is governed by the eligibility rule
  above, and the person's badge reads `Archivado`.

## Choreographies

- `Coreografía` belongs to one academy and one event; it is not reusable between events.
- It is registered with modalidad, dancers, calculated tipo de grupo, category, optional nivel de experiencia and cupo de cronograma.
- It can be created without professors, but needs at least one linked professor to be operationally complete.
- It can be confirmed without category when no category rule applies; then it is operationally incomplete.
- Academia cannot delete a Coreografía after registration; removal is an administrative action.
- Administrador can delete a Coreografía only when it has no presentación and no puntajes.
- Administrador can rename a Coreografía at any time, including when it has presentación or puntajes.
- Administrative renaming changes only the Coreografía name; it does not recalculate price, capacity, category, schedule or competitive state.
- Deleting a coreografía releases cupo de cronograma capacity and leaves no visible domain entity.
- The dancer roster is never academy-editable; changing it is an administrative action (see Choreography Locks). Once signed, academy also cannot edit other blocked data until admin removes the active financial link.
- Roster changes trigger automatic recalculation of group type, category, experience level and schedule.
- Professors do not trigger choreography recalculation.
- Administrative roster modification is submitted as one save operation; if a dancer change cannot be confirmed, professor changes in the same submission are not saved.

## Administrative Choreography Lists

- The Panel de administración's operational choreography list reviews data
  completeness and consistency for the active event.
- The operational list allows administrative actions for `admin` users and is
  read-only for `auditor` users.
- The operational list links to an administrative instance view of the
  choreography; deletion is an `Acción de instancia`, not a list action.
- The administrative instance view lives at `/administracion/coreografias/:id`
  and resolves only choreographies of the Evento activo.
- In the administrative instance view, only the name and the deletion are
  mutable within this scope; dancers, professors and Archivo de música are shown
  read-only.
- The Archivo de música in the administrative instance view uses the same visual
  upload field as the Portal de academias, but disabled; if a file already
  exists, it allows downloading it.
- After renaming a choreography from administration, the user stays in the
  instance view and gets a save confirmation.
- After deleting a choreography from administration, the user returns to the
  operational list with a deletion confirmation.
- The administrative action to delete a choreography is shown in the instance
  view; if the choreography is not deletable, the dialog reports the blocking
  reason instead of hiding the action.
- The blocked-deletion dialog lists the choreography's concrete blocks:
  presentación and/or puntajes.
- The operational list shows only choreographies of the active event and does
  not act as a historical archive of other events.
- If there is no active event, the screen must show a specific empty state
  prompting to choose or activate an event before reviewing choreographies.
- A choreography of the active event is shown whatever the state of its academy;
  the administrative view must not hide operational records because of academy
  state. An academy carries no archive or inactive state of its own: the only
  Estado de alta in the product belongs to bailarines and profesores (see
  "Estado de alta de personas del elenco").
- The operational list uses the same visible state as the Portal de academias:
  `Completa` or `Incompleta`.
- The first version does not break down pending operational data with additional
  badges. That detail can be added later without changing the semantics of the
  operational state.
- Dancer document verification does not affect a choreography's operational
  state.
- The financial choreography list and the participation choreography list are
  separate administrative views, not implicit variants of the operational list.

## Choreography Registration

- `Registro de coreografía` works with temporary data and creates the coreografía only on final confirmation.
- Before final confirmation it does not consume capacity, generate financial state, or leave abandoned incomplete coreografías.
- Looking up available cupos de cronograma does not reserve capacity.
- Schedule resolution prefers a cupo de cronograma for the calculated group type. If a compatible cronograma has no specific cupo for that group type, the cronograma total capacity is a global fallback option.
- Submodalidad step exists only when selected modalidad has submodalidades.
- If no category is assigned, level step is skipped and level remains empty until recalculation.
- If category requires level, registration cannot advance or confirm until academy chooses one.
- Professors are selected after schedule and level, before summary; empty professors are allowed and make coreografía incomplete.
- Registration summary shows operational data only, not price or financial info.
- Solo, duo and trio summaries list names and ages; group summaries show dancer count.
- Registration does not create dancers or professors inline.
- Music file is not uploaded during initial registration; it remains pending operational data.
- Backend revalidates the selected specific cupo when present and always revalidates cronograma total capacity on confirmation.
- Cupo options show their occupancy and full options are offered disabled, in the portal registration and in the administrative reassignment alike. The count is a snapshot that races with any other registration: the hint does not replace the backend revalidation.
- If every compatible option is full, the registration schedule step replaces the select with a message explaining it, instead of offering a list with nothing selectable.

## Choreography Locks

- `Datos bloqueados de coreografía` include name, modalidad, submodalidad, tipo de grupo and category. Modalidad, cupo de cronograma and nivel de experiencia are not academy-editable either, but they are not fully blocked: the administrator can correct or reassign each of them under the conditions below.
- Delete and register again is the last resort for an unpaid choreography without presentation, not the ordinary correction path: modalidad, submodalidad, nivel de experiencia, cupo de cronograma and the roster all have their own administrative correction. It remains the answer when what has to change is none of those.
- The presentación lock covers the puntajes transitively: a Puntaje belongs to a judge assignment on a presentación, and a presentación is 1:1 with a coreografía, so a scored choreography always has one. No correction needs a separate scores check.
- Administrative renaming is not a structural correction and is allowed even when structural data is otherwise blocked.
- Admin structural correction is exceptional, instance-level, and is allowed only without presentation.
- Structural correction that changes modalidad, submodalidad or dancers recalculates group type, category, level and schedule.
- If recalculation needs a level, admin must choose it in same correction.
- Active financial document blocks academy edits, dancer changes and deletion, even without imputations.
- If financial docs are canceled/accredited, coreografía can become editable/deletable again.
- Academy cannot change choreography dancers after registration. The roster is chosen once, at creation, and from then on only the administrator can change it. This is a permanent, role-based restriction, not an inscription-window rule (see `docs/domain/finances.md` → "Roster editing and deletion").
- Even the administrator cannot change the roster while the choreography has a presentation (hard lock, like the deletion lock).
- A choreography roster change must keep at least one dancer before confirmation.
- Level clears when recalculation changes category. It is editable whenever the resolved category declares levels, not only after a recalculation: with no pending roster change the administrator reassigns it standalone, and a single available level still leaves the field open, because that is the only way to resolve a missing level that leaves the choreography incomplete.
- Reassigning the nivel de experiencia of a registered choreography is a standalone administrative correction in the instance view, like the cupo de cronograma. It carries no financial guard: the level is not a price key, so changing it cannot move an amount.
- A field with no value reads `No aplica` when the category declares no levels and `Sin asignar` when it declares them and the level is missing. The second is the state that makes the choreography incomplete.
- A roster change that recalculates to a category requiring level must choose the new level before confirmation.
- Cupo de cronograma stays when roster change does not change group type; it clears when group type changes.
- When roster change clears cupo de cronograma, confirmation follows registration schedule semantics: no compatible option blocks confirmation, one compatible option is assigned automatically, and multiple compatible options require choosing one.
- Roster change can recalculate price on confirmation, but the administrative roster edit flow remains operational and does not show price amounts before confirming.
- Reassigning the cupo de cronograma of a registered choreography is a standalone administrative correction in the instance view, one choreography at a time. It is not an edit of the cupo's declared capacity and it is not a side effect of a roster change.
- The reassignment offers only compatible cupos (same event, modalidad and calculated tipo de grupo), plus the currently assigned one, so an assignment that drifted out of compatibility stays visible instead of disappearing from the list.
- The administrator can reassign only when all of these hold: the user is `admin` (the `auditor` sees the field read-only), the choreography has no presentación, no active inscription has a registered seña, and there is more than one compatible cupo to choose from. Otherwise the cronograma is shown read-only.
- A registered seña blocks the whole field, never single options: cupo de cronograma is an input of price selection, so every option offered moves the price of the choreography, and there is no financially inert reassignment to exempt. The reason is reported in the page alert, also for the `auditor`.
- The presentación lock is a hard lock for the cupo de cronograma too, like the roster and the deletion; renaming stays allowed.
- Reassignment enforces cupo capacity on confirmation: a cupo that filled up in the meantime is rejected, and re-selecting the cupo the choreography already occupies is a no-op that is never reported as full.
- When there is a pending roster change, the roster form's cronograma select wins over the standalone reassignment: a tipo de grupo change clears the cupo and the replacement must be chosen together with the confirmation.
- The roster save path enforces the same two guards as the standalone reassignment, on the cupo axis only: it locks and re-counts the destination cupo (excluding the choreography being saved) and rejects when any inscription of the choreography holds money, using the same message. Both fire only when the save would actually change `scheduleId`/`scheduleCapacityId` from their current value — a roster edit that keeps the same cupo (e.g. a same-count dancer swap, or a name-only save) is never blocked by either check, even on a choreography that has money on it. A dancer add/remove that recalculates tipo de grupo and, with it, lands on a different cupo of the same cronograma is a change on this axis and is guarded like any other move.
- Correcting the modalidad of a registered choreography is a compound administrative correction in the instance view: one select re-resolves everything the modalidad determines — submodalidad, categoría, nivel de experiencia and cupo de cronograma — and a single confirmation writes all of it in one transaction, or writes nothing. It is a correction of its own, not a field of the roster form —its own intent, its own guards— and the two are mutually exclusive on screen: while one has unsaved changes the other is read-only. They share the page's single `Guardar`, which submits whichever of the two is pending.
- The submodalidad is always re-chosen and never carried over: nothing in the database ties `choreography.submodality_id` back to its modalidad, so carrying it would leave the choreography pointing at a submodalidad of another modalidad, invisible in every list and corrupting for judging.
- The correction offers every modalidad of the event, with the assigned one preselected rather than excluded. Re-selecting it is a successful no-op.
- A modalidad no cronograma of the event accepts is offered disabled, with the reason on the option: it is a structural dead end, because a choreography with no cronograma cannot exist. A modalidad whose cupos merely happen to be full is not disabled — occupancy is a racing snapshot and is resolved at the cupo step, where full options are offered disabled and an entirely full set replaces the select with the reason.
- When the destination modalidad resolves exactly one compatible cupo it is preselected and read-only, like registration. With several, choosing one is required and holds `Guardar` disabled until it is answered, like every other field the resolution leaves to be chosen and like the roster form's own cronograma select.
- The nivel de experiencia survives when the resolved categoría does not change and is cleared when it does; when the resolved categoría declares levels, choosing one is required in the same correction. When no categoría resolves, the correction still saves and the choreography reads as operationally incomplete, exactly like registration.
- Confirming re-resolves the correction against the current bases and rejects it when the outcome diverges from what was previewed, because the preview is older than the write by construction.
- A registered seña does not close the modalidad: it rejects the correction only when the correction would actually move `scheduleId`/`scheduleCapacityId`, since modalidad is not a price key and a destination modalidad that keeps the current cronograma is financially inert. The rejection names the modalidad, not the cupo. The seña is reported in the page alert as a blocker-in-waiting, also for the `auditor`.
- The destination cupo is locked and re-counted on confirmation, excluding the choreography being corrected, exactly like the standalone reassignment.
- The presentación lock is a hard lock for the modalidad too, and the `auditor` sees the field read-only.
- **Known gap**: tipo de grupo is also a price key, and the roster save path recalculates and writes it unconditionally, with no financial guard of its own. Guarding it directly would block ordinary dancer add/remove on choreographies that already have money on them — the most common roster operation on exactly the choreographies most likely to have paid — so it is deliberately left unguarded pending a dedicated decision with its own business case.
- `Datos operativos pendientes de coreografía` include music and professors. They do not change calculation, capacity or competitive placement.
- Music and professor links can be edited while presentation is pending, even if registration is closed or the choreography has an active financial link.
- Music/professor links stop being editable once presentation is no longer pending.
- `Archivo de música` is stored as a private audio file for a choreography and is not uploaded during initial registration.
- A choreography can have at most one current Archivo de música.
- Replacing the Archivo de música uploads the new file first, then removes the previous object when the upload succeeds.
- Removing the Archivo de música is allowed while presentation is pending and makes music pending again for operational status.
- V1 accepts MP3, M4A/AAC, WAV and OGG audio files up to 50 MB.
- The Portal de academias exposes the current Archivo de música through a short-lived signed download URL, not a public URL.

## Bases del evento

- `Modalidad` can have submodalidades.
- `Submodalidad` is selected only when modalidad has related submodalidades.
- `Tipo de grupo` is calculated from dancer count: solo, duo, trio or grupal.
- Tipo de grupo determines available cupos de cronograma and price rules.
- `Categoría` is calculated from ages against event start date.
- Category applies to one or more group types and either all modalities or selected modalities.
- Category duplication uses exact competitive identity: same minimum age, maximum age, group type set and modality set. It ignores category name and experience levels.
- Category ranges cannot overlap for the same group type and modality.
- Solo, duo and trio use oldest dancer age.
- Grupal allows up to 20% older dancers; above that, it uses average age.
- Category calculation returns one category or leaves choreography unassigned.
- If recalculation changes category and new category has levels, choreography becomes incomplete until academy chooses level.
- `Nivel de experiencia` is selected only when calculated category has levels.
