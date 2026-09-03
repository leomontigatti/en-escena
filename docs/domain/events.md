# Events

Rules for event context, `Bases del evento`, administration and portal behavior.

## Events and `Bases del evento`

- `Evento activo` is the only event context in V1 for `Panel de administración` and `Portal de academias`. Lists, event-specific mutations, choreographies, financial operations, scores and awards use it unless a detail route identifies one explicit `Evento` by URL.
- At most one `Evento activo` can exist globally; there can also be none.
- `Estado del evento` is automatic from dates: no iniciado, en curso, finalizado. It is not the same as active.
- `Visibilidad de resultados` is controlled by publish/unpublish actions and is independent from active status and temporal state.
- `Cronograma` dates and times are local business dates/times, without their own timezone.
- A `Cupo de cronograma` consumes capacity inside a `Cronograma`; the sum of its capacities cannot exceed the `Cronograma` capacity.
- A choreography first uses a `Cupo de cronograma` when schedule modality and capacity group type are compatible.
- If a compatible `Cronograma` has no `Cupo de cronograma` for the choreography group type, the choreography falls back to the `Cronograma` total capacity as global capacity.
- `Bases del evento` includes modalities, submodalities, categories, experience levels, schedules, schedule capacities and prices. It does not include Events.

## Administration and portal

- `Portal de academias` can manage professors and dancers even without an active event.
- Portal choreographies stays visible without active event, showing an empty state.
- If inscription is closed, portal shows existing choreographies, disables new ones, and still allows deleting eligible unpaid choreographies.
- Portal price/payment view shows all academy choreographies, including unpaid and incomplete ones.
- Academy sees price after creating a choreography, not during registration.
- Admin dashboard lists are operational views; direct `/administracion/*` sections hold global event management and `Bases del evento`.
- Administration does not create choreographies, professors or dancers in ordinary flows; those belong to portal.
- Admin choreographies are separated by axis: operational, financial and participation.
- Academies, professors and dancers have `Participando` filter active by default in admin when they have inscriptions in the active event.
- Participation badges are hidden in both admin and portal when there is no active event, so a row is never read as `No participando` without an event to participate in.
- `Acción de lista` handles selected sets and can process eligible rows while reporting omitted rows.
- `Acción de instancia` handles operations that need full instance context.
