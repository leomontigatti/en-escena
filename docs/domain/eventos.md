# Eventos

Rules for event context, Bases del evento, administration and portal behavior.

## Evento y Bases del evento

- `Evento activo` is the only event context in V1 for Panel de administración and Portal de academias. Lists, event-specific mutations, coreografías, financial operations, puntajes and premios use it unless a detail route identifies one explicit `Evento` by URL.
- At most one `Evento activo` can exist globally; there can also be none.
- `Estado del evento` is automatic from dates: no iniciado, en curso, finalizado. It is not the same as active.
- `Visibilidad de resultados` is controlled by publish/unpublish actions and is independent from active status and temporal state.
- `Cronograma` dates and times are local business dates/times, without their own timezone.
- A `Cupo de cronograma` consumes capacity inside a `Cronograma`; the sum of cupo capacities cannot exceed cronograma capacity.
- A coreografía can use a cupo de cronograma only when cronograma modality and cupo group type are compatible.
- `Bases del evento` includes modalidades, submodalidades, categorías, niveles de experiencia, cronogramas, cupos de cronograma and precios. It does not include Eventos.

## Administración y Portal

- Portal de academias can manage profesores and bailarines even without an active event.
- Portal coreografías stays visible without active event, showing an empty state.
- If inscription is closed, portal shows existing coreografías, disables new ones, and still allows deleting eligible unpaid coreografías.
- Portal price/payment view shows all academy coreografías, including unpaid, incomplete and without active invoice.
- Academy sees price after creating a coreografía, not during registration.
- Admin dashboard lists are operational views; direct `/administracion/*` sections hold global event management and Bases del evento.
- Administración does not create coreografías, profesores or bailarines in ordinary flows; those belong to portal.
- Admin coreografías are separated by axis: operational, financial and participation.
- Academies, professors and dancers have `Participando` filter active by default in admin when they have inscriptions in the active event.
- `Acción de lista` handles selected sets and can process eligible rows while reporting omitted rows.
- `Acción de instancia` handles operations that need full instance context.
