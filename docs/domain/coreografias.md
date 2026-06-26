# Coreografias

Rules for roster links, choreography registration, locks and Bases del evento.

## Roster

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
- Dancer verification states are: incompleto, no verificado, verificado.
- Si falta algún dato o imagen del documento, el estado de verificación de bailarín es incompleto.
- Un par de documento parcial no es un estado guardado: es un error de validación del formulario.
- Dancer verification does not block participation and does not affect choreography operational state.
- Academy cannot edit identity data or document images after a dancer is verified; later corrections are administrative.
- Correcting dancer birth date can recalculate categories for signed or paid choreographies while their presentation is still pending; it does not change financial state.

## Choreographies

- `Coreografía` belongs to one academy and one event; it is not reusable between events.
- It is registered with modalidad, dancers, calculated tipo de grupo, category, optional nivel de experiencia and cupo de cronograma.
- It can be created without professors, but needs at least one linked professor to be operationally complete.
- It can be confirmed without category when no category rule applies; then it is operationally incomplete.
- Academy can delete it while unpaid, without active financial documents, and without presentation.
- Deleting a coreografía releases cupo de cronograma capacity and leaves no visible domain entity.
- Outside inscription period, deleting an unpaid coreografía can make re-registration impossible unless admin changes event dates.
- Once signed, academy cannot edit blocked data or dancers until admin removes the active financial link.
- Roster changes trigger automatic recalculation of group type, category, experience level and schedule.
- Professors do not trigger choreography recalculation.
- Academy choreography modification is submitted as one save operation; if a dancer change cannot be confirmed, professor changes in the same submission are not saved.

## Administrative Choreography Lists

- La lista operativa de coreografías del Panel de administración revisa
  completitud y consistencia de datos para el evento activo.
- La primera versión de la lista operativa es de solo lectura para usuarios
  `admin` y `auditor`.
- La lista operativa muestra únicamente coreografías del evento activo y no
  actúa como archivo histórico de otros eventos.
- Si no hay evento activo, la pantalla debe mostrar un estado vacío específico
  para elegir o activar un evento antes de revisar coreografías.
- Una coreografía del evento activo se muestra aunque su academia esté archivada
  o inactiva; la vista administrativa no debe ocultar registros operativos por
  estado de academia.
- La lista operativa usa el mismo estado visible que el Portal de academias:
  `Completa` o `Incompleta`.
- La primera versión no desglosa los datos operativos pendientes con badges
  adicionales. Ese detalle puede agregarse después sin cambiar la semántica del
  estado operativo.
- La verificación documental de bailarines no afecta el estado operativo de una
  coreografía.
- La lista financiera de coreografías y la lista de participación de
  coreografías son vistas administrativas separadas, no variantes implícitas de
  la lista operativa.

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
- For unpaid choreographies without financial docs or presentation, expected correction path is delete and register again.
- Admin structural correction is exceptional, instance-level, requires reason, and is allowed only without presentation or active financial docs.
- Structural correction that changes modalidad, submodalidad or dancers recalculates group type, category, level and schedule.
- If recalculation needs a level, admin must choose it in same correction.
- Active financial document blocks academy edits, dancer changes and deletion, even without imputations.
- If financial docs are canceled/accredited, coreografía can become editable/deletable again.
- Academy can change choreography dancers only during the inscription period and only while the choreography has no active financial document or presentation.
- A choreography roster change must keep at least one dancer before confirmation.
- Level clears when recalculation changes category; it becomes editable when new category requires level.
- A roster change that recalculates to a category requiring level must choose the new level before confirmation.
- Cupo de cronograma stays when roster change does not change group type; it clears when group type changes.
- When roster change clears cupo de cronograma, confirmation follows registration schedule semantics: no compatible option blocks confirmation, one compatible option is assigned automatically, and multiple compatible options require choosing one.
- Roster change can recalculate price on confirmation, but the academy edit flow remains operational and does not show price amounts before confirming.
- `Datos operativos pendientes de coreografía` include music and professors. They do not change calculation, capacity or competitive placement.
- Music and professor links can be edited while presentation is pending, even if registration is closed or the choreography has an active financial link.
- Music/professor links stop being editable once presentation is no longer pending.

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
