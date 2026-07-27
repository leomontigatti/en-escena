# En Escena

Glosario del dominio de competencias de danza. Define términos canónicos; las reglas detalladas viven en [docs/domain/](docs/domain/).

## Cómo leer el glosario

Cada entrada es bilingüe: el término canónico en español —el que ve el usuario, en
la UI y en las URLs— y, después de `code:`, el identificador canónico en inglés
para nombrarlo en el código. Es la tabla de mapeo de la convención de idioma
documentada en [.sandcastle/CODING_STANDARDS.md](.sandcastle/CODING_STANDARDS.md).

Reglas de lectura:

- El identificador es la raíz, no la firma exacta: se declina como corresponda
  (`event` → `eventId`, `events`, `loadAdminEvent`, `EventStatusBadge`).
- `comprobante` es el único término reservado en español dentro del código; sumar
  otro exige un ADR. Ver [ADR-0011](docs/adr/0011-invoicing-concept-portion-and-surfaces.md).
- Los adaptadores de sistemas externos son la excepción: `app/lib/comprobantes/arca`
  habla WSFEv1 (`ArcaVoucher`, `createVoucher`), no el glosario.
- Donde un símbolo existente no coincide con el identificador de acá, manda el
  glosario y el símbolo está pendiente de renombre; renombrar se trackea aparte.
- Los términos retirados no llevan identificador: no deben aparecer en código nuevo.

## Lenguaje

**Evento** — code: `event`
Edición concreta de una competencia de danza, con fechas, configuración, inscripciones, cronograma, jueces, puntajes y premios propios.
_Evitar_: Concurso, temporada, edition

**Evento activo** — code: `activeEvent`
Evento único que administración marca como operativo global para el producto. Como máximo puede haber un Evento activo global; también puede no haber ninguno. Es el único contexto de evento para la primera versión del Panel de administración y del Portal de academias.
_Evitar_: Estado del evento, filtro de evento oculto, evento consultado

**Estado del evento** — code: `eventStatus`
Ciclo de vida temporal automático de un evento, calculado a partir de sus fechas de inicio y finalización.
_Evitar_: Activo, visible

**Visibilidad de resultados** — code: `resultsVisible`
Condición que indica si los resultados de un evento están visibles u ocultos.
_Evitar_: Estado del evento, active

**Cronograma** — code: `schedule`
Franja de programación de un evento, con nombre, fecha local, hora local, modalidades aceptadas y cupo total de coreografías. Cuando no existe un Cupo de cronograma específico para el tipo de grupo de una coreografía, la coreografía puede consumir el cupo total del Cronograma como cupo global.
_Evitar_: Bloque horario, horario suelto, agenda completa

**Cupo de cronograma** — code: `scheduleCapacity`
Distribución del cupo de coreografías dentro de un cronograma, relacionada con un único tipo de grupo.
_Evitar_: Cronograma, bloque horario

**Academia** — code: `academy`
Entidad participante que puede inscribirse en eventos y cargar profesores, bailarines y coreografías.
_Evitar_: Usuario, profesor, escuela, delegación

**Registro público de academia** — code: `academyRegistration`
Flujo público por el que una academia crea su acceso inicial al sistema.
_Evitar_: Registro de coreografía, usuario público, cuenta libre

**Portal de academias** — code: `portal`
Área privada donde una academia gestiona sus datos y consulta información propia del evento activo.
_Evitar_: Administración, vista pública

**Panel de administración** — code: `adminPanel`
Área privada para operación, auditoría y configuración del evento activo.
_Evitar_: Portal de academias, vista pública

**Lista operativa de coreografías** — code: `choreographyOperationalList`
Vista administrativa de coreografías centrada en completitud y consistencia de datos.
_Evitar_: Lista financiera, lista de participación

**Lista financiera de coreografías** — code: `choreographyFinancialList`
Vista administrativa de coreografías centrada en estado financiero.
_Evitar_: Lista operativa, cuenta corriente de academia

**Lista de participación de coreografías** — code: `choreographyParticipationList`
Vista administrativa de coreografías centrada en presentaciones, programa y evaluación.
_Evitar_: Lista operativa, lista financiera

**Participando** — code: `participating`
Indicador operativo usado en administración para academias, profesores y bailarines con inscripción en el Evento activo.
_Evitar_: Presentada, estado de participación

**Ajustes de administración** — code: `adminSettings`
Área del panel destinada a configuración global y configuración del evento activo.
_Evitar_: Dashboard, operación diaria

**Bases del evento** — code: `eventBases`
Conjunto de reglas y datos maestros propios de un Evento que definen cómo se registra, programa, calcula, cobra y compite una coreografía.
_Evitar_: Configuración del Evento, settings, configuration

**Acción de lista** — code: `listAction`
Operación administrativa disponible desde una vista de lista y aplicada a una o más instancias seleccionadas.
_Evitar_: Acción de instancia, edición de formulario

**Acción de instancia** — code: `instanceAction`
Operación administrativa disponible dentro de la vista de formulario o detalle de una instancia concreta.
_Evitar_: Acción de lista, acción masiva

**Usuario** — code: `user`
Identidad de acceso al sistema, con credenciales y un permiso principal.
_Evitar_: Academia, profesor, cuenta de academia

**Nombre de usuario interno** — code: `internalUsername`
Identificador de acceso para usuarios internos sin depender de un correo electrónico válido.
_Evitar_: Correo interno, alias, cuenta

**Recuperación de acceso** — code: `accessRecovery`
Flujo por el que una academia existente recupera su acceso mediante un enlace enviado a su correo verificado.
_Evitar_: Registro público de academia, invitación de usuario

**Restablecimiento administrativo de contraseña** — code: `internalUserPasswordReset`
Acción administrativa que asigna una nueva contraseña temporal a un usuario interno y exige cambio obligatorio de contraseña; es el mecanismo de recuperación para usuarios internos.
_Evitar_: Recuperación de acceso, invitación de usuario interno

**Sesión de acceso** — code: `accessSession`
Período autenticado de un usuario dentro del sistema.
_Evitar_: Registro, invitación, recuperación de acceso

**Cambio obligatorio de contraseña** — code: `requiresPasswordChange`
Condición de un usuario interno que debe definir una contraseña propia antes de acceder a su área privada.
_Evitar_: Recuperación de acceso, invitación de usuario interno

**Usuario suspendido** — code: `suspendedUser`
Usuario que conserva su historial pero no puede iniciar ni mantener sesiones de acceso.
_Evitar_: Usuario eliminado, usuario inactivo, baja

**Administrador** — code: `admin`
Usuario con permisos de operación sobre el evento y sus excepciones.
_Evitar_: Auditor, usuario de academia

**Invitación de usuario interno** — code: `internalUserInvitation`
Flujo administrativo para habilitar un usuario de administración, auditoría o juzgamiento.
_Evitar_: Registro público de academia, recuperación de acceso

**Juez** — code: `judge`
Usuario interno asignado a evaluar presentaciones de un evento.
_Evitar_: Administrador, auditor

**Publicación de resultados** — code: `resultsPublication`
Acción administrativa única que habilita u oculta los resultados públicos y de academia para un evento.
_Evitar_: Estado del evento, visibilidad del programa

**Documento financiero** — code: `financialDocument`
Registro financiero administrado por un administrador, como factura o nota de crédito.
_Evitar_: Pago, imputación, estado financiero

**Profesor** — code: `professor`
Persona asociada a una academia y cargada por esa academia como parte de sus datos.
_Evitar_: Usuario, administrador

**Inscripción** — code: `inscription`
Vínculo con identidad económica e identidad estable (`id` propio) entre una coreografía y un bailarín dentro de un evento concreto. Puede estar impaga, señada o pagada. Quitar una inscripción es un borrado físico; no existe estado inactiva.
_Evitar_: Participación de academia, cuenta, pago, factura, inscripción inactiva

**Inscripción activa** — code: `activeInscription`
Inscripción que participa en los cálculos vigentes de una coreografía, sus importes pendientes y los descuentos automáticos.
_Evitar_: Inscripción pagada, participación competitiva

**Coreografía** — code: `choreography`
Coreografía registrada por una academia para un evento concreto.
_Evitar_: Obra reutilizable, inscripción, número

**Coreografía sin inscripciones activas** — code: `choreographyWithoutActiveInscriptions`
Caso excepcional pendiente de definición para una coreografía que conserva historial pero ya no tiene inscripciones activas.
_Evitar_: Coreografía eliminada, coreografía impaga

**Registro de coreografía** — code: `choreographyRegistration`
Flujo del portal de academias para crear una coreografía en el Evento activo dentro del período de inscripción.
_Evitar_: Borrador de coreografía, presentación

**Modificación de coreografía** — code: `choreographyModification`
Flujo del portal de academias para cambiar datos permitidos de una Coreografía ya registrada, sin convertir correcciones estructurales excepcionales en edición libre.
_Evitar_: Registro de coreografía, corrección administrativa

**Período de inscripción** — code: `registrationPeriod`
Ventana temporal del evento durante la cual las academias pueden registrar coreografías desde el portal.
_Evitar_: Estado del evento, active

**Datos bloqueados de coreografía** — code: `lockedChoreographyData`
Datos de una coreografía que la academia no puede cambiar cuando las reglas del evento o su estado financiero/competitivo los bloquean.
_Evitar_: Datos operativos pendientes, datos financieros

**Datos operativos pendientes de coreografía** — code: `pendingOperationalChoreographyData`
Datos de una coreografía que pueden completarse sin cambiar cálculo, cupo ni ubicación competitiva.
_Evitar_: Datos bloqueados, datos financieros

**Archivo de música** — code: `musicFile`
Archivo de audio privado asociado a una Coreografía y gestionado como dato operativo pendiente.
_Evitar_: Audio de evaluación, devolución, pista pública

**Bailarines de coreografía** — code: `choreographyDancers`
Bailarines vinculados a una coreografía mediante inscripciones.
_Evitar_: Profesores, datos financieros

**Bailarín** — code: `dancer`
Persona cargada por una academia para participar en coreografías.
_Evitar_: Profesor, usuario

**Estado de verificación de bailarín** — code: `dancerVerificationStatus`
Situación de validación documental de un bailarín.
_Evitar_: Estado operativo de coreografía, estado financiero

**Inconsistencia administrativa** — code: `administrativeInconsistency`
Alerta interna de administración para datos que requieren revisión o trazabilidad sin pertenecer al estado operativo, financiero ni competitivo.
_Evitar_: Estado operativo, estado financiero, descalificación

**Estado operativo de coreografía** — code: `choreographyOperationalStatus`
Completitud de datos necesarios para presentar una coreografía.
_Evitar_: Estado financiero, estado del evento

**Estado financiero de coreografía** — code: `choreographyFinancialState`
Situación financiera derivada de los estados económicos de las inscripciones activas de una coreografía.
_Evitar_: Estado operativo, estado del evento

**Presentación** — code: `presentation`
Instancia ordenada de una coreografía para el día del evento.
_Evitar_: Coreografía, estado operativo, estado financiero

**Estado de participación** — code: `participationStatus`
Estado derivado de la presentación de una coreografía en el evento.
_Evitar_: Estado operativo de coreografía, estado financiero de coreografía

**Asignación de juez** — code: `judgeAssignment`
Relación entre un juez y las presentaciones que debe evaluar.
_Evitar_: Presentación, puntaje

**Ranking** — code: `ranking`
Orden competitivo calculado con presentaciones no descalificadas que tengan al menos un puntaje válido.
_Evitar_: Presentación, cronograma, orden de presentación

**Resultados publicados** — code: `publishedResults`
Vista pública de resultados liberada manualmente por administración.
_Evitar_: Ranking preliminar, devolución

**Programa del evento** — code: `eventProgram`
Vista pública del orden cronológico de presentación de un evento.
_Evitar_: Resultados publicados, ranking

**Resultados de academia** — code: `academyResults`
Vista de resultados disponible con login para la academia dueña de una coreografía cuando administración publica resultados.
_Evitar_: Resultados publicados, ranking preliminar

**Ranking preliminar** — code: `preliminaryRanking`
Vista interna de administración que puede calcularse aunque falten presentaciones por resolver.
_Evitar_: Ranking final, premio

**Premio** — code: `award`
Reconocimiento derivado del promedio competitivo válido de una presentación dentro de un evento.
_Evitar_: Puntaje, ranking

**Tipo de premio** — code: `awardType`
Regla de premio dentro de un evento.
_Evitar_: Premio, ranking

**Puntaje** — code: `score`
Evaluación asignada a un juez para una presentación.
_Evitar_: Presentación, precio, pago

**Corrección de puntaje** — code: `scoreCorrection`
Cambio administrativo de un puntaje ya confirmado.
_Evitar_: Puntaje borrador, presentación

**Anulación de puntaje** — code: `scoreAnnulment`
Acción administrativa explícita sobre un puntaje confirmado que lo excluye del promedio competitivo sin eliminar su trazabilidad.
_Evitar_: Corrección de puntaje, eliminación de asignación

**Devolución** — code: `feedbackAudio`
Archivo de audio opcional asociado a la evaluación o descalificación realizada por un juez.
_Evitar_: Puntaje numérico, presentación

**Pago** — code: `payment`
Ingreso de dinero registrado para una academia en un evento, que puede quedar disponible o aplicarse mediante asignaciones de pago.
_Evitar_: Factura, asignación de pago, estado financiero de coreografía

**Factura (comprobante fiscal ARCA)** — code: `comprobante`
Comprobante fiscal electrónico —Factura C de monotributo, emitida contra ARCA/WSFEv1— como documento derivado de pagos, asignaciones e inscripciones que nunca gobierna el estado financiero. Modelo en definición (mapa #320). El término "factura"/"comprobante" queda reservado para este uso fiscal.
_Evitar_: Pago, asignación de pago, Factura de coreografía (retirada)

**Factura de coreografía** _(término retirado)_ — sin identificador de código
Documento del modelo financiero viejo (tablas `academy_event_choreography_invoice` e `academy_event_invoice_imputation`), removido en V1 (ver ADR-0009). No usar; para el comprobante fiscal ver **Factura (comprobante fiscal ARCA)**.

**Imputación** _(término retirado)_ — sin identificador de código
Concepto financiero del modelo viejo, retirado del modelo de pagos e inscripciones (ver ADR-0009). No usar; la aplicación de un pago es una **Asignación de pago**.
_Evitar_: Asignación de pago, pago, factura

**Asignación de pago** — code: `paymentAllocation`
Aplicación de saldo de un pago a una o más inscripciones de una academia en un evento.
_Evitar_: Pago, factura, imputación

**Etapa de inscripción** — code: `inscriptionStage`
Parte financiera completa de una inscripción que puede recibir una asignación de pago: seña o saldo.
_Evitar_: Cuota, pago parcial, factura

**Cuenta corriente de academia** — code: `academyAccountBalance`
Saldo financiero de una academia en un evento, compuesto por pagos, asignaciones de pago y el saldo disponible derivado.
_Evitar_: Estado financiero de coreografía, pago, saldo operativo

**Saldo disponible** — code: `availableBalanceAmount`
Monto de pagos activos de una academia que todavía no fue aplicado mediante asignaciones de pago.
_Evitar_: Saldo adeudado, total pagado

**Saldo adeudado** — code: `owedBalanceAmount`
Monto operativo neto pendiente de cobrar o pagar para una academia en el Evento activo, calculado con señas y saldos pendientes de inscripciones activas y descuento del Saldo disponible. Nunca es menor que cero.
_Evitar_: Saldo disponible, total pagado, total estimado

**Seña adeudada** — code: `owedDepositAmount`
Monto operativo bruto de seña pendiente para inscripciones activas impagas. No descuenta el Saldo disponible.
_Evitar_: Factura de coreografía, saldo disponible, saldo adeudado

**Seña de inscripción** — code: `inscriptionDepositAmount`
Monto de seña calculado para una inscripción a partir de su precio congelado.
_Evitar_: Seña de coreografía, factura de seña

**Saldo de inscripción** — code: `inscriptionBalanceAmount`
Monto restante de una inscripción después de descontar su seña asignada y sus descuentos aplicables.
_Evitar_: Saldo de coreografía, saldo disponible

**Precio de coreografía** — code: `choreographyPrice`
Importe derivado para una coreografía a partir de los precios de sus inscripciones activas.
_Evitar_: Pago, estado financiero, precio congelado de inscripción

**Precio tentativo de inscripción** — code: `tentativeInscriptionPrice`
Precio orientativo de una inscripción impaga, calculado con las reglas vigentes para mostrar o decidir una asignación futura.
_Evitar_: Precio congelado, factura

**Precio congelado de inscripción** — code: `frozenInscriptionPrice`
Precio fijado para una inscripción cuando recibe una asignación de pago.
_Evitar_: Precio tentativo, factura

**Snapshot financiero de inscripción** — code: `inscriptionSnapshot`
Datos económicos fijados por una asignación de pago para que el estado financiero de una inscripción no dependa de cambios posteriores de precios o descuentos.
_Evitar_: Factura, precio tentativo

**Fecha de referencia financiera** — code: `financialReferenceDate`
Fecha de negocio usada para resolver el precio tentativo o congelado de una inscripción.
_Evitar_: Fecha UTC

**Fecha límite de pago** — code: `paymentDeadline`
Fecha hasta la que un precio configurado puede aplicarse a una inscripción.
_Evitar_: Fecha de seña, vencimiento de factura

**Descuento por bailarín** — code: `dancerDiscount`
Descuento automático aplicado al saldo de una inscripción según las reglas del evento y las inscripciones activas del mismo bailarín.
_Evitar_: Descuento administrativo, descuento manual

**Descuento administrativo** — code: `administrativeDiscount`
Reducción excepcional aplicada por administración cuyo lugar exacto en el modelo financiero está pendiente de definición.
_Evitar_: Descuento individual, precio base

**Modalidad** — code: `modality`
Clasificación artística elegida al registrar una coreografía.
_Evitar_: Categoría, tipo de grupo

**Submodalidad** — code: `submodality`
Clasificación opcional dentro de una modalidad. Su nombre debe ser único dentro de esa modalidad, sin distinguir mayúsculas y minúsculas.
_Evitar_: Modalidad, categoría

**Tipo de grupo** — code: `groupType`
Clasificación calculada por cantidad de bailarines seleccionados para una coreografía.
_Evitar_: Modalidad, categoría

**Categoría** — code: `category`
Clasificación calculada por edades medidas contra la fecha de inicio del evento. Su identidad competitiva se define por rango de edad, tipos de grupo y modalidades.
_Evitar_: Modalidad, tipo de grupo

**Nivel de experiencia** — code: `experienceLevel`
Clasificación relacionada con una categoría y elegida por la academia cuando corresponde.
_Evitar_: Categoría
