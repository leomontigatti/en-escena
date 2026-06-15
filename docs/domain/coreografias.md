# Coreografias

Rules for people, choreography registration, locks and Bases del evento.

## People

- `Profesor` belongs to an academy, not to a user account.
- Tipo de documento y número de documento de `Profesor` se tratan como un par: ambos pueden quedar vacíos, o ambos deben completarse.
- Si uno está completo y el otro vacío, la ficha es inválida y no se guarda.
- A professor with empty document pair is incomplete but can be used in coreografías.
- Cuando el par de documento está completo, su unicidad se controla dentro de la misma academia.
- Professors do not have manual admin verification.
- Professor records can be edited even when linked to invoiced, paid or presented coreografías; professor links inside non-pending coreografías can be blocked.
- `Bailarín` birth date is a declared civil date without time or timezone and is compared against event local start date for competitive age.
- Tipo de documento y número de documento de `Bailarín` se tratan como un par: ambos pueden quedar vacíos, o ambos deben completarse.
- Si uno está completo y el otro vacío, la ficha es inválida y no se guarda.
- Cuando el par de documento está completo, su unicidad se controla dentro de la misma academia.
- A dancer participating with another academy is a different domain entity.
- Dancer verification states are: incompleto, faltan imágenes, no verificado, verificado.
- Si el par de documento está vacío, el estado de verificación de bailarín es incompleto.
- Un par de documento parcial no es un estado guardado: es un error de validación del formulario.
- Dancer verification does not block participation and does not affect choreography operational state.
- Academy cannot edit identity data or document images after a dancer is verified; later corrections are administrative.
- Correcting dancer birth date can recalculate categories for signed or paid choreographies while their presentation is still pending; it does not change financial state.

## Choreographies

- `Coreografía` belongs to one academy and one event; it is not reusable between events.
- It is registered with modalidad, dancers, calculated tipo de grupo, category, optional nivel de experiencia and cronograma.
- It can be created without professors, but needs at least one linked professor to be operationally complete.
- It can be confirmed without category when no category rule applies; then it is operationally incomplete.
- Academy can delete it while unpaid, without active financial documents, and without presentation.
- Deleting a coreografía releases cronograma capacity and leaves no visible domain entity.
- Outside inscription period, deleting an unpaid coreografía can make re-registration impossible unless admin changes event dates.
- Once signed, academy cannot edit blocked data or dancers until admin removes the active financial link.
- Roster changes trigger automatic recalculation of group type, category, experience level and schedule.
- Professors do not trigger choreography recalculation.

## Choreography Registration

- `Registro de coreografía` works with temporary data and creates the coreografía only on final confirmation.
- Before final confirmation it does not consume capacity, generate financial state, or leave abandoned incomplete coreografías.
- Looking up available cronogramas does not reserve capacity.
- Submodalidad step exists only when selected modalidad has submodalidades.
- If no category is assigned, level step is skipped and level remains empty until recalculation.
- If category requires level, registration cannot advance or confirm until academy chooses one.
- Professors are selected after schedule and level, before summary; empty professors are allowed and make coreografía incomplete.
- Registration summary shows operational data only, not price or financial info.
- Solo, duo and trio summaries list names and ages; group summaries show dancer count.
- Registration does not create dancers or professors inline.
- Music file is not uploaded during initial registration; it remains pending operational data.
- Backend revalidates cronograma capacity on confirmation.

## Choreography Locks

- `Datos bloqueados de coreografía` include name, modalidad, submodalidad, tipo de grupo, category, level and cronograma.
- For unpaid choreographies without financial docs or presentation, expected correction path is delete and register again.
- Admin structural correction is exceptional, instance-level, requires reason, and is allowed only without presentation or active financial docs.
- Structural correction that changes modalidad, submodalidad or dancers recalculates group type, category, level and schedule.
- If recalculation needs a level, admin must choose it in same correction.
- Active financial document blocks academy edits, dancer changes and deletion, even without imputations.
- If financial docs are canceled/accredited, coreografía can become editable/deletable again.
- Level clears when recalculation changes category; it becomes editable when new category requires level.
- Cronograma stays when roster change does not change group type; it clears when group type changes.
- `Datos operativos pendientes de coreografía` include music and professors. They do not change calculation, capacity or competitive placement.
- Music/professor links stop being editable once presentation is no longer pending.

## Bases del evento

- `Modalidad` can have submodalidades.
- `Submodalidad` is selected only when modalidad has related submodalidades.
- `Tipo de grupo` is calculated from dancer count: solo, duo, trio or grupal.
- Tipo de grupo determines available cronogramas and price rules.
- `Categoría` is calculated from ages against event start date.
- Category applies to one or more group types and either all modalities or selected modalities.
- Category ranges cannot overlap for the same group type and modality.
- Solo, duo and trio use oldest dancer age.
- Grupal allows up to 20% older dancers; above that, it uses average age.
- Category calculation returns one category or leaves choreography unassigned.
- If recalculation changes category and new category has levels, choreography becomes incomplete until academy chooses level.
- `Nivel de experiencia` is selected only when calculated category has levels.
