# Auditoria

> **Retirado (2026-07):** por decisión operativa, el sistema deja de auditar
> cambios. Se elimina la infraestructura de auditoría (la tabla
> `administrative_audit_entry` y el código de audit de bailarines, profesores,
> usuarios y coreografías) y los campos de anulación/atribución
> (`annulled*`, `cancelled*`, `createdByUserId`) de los registros. Hay un único
> `Administrador` (edita) y un único `Auditor` (solo lectura); el Auditor lee
> datos, no historial de cambios. Las reglas de abajo quedan como referencia
> histórica y no rigen el modelo actual. El plan de migración que las remueve se
> coordina en #278.

Rules for administrative traceability, audit history and state-level audit
fields.

- Use a persisted state field on the business record when the audit data is part
  of current domain state and is queried by business rules, reports or lists.
- State-level audit fields use explicit columns such as `createdByUserId`,
  `cancelledAt`, `cancelledByUserId`, `cancelledReason`, `annulledAt`,
  `annulledByUserId`, `annulledReason`, `publishedAt` or
  `publishedByUserId`.
- Do not make a generic JSON audit entry the source of truth for active domain
  state, because state queries, constraints, permissions and reports must not
  depend on replaying audit payloads.
- Use a generic administrative audit entry when the product needs historical
  traceability: who changed what, when, why, and the before/after values.
- Administrative audit entries are appropriate for administrative corrections,
  sensitive user administration, roster identity changes, choreography
  structural corrections, score corrections and other exceptional mutations
  where the previous value must remain inspectable.
- When an action changes current state and also needs before/after history, keep
  the state fields on the business record and also write an administrative audit
  entry in the same transaction.
- Corrections, annulments, cancellations and reversals require an administrative
  reason when the domain rule says the action is exceptional, destructive,
  state-reversing or user-visible in audit history.
- Creation and normal operational edits may store actor and timestamp without a
  reason unless the domain rule explicitly requires one.
- Audit payloads must not store raw passwords, password hashes, credential
  secrets or private file contents.
- Audit timestamps are server-side timestamps. User-supplied dates, such as
  payment dates, are business dates and do not replace audit timestamps.
