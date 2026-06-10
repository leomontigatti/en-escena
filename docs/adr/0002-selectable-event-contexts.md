# Use selectable event contexts for administration and portal views

We will model event context with three explicit domain terms: Evento activo, Evento de trabajo and Evento consultado. This records the trade-off between a single active-event-only model and selectable event contexts for the Panel de administración and the Portal de academias.

**Context**

The product supports many Eventos over time, but at most one Evento can be active globally. The Evento activo is the operative default for daily work and portal mutations, especially coreography registration and related event operations.

Administration also needs to inspect and prepare future or historical events. Academies need to review their own event-specific history even when an event is not active. If every event-specific list only used the Evento activo, historical consultation, future preparation, shareable filtered admin views, program or result visibility corrections, and read-only portal history would be blocked or require changing the active event for the whole product.

**Decision**

Use the Evento activo as the single global operative default, but allow selectable event contexts where the user journey requires consultation:

- The Panel de administración uses an Evento de trabajo for operational lists. It defaults to the Evento activo when one exists, and can be another event when the view supports consulting or preparing historical or future data.
- The Portal de academias uses an Evento consultado for event-specific sections. It shows all Eventos, defaults to the Evento activo when one exists, and otherwise defaults to the most recent Evento.
- Ordinary event mutations remain limited by the Evento activo and the relevant registration, deletion, permission, and lifecycle rules. Non-active Eventos are read-only in the portal unless a future PRD defines an explicit exception.
- Visibility actions for Programa del evento and Resultados publicados are explicit exceptions: administration may publish or unpublish them for any Evento de trabajo.
- Event detail routes use the event in the URL as their context, so they do not compete with a global selector for source of truth.

**Considered Options**

- Single active-event-only model: simpler routing and fewer selectors, but it prevents historical and future consultation unless administration changes the global active event.
- Multiple active events: flexible for parallel editions, but it weakens the product-wide default, complicates portal mutation rules, and contradicts the one operative event requirement.
- Selectable event contexts with one Evento activo: keeps one global operative default while allowing administration and academies to consult event-specific data safely.

**Consequences**

- Loaders, route actions, repositories, and permissions must distinguish whether they are using Evento activo, Evento de trabajo, or Evento consultado.
- Admin operational list URLs should carry the Evento de trabajo where shareability matters.
- Portal event-specific URLs should carry the Evento consultado where shareability matters.
- UI copy must make non-active contexts explicit so users understand when a view is read-only or limited.
- Tests for future event features should assert both the default active-event behavior and the behavior for selected historical or future contexts.
