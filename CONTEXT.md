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
  requires an ADR. See [ADR-0011](docs/adr/0011-invoicing-concept-portion-and-surfaces.md).
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
_Avoid_: `user`, `professor`, escuela, delegación

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
_Avoid_: `payment`, imputación, `choreographyFinancialStatus`

**`professor`** — ui: "Profesor"
Person associated with an academy and loaded by that academy as part of its data.
_Avoid_: `user`, `admin`

**`inscription`** — ui: "Inscripción"
Link with economic identity and stable identity (its own `id`) between a choreography and a dancer within a concrete event. It can be unpaid, deposited or paid. Removing an inscription is a physical delete; there is no inactive state.
_Avoid_: academy participation, account, `payment`, invoice, inactive inscription

**`activeInscription`** — ui: "Inscripción activa"
Inscription that takes part in a choreography's current calculations, its pending amounts and its automatic discounts.
_Avoid_: paid inscription, competitive participation

**`choreography`** — ui: "Coreografía"
Choreography registered by an academy for a concrete event.
_Avoid_: reusable work, `inscription`, number

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
The class of uploaded asset — `musicFile` or `documentImage` — that decides accepted formats, size ceiling and key layout.
_Avoid_: mime type, file extension, bucket

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

**`dancer`** — ui: "Bailarín"
Person loaded by an academy to take part in choreographies.
_Avoid_: `professor`, `user`

**`dancerVerificationStatus`** — ui: "Estado de verificación de bailarín"
Documentary validation situation of a dancer.
_Avoid_: `choreographyOperationalStatus`, `choreographyFinancialStatus`

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
Optional audio file associated with the evaluation or disqualification made by a judge.
_Avoid_: numeric score, `presentation`

**`payment`** — ui: "Pago"
Money received and recorded for an academy in an event, which may stay available or be applied through payment allocations.
_Avoid_: invoice, `paymentAllocation`, `choreographyFinancialStatus`

**`comprobante`** — ui: "Factura (comprobante fiscal ARCA)"
Electronic tax receipt —Factura C for monotributo, issued against ARCA/WSFEv1— as a document derived from payments, allocations and inscriptions that never governs financial state. Model under definition (map #320). The term "factura"/"comprobante" is reserved for this fiscal use.
_Avoid_: `payment`, `paymentAllocation`, choreography invoice (retired)

**Choreography invoice** _(retired term)_ — no code identifier
Document of the old financial model (tables `academy_event_choreography_invoice` and `academy_event_invoice_imputation`), removed in V1 (see ADR-0009). Do not use; for the tax receipt see **`comprobante`**.

**Imputación** _(retired term)_ — no code identifier
Financial concept of the old model, retired from the payments and inscriptions model (see ADR-0009). Do not use; applying a payment is a **`paymentAllocation`**.
_Avoid_: `paymentAllocation`, `payment`, invoice

**`paymentAllocation`** — ui: "Asignación de pago"
Application of a payment's balance to one or more inscriptions of an academy in an event.
_Avoid_: `payment`, invoice, imputación

**`inscriptionStage`** — ui: "Etapa de inscripción"
Complete financial part of an inscription that can receive a payment allocation: deposit or balance.
_Avoid_: installment, partial payment, invoice

**`academyAccountBalance`** — ui: "Cuenta corriente de academia"
Financial balance of an academy in an event, composed of payments, payment allocations and the derived available balance.
_Avoid_: `choreographyFinancialStatus`, `payment`, operational balance

**`availableBalanceAmount`** — ui: "Saldo disponible"
Amount of an academy's active payments not yet applied through payment allocations.
_Avoid_: `owedBalanceAmount`, total paid

**`owedBalanceAmount`** — ui: "Saldo adeudado"
Gross operational amount pending for an academy in the active event: the sum, per active inscription, of the shortfall of its allocations against its total. Does not subtract the available balance.
_Avoid_: `availableBalanceAmount`, total paid, estimated total

**`owedDepositAmount`** — ui: "Seña adeudada"
Gross operational deposit amount pending: the sum, per active inscription, of the shortfall of its allocations against its deposit. Does not subtract the available balance, and is always contained in `owedBalanceAmount`.
_Avoid_: choreography invoice, `availableBalanceAmount`, `owedBalanceAmount`

**`inscriptionDepositAmount`** — ui: "Seña de inscripción"
Lower threshold of an inscription: a percentage of its selected price, computed on the **undiscounted** price so the threshold cannot move when a discount tier changes.
_Avoid_: choreography deposit, deposit invoice

**`inscriptionTotalAmount`** — ui: "Total de inscripción"
Upper threshold of an inscription: its selected price minus the live `Descuento por bailarín`, applied exactly once. Supersedes the retired `inscriptionBalanceAmount` (`base − deposit − discount`), whose two subtrahends both moved.
_Avoid_: `inscriptionBalanceAmount` (retired), choreography balance, `availableBalanceAmount`

**`inscriptionFinancialStatus`** — ui: "Estado"
Status of an inscription derived on read from `Σ allocations` against its two thresholds: `depositPending` ("Seña pendiente"), `depositMet` ("Señada") and `paidInFull` ("Pagada"). Nothing is written when a threshold is crossed. A choreography carries the **minimum** over its inscriptions.
_Avoid_: `choreographyFinancialState` (retired), watermark, needs attention

**`choreographyPrice`** — ui: "Precio de coreografía"
Amount derived for a choreography from the prices of its active inscriptions.
_Avoid_: `payment`, `choreographyFinancialStatus`, `frozenInscriptionPrice`

**`tentativeInscriptionPrice`** — ui: "Precio tentativo de inscripción"
Indicative price of an unpaid inscription, computed with the current rules to display or decide a future allocation.
_Avoid_: `frozenInscriptionPrice`, invoice

**`frozenInscriptionPrice`** — ui: "Precio congelado de inscripción"
Price fixed for an inscription when it receives a payment allocation.
_Avoid_: `tentativeInscriptionPrice`, invoice

**`inscriptionSnapshot`** — ui: "Snapshot financiero de inscripción"
Economic data fixed by a payment allocation so that an inscription's financial state does not depend on later price or discount changes.
_Avoid_: invoice, `tentativeInscriptionPrice`

**`financialReferenceDate`** — ui: "Fecha de referencia financiera"
Business date used to resolve the tentative or frozen price of an inscription.
_Avoid_: UTC date

**`paymentDeadline`** — ui: "Fecha límite de pago"
Date until which a configured price can be applied to an inscription.
_Avoid_: deposit date, invoice due date

**`dancerDiscount`** — ui: "Descuento por bailarín"
Automatic discount applied to an inscription's balance according to the event rules and the active inscriptions of the same dancer.
_Avoid_: `administrativeDiscount`, manual discount

**`administrativeDiscount`** — ui: "Descuento administrativo"
Exceptional reduction applied by administration whose exact place in the financial model is pending definition.
_Avoid_: individual discount, base price

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
_Avoid_: "Sin asignar", "Sin datos", blank
