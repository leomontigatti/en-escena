# Use the active event as the only V1 event context

We will use the Evento activo as the only event context for the first version of the Panel de administración and the Portal de academias. Selectable event contexts are deferred to a later version.

**Context**

The product supports many Eventos over time, but at most one Evento can be active globally. The Evento activo is the operative default for daily work and portal mutations, especially choreography registration and related event operations.

Selectable event contexts would let administration inspect historical or future data and would let academies review event-specific history. That remains useful, but it creates two layout and routing surfaces for V1: views with an `evento` query parameter and views without it.

For the first version, the product needs one consistent shell and one source of truth more than historical filtering.

**Decision**

Use the Evento activo as the only event context in V1:

- The Panel de administración uses the Evento activo for operational lists and Bases del evento.
- The Portal de academias uses the Evento activo for event-specific sections such as coreografías.
- URLs do not carry an `evento` query parameter for list filtering.
- When there is no Evento activo, event-specific sections show an empty or blocked state instead of falling back to the most recent Evento.
- Event detail routes continue using the event in the URL as their context, because those routes are about one explicit Evento and do not act as list filters.

Selectable event contexts can be reintroduced in V2 as explicit Evento de trabajo and Evento consultado concepts if historical or future event consultation becomes a priority.

**Considered Options**

- Single active-event-only model: simpler routing, one shell behavior, no hidden query context, but no historical or future list filtering in V1.
- Selectable event contexts with one active event: supports historical consultation, but adds selectors, query propagation, read-only states, and duplicated UI behavior before the product needs them.
- Multiple active events: flexible for parallel editions, but weakens the product-wide default and contradicts the one operative event requirement.

**Consequences**

- Loaders, actions, repositories, and UI copy should treat the Evento activo as the only implicit event context.
- Admin and portal list URLs should not preserve or emit `evento` query parameters.
- Admin Bases del evento for Modalidades, Categorías, Cronogramas and Precios applies to the Evento activo in V1.
- V2 event filtering will require a new decision to define URL shape, selector placement, read-only copy, and mutation rules.
