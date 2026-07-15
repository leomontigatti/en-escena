# En Escena

Glosario del dominio de competencias de danza. Define términos canónicos; las reglas detalladas viven en [docs/domain/](docs/domain/).

## Lenguaje

**Evento**:
Edición concreta de una competencia de danza, con fechas, configuración, inscripciones, cronograma, jueces, puntajes y premios propios.
_Evitar_: Concurso, temporada, edition

**Evento activo**:
Evento único que administración marca como operativo global para el producto. Como máximo puede haber un Evento activo global; también puede no haber ninguno. Es el único contexto de evento para la primera versión del Panel de administración y del Portal de academias.
_Evitar_: Estado del evento, filtro de evento oculto, evento consultado

**Estado del evento**:
Ciclo de vida temporal automático de un evento, calculado a partir de sus fechas de inicio y finalización.
_Evitar_: Activo, visible

**Visibilidad de resultados**:
Condición que indica si los resultados de un evento están visibles u ocultos.
_Evitar_: Estado del evento, active

**Cronograma**:
Franja de programación de un evento, con nombre, fecha local, hora local, modalidades aceptadas y cupo total de coreografías. Cuando no existe un Cupo de cronograma específico para el tipo de grupo de una coreografía, la coreografía puede consumir el cupo total del Cronograma como cupo global.
_Evitar_: Bloque horario, horario suelto, agenda completa

**Cupo de cronograma**:
Distribución del cupo de coreografías dentro de un cronograma, relacionada con un único tipo de grupo.
_Evitar_: Cronograma, bloque horario

**Academia**:
Entidad participante que puede inscribirse en eventos y cargar profesores, bailarines y coreografías.
_Evitar_: Usuario, profesor, escuela, delegación

**Registro público de academia**:
Flujo público por el que una academia crea su acceso inicial al sistema.
_Evitar_: Registro de coreografía, usuario público, cuenta libre

**Portal de academias**:
Área privada donde una academia gestiona sus datos y consulta información propia del evento activo.
_Evitar_: Administración, vista pública

**Panel de administración**:
Área privada para operación, auditoría y configuración del evento activo.
_Evitar_: Portal de academias, vista pública

**Lista operativa de coreografías**:
Vista administrativa de coreografías centrada en completitud y consistencia de datos.
_Evitar_: Lista financiera, lista de participación

**Lista financiera de coreografías**:
Vista administrativa de coreografías centrada en estado financiero.
_Evitar_: Lista operativa, cuenta corriente de academia

**Lista de participación de coreografías**:
Vista administrativa de coreografías centrada en presentaciones, programa y evaluación.
_Evitar_: Lista operativa, lista financiera

**Participando**:
Indicador operativo usado en administración para academias, profesores y bailarines con inscripción en el Evento activo.
_Evitar_: Presentada, estado de participación

**Ajustes de administración**:
Área del panel destinada a configuración global y configuración del evento activo.
_Evitar_: Dashboard, operación diaria

**Bases del evento**:
Conjunto de reglas y datos maestros propios de un Evento que definen cómo se registra, programa, calcula, cobra y compite una coreografía.
_Evitar_: Configuración del Evento, settings, configuration

**Acción de lista**:
Operación administrativa disponible desde una vista de lista y aplicada a una o más instancias seleccionadas.
_Evitar_: Acción de instancia, edición de formulario

**Acción de instancia**:
Operación administrativa disponible dentro de la vista de formulario o detalle de una instancia concreta.
_Evitar_: Acción de lista, acción masiva

**Usuario**:
Identidad de acceso al sistema, con credenciales y un permiso principal.
_Evitar_: Academia, profesor, cuenta de academia

**Nombre de usuario interno**:
Identificador de acceso para usuarios internos sin depender de un correo electrónico válido.
_Evitar_: Correo interno, alias, cuenta

**Recuperación de acceso**:
Flujo por el que una academia existente recupera su acceso mediante un enlace enviado a su correo verificado.
_Evitar_: Registro público de academia, invitación de usuario

**Restablecimiento administrativo de contraseña**:
Acción administrativa que asigna una nueva contraseña temporal a un usuario interno y exige cambio obligatorio de contraseña; es el mecanismo de recuperación para usuarios internos.
_Evitar_: Recuperación de acceso, invitación de usuario interno

**Sesión de acceso**:
Período autenticado de un usuario dentro del sistema.
_Evitar_: Registro, invitación, recuperación de acceso

**Cambio obligatorio de contraseña**:
Condición de un usuario interno que debe definir una contraseña propia antes de acceder a su área privada.
_Evitar_: Recuperación de acceso, invitación de usuario interno

**Usuario suspendido**:
Usuario que conserva su historial pero no puede iniciar ni mantener sesiones de acceso.
_Evitar_: Usuario eliminado, usuario inactivo, baja

**Administrador**:
Usuario con permisos de operación sobre el evento y sus excepciones.
_Evitar_: Auditor, usuario de academia

**Invitación de usuario interno**:
Flujo administrativo para habilitar un usuario de administración, auditoría o juzgamiento.
_Evitar_: Registro público de academia, recuperación de acceso

**Juez**:
Usuario interno asignado a evaluar presentaciones de un evento.
_Evitar_: Administrador, auditor

**Publicación de resultados**:
Acción administrativa única que habilita u oculta los resultados públicos y de academia para un evento.
_Evitar_: Estado del evento, visibilidad del programa

**Documento financiero**:
Registro financiero administrado por un administrador, como factura o nota de crédito.
_Evitar_: Pago, imputación, estado financiero

**Profesor**:
Persona asociada a una academia y cargada por esa academia como parte de sus datos.
_Evitar_: Usuario, administrador

**Inscripción**:
Vínculo con identidad económica entre una coreografía y un bailarín dentro de un evento concreto. Puede estar impaga, señada, pagada o inactiva.
_Evitar_: Participación de academia, cuenta, pago, factura

**Inscripción activa**:
Inscripción que participa en los cálculos vigentes de una coreografía, sus importes pendientes y los descuentos automáticos.
_Evitar_: Inscripción pagada, participación competitiva

**Inscripción inactiva**:
Inscripción que dejó de participar en el cálculo activo de una coreografía, pero se conserva porque tuvo impacto financiero.
_Evitar_: Inscripción eliminada, baja, anulación

**Inactivación de inscripción pagada**:
Caso excepcional pendiente de definición para una inscripción pagada que deja de participar en una coreografía.
_Evitar_: Devolución, anulación, inscripción eliminada

**Coreografía**:
Coreografía registrada por una academia para un evento concreto.
_Evitar_: Obra reutilizable, inscripción, número

**Coreografía sin inscripciones activas**:
Caso excepcional pendiente de definición para una coreografía que conserva historial pero ya no tiene inscripciones activas.
_Evitar_: Coreografía eliminada, coreografía impaga

**Registro de coreografía**:
Flujo del portal de academias para crear una coreografía en el Evento activo dentro del período de inscripción.
_Evitar_: Borrador de coreografía, presentación

**Modificación de coreografía**:
Flujo del portal de academias para cambiar datos permitidos de una Coreografía ya registrada, sin convertir correcciones estructurales excepcionales en edición libre.
_Evitar_: Registro de coreografía, corrección administrativa

**Período de inscripción**:
Ventana temporal del evento durante la cual las academias pueden registrar coreografías desde el portal.
_Evitar_: Estado del evento, active

**Datos bloqueados de coreografía**:
Datos de una coreografía que la academia no puede cambiar cuando las reglas del evento o su estado financiero/competitivo los bloquean.
_Evitar_: Datos operativos pendientes, datos financieros

**Datos operativos pendientes de coreografía**:
Datos de una coreografía que pueden completarse sin cambiar cálculo, cupo ni ubicación competitiva.
_Evitar_: Datos bloqueados, datos financieros

**Archivo de música**:
Archivo de audio privado asociado a una Coreografía y gestionado como dato operativo pendiente.
_Evitar_: Audio de evaluación, devolución, pista pública

**Bailarines de coreografía**:
Bailarines vinculados a una coreografía mediante inscripciones.
_Evitar_: Profesores, datos financieros

**Bailarín**:
Persona cargada por una academia para participar en coreografías.
_Evitar_: Profesor, usuario

**Estado de verificación de bailarín**:
Situación de validación documental de un bailarín.
_Evitar_: Estado operativo de coreografía, estado financiero

**Inconsistencia administrativa**:
Alerta interna de administración para datos que requieren revisión o trazabilidad sin pertenecer al estado operativo, financiero ni competitivo.
_Evitar_: Estado operativo, estado financiero, descalificación

**Estado operativo de coreografía**:
Completitud de datos necesarios para presentar una coreografía.
_Evitar_: Estado financiero, estado del evento

**Estado financiero de coreografía**:
Situación financiera derivada de los estados económicos de las inscripciones activas de una coreografía.
_Evitar_: Estado operativo, estado del evento

**Estado de factura**:
Situación financiera propia de una factura según sus imputaciones y cancelación.
_Evitar_: Estado financiero de coreografía

**Presentación**:
Instancia ordenada de una coreografía para el día del evento.
_Evitar_: Coreografía, estado operativo, estado financiero

**Estado de participación**:
Estado derivado de la presentación de una coreografía en el evento.
_Evitar_: Estado operativo de coreografía, estado financiero de coreografía

**Asignación de juez**:
Relación entre un juez y las presentaciones que debe evaluar.
_Evitar_: Presentación, puntaje

**Ranking**:
Orden competitivo calculado con presentaciones no descalificadas que tengan al menos un puntaje válido.
_Evitar_: Presentación, cronograma, orden de presentación

**Resultados publicados**:
Vista pública de resultados liberada manualmente por administración.
_Evitar_: Ranking preliminar, devolución

**Programa del evento**:
Vista pública del orden cronológico de presentación de un evento.
_Evitar_: Resultados publicados, ranking

**Resultados de academia**:
Vista de resultados disponible con login para la academia dueña de una coreografía cuando administración publica resultados.
_Evitar_: Resultados publicados, ranking preliminar

**Ranking preliminar**:
Vista interna de administración que puede calcularse aunque falten presentaciones por resolver.
_Evitar_: Ranking final, premio

**Premio**:
Reconocimiento derivado del promedio competitivo válido de una presentación dentro de un evento.
_Evitar_: Puntaje, ranking

**Tipo de premio**:
Regla de premio dentro de un evento.
_Evitar_: Premio, ranking

**Puntaje**:
Evaluación asignada a un juez para una presentación.
_Evitar_: Presentación, precio, pago

**Corrección de puntaje**:
Cambio administrativo de un puntaje ya confirmado.
_Evitar_: Puntaje borrador, presentación

**Anulación de puntaje**:
Acción administrativa explícita sobre un puntaje confirmado que lo excluye del promedio competitivo sin eliminar su trazabilidad.
_Evitar_: Corrección de puntaje, eliminación de asignación

**Devolución**:
Archivo de audio opcional asociado a la evaluación o descalificación realizada por un juez.
_Evitar_: Puntaje numérico, presentación

**Pago**:
Ingreso de dinero registrado para una academia en un evento, que puede quedar disponible o aplicarse mediante asignaciones de pago.
_Evitar_: Factura, asignación de pago, estado financiero de coreografía

**Factura de coreografía**:
Documento financiero pendiente de redefinición que podría representar información derivada de pagos, asignaciones e inscripciones.
_Evitar_: Pago, inscripción

**Imputación**:
Concepto financiero retirado del nuevo modelo de pagos e inscripciones.
_Evitar_: Asignación de pago, pago, factura

**Asignación de pago**:
Aplicación de saldo de un pago a una o más inscripciones de una academia en un evento.
_Evitar_: Pago, factura, imputación

**Etapa de inscripción**:
Parte financiera completa de una inscripción que puede recibir una asignación de pago: seña o saldo.
_Evitar_: Cuota, pago parcial, factura

**Cuenta corriente de academia**:
Saldo financiero de una academia en un evento, compuesto por pagos, asignaciones de pago y el saldo disponible derivado.
_Evitar_: Estado financiero de coreografía, pago, saldo operativo

**Saldo disponible**:
Monto de pagos activos de una academia que todavía no fue aplicado mediante asignaciones de pago.
_Evitar_: Saldo adeudado, total pagado

**Saldo adeudado**:
Monto operativo neto pendiente de cobrar o pagar para una academia en el Evento activo, calculado con señas y saldos pendientes de inscripciones activas y descuento del Saldo disponible. Nunca es menor que cero.
_Evitar_: Saldo disponible, total pagado, total estimado

**Seña adeudada**:
Monto operativo bruto de seña pendiente para inscripciones activas impagas. No descuenta el Saldo disponible.
_Evitar_: Factura de coreografía, saldo disponible, saldo adeudado

**Seña de inscripción**:
Monto de seña calculado para una inscripción a partir de su precio congelado.
_Evitar_: Seña de coreografía, factura de seña

**Saldo de inscripción**:
Monto restante de una inscripción después de descontar su seña asignada y sus descuentos aplicables.
_Evitar_: Saldo de coreografía, saldo disponible

**Precio de coreografía**:
Importe derivado para una coreografía a partir de los precios de sus inscripciones activas.
_Evitar_: Pago, estado financiero, precio congelado de inscripción

**Precio tentativo de inscripción**:
Precio orientativo de una inscripción impaga, calculado con las reglas vigentes para mostrar o decidir una asignación futura.
_Evitar_: Precio congelado, factura

**Precio congelado de inscripción**:
Precio fijado para una inscripción cuando recibe una asignación de pago.
_Evitar_: Precio tentativo, factura

**Snapshot financiero de inscripción**:
Datos económicos fijados por una asignación de pago para que el estado financiero de una inscripción no dependa de cambios posteriores de precios o descuentos.
_Evitar_: Factura, precio tentativo

**Fecha de referencia financiera**:
Fecha de negocio usada para resolver el precio tentativo o congelado de una inscripción.
_Evitar_: Fecha UTC

**Fecha límite de pago**:
Fecha hasta la que un precio configurado puede aplicarse a una inscripción.
_Evitar_: Fecha de seña, vencimiento de factura

**Descuento por bailarín**:
Descuento automático aplicado al saldo de una inscripción según las reglas del evento y las inscripciones activas del mismo bailarín.
_Evitar_: Descuento administrativo, descuento manual

**Descuento administrativo**:
Reducción excepcional aplicada por administración cuyo lugar exacto en el modelo financiero está pendiente de definición.
_Evitar_: Descuento individual, precio base

**Modalidad**:
Clasificación artística elegida al registrar una coreografía.
_Evitar_: Categoría, tipo de grupo

**Submodalidad**:
Clasificación opcional dentro de una modalidad. Su nombre debe ser único dentro de esa modalidad, sin distinguir mayúsculas y minúsculas.
_Evitar_: Modalidad, categoría

**Tipo de grupo**:
Clasificación calculada por cantidad de bailarines seleccionados para una coreografía.
_Evitar_: Modalidad, categoría

**Categoría**:
Clasificación calculada por edades medidas contra la fecha de inicio del evento. Su identidad competitiva se define por rango de edad, tipos de grupo y modalidades.
_Evitar_: Modalidad, tipo de grupo

**Nivel de experiencia**:
Clasificación relacionada con una categoría y elegida por la academia cuando corresponde.
_Evitar_: Categoría
