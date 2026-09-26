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
A concrete edition of a dance competition, with its own dates, settings, inscriptions, schedule, judges, scores and results.
_Avoid_: Concurso, season, edition

**`activeEvent`** — ui: "Evento activo"
The single event administration marks as globally operative for the product. At most one active event can exist globally; there can also be none. It is the only event context for the first version of the admin panel and the academy portal.
_Avoid_: `eventStatus`, hidden event filter, queried event

**`eventStatus`** — ui: "Estado del evento"
Automatic temporal lifecycle of an event, derived from its start and end dates.
_Avoid_: `activeEvent`, visible

**`resultsPublishedAt`** — ui: "Resultados publicados"
The moment an `event`'s results were last published, null while they are hidden. It is half of the publication: the other half is each `presentation`'s own `resultPublishedAt`, and a presentation is published only when both are set. It is independent of `activeEvent` and of `eventStatus`.
_Avoid_: `eventStatus`, active, results visibility flag

**`schedule`** — ui: "Cronograma"
A programming slot of an event, with name, local date, local time, accepted modalities, optionally accepted categories, and total choreography capacity. Listing no category means it accepts every category, which is how a schedule that names none behaves. When no specific schedule capacity exists for a choreography's group type, the choreography may consume the schedule's total capacity as a global allowance.
_Avoid_: time block, loose time slot, full agenda

**`scheduleCapacity`** — ui: "Cupo de cronograma"
Distribution of choreography capacity within a schedule, tied to a single group type.
_Avoid_: `schedule`, time block

**`registrationOpen`** — ui: "Inscripciones abiertas"
Whether a `schedule` takes registrations right now, reading `Inscripciones cerradas` while it does not. A manual switch an administrator opens and closes on one `schedule` at a time; a new `schedule` is born closed, and the event's registrations are open when any of its schedules is.
The actions that move it, on the `schedule` detail, are `Abrir inscripciones` and `Cerrar inscripciones`; opening is refused while the event's registration readiness fails or the event already ended, and closing never fails.
The schedules list reads the same fact as a read-only column headed `Inscripciones`, badged `Abiertas` or `Cerradas`: shortened because the header already names it.
_Avoid_: `registrationPeriod` (retired), registration window, `active`

**`academy`** — ui: "Academia"
Participating entity that can register for events and load professors, dancers and choreographies. Its name is not unique, but it is guarded at both ends. At signup the onboarding **warns** when an academy of that name already exists, naming it and the date it registered and nothing else about the other account, and points the reader at logging in or recovering that password before offering to continue — a forgotten login is what forks a roster. At the other end administration can **delete an academy that holds nothing** — no dancer, no professor, no choreography (withdrawn ones included), no seminar inscription and no payment — together with its `user`, from the academy detail behind the shared delete confirmation; when it holds something the delete is refused naming what, so an abandoned or forked signup is one panel action instead of SQL.
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
Administrative choreography view centered on presentations, program and evaluation, shown as `Presentación` in the sidebar: where the administrator orders the presentations of the active event and assigns judges. It lists the choreographies that have a `presentation` or are at least `Señada`.
_Avoid_: `choreographyOperationalList`, `choreographyFinancialList`

**`participating`** — ui: "Participando"
Operational indicator used in administration for academies, professors and dancers with an inscription in the active event. A `seminarInscription` never makes anyone `Participando`. The same per-event predicate, read on the roster row alone, is what decides which `seminarPrice` rows price a seminar inscription (see `forParticipants`).
_Avoid_: presented, `participationStatus`, seminar attendee

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
System access identity, with credentials and one main permission. An academy user has a verified email; an internal user has only a name, a `Nombre de usuario interno` and a permission.
_Avoid_: `academy`, `professor`, academy account

**`internalUsername`** — ui: "Nombre de usuario interno"
Access identifier for internal users, the only thing they type to sign in. Internal users have no email: the credential email the access auth provider needs is made up from this username as `<username>@enescena.com.ar` and nothing is ever sent to it.
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
The snapshot of which presentations an `event`'s academies can read, taken by administration from the event's actions menu with no precondition: `Mostrar resultados` publishes every presentation evaluated at that moment, `Actualizar resultados` adds the ones evaluated since, and `Ocultar resultados` takes them all down, so publishing again starts from what is evaluated then. Only membership is stored (`resultsPublishedAt` and `resultPublishedAt`); the medal, the average and the scores are always read live, so a correction to a published presentation reaches the academy without publishing again.
_Avoid_: `eventStatus`, program visibility, public results, freezing results

**`financialDocument`** — ui: "Documento financiero"
Financial record managed by an administrator, such as an invoice or a credit note.
_Avoid_: `payment`, `imputación`, `choreographyFinancialStatus`

**`professor`** — ui: "Profesor"
Person associated with an academy and loaded by that academy as part of its data. Their document **number** alone identifies them within their academy, whatever `documentType` was chosen and archived professors included, so the same number cannot be loaded twice; the creation dialog asks for the pair, optionally, so the rule acts from the first save. A second professor of the same **name** in the academy is a warning the academy confirms, not a refusal. Neither rule crosses into **`dancer`**: one academy may hold the same number on a dancer and on a professor, because a teacher who also dances is one person on two rosters.
_Avoid_: `user`, `admin`

**`seminar`** — ui: "Seminario"
A class an event offers around the competition, created by administration: an instructor's name and picture, a date and time, a quota, a `seminarKind` and its own deposit rate (`Seña (%)`, 1 to 99, default 50, never the event's). It has no name of its own —the instructor and the date are what an academy reads it by— and it is not part of the `Bases del evento`, so registration readiness ignores it. The kind and the rate are refused while any inscription of the seminar is covered. Its quota caps the inscriptions that have **covered their deposit**, not the registrations, and cannot be lowered below that count — see `docs/domain/seminars.md`.
_Avoid_: `schedule`, workshop, taller, class, `eventDocument`

**`seminarInscription`** — ui: "Inscripción a seminario"
The registration of exactly one roster person —a `dancer` or a `professor` of the academy that registers them— into one seminar, open until the seminar starts. Only an academy creates one, from the portal, for its own roster; administration removes any at any time but never creates one. Unique per seminar and person; the same person may hold one in any number of seminars. Registration is **unlimited**: the quota is not checked at the insert, and **covering its deposit is what takes a place** in it. It is the second kind of **`inscription`** — an allocation target in the academy's event pool, carrying `selectedPriceId` (a `seminarPrice`) and `withdrawnAt` and nothing else financial. Removal chooses between a delete and a withdrawal exactly as a choreography inscription's does, on the academy's side too, and registering the same person again revives the withdrawn row with its money.
_Avoid_: student, `academyRegistration`, `choreographyRegistration`, attendance, seminar payment

**`seminarPrice`** — ui: "Precio de seminario"
One named, dated, event-level price row for seminars, shared by every seminar of the event: a free-text `name`, a `seminarKind`, a `forParticipants` flag, a nullable `paymentDeadline` and one `amount`. At most one deadline-less row per `(kind, forParticipants)` cell of an event, the one that applies once every dated row has expired. Edited in a `Seminarios` tab of the event's `Precios`; the guards are the choreography `price` guards verbatim, and they show on the form before they refuse. A seminar inscription resolves its price from the rows of its seminar's kind for the person's participant cell, falling back to the `regular` rows; the stored row's participant flag is what freezes the participant fact at the deposit crossing. The `selectedPrice` column is written by the allocation dialog and by nothing else.
_Avoid_: `price`, seminar tier, per-seminar price, `participantAmount`, `nonParticipantAmount`

**`seminarKind`** — ui: "Tipo de seminario"
The kind of a seminar, an enum with the values `regular` (`Común`) and `special` (`Exclusivo`); the `seminarPrice` carries it too. It plays the role the schedule plays for a choreography price —a non-regular seminar resolves against its kind's rows first and falls back to the regular ones— with no schedule involved. An enum rather than a boolean so a third kind is a value, not a migration. A seminar's kind cannot flip while any of its inscriptions is covered.
_Avoid_: special flag, `isSpecial`, exclusive, `groupType`, `modality`

**`forParticipants`** — ui: "Para participantes"
The flag on a `seminarPrice` that says which people the row prices: those `participating` in the seminar's event, or those who are not. A participant is whoever the existing per-event `Participando` predicate names on the roster row the inscription points at, regardless of the choreography's money; there is no fallback across the axis, so a participant is priced only by rows with the flag set. No surface shows whether a person is read as a participant: the effective price's `name` is the only carrier of the fact.
_Avoid_: `selectedAmountKind` (withdrawn), `Precio aplicado` (withdrawn), participant discount, `dancerDiscount`

**`inscription`** — ui: "Inscripción"
The canonical economic unit: a link with economic identity and stable identity (its own `id`) between one person and one thing an academy pays the event for. It has two kinds. The **choreography inscription** links a choreography and a dancer within a concrete event, is held in `choreography_dancer` and referenced as `choreographyInscriptionId` from the allocation and the comprobante line. The **`seminarInscription`** links a seminar and a roster person, is held in `seminar_inscription` and referenced as `seminarInscriptionId` from the allocation and the comprobante line. Both carry `selectedPriceId` and `withdrawnAt` and nothing else financial. Removing one chooses once between a physical delete —when it holds neither allocations nor a `comprobante` line— and a withdrawal (`withdrawnAt`), which keeps the row and the money on it. Registering the same person again revives that row.
_Avoid_: academy participation, account, `payment`, invoice, inactive inscription, bare `inscriptionId` for one kind

**`activeInscription`** — ui: "Inscripción activa"
Inscription that takes part in its choreography's current calculations, its pending amounts and its automatic discounts: every one that has not been withdrawn. The shared `activeInscription()` predicate and its raw-SQL twin exist so that no reader has to restate the rule, and no reader writes `isNull(withdrawnAt)` by hand. Four reads drop the predicate to show a withdrawn row as evidence: the money rollup behind the four finance surfaces, the roster the two financial details render, the threshold read that keeps the withdrawn row's deposit figure, and the comprobante emitter. Those four are not the whole list of queries without the predicate — several write-path and guard queries have no display to make and need no filter (see `docs/domain/finances.md`, "Withdrawal from the roster"). The seminar kind has a twin, `activeSeminarInscription()`, with the same rule and its own raw-SQL twin — no generic predicate over two tables — and it is the predicate the seminar roster surfaces and the covered count read.
_Avoid_: paid inscription, competitive participation

**`withdrawnInscription`** — ui: "Retirada"
Inscription taken off the roster whose row survives because it holds money or a `comprobante` line. Its total is **what remains allocated to it, not zero**: the deposit may be forfeited and the retained allocation is the record of that retention, so it owes nothing, it cannot be over-allocated, and it keeps exposing its deposit figure. It stays in its choreography's money rollup, and out of its status rollup, its `registrationCount` and its discount qualifying set. Its price still resolves exactly as an active row's does — that is what keeps the deposit figure readable — so price resolution is not one of the things withdrawal changes. `Retirada` is a derived axis of its own, like `Facturada`, and replaces the status badge rather than joining it. A **`withdrawnChoreography`** is the same cut one level up, and every inscription it took is one of these. A withdrawn `seminarInscription` reads the same way — in the money rollup, out of the status rollup and out of the seminar's covered count, so withdrawal frees its place — and, unlike a choreography one, the academy itself can produce it until the seminar starts.
_Avoid_: fourth financial status, deleted inscription, cancelled inscription

**`registeredAt`** — ui: "Fecha de inscripción"
The date an inscription was registered, held on the inscription's own row and not on its choreography's: a dancer added to the roster a week after the choreography was created was registered that week, and counting by the parent choreography's date credited every such row to the original registration. Reviving a withdrawn inscription keeps the original date, because revival undoes the withdrawal rather than registering again; an inscription hard-deleted and then re-added to the roster is a new row and gets a new date. No surface renders it yet — it exists so inscriptions can be counted by day. It ships as `choreographyDancers.createdAt` (`en_escena_choreography_dancer."created_at"`), chosen for symmetry with every other table's timestamp; creation is not the concept — what it dates is the registration — so the symbol is pending rename.
_Avoid_: `choreography.createdAt`, `financialReferenceDate` (retired), payment date

**`choreography`** — ui: "Coreografía"
Choreography registered by an academy for a concrete event. Nothing about its name is unique — two solos of different dancers share a piece name all the time — but confirming one **warns** when the academy already has a non-withdrawn choreography of the same name **and** the same cast in that event, naming it by **`choreographyNumber`** and name; same name with another cast and same cast with another name are both ordinary and pass unremarked.
_Avoid_: reusable work, `inscription`, number

**`choreographyNumber`** — ui: "#"
The short number a choreography is searched and quoted by, unique within its event rather than globally: every screen that lists choreographies already works against a chosen event, and a choreography's event never changes, so the number stays fixed for life. It identifies, it does not count — neither deleting a choreography nor withdrawing one gives its number back, since a **`withdrawnChoreography`** keeps the number it was quoted by, so the sequence has gaps by design and `#00042` does not mean "the event's forty-second choreography". The per-event counter behind it — the same one that numbers `paymentNumber`, and named `eventFinancialSequence` while it only counted money — hands it out inside the transaction that inserts, and `formatEventSequenceNumber` renders it zero-padded at the shared width. It does not replace the `id`, which stays the UUID every route and foreign key uses.
_Avoid_: choreography id, position, order, correlative

**`withdrawnChoreography`** — ui: "Coreografía retirada"
Choreography taken out of the event whose row survives, with every inscription it still had **withdrawn under one shared timestamp**, because some inscription of it holds money or a `comprobante` line. `Eliminar coreografía` is one action that chooses between deleting it outright and this, exactly as roster removal chooses for one dancer, and it is never refused because of money — only an evaluated presentation refuses both outcomes. It is held in `choreographies.withdrawnAt` and is roster state, not financial state, so ADR-0009 is untouched; the `notWithdrawnChoreography()` predicate and its raw-SQL twin are the only place the filter lives. Nothing moves when it is stamped: it keeps its money allocated, keeps its **`choreographyNumber`** and keeps its schedule references, while occupying no capacity and making neither its professors nor its academy participating. It reads as `Retirada` in place of both its operational and its financial status — a derived axis, like the **`withdrawnInscription`** it is made of — stays in the money rollups and out of the status rollups and counts, is hidden from the operational and portal lists behind the `Retirada` filter, always shown in the financial ones, never presented or programmed, and read-only but for `Restaurar coreografía`. The choice is never revisited: de-allocating every peso on it does not make it deletable. Restoring clears the stamp, revives exactly the inscriptions carrying it and re-checks the schedule capacity, which is the one thing that can refuse it.
_Avoid_: choreography without active inscriptions (retired), deleted choreography, unpaid choreography, fourth financial status, cancelled choreography

**`choreographyRegistration`** — ui: "Registro de coreografía"
Academy portal flow to create a choreography in the active event while some `schedule` of it has `Inscripciones abiertas`.
_Avoid_: choreography draft, `presentation`

**`choreographyModification`** — ui: "Modificación de coreografía"
Academy portal flow to change the permitted data of an already registered choreography, without turning exceptional structural corrections into free-form editing.
_Avoid_: `choreographyRegistration`, administrative correction

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
The class of uploaded asset — `musicFile`, `documentImage`, `eventDocument` or `seminarInstructorPicture` — that decides accepted formats, size ceiling and key layout.
_Avoid_: mime type, file extension, bucket

**`eventDocument`** — ui: "Documento del evento"
Static PDF the administration uploads for an event and every academy downloads unchanged. A new event starts with none, and a missing one never blocks registration.
_Avoid_: `documentImage`, `comprobante`, attachment, bases

**`seminarInstructorPicture`** — ui: "Foto del instructor"
The private image of a seminar's instructor, uploaded by administration from the seminar's detail and shown to academies in the portal through a temporary link. One object per seminar; a seminar may exist without one, and the portal shows a placeholder until it does.
_Avoid_: avatar, `documentImage`, public image, logo

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
The set of dancers and professors a choreography currently carries: the **`choreographyDancers`** the admin form edits, plus the linked professors. It is the English domain term and stays in identifiers, file names and comments (`choreography-roster.server.ts`, `updateChoreographyRosterIntent`, `removeInscriptionsFromRoster`); what the academy reads is `Elenco`. Use `Bailarines de coreografía` when the surface names the dancers alone, and `Elenco` when it names the group the choreography presents with. Removal from it is not one gesture but two — a physical delete without evidence, a **`withdrawnInscription`** with it — and removing the whole choreography makes the same choice, between a delete and a **`withdrawnChoreography`**.
_Avoid_: "Roster" as interface copy (retired), cast, lineup, plantel

**`dancer`** — ui: "Bailarín"
Person loaded by an academy to take part in choreographies. Their document **number** is unique within their academy on the same terms as a **`professor`**'s, and the creation dialog asks for the pair optionally too; a second dancer of the same **name and birth date** is a warning the academy confirms, since two children of one academy may share both.
_Avoid_: `professor`, `user`

**`dancerVerificationStatus`** — ui: "Estado de verificación de bailarín"
Documentary validation situation of a dancer.
_Avoid_: `choreographyOperationalStatus`, `choreographyFinancialStatus`

**`rosterPersonStatus`** — ui: "Estado de alta"
Roster status of a person —a **`dancer`** or a **`professor`**— with exactly two values, `active` (`Activo`) and `archived` (`Archivado`): whether the academy still works with them. It is stored as the `active` boolean on both tables, and `app/lib/roster/roster-person-status*` is the only module that reads that column: one predicate, one filter type with one default and one URL codec, one label pair, one eligibility rule (`isSelectableForRoster`) and one writer. Archiving is refused while the person is participating in the active event —a live inscription, a professor link or a live seminar inscription of that event— and reactivating is never refused; the predicate is one reader, shared by the writer's guard and by the detail screens that grey the `Archivar` button out. It is a third axis, independent of **`participationStatus`** and of **`dancerVerificationStatus`**, and archiving touches no inscription, no **`choreographyOperationalStatus`**, no **`choreographyFinancialStatus`** and no figure (see `docs/domain/choreographies.md`, "`Estado de alta` for roster people"). `Archivado` names this and only this: the internal user list's filter of the same name is an unrelated duplicate, pending retirement.
_Avoid_: participating, `dancerVerificationStatus`, deleted person

**`mergeRosterPeople`** — ui: "Fusionar"
Folding a duplicate roster person into the one that stays: two **`dancer`**s or two **`professor`**s of the same academy become one. The survivor keeps its own data and takes from the removed person only a document it lacks; every inscription moves to it whole, so no money moves; the removed person is deleted, not archived. Refused when both share a choreography or a seminar (see `docs/domain/choreographies.md`, "Merging duplicates").
_Avoid_: combine, archive (an archived duplicate is still a duplicate)

**`mergeAcademies`** — ui: "Fusionar"
Folding an academy that forked at signup into the one that stays: everything it holds moves to the survivor, and it and its user are deleted. Refused when it has a comprobante or when a document number is on both rosters.
_Avoid_: combine, delete academy (which only removes an empty one)

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
Ordered instance of a choreography for the event day: a row of its own, one-to-one with the choreography, holding its order number (`N.º`) within the event. A choreography needs to be at least `Señada` to get one and nothing to keep it. Created only by the automatic ordering or by placing a late choreography by hand.
_Avoid_: `choreography`, `choreographyNumber` (the number a choreography is searched by, not its place in the order), `choreographyOperationalStatus`, `choreographyFinancialStatus`

**`dancerSpacing`** — ui: "Separación de bailarines"
The minimum of four presentations between two that share an active dancer, counted within one schedule. The automatic ordering enforces it inside a block, and a clash it could not avoid, or one a manual move or a roster change created, shows as a `presentationWarning` (`Separación`).
_Avoid_: costume change, gap setting, professor spacing

**`frozenPresentation`** — ui: "Presentación fija"
A numbered `presentation` of a schedule that already has an evaluated presentation. Its number is kept by the automatic ordering and by every manual move, and is never offered as a place to move to. Derived on read from the panel's evaluations, never stored.
_Avoid_: locked presentation, evaluated presentation (a frozen row need not be evaluated itself), closed schedule (`registrationOpen` is about inscriptions)

**`presentationWarning`** — ui: "Advertencia"
Derived, informational flag on a row of the `choreographyParticipationList`: never stored, blocks nothing. Its kinds are `belowDeposit` (`Seña pendiente`), `evaluatedSchedule` (`Cronograma evaluado`: a row without a number whose schedule already has a `frozenPresentation`, so no ordering can place it among the presentations already announced), `dancerSpacing` (`Separación`) and `outOfBlock` (`Fuera de bloque`: placed outside the block its schedule, category and group type put it in). Only `belowDeposit` reaches the portal; none reaches the `eventProgram`.
_Avoid_: error, validation, lock

**`participationStatus`** — ui: "Estado de participación"
State derived from a choreography's presentation at the event, and the presentation's evaluation status for the whole panel: `disqualified` is disqualified, `evaluated` is evaluated —disqualified, or carrying any `score` row— and not disqualified, and `pending` is everything else, a choreography with no presentation included. `PresentationEvaluationStatus` is the identifier the code reads it under, with English members and the Spanish in its labels map. The `choreographyParticipationList` shows `Evaluada` and `Descalificada` as badges, each replacing that row's `presentationWarning` badge, and shows no badge for `pending`. It answers for the panel, never for one judge: that is the `judgeScoreStatus`.
_Avoid_: `choreographyOperationalStatus`, `choreographyFinancialStatus`, `judgeScoreStatus`

**`judgingDay`** — ui: "Jornada"
The day the judges are working on: the business date of three hours before now, so a show that runs past midnight keeps its date until 03:00 the next morning, when it closes for good. A `presentation` is open for its judges exactly while its choreography's schedule date is that day — before it there is nothing to score, after it every judge write is refused. It is computed on read from the current instant, with no stored flag and no job, and it binds the judge's list and the judge's editing window with one rule. Administration is not bound by it.
_Avoid_: `schedule`, event date, score window, deadline flag

**`disqualification`** — ui: "Descalificación"
A `presentation` closed for the whole panel and taken out of the results, held as its `disqualifiedAt` timestamp. Any assigned judge sets it while the `judgingDay` is open and any assigned judge clears it, with no confirmation and no reason; administration does both from the scores view at any time. Who did it is not stored, and the scores saved before it are kept, so reinstating brings them back untouched. A judge may still record a `feedbackAudio` on it, stored with no value.
_Avoid_: `scoreAnnulment`, absence, `withdrawnChoreography`, `participationStatus`

**`judgeAssignment`** — ui: "Asignación de juez"
Relation between one judge and one `presentation` they must evaluate, unique per pair. Assigned and removed in bulk from the `choreographyParticipationList`; it survives a reordering, and the judge's suspension or change of role. Removing it is refused once that judge has a `score` for that presentation, and a bulk removal removes the rest and reports how many it kept.
_Avoid_: `presentation`, `score`

**`eventProgram`** — ui: "Programa del evento"
Public view of the active event's presentations in order, at `/programa`, without login and only while the event's program is visible. It lists every `presentation`, with non-competitive data only.
_Avoid_: `resultsPublication`, score, medal

**`academyResults`** — ui: "Resultados de academia"
The evaluation detail an academy opens from its own presentations list, behind its login, for a presentation whose result is published: the `medal` beside the title, the average at the top right, and one card per judge with the judge's name, their score, the `scoreSheet` breakdown when there is one, and their `feedbackAudio`. Annulled scores and judges who never scored are dropped in the loader, so they never reach the browser; a disqualified presentation shows `Descalificada`, no medal, no average and no scores, and keeps the audios. A presentation that is not the academy's own, is not published, or belongs to hidden results answers "not found", and that check is the access control on the `feedbackAudio` signed URL.
_Avoid_: `resultsPublication`, public results, ranking

**`score`** — ui: "Puntaje"
What one judge gave one `presentation`, one row per `judgeAssignment`, **created on that judge's first save** and never on assignment. Its value runs from 0 to 100 in steps of 0.5, and is null only for a judge who saved just a `feedbackAudio` on a disqualified presentation. On a `scoreSheet` the value is the sheet's computed total, recomputed on every save and every administrative edit, so an average never re-derives a sheet. A judge corrects their own until the `judgingDay` closes; administration edits any of them at any time, with no window, no reason asked and no trace kept, and never creates one for a judge who has none. Every score, sheet total and average the app shows is written with a decimal point, on every surface —the judge's screens, administration, the academy portal and the results print—: a deliberate exception to es-AR formatting that covers scores only, money and dates unchanged.
_Avoid_: `presentation`, price, `payment`, confirmed score, draft score

**`submodalityCriterion`** — ui: "Criterio"
One line of a `scoreSheet`: a name, a maximum that is a whole number from 1, and a kind that either adds to the score or deducts from it, belonging to one `submodality` and unique by name within it. The adding maxima total exactly 100, so a sheet can always reach 100, and the deduction maxima sit outside that total because a deduction is a penalty and not a share of the score. Administration defines them as a whole from the modality page, and they lock as soon as any presentation of that submodality has a `score`.
_Avoid_: `medal`, weight, percentage

**`scoreSheet`** — ui: "Planilla"
How a `presentation` is scored when its `submodality` has `submodalityCriterion` rows: one field per criterion instead of one 0-100 value. Its total is the additions minus the deductions, clamped to 0 and 100, and it is what the `score` stores as its value. A submodality with no criteria, and a modality with no submodalities, score with a single value and have no sheet.
_Avoid_: `score`, `eventProgram`, printed sheet, ballot

**`scoreAnnulment`** — ui: "Anulación de puntaje"
Administrative exclusion of a `score` from the average that neither deletes it nor changes it, held as the `annulled` flag and reversed with the same toggle. An annulled score keeps its value, stays visible to administration and is not shown to the academy in published results.
_Avoid_: `disqualification`, assignment deletion, score deletion

**`medal`** — ui: "Medalla"
The recognition a `presentation` earns, read off its average —the mean of its non-annulled score values, rounded to two decimals— in bands fixed by the domain: below 60 `Mención especial` (`specialMention`), 60 to below 80 `Medalla de bronce` (`bronze`), 80 to below 90 `Medalla de plata` (`silver`), 90 or more `Medalla de oro` (`gold`). It carries no position, no tie and no competitive grouping: two presentations that average the same take the same medal. A disqualified presentation has no average and no medal. It is the single recognition term of the domain —what used to be called `Premio`— and there is no award rule, no award type and no ranking beside it.
_Avoid_: `award`, `premio`, position, tie, ranking

**`judgeScoreStatus`** — ui: "Estado"
How one judge's own work on a `presentation` stands, shown in that judge's list and to that judge only: `Pendiente` while their score has no value, `Completa` with a value and a `feedbackAudio`, `Sin devolución` with a value and none —neutral in tone, not a fault— and `Descalificada` whenever the presentation is —`pending`, `complete`, `noFeedback` and `disqualified` in the code, which keeps the Spanish in its labels map. It is never the presentation's `participationStatus`, which answers for the whole panel. Both say "Pendiente" and mean different things: here it is "this judge has not scored yet", there it is "the panel has not evaluated it yet", and neither is the finances `Pendiente` below. Saying which "Pendiente" a screen means is part of writing it.
_Avoid_: `participationStatus`, `choreographyOperationalStatus`, score completeness

**`feedbackAudio`** — ui: "Devolución"
The optional private audio a judge records for the academy, one per `score`, saved by the same save that carries the score and replaced or removed by it. It is allowed on a disqualified presentation, where it is stored with no value, so the academy still hears why. It is `audio/webm` from the browser recorder, capped at three minutes, kept in its own private bucket and served by signed URL (`app/lib/storage/feedback-audio.server.ts`, `app/lib/storage/asset-kinds.ts`). **`Devolución` is reserved for it**: a returned amount of money is a **`refund`** (`Reembolso`), never a `devolución`.
_Avoid_: numeric score, `presentation`, refund, money returned

**`payment`** — ui: "Pago"
Money received and recorded for an academy in an event, which may stay available or be applied through payment allocations. It is editable after the fact — academy, amount, date, method, reference and note — under exactly two accounting guards: the academy is frozen once the payment carries allocations, and the amount can never be edited below what is already allocated. A payment recorded in error can also be deleted, cascading its allocations.
_Avoid_: invoice, `paymentAllocation`, `refund`, `choreographyFinancialStatus`

**`paymentInstructions`** — ui: "Instrucciones de pago"
What an academy needs in order to pay an event: the bank identifiers of the account that receives the money, plus free text that says how to pay and what to write in the transfer. It belongs to one event, is loaded by administration on the event detail and is read by the academy on the portal's payments page. It is not a `payment` and records nothing about money received; an event without it simply shows no instructions.
_Avoid_: `payment`, bank settings, global account, `eventBases`

**`refund`** — ui: "Reembolso"
Money handed back to an academy in an event: an explicit mirror of **`payment`** — amount, date, `refundMethod` over the same method enum, `refundNumber` — that **never carries allocations** and is capped at `availableBalanceAmount`. It moves money, where a credit note moves what is owed; either can happen without the other. **Specified, not built** (ADR-0014 §6, #536). Never call it `Devolución`: that term is taken by **`feedbackAudio`**, the judge's recorded feedback.
_Avoid_: `Devolución`, negative `payment`, `paymentAllocation`, `nota de crédito`

**`comprobante`** — ui: "Factura (comprobante fiscal ARCA)"
Electronic tax receipt —a `Factura C`, issued against ARCA/WSFEv1— derived from inscriptions, payments and allocations, and never governing financial state. It belongs to one **anchor**, of two kinds with a `CHECK` requiring exactly one: a `choreography`, or a `(seminar, academy)` unit (`seminarId` plus the root's own not-null `academyId`, derived from the choreography on a choreography row and taken from the emission input on a seminar one). It is immutable once it carries a CAE, and amended only by another comprobante **of the same anchor**; an anchor that was ever invoiced is permanently undeletable. `comprobante` is **the only reserved Spanish term inside code**; adding another requires an ADR, and `factura` is not one of them — in prose it is an invoice. What the emission and amendment rules are today, and where they are still the ADR-0014 target rather than the code, is in [docs/domain/finances.md](docs/domain/finances.md).
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
An amount of one payment committed to one inscription: the triple `(payment, inscription, amount)`, with no role and no type, unique on the pair, positive by CHECK and deleted rather than kept at zero. Mutable, deletable current state, not an append-only ledger. The administrator never names a payment: allocating draws from `availableBalanceAmount` oldest-first by payment number and de-allocating unwinds newest-first. The inscription side of the triple is a target of either kind — `choreographyInscriptionId` or `seminarInscriptionId`, exactly one set. For a seminar target the write locks the seminar row and enforces its quota at the deposit crossing.
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
The `availableBalanceAmount` of a **single payment**: its amount minus what its own allocations commit, floored at zero. It reads as "how much of this payment is still free to draw", never as "this payment is unresolved" — the money arrived in full either way, which is why it is not called "Pendiente": that word already means an amount that cannot be computed for want of a price, and `Seña pendiente` means an unmet threshold. Two other `Pendiente`s exist and neither is this one: the `judgeScoreStatus` `Pendiente`, which is one judge who has not scored a presentation yet, and the `participationStatus` `pendiente`, which is a presentation the panel has not evaluated. A screen that shows any of the three says which it means. It carries **no provenance**: the pool draws oldest-first and unwinds newest-first, so money returned may land on a different payment than it left, and a row's figure can move without that payment being touched. Summed over an event it is the same money `availableBalanceAmount` counts per academy.
_Avoid_: Pendiente, `owedBalanceAmount`, unpaid payment, `availableBalanceAmount` (that one is the academy's)

**`owedBalanceAmount`** — ui: "Saldo adeudado"
Shortfall of an inscription's allocations against its `inscriptionTotalAmount`, floored at zero. **Gross**: it never subtracts `availableBalanceAmount`, which is shown alongside as its own figure. Scope-owned — inscription, choreography and academy each carry it, the wider scopes by summing the narrower.
_Avoid_: `availableBalanceAmount`, net debt, total paid, estimated total

**`owedDepositAmount`** — ui: "Seña adeudada"
Shortfall of an inscription's allocations against its `inscriptionDepositAmount`, floored at zero. Also **gross**, also scope-owned, and always contained in `owedBalanceAmount`. The two are two cuts of the same debt, not two parts of a total.
_Avoid_: choreography invoice, `availableBalanceAmount`, `owedBalanceAmount`, net debt

**`inscriptionDepositAmount`** — ui: "Seña de inscripción"
Lower threshold of an inscription: `requiredDepositPercentage` of its `selectedPrice`, computed on the **undiscounted** price so the threshold cannot move under an academy when a discount tier changes. The percentage is the event's for a choreography inscription and the seminar's own for a seminar inscription, where covering it is also what takes the place in the quota.
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
The one price row that prices an inscription, held as `selectedPriceId` — the single surviving snapshot column; a `price` row for a choreography inscription and a `seminarPrice` row for a seminar inscription, under the same rule. Every amount and every financial status derives from its `amount` and from `Σ paymentAllocation`. It holds the row the administrator picked when charging — nothing writes it at creation and nothing refreshes it on its own — and it may be rewritten on an allocation write while the inscription is **below its deposit threshold**, fixed from the crossing on, enforced by the write path and by a database trigger; below the threshold the read does not treat it as authoritative either, and re-derives from the row that applies today (ADR-0014, correction of 2026-09-09). The guard that protects it is `hasPriceDivergentInscription` (`choreography-price-divergence-guard.server.ts`), refusing under `code: "price-divergence"`: it asks whether a move would change what a money-holding inscription is charged, not whether one holds money at all. The `hasFrozenPriceInscription` / `frozen-price` names it replaced said the broader thing and are retired.
_Avoid_: `tentativeInscriptionPrice` (retired), `frozenInscriptionPrice` (retired), `hasFrozenPriceInscription` (retired), `frozen-price` (retired), invoice

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
Per-inscription date that used to decide which price row applied. Map #547 replaced date-driven price resolution with the price fixed at the deposit threshold crossing, and the two reference-date columns were dropped in #689. What survives is the shared business date `getBusinessDateOnly()`, which is not a financial concept and needs no glossary term — the read path receives it as the `businessDate` parameter of `selectApplicableInscriptionPrice`, and the words no longer appear in code. Do not use.
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
