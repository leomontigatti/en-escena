# Coreografias

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
- A choreography of the active event is shown even if its academy is archived or
  inactive; the administrative view must not hide operational records because of
  academy state.
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

## Choreography Locks

- `Datos bloqueados de coreografía` include name, modalidad, submodalidad, tipo de grupo, category, level and cupo de cronograma.
- For unpaid choreographies without presentation, expected correction path is delete and register again.
- Administrative renaming is not a structural correction and is allowed even when structural data is otherwise blocked.
- Admin structural correction is exceptional, instance-level, requires reason, and is allowed only without presentation.
- Structural correction that changes modalidad, submodalidad or dancers recalculates group type, category, level and schedule.
- If recalculation needs a level, admin must choose it in same correction.
- Active financial document blocks academy edits, dancer changes and deletion, even without imputations.
- If financial docs are canceled/accredited, coreografía can become editable/deletable again.
- Academy cannot change choreography dancers after registration. The roster is chosen once, at creation, and from then on only the administrator can change it. This is a permanent, role-based restriction, not an inscription-window rule (see `docs/domain/finanzas.md` → "Edición y eliminación de coreografía").
- Even the administrator cannot change the roster while the choreography has a presentation (hard lock, like the deletion lock).
- A choreography roster change must keep at least one dancer before confirmation.
- Level clears when recalculation changes category; it becomes editable when new category requires level.
- A roster change that recalculates to a category requiring level must choose the new level before confirmation.
- Cupo de cronograma stays when roster change does not change group type; it clears when group type changes.
- When roster change clears cupo de cronograma, confirmation follows registration schedule semantics: no compatible option blocks confirmation, one compatible option is assigned automatically, and multiple compatible options require choosing one.
- Roster change can recalculate price on confirmation, but the administrative roster edit flow remains operational and does not show price amounts before confirming.
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
