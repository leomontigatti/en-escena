# Pagos e inscripciones

Reglas acordadas para el rediseño del modelo financiero basado en
`Inscripción` y `Asignación de pago`. Este documento captura decisiones de
dominio; no define esquema de base de datos ni pantallas.

## Alcance

- El nuevo modelo financiero toma `Inscripción` como unidad económica canónica.
- `Pago` y `Asignación de pago` reemplazan a `Factura de coreografía` e
  `Imputación` como fuente de verdad operativa.
- Las facturas quedan fuera del alcance operativo actual; si vuelven, deberían
  leer información derivada de pagos, asignaciones e inscripciones.
- `Imputación` es un concepto retirado del nuevo modelo.
- **El sistema no audita cambios** (ver "Sin auditoría"): no hay entradas de
  auditoría ni campos de anulación/atribución en los registros.
- No se definen en este alcance reintegro de dinero, descuento administrativo ni
  ciclo de vida completo de coreografías sin inscripciones activas.

## Inscripciones

- Una `Inscripción` vincula una coreografía con un bailarín, tiene identidad
  económica propia e **identidad estable** (`id` propio, no la clave compuesta
  coreografía+bailarín).
- Estados económicos de una inscripción: `impaga`, `señada` y `pagada`. No
  existe estado `inactiva`.
- El estado económico es **derivado**, no persistido: se infiere de qué
  snapshots están presentes.
  - Sin snapshot de seña: `impaga`.
  - Con snapshot de seña y sin snapshot de saldo: `señada`.
  - Con snapshot de saldo: `pagada`.
- Quitar una inscripción de una coreografía (acción exclusiva del
  administrador; ver "Edición y eliminación de coreografía") la **elimina
  físicamente**, sin importar su estado económico.
  - Sus asignaciones de pago se eliminan.
  - **Todo** el monto que tenía asignado (seña y, si existía, saldo) vuelve al
    `Saldo disponible` de la academia en el evento activo.
- Volver a agregar al mismo bailarín crea una **inscripción nueva** con `id`
  nuevo, que nace `impaga` a precio tentativo vigente.

## Estado financiero de coreografía

- El estado financiero de una coreografía se deriva de sus inscripciones
  activas con una regla de **marca de agua**, no de mínimo:
  - `impaga`: ninguna inscripción activa está `señada` ni `pagada`.
  - `señada`: al menos una inscripción activa está `señada` o `pagada` y no
    todas están `pagada`.
  - `pagada`: todas las inscripciones activas están `pagada`.
- Una coreografía `señada` **no vuelve a `impaga`** cuando el administrador
  cambia el roster. Agregar una inscripción `impaga` a una coreografía ya
  firmada la deja en estado mixto, pero sigue `señada`.
- Una coreografía `señada` solo puede bajar de estado por corrección financiera
  administrativa (por ejemplo, borrar la asignación `deposit` de la única
  inscripción señada), no por cambios de roster.
- El estado de dominio (`impaga`/`señada`/`pagada`) gobierna orden, competencia
  y los importes agregados.

### Display "necesita atención"

- La lista financiera de coreografías del panel de administración muestra un
  status de display **"necesita atención"** cuando las inscripciones activas
  están **mezcladas** (el flujo normal no puede resolverlas en una sola
  acción).
- "Necesita atención" es **solo display, derivado y no persistido**; no es un
  cuarto estado de dominio y no afecta orden, competencia ni agregados. Por
  debajo, una coreografía mixta sigue siendo `señada`.

## Edición y eliminación de coreografía

No hay bloqueo de roster por coreografía, ni enum de estado de roster, ni ciclo
de desbloqueo, ni acciones de solicitud. La restricción es **permanente y por
rol**.

- **Creación (academia):** la creación es **atómica** — la coreografía se
  persiste al confirmar el último paso del diálogo; no hay estado "borrador".
  - Roster inicial y profesores son **obligatorios** en ese diálogo (los
    profesores pasan de opcionales a obligatorios).
  - El resumen del paso final muestra una **alerta** de que hay que verificar los
    datos porque después la academia no podrá modificarlos.
- **Academia, post-creación:** lo único que puede modificar es el **archivo de
  audio**. Nunca edita el roster ni elimina la coreografía. No existen acciones
  de solicitud de cambio o eliminación.
- **Administrador:** es el único que puede modificar cualquier dato de la
  coreografía (incluido el roster: agregar o quitar inscripciones) y
  **eliminarla físicamente**, en cualquier momento.
- Quitar una inscripción (borrado físico + devolución de todo lo asignado al
  `Saldo disponible`, ver "Inscripciones") es, por lo tanto, una acción del
  administrador.
- Se retira la columna muerta `has_active_financial_link` y el gate de edición
  derivado de facturas activas; la restricción de edición pasa a ser por rol.

### Edición de roster desde administración

- La edición de roster ocurre en el **detalle/formulario de coreografía** del
  panel de administración (donde ya vive la eliminación física). No es una
  pantalla nueva.
- Desde ese formulario el administrador desbloquea únicamente **bailarines y
  profesores**; el resto de los campos sigue de solo lectura. La modificación de
  bailarines usa el mismo multi-combobox de alta.
- Cambiar el conjunto de bailarines **re-resuelve** en vivo el **tipo de grupo**
  (por cantidad), la **categoría** (por edades) y el **nivel de experiencia**
  (según la categoría). Esos campos se muestran de solo lectura y su valor se
  actualiza al recalcular; **nivel de experiencia y cronograma se habilitan para
  elección** solo cuando la re-resolución lo exige (categoría que requiere nivel;
  cambio de tipo de grupo que obliga a re-elegir cronograma).
- Si el roster no resuelve a una **categoría compatible**, no se puede guardar.
- Los **profesores** no tienen dimensión financiera ni de resolución: agregarlos
  o quitarlos no cascada en nada más.
- La **consecuencia financiera** de agregar (inscripción `impaga`) o quitar
  (borrado físico + devolución al `Saldo disponible`) **no se resuelve en este
  formulario**: el formulario solo produce el cambio de membresía. El impacto
  (incluido el display "necesita atención") se refleja y se gestiona en las
  **vistas financieras** — lista financiera de la academia y detalle financiero
  de la coreografía. La confirmación de guardado es un **aviso genérico** de que
  la edición puede necesitar atención en el estado financiero, sin montos ni
  selección de precio.
- **Provisional (a revisar):** una coreografía con **presentación asociada** no
  puede editar su roster (bloqueo duro, como el bloqueo de eliminación).
- La edición del **archivo de música** desde administración queda fuera de este
  mapa por ahora; en el formulario se muestra de solo lectura.

## Sin auditoría

- El sistema **no audita cambios**. No hay entradas de auditoría para pagos,
  asignaciones, inscripciones ni coreografías.
- Roles: un único `Administrador` (edita) y un único `Auditor` (solo lectura). El
  Auditor lee datos; no hay registro de quién cambió qué.
- Los registros **no** llevan campos de anulación (`annulled*`, `cancelled*`) ni
  de atribución de actor (`createdByUserId`); con un solo administrador no
  distinguen nada.
- Las acciones destructivas (eliminar un pago, eliminar una coreografía, quitar
  una inscripción, asignación extraordinaria) se ejecutan sin motivo y sin dejar
  entrada de auditoría.

## Precios

- El portal muestra `Precio tentativo de inscripción` mientras la inscripción
  está `impaga`.
- La **asignación de seña es el evento que congela precio**. Una inscripción
  `señada` o `pagada` muestra su precio congelado.
- Para una inscripción agregada a una coreografía ya señada o pagada, el precio
  tentativo puede cambiar mientras siga `impaga`.
- Una inscripción ya congelada es **inmutable**; un cambio de roster no toca su
  precio congelado ni sus snapshots.

### Selección de la fila de precio al congelar

- La fecha de referencia del congelamiento es la `payment.date` del pago
  elegido para la asignación de seña.
- Flujo normal (`Pagar seña` de coreografía completa): la fila de precio se
  **deriva automáticamente** de `payment.date` contra los deadlines de precio
  vigentes. Administración no elige fila; su única palanca es qué pago usa.
- Flujo extraordinario (inscripción que el administrador agrega después):
  administración **elige** explícitamente una fila de precio (vigente o
  histórica permitida), acotada por un **piso**: no puede elegir un precio menor
  que el precio congelado más bajo entre las inscripciones activas ya `señadas`
  o `pagadas` de esa coreografía. `payment.date` se guarda igual como fecha de
  referencia del snapshot.

## Asignaciones de pago

- Una `Asignación de pago` aplica saldo de un pago a una inscripción y una
  etapa. Es **estado actual mutable y eliminable**, no un ledger append-only ni
  una imputación con reversas.
- Las etapas de inscripción son `seña` (`deposit`) y `saldo` (`balance`).
- Cada asignación paga una etapa completa de una inscripción.
- Una misma etapa de una inscripción no puede repartirse entre varios pagos.
- Un mismo pago puede usarse en varias asignaciones, incluso en momentos
  distintos, siempre que tenga `Saldo disponible` suficiente.
- No se puede asignar saldo a una inscripción que no tiene seña.
- No se puede volver a pagar una etapa ya pagada.
- La asignación es **mínima**: guarda el vínculo de plata pago↔inscripción, no
  snapshots de precio. Los snapshots viven en la inscripción.
  - Campos: `paymentId`, `inscriptionId`, `academyId`, `eventId`,
    `allocationType`, `amount`, `createdAt`, `updatedAt`.
  - Unicidad: `(paymentId, inscriptionId, allocationType)`.
  - No guarda atribución de usuario (`createdByUserId`); el sistema no audita.

## Acciones normales y casos extraordinarios

- `Pagar seña` es una acción normal de coreografía completa. Solo aparece si
  todas las inscripciones activas de esa coreografía están `impagas`. Crea una
  asignación de seña para cada inscripción activa.
- `Pagar saldo` es una acción normal de coreografía completa. Solo aparece si
  todas las inscripciones activas están `señadas`. Crea una asignación de saldo
  para cada inscripción activa.
- Cualquier coreografía con estados mixtos ("necesita atención") requiere
  tratamiento extraordinario.
- Cada inscripción no resuelta por el flujo normal se trata como un caso
  extraordinario separado, aunque varias tengan la misma resolución. La
  asignación manual extraordinaria apunta a una sola inscripción y una sola
  etapa completa.

## Seña y saldo

- La seña se calcula por inscripción: un porcentaje de su precio congelado,
  redondeado a pesos enteros. La seña total de una coreografía es la suma de las
  señas de sus inscripciones activas.
- El saldo se calcula por inscripción. Fórmula base:
  `saldo de inscripción = precio congelado - seña asignada - descuentos
aplicables a esa inscripción`. El saldo total de una coreografía es la suma de
  los saldos de sus inscripciones activas.

## Descuentos

- En este alcance, los descuentos aplican solo al saldo, nunca a la seña.
- El único descuento automático dentro de este alcance es el `Descuento por
bailarín`, que se calcula automáticamente y vive por inscripción.
- El `Descuento por bailarín` cuenta solo inscripciones activas `señadas` o
  `pagadas` del mismo bailarín, academia y evento.
- Regla del `Descuento por bailarín`:
  - 1 o 2 inscripciones activas del mismo bailarín en el mismo evento y
    academia: sin descuento.
  - 3 inscripciones activas: 10% de descuento.
  - 4 o más inscripciones activas: 15% de descuento.
- El porcentaje se calcula sobre el precio congelado de cada inscripción con
  descuento y se aplica al saldo.
- En los casos con descuento, una inscripción activa del bailarín queda sin
  descuento: la última al ordenar las inscripciones activas por precio base y
  fecha de inscripción (normalmente la más cara; si empatan en precio, la más
  reciente).
- Mientras una inscripción está `señada`, el descuento por bailarín usado para
  importes pendientes se **estima dinámicamente**.
- Cuando se asigna el saldo, el descuento por bailarín aplicado queda
  **congelado** en la inscripción (monto y porcentaje).
- El congelamiento es **secuencial e irreversible**: cada asignación de saldo
  congela con la mejor estimación al momento y no se re-liquida hacia atrás. La
  "foto ideal" del descuento del bailarín solo se garantiza si se paga el saldo
  de la coreografía completa en una sola acción (`Pagar saldo`).
- `Descuento administrativo` queda fuera del alcance y pendiente de definición.

## Importes agregados

- `Saldo disponible` es el total de pagos activos menos el total de asignaciones
  de pago activas.
- `Seña adeudada` es la suma de señas pendientes de inscripciones activas
  `impagas`, usando precio tentativo vigente. No descuenta `Saldo disponible`.
- `Saldo adeudado` suma señas pendientes de inscripciones activas `impagas` y
  saldos pendientes de inscripciones activas `señadas`, descuenta `Saldo
disponible` y nunca baja de cero.
- Las inscripciones `pagadas` no aportan a `Saldo adeudado`.

## Snapshots

Los snapshots viven en la **Inscripción**, no en la asignación. La asignación
mínima aporta la trazabilidad del pago.

- Snapshot de seña (se fija al crear la asignación `deposit`; se limpia si esa
  asignación se borra, devolviendo la inscripción a `impaga`):
  - `frozenBasePriceAmount` — precio base congelado.
  - `selectedPriceId` — fila de precio usada, para dependencias históricas.
  - `depositReferenceDate` — la `payment.date` usada.
  - `depositPercentage` — porcentaje de seña vigente al congelar.
  - `depositAmount` — seña = redondeo(`frozenBasePriceAmount` × `depositPercentage`).
- Snapshot de saldo (se fija al crear la asignación `balance`; se limpia si esa
  asignación se borra, devolviendo la inscripción a `señada`):
  - `balanceReferenceDate` — `payment.date` del pago de saldo.
  - `appliedDancerDiscountPercentage` — descuento por bailarín congelado.
  - `appliedDancerDiscountAmount` — monto de descuento por bailarín congelado.
  - `finalTotalAmount` — total final congelado de la inscripción.
  - `balanceAmount` — = `finalTotalAmount − depositAmount`.
  - `balanceCompletedAt` — = `payment.date` del pago de saldo.

## Transición desde facturas e imputaciones

- **Remoción completa** del módulo de facturas/imputaciones en V1: se eliminan las
  tablas `academy_event_choreography_invoice` y `academy_event_invoice_imputation`,
  su código server y su UI. `Pago` + `Asignación` son la única fuente de verdad
  operativa.
- Facturación futura (documento opcional a monto que el administrador decida, no
  atado a seña/saldo/total ni al estado operativo) **no se construye en V1**; si
  se retoma, es un documento **derivado** que lee de pagos/asignaciones/inscripciones
  y nunca driven el estado financiero.
- De finanzas sobreviven en la UI solo la **lista y el detalle financiero de
  coreografías** y la **lista de pagos**.
- **Datos existentes:** en producción no hay facturas, imputaciones, pagos ni
  asignaciones (finanzas arranca greenfield, sin backfill). Sí hay inscripciones:
  las filas existentes de `choreography_dancer` se preservan y se migran al nuevo
  modelo (id estable + snapshots en `null` → todas `impaga`). Se dropea la columna
  `has_active_financial_link`.
- **Profesores obligatorios** se aplica por validación de creación, sin constraint
  duro retroactivo, para no romper coreografías existentes sin profesor.
- **Docs:** `finanzas.md` pasa a ser el único doc canónico del modelo nuevo
  (se pliega este documento adentro y se retira). ADR-0009 se reescribe en el
  lugar como el ADR del modelo basado en inscripciones (rediseño desde cero, sin
  lápida "superseded"). `CONTEXT.md` se actualiza; `auditoria.md` queda retirado.
- La mecánica exacta de migraciones (orden de columnas/tablas, SQL) la detalla
  el plan de migración (#278).

## Pendientes explícitos

- Definir si existe reintegro de dinero o algún mecanismo equivalente; por
  ahora, todo monto liberado queda como `Saldo disponible`.
- Definir `Descuento administrativo`.
- Definir el ciclo de vida de una coreografía sin inscripciones activas.
- Rediseñar facturas futuras, si se retoman, como documentos derivados.
