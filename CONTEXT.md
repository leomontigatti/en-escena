# En Escena

Domain glossary for dance competitions. Defines canonical terms; the detailed rules live in [docs/domain/](docs/domain/).

## How to read the glossary

Each entry is keyed on the canonical English identifier —the name to use in
code— followed by `ui:`, the canonical Spanish term the user sees in the
interface and in URLs. It is the mapping table for the code language convention
documented in [.sandcastle/CODING_STANDARDS.md](.sandcastle/CODING_STANDARDS.md).

Reading rules:

- The identifier is the root, not the exact signature: decline it as needed
  (`event` → `eventId`, `events`, `loadAdminEvent`, `EventStatusBadge`).
- `comprobante` is the only reserved Spanish term inside code; adding another
  requires an ADR. See [ADR-0011](docs/adr/superseded/0011-invoicing-concept-portion-and-surfaces.md).
- **Prose is governed like an identifier** (#792): the terms below are what the
  user reads, not what a comment, a test name or a design doc says. Write the
  English identifier in prose, and if the surface's own wording is the point,
  mark the Spanish as data — a backtick in markdown, a double quote for copy and
  a backtick for a name in code.
- External-system adapters are the exception: `app/lib/comprobantes/arca` speaks
  WSFEv1 (`ArcaVoucher`, `createVoucher`), not the glossary.
- Where an existing symbol disagrees with the identifier here, the glossary wins
  and the symbol is pending rename; renames are tracked separately.
- Retired terms carry no identifier: they must not appear in new code.

## Vocabulary

**`event`** — ui: "Evento"
A concrete edition of a dance competition, with its own dates, settings, inscriptions, schedule, judges, scores and awards.
_Avoid_: Concurso, season, edition

**`activeEvent`** — ui: "Evento activo"
The single event administration marks as globally operative for the product. At most one active event can exist globally; there can also be none. It is the only event context for the first version of the admin panel and the academy portal.
_Avoid_: `eventStatus`, hidden event filter, queried event

**`eventStatus`** — ui: "Estado del evento"
Automatic temporal lifecycle of an event, derived from its start and end dates.
_Avoid_: `activeEvent`, visible

**`resultsVisible`** — ui: "Visibilidad de resultados"
Condition indicating whether an event's results are visible or hidden.
_Avoid_: `eventStatus`, active

**`schedule`** — ui: "Cronograma"
A programming slot of an event, with name, local date, local time, accepted modalities and total choreography capacity. When no specific schedule capacity exists for a choreography's group type, the choreography may consume the schedule's total capacity as a global allowance.
_Avoid_: time block, loose time slot, full agenda

**`scheduleCapacity`** — ui: "Cupo de cronograma"
Distribution of choreography capacity within a schedule, tied to a single group type.
_Avoid_: `schedule`, time block

**`academy`** — ui: "Academia"
Participating entity that can register for events and load professors, dancers and choreographies.
_Avoid_: `user`, `professor`, `escuela`, `delegación`

**`academyRegistration`** — ui: "Registro público de academia"
Public flow through which an academy creates its initial access to the system.
_Avoid_: `choreographyRegistration`, public user, free account

**`portal`** — ui: "Portal de academias"
Private area where an academy manages its own data and consults information about the active event.
_Avoid_: `adminPanel`, public view

**`adminPanel`** — ui: "Panel de administración"
Private area for operating, auditing and configuring the active event.
_Avoid_: `portal`, public view

**`choreographyOperationalList`** — ui: "Lista operativa de coreografías"
Administrative choreography view centered on data completeness and consistency.
_Avoid_: `choreographyFinancialList`, `choreographyParticipationList`

**`choreographyFinancialList`** — ui: "Lista financiera de coreografías"
Administrative choreography view centered on financial state.
_Avoid_: `choreographyOperationalList`, `academyAccountBalance`

**`choreographyParticipationList`** — ui: "Lista de participación de coreografías"
Administrative choreography view centered on presentations, program and evaluation.
_Avoid_: `choreographyOperationalList`, `choreographyFinancialList`

**`participating`** — ui: "Participando"
Operational indicator used in administration for academies, professors and dancers with an inscription in the active event.
_Avoid_: presented, `participationStatus`

**`adminSettings`** — ui: "Ajustes de administración"
Panel area for global configuration and active-event configuration.
_Avoid_: dashboard, daily operation

**`eventBases`** — ui: "Bases del evento"
The set of rules and master data belonging to an event that define how a choreography is registered, scheduled, calculated, charged and competed.
_Avoid_: event configuration, settings, configuration

**`listAction`** — ui: "Acción de lista"
Administrative operation available from a list view and applied to one or more selected instances.
_Avoid_: `instanceAction`, form editing

**`instanceAction`** — ui: "Acción de instancia"
Administrative operation available inside the form or detail view of one concrete instance.
_Avoid_: `listAction`, bulk action

**`user`** — ui: "Usuario"
System access identity, with credentials and one main permission.
_Avoid_: `academy`, `professor`, academy account

**`internalUsername`** — ui: "Nombre de usuario interno"
Access identifier for internal users, without depending on a valid email address.
_Avoid_: internal email, alias, account

**`accessRecovery`** — ui: "Recuperación de acceso"
Flow through which an existing academy recovers its access via a link sent to its verified email.
_Avoid_: `academyRegistration`, `internalUserInvitation`

**`internalUserPasswordReset`** — ui: "Restablecimiento administrativo de contraseña"
Administrative action that assigns a new temporary password to an internal user and forces a mandatory password change; it is the recovery mechanism for internal users.
_Avoid_: `accessRecovery`, `internalUserInvitation`

**`accessSession`** — ui: "Sesión de acceso"
Authenticated period of a user inside the system.
_Avoid_: `academyRegistration`, `internalUserInvitation`, `accessRecovery`

**`requiresPasswordChange`** — ui: "Cambio obligatorio de contraseña"
Condition of an internal user who must set their own password before reaching their private area.
_Avoid_: `accessRecovery`, `internalUserInvitation`

**`suspendedUser`** — ui: "Usuario suspendido"
User who keeps their history but cannot start or maintain access sessions.
_Avoid_: deleted user, inactive user, deactivation

**`admin`** — ui: "Administrador"
User with operating permissions over the event and its exceptions.
_Avoid_: auditor, academy user

**`internalUserInvitation`** — ui: "Invitación de usuario interno"
Administrative flow to enable an administration, audit or judging user.
_Avoid_: `academyRegistration`, `accessRecovery`

**`judge`** — ui: "Juez"
Internal user assigned to evaluate an event's presentations.
_Avoid_: `admin`, auditor

**`resultsPublication`** — ui: "Publicación de resultados"
Single administrative action that enables or hides the public and academy results for an event.
_Avoid_: `eventStatus`, program visibility

**`financialDocument`** — ui: "Documento financiero"
Financial record managed by an administrator, such as an invoice or a credit note.
_Avoid_: `payment`, `imputación`, `choreographyFinancialStatus`

**`professor`** — ui: "Profesor"
Person associated with an academy and loaded by that academy as part of its data.
_Avoid_: `user`, `admin`

**`inscription`** — ui: "Inscripción"
Link with economic identity and stable identity (its own `id`) between a choreography and a dancer within a concrete event. Removing it from the roster chooses once between a physical delete —when it holds neither allocations nor a `comprobante` line— and a withdrawal (`withdrawnAt`), which keeps the row and the money on it. Adding the same dancer again revives that row.
_Avoid_: academy participation, account, `payment`, invoice, inactive inscription

**`activeInscription`** — ui: "Inscripción activa"
Inscription that takes part in a choreography's current calculations, its pending amounts and its automatic discounts: every one that has not been withdrawn. The shared `activeInscription()` predicate and its raw-SQL twin exist so that no reader has to restate the rule, and no reader writes `isNull(withdrawnAt)` by hand. Four reads drop the predicate to show a withdrawn row as evidence: the money rollup behind the four finance surfaces, the roster the two financial details render, the threshold read that keeps the withdrawn row's deposit figure, and the comprobante emitter. Those four are not the whole list of queries without the predicate — several write-path and guard queries have no display to make and need no filter (see `docs/domain/finances.md`, "Withdrawal from the roster").
_Avoid_: paid inscription, competitive participation

**`withdrawnInscription`** — ui: "Retirada"
Inscription taken off the roster whose row survives because it holds money or a `comprobante` line. Its total is **what remains allocated to it, not zero**: the deposit may be forfeited and the retained allocation is the record of that retention, so it owes nothing, it cannot be over-allocated, and it keeps exposing its deposit figure. It stays in its choreography's money rollup, and out of its status rollup, its `registrationCount` and its discount qualifying set. Its price still resolves exactly as an active row's does — that is what keeps the deposit figure readable — so price resolution is not one of the things withdrawal changes. `Retirada` is a derived axis of its own, like `Facturada`, and replaces the status badge rather than joining it.
_Avoid_: fourth financial status, deleted inscription, cancelled inscription

**`registeredAt`** — ui: "Fecha de inscripción"
The date an inscription was registered, held on the inscription's own row and not on its choreography's: a dancer added to the roster a week after the choreography was created was registered that week, and counting by the parent choreography's date credited every such row to the original registration. Reviving a withdrawn inscription keeps the original date, because revival undoes the withdrawal rather than registering again; an inscription hard-deleted and then re-added to the roster is a new row and gets a new date. No surface renders it yet — it exists so inscriptions can be counted by day. It ships as `choreographyDancers.createdAt` (`en_escena_choreography_dancer."created_at"`), chosen for symmetry with every other table's timestamp; creation is not the concept — what it dates is the registration — so the symbol is pending rename.
_Avoid_: `choreography.createdAt`, `financialReferenceDate` (retired), payment date

**`choreography`** — ui: "Coreografía"
Choreography registered by an academy for a concrete event.
_Avoid_: reusable work, `inscription`, number

**`choreographyNumber`** — ui: "#"
The short number a choreography is searched and quoted by, unique within its event rather than globally: every screen that lists choreographies already works against a chosen event, and a choreography's event never changes, so the number stays fixed for life. It identifies, it does not count — deleting a choreography does not give its number back, so the sequence has gaps by design and `#00042` does not mean "the event's forty-second choreography". The per-event counter behind it — the same one that numbers `paymentNumber`, and named `eventFinancialSequence` while it only counted money — hands it out inside the transaction that inserts, and `formatEventSequenceNumber` renders it zero-padded at the shared width. It does not replace the `id`, which stays the UUID every route and foreign key uses.
_Avoid_: choreography id, position, order, correlative

**`choreographyWithoutActiveInscriptions`** — ui: "Coreografía sin inscripciones activas"
Exceptional case, pending definition, for a choreography that keeps its history but no longer has active inscriptions.
_Avoid_: deleted choreography, unpaid choreography

**`choreographyRegistration`** — ui: "Registro de coreografía"
Academy portal flow to create a choreography in the active event during the registration period.
_Avoid_: choreography draft, `presentation`

**`choreographyModification`** — ui: "Modificación de coreografía"
Academy portal flow to change the permitted data of an already registered choreography, without turning exceptional structural corrections into free-form editing.
_Avoid_: `choreographyRegistration`, administrative correction

**`registrationPeriod`** — ui: "Período de inscripción"
Time window of the event during which academies can register choreographies from the portal.
_Avoid_: `eventStatus`, active

**`lockedChoreographyData`** — ui: "Datos bloqueados de coreografía"
Data of a choreography the academy cannot change when the event rules or its financial/competitive state lock them.
_Avoid_: `pendingOperationalChoreographyData`, financial data

**`pendingOperationalChoreographyData`** — ui: "Datos operativos pendientes de coreografía"
Data of a choreography that can be completed without changing calculation, capacity or competitive placement.
_Avoid_: `lockedChoreographyData`, financial data

**`musicFile`** — ui: "Archivo de música"
Private audio file associated with a choreography and managed as pending operational data.
_Avoid_: evaluation audio, `feedbackAudio`, public track

**`uploadedAsset`** — ui: "Archivo subido"
Private file an academy uploads and the system stores on the volume, referenced from a row by its key.
_Avoid_: attachment, media, public file

**`assetKind`** — ui: "Tipo de archivo subido"
The class of uploaded asset — `musicFile`, `documentImage` or `eventDocument` — that decides accepted formats, size ceiling and key layout.
_Avoid_: mime type, file extension, bucket

**`eventDocument`** — ui: "Documento del evento"
Static PDF the administration uploads for an event and every academy downloads unchanged. A new event starts with none, and a missing one never blocks registration.
_Avoid_: `documentImage`, `comprobante`, attachment, bases

**`professorContract`** — ui: "Contrato para profesores"
The event document an academy downloads from the professors list; `professor_contract` as an `EventDocumentKind` value.
_Avoid_: `adultContract`, teacher agreement

**`minorAuthorization`** — ui: "Autorización para menores"
The event document authorizing a minor's participation, downloaded from the dancers list; `minor_authorization` as an `EventDocumentKind` value. Always offered, whether or not the academy has minors on its roster.
_Avoid_: parental consent, `adultContract`

**`adultContract`** — ui: "Contrato para mayores"
The event document an adult dancer signs, downloaded from the dancers list; `adult_contract` as an `EventDocumentKind` value.
_Avoid_: `professorContract`, `minorAuthorization`

**`documentImage`** — ui: "Imagen del documento"
Photograph of one side of a dancer's identity document, held as evidence for verification.
_Avoid_: avatar, `musicFile`, public image

**`storageKey`** — ui: "Clave de almacenamiento"
The path that locates an uploaded asset on the volume; what a row stores, never a URL.
_Avoid_: URL, path on disk, file name

**`signedUrl`** — ui: "Enlace temporal"
Short-lived authenticated link that serves an uploaded asset, expiring after the lifetime its asset kind declares.
_Avoid_: public link, presigned URL, permalink

**`choreographyDancers`** — ui: "Bailarines de coreografía"
Dancers linked to a choreography through inscriptions.
_Avoid_: professors, financial data

**`roster`** — ui: "Elenco"
The set of dancers and professors a choreography currently carries: the **`choreographyDancers`** the admin form edits, plus the linked professors. It is the English domain term and stays in identifiers, file names and comments (`choreography-roster.server.ts`, `updateChoreographyRosterIntent`, `removeInscriptionsFromRoster`); what the academy reads is `Elenco`. Use `Bailarines de coreografía` when the surface names the dancers alone, and `Elenco` when it names the group the choreography presents with. Removal from it is not one gesture but two — a physical delete without evidence, a **`withdrawnInscription`** with it.
_Avoid_: "Roster" as interface copy (retired), cast, lineup, plantel

**`dancer`** — ui: "Bailarín"
Person loaded by an academy to take part in choreographies.
_Avoid_: `professor`, `user`

**`dancerVerificationStatus`** — ui: "Estado de verificación de bailarín"
Documentary validation situation of a dancer.
_Avoid_: `choreographyOperationalStatus`, `choreographyFinancialStatus`

**`rosterPersonStatus`** — ui: "Estado de alta"
Roster status of a person —a **`dancer`** or a **`professor`**— with exactly two values, `active` (`Activo`) and `archived` (`Archivado`): whether the academy still works with them. It is stored as the `active` boolean on both tables, and `app/lib/roster/roster-person-status*` is the only module that reads that column: one predicate, one filter type with one default and one URL codec, one label pair, one eligibility rule (`isSelectableForRoster`) and one writer. It is a third axis, independent of **`participationStatus`** and of **`dancerVerificationStatus`**, and archiving touches no inscription, no **`choreographyOperationalStatus`**, no **`choreographyFinancialStatus`** and no figure (see `docs/domain/choreographies.md`, "`Estado de alta` for roster people"). `Archivado` names this and only this: the internal user list's filter of the same name is an unrelated duplicate, pending retirement.
_Avoid_: participating, `dancerVerificationStatus`, deleted person

**`administrativeInconsistency`** — ui: "Inconsistencia administrativa"
Internal administration alert for data requiring review or traceability without belonging to the operational, financial or competitive state.
_Avoid_: `choreographyOperationalStatus`, `choreographyFinancialStatus`, disqualification

**`choreographyOperationalStatus`** — ui: "Estado operativo de coreografía"
Completeness of the data needed to present a choreography.
_Avoid_: `choreographyFinancialStatus`, `eventStatus`

**`choreographyFinancialStatus`** — ui: "Estado financiero de coreografía"
Financial situation of a choreography: the **minimum** `inscriptionFinancialStatus` over its active inscriptions, so one uncovered dancer pulls the whole choreography down. Supersedes the retired `choreographyFinancialState`, a watermark that hid stragglers, and the "needs attention" display that compensated for it.
_Avoid_: `choreographyOperationalStatus`, `eventStatus`, watermark, needs attention

**`presentation`** — ui: "Presentación"
Ordered instance of a choreography for the event day.
_Avoid_: `choreography`, `choreographyOperationalStatus`, `choreographyFinancialStatus`

**`participationStatus`** — ui: "Estado de participación"
State derived from a choreography's presentation at the event.
_Avoid_: `choreographyOperationalStatus`, `choreographyFinancialStatus`

**`judgeAssignment`** — ui: "Asignación de juez"
Relation between a judge and the presentations they must evaluate.
_Avoid_: `presentation`, `score`

**`ranking`** — ui: "Ranking"
Competitive order computed from non-disqualified presentations having at least one valid score.
_Avoid_: `presentation`, `schedule`, presentation order

**`publishedResults`** — ui: "Resultados publicados"
Public results view released manually by administration.
_Avoid_: `preliminaryRanking`, `feedbackAudio`

**`eventProgram`** — ui: "Programa del evento"
Public view of an event's chronological presentation order.
_Avoid_: `publishedResults`, `ranking`

**`academyResults`** — ui: "Resultados de academia"
Results view available with login to the academy owning a choreography once administration publishes results.
_Avoid_: `publishedResults`, `preliminaryRanking`

**`preliminaryRanking`** — ui: "Ranking preliminar"
Internal administration view that can be computed even while presentations remain unresolved.
_Avoid_: final ranking, `award`

**`award`** — ui: "Premio"
Recognition derived from the valid competitive average of a presentation within an event.
_Avoid_: `score`, `ranking`

**`awardType`** — ui: "Tipo de premio"
Award rule within an event.
_Avoid_: `award`, `ranking`

**`score`** — ui: "Puntaje"
Evaluation assigned by a judge to a presentation.
_Avoid_: `presentation`, price, `payment`

**`scoreCorrection`** — ui: "Corrección de puntaje"
Administrative change to an already confirmed score.
_Avoid_: draft score, `presentation`

**`scoreAnnulment`** — ui: "Anulación de puntaje"
Explicit administrative action on a confirmed score that excludes it from the competitive average without removing its traceability.
_Avoid_: `scoreCorrection`, assignment deletion

**`feedbackAudio`** — ui: "Devolución"
Optional audio file associated with the evaluation or disqualification made by a judge. **Specified, not built**: nothing in `app/` carries this identifier — judging owns the concept in `docs/domain/judging.md`, and the column, the upload and the reader are all still to come. **`Devolución` is reserved for it regardless**: a returned amount of money is a **`refund`** (`Reembolso`), never a `devolución`. The reservation is what keeps the name free for the surface that will need it.
_Avoid_: numeric score, `presentation`, refund, money returned

**`payment`** — ui: "Pago"
Money received and recorded for an academy in an event, which may stay available or be applied through payment allocations. It is editable after the fact — academy, amount, date, method, reference and note — under exactly two accounting guards: the academy is frozen once the payment carries allocations, and the amount can never be edited below what is already allocated. A payment recorded in error can also be deleted, cascading its allocations.
_Avoid_: invoice, `paymentAllocation`, `refund`, `choreographyFinancialStatus`

**`refund`** — ui: "Reembolso"
Money handed back to an academy in an event: an explicit mirror of **`payment`** — amount, date, `refundMethod` over the same method enum, `refundNumber` — that **never carries allocations** and is capped at `availableBalanceAmount`. It moves money, where a credit note moves what is owed; either can happen without the other. **Specified, not built** (ADR-0014 §6, #536). Never call it `Devolución`: that term is reserved for **`feedbackAudio`**, itself specified and not built.
_Avoid_: `Devolución`, negative `payment`, `paymentAllocation`, `nota de crédito`

**`comprobante`** — ui: "Factura (comprobante fiscal ARCA)"
Electronic tax receipt —a `Factura C`, issued against ARCA/WSFEv1— derived from inscriptions, payments and allocations, and never governing financial state. One per choreography, immutable once it carries a CAE, and amended only by another comprobante. `comprobante` is **the only reserved Spanish term inside code**; adding another requires an ADR, and `factura` is not one of them — in prose it is an invoice. What the emission and amendment rules are today, and where they are still the ADR-0014 target rather than the code, is in [docs/domain/finances.md](docs/domain/finances.md).
_Avoid_: `payment`, `paymentAllocation`, choreography invoice (retired), voucher

**`Porción`** _(retired term)_ — no code identifier
Label that classified a **`comprobante`** as covering the deposit, the balance or both. It only made sense under the two-rung ladder map #547 retired: money is now allocated in arbitrary amounts against two thresholds, so a comprobante covers an amount and is neither rung. The column, its pgEnum, its derivation and its printed label are gone; the printed line names the service sold instead. It is retired as a _concept_, not as a string: the comprobante list still scrubs a stale `porcion` query parameter out of old URLs, which canonicalises a bookmark rather than reading anything. Do not use.
_Avoid_: `comprobante`, `inscriptionStage` (retired), deposit invoice, balance invoice

**`Desactualizada`** _(retired term)_ — no code identifier
Currency badge each of the choreography financial detail's two `porción` metric cards carried, paired with a `Vigente` that meant "the covering invoice bills every peso collected in this portion". It read a portion and died with **`Porción`**; those cards now carry no badge and no comprobante link. The surviving `Vigente` is the unrelated one — the derived `vigente` / `anulada` status of a **`comprobante`**, shown on the global comprobante list and detail. Do not use.
_Avoid_: `comprobanteStatus`, `Vigente` (comprobante status), stale, outdated

**`Plata`** _(retired term)_ — no code identifier
Colloquial Rioplatense word for money, once used across the finance surfaces: the allocation dialog's `Asignar plata` / `Quitar plata`, the withdrawal copy, the payment-deletion warning and two server error messages. The register was wrong for a product an academy reads, so every surface now says **`dinero`** — masculine, so the agreement around it changed too (`el dinero asignado`, not `la plata asignada`). It is retired as a _string_, not as a concept: what the copy names is still a **`paymentAllocation`** against an inscription. Do not use, in interface copy or in comments.
_Avoid_: `paymentAllocation`, guita, balance, `availableBalanceAmount`

**Choreography invoice** _(retired term)_ — no code identifier
Document of the old financial model (tables `academy_event_choreography_invoice` and `academy_event_invoice_imputation`), removed in V1 (see ADR-0009). Do not use; for the tax receipt see **`comprobante`**.

**`Imputación`** _(retired term)_ — no code identifier
Financial concept of the old model, retired from the payments and inscriptions model (see ADR-0009). Do not use; applying a payment is a **`paymentAllocation`**.
_Avoid_: `paymentAllocation`, `payment`, invoice

**`paymentAllocation`** — ui: "Asignación de pago"
An amount of one payment committed to one inscription: the triple `(payment, inscription, amount)`, with no role and no type, unique on the pair, positive by CHECK and deleted rather than kept at zero. Mutable, deletable current state, not an append-only ledger. The administrator never names a payment: allocating draws from `availableBalanceAmount` oldest-first by payment number and de-allocating unwinds newest-first.
_Avoid_: `payment`, invoice, `imputación`, `inscriptionStage` (retired), ledger entry

**`Etapa de inscripción`** _(retired term)_ — no code identifier
The deposit-or-balance rung of the two-rung ladder retired by map #547 and ADR-0014 §1. An allocation no longer pays a rung: it is an amount against an inscription, and what replaced the ladder is a threshold reading, **`inscriptionFinancialStatus`**. Do not use.
_Avoid_: installment, partial payment, rung

**`Cuenta corriente de academia`** _(retired term)_ — no code identifier
Named no symbol in code before map #547 and names none after it. An academy's money is **`payment`**, **`paymentAllocation`**, **`refund`** and the derived **`availableBalanceAmount`**; there is no account-balance entity holding them together. Do not use it for an entity. It is retired as a _concept_, not as a string: "Cuenta corriente" is the live page title of the portal's finance page (`app/features/portal/finances/view.tsx`), which is UI copy an academy reads and is not covered by this tombstone.
_Avoid_: `availableBalanceAmount`, `choreographyFinancialStatus`, operational balance

**`availableBalanceAmount`** — ui: "Saldo disponible"
Money an academy has handed over in an event and that is not committed: `paid − allocated − refunded`. Structurally never negative, because every allocation is capped against it and a payment's amount can never be edited below what it already funds. The refunds term is specified and not yet built (#536), so today the figure reads `paid − allocated`.
_Avoid_: `owedBalanceAmount`, total paid, `academyAccountBalance` (retired)

**`paymentAvailableAmount`** — ui: "Disponible"
The `availableBalanceAmount` of a **single payment**: its amount minus what its own allocations commit, floored at zero. It reads as "how much of this payment is still free to draw", never as "this payment is unresolved" — the money arrived in full either way, which is why it is not called "Pendiente": that word already means an amount that cannot be computed for want of a price, and `Seña pendiente` means an unmet threshold. It carries **no provenance**: the pool draws oldest-first and unwinds newest-first, so money returned may land on a different payment than it left, and a row's figure can move without that payment being touched. Summed over an event it is the same money `availableBalanceAmount` counts per academy.
_Avoid_: Pendiente, `owedBalanceAmount`, unpaid payment, `availableBalanceAmount` (that one is the academy's)

**`owedBalanceAmount`** — ui: "Saldo adeudado"
Shortfall of an inscription's allocations against its `inscriptionTotalAmount`, floored at zero. **Gross**: it never subtracts `availableBalanceAmount`, which is shown alongside as its own figure. Scope-owned — inscription, choreography and academy each carry it, the wider scopes by summing the narrower.
_Avoid_: `availableBalanceAmount`, net debt, total paid, estimated total

**`owedDepositAmount`** — ui: "Seña adeudada"
Shortfall of an inscription's allocations against its `inscriptionDepositAmount`, floored at zero. Also **gross**, also scope-owned, and always contained in `owedBalanceAmount`. The two are two cuts of the same debt, not two parts of a total.
_Avoid_: choreography invoice, `availableBalanceAmount`, `owedBalanceAmount`, net debt

**`inscriptionDepositAmount`** — ui: "Seña de inscripción"
Lower threshold of an inscription: `requiredDepositPercentage` of its `selectedPrice`, computed on the **undiscounted** price so the threshold cannot move under an academy when a discount tier changes.
_Avoid_: choreography deposit, deposit invoice, `inscriptionStage` (retired)

**`inscriptionTotalAmount`** — ui: "Total de inscripción"
Upper threshold of an inscription: its `selectedPrice` minus the live `dancerDiscount`, applied exactly once, with no coalesce and no third subtrahend. On a **withdrawn** inscription it is instead what remains allocated to it — not zero. Supersedes the retired `inscriptionBalanceAmount` (`base − deposit − discount`), whose two subtrahends both moved.
_Avoid_: `inscriptionBalanceAmount` (retired), choreography balance, `availableBalanceAmount`

**`inscriptionFinancialStatus`** — ui: "Estado"
Status of an inscription derived on read from `Σ allocations` against its two thresholds: `depositPending` (`Seña pendiente`), `depositMet` (`Señada`) and `paidInFull` (`Pagada`). Nothing is written when a threshold is crossed. A choreography carries the **minimum** over its inscriptions.
_Avoid_: `choreographyFinancialState` (retired), watermark, needs attention

**`choreographyPrice`** — ui: "Precio de coreografía"
Amount derived for a choreography from the prices of its active inscriptions: the sum of their selected prices, one by one.
_Avoid_: `payment`, `choreographyFinancialStatus`, applicable price × dancers

**`selectedPrice`** — ui: "Precio base"
The one price row that prices an inscription, held as `selectedPriceId` — the single surviving snapshot column. Every amount and every financial status derives from its `amount` and from `Σ paymentAllocation`. It is rewritten on each allocation write while the inscription is **below its deposit threshold** and fixed from the crossing on, enforced by the write path and by a database trigger; below the threshold the read does not treat it as authoritative either, and re-derives from the row that applies today. The existing `hasFrozenPriceInscription` / `frozen-price` symbols name a broader guard — any money at all, not the price lock — and are pending rename.
_Avoid_: `tentativeInscriptionPrice` (retired), `frozenInscriptionPrice` (retired), invoice

**`Precio tentativo de inscripción`** _(retired term)_ — no code identifier
Indicative price of an unpaid inscription, retired with the estimate marking map #547 deleted: every figure an academy reads is exact and is exactly what must be paid, so there is no tentative price to contrast a fixed one with. Do not use; the price of an inscription is **`selectedPrice`**.
_Avoid_: `selectedPrice`, estimated price

**`Precio congelado de inscripción`** _(retired term)_ — no code identifier
The other half of the retired tentative/frozen pair. Fixing survives as behaviour — see **`selectedPrice`**, where it happens at the deposit threshold — but not as a second term, because there is only ever one price on an inscription. Do not use.
_Avoid_: `selectedPrice`, snapshot price

**`Snapshot financiero de inscripción`** _(retired term)_ — no code identifier
Economic data fixed by a payment allocation so that an inscription's financial state did not depend on later price or discount changes. The ten columns that held it were dropped in #689: amounts, thresholds and financial status are now derived from the selected price and `Σ paymentAllocation`. The one fixed thing left is the price row, and that is **`selectedPrice`**.
_Avoid_: `inscriptionSnapshot` (retired), invoice, frozen amount, `financialReferenceDate` (retired)

**`Fecha de referencia financiera`** _(retired term)_ — no code identifier
Per-inscription date that used to decide which price row applied. Map #547 replaced date-driven price resolution with the price fixed at the deposit threshold crossing, and the two reference-date columns were dropped in #689. What survives is the shared business date `getBusinessDateOnly()`, which is not a financial concept and needs no glossary term — it is held in a local named `financialReferenceDate` inside `resolveEstimatedBasePriceAmount`, on the **read** path, so the words do still appear in code even though they name no column, no type and no exported symbol. Do not use.
_Avoid_: `selectedPrice`, UTC date, deposit date

**`paymentDeadline`** — ui: "Fecha límite de pago"
Date until which a configured price can be applied to an inscription.
_Avoid_: deposit date, invoice due date

**`dancerDiscount`** — ui: "Descuento por bailarín"
Automatic discount that enters an inscription's `inscriptionTotalAmount` and nowhere else. It is **always live**: recomputed on every read, never frozen and never carried forward. Its qualifying set is the dancer's registered active inscriptions in the same **academy and event**, whatever their financial status, and the most expensive one of the set is left at full price.
_Avoid_: `administrativeDiscount`, manual discount, granted discount, frozen discount

**`administrativeDiscount`** — ui: "Descuento administrativo"
Exceptional obligation-side reduction granted by administration. **Reserved and deliberately undefined**: map #547 ruled it out of scope rather than answering it (ADR-0014 §9), because no map decision depends on it and the 80% case is already served by picking the price row explicitly. It is not tombstoned and the name stays taken. Whoever defines it has to argue the exception ADR-0009 forbids — it is the one figure in the model with no derivation behind it, so it must be persisted.
_Avoid_: individual discount, base price, `dancerDiscount`, refund

**`modality`** — ui: "Modalidad"
Artistic classification chosen when registering a choreography.
_Avoid_: `category`, `groupType`

**`submodality`** — ui: "Submodalidad"
Optional classification within a modality. Its name must be unique within that modality, case-insensitively.
_Avoid_: `modality`, `category`

**`groupType`** — ui: "Tipo de grupo"
Classification computed from the number of dancers selected for a choreography.
_Avoid_: `modality`, `category`

**`category`** — ui: "Categoría"
Classification computed from ages measured against the event's start date. Its competitive identity is defined by age range, group types and modalities.
_Avoid_: `modality`, `groupType`

**`experienceLevel`** — ui: "Nivel de experiencia"
Classification related to a category and chosen by the academy where applicable.
_Avoid_: `category`

**`notApplicableValue`** — ui: "No aplica"
Empty value of a field that cannot hold one in this context, as opposed to one that has none yet. Reserved for the second case is "Sin asignar": the field admits a value and it is missing, which is what leaves a choreography `incomplete`. Rendering both the same way hides an incomplete record behind a correct-looking one.
_Avoid_: `Sin asignar`, `Sin datos`, blank
