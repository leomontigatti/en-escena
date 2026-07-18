# Finanzas

Doc canónico del modelo financiero basado en `Inscripción` y `Asignación de
pago`. Captura decisiones de dominio; no define esquema de base de datos ni
pantallas. La decisión de arquitectura vive en
[ADR-0009](../adr/0009-inscription-based-finances.md).

## Alcance

- El modelo financiero toma `Inscripción` como unidad económica canónica.
- `Pago` y `Asignación de pago` son la fuente de verdad operativa. No existen
  `Factura de coreografía` ni `Imputación` en el modelo operativo.
- `Imputación` es un concepto retirado.
- Las facturas quedan fuera del alcance operativo actual; si vuelven, deberían
  ser un documento derivado que lee de pagos, asignaciones e inscripciones, y
  nunca gobernar el estado financiero.
- Finanzas no audita cambios (ver "Sin auditoría en finanzas"). Esto acota
  únicamente al dominio financiero; el resto del sistema conserva su auditoría
  hasta el follow-up correspondiente ([auditoria.md](./auditoria.md)).
- Fuera de este alcance: reintegro de dinero, descuento administrativo y ciclo
  de vida completo de coreografías sin inscripciones activas.
- Los montos monetarios persistidos son pesos argentinos enteros en toda la app;
  la UI no muestra centavos. Los porcentajes pueden usar decimales internamente,
  pero los importes se redondean a pesos enteros antes de persistir, con
  redondeo comercial al peso más cercano.
- En V1, `Administrador` puede mutar registros financieros y `Auditor` puede
  leerlos.

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
  físicamente**, sin importar su estado económico. No hay estado "inactiva" ni
  baja lógica.
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
- El estado financiero no se persiste en el registro de la coreografía; se
  deriva de sus inscripciones activas.
- Una coreografía `señada` **no vuelve a `impaga`** cuando el administrador
  cambia el roster. Agregar una inscripción `impaga` a una coreografía ya
  firmada la deja en estado mixto, pero sigue `señada`.
- Una coreografía `señada` solo puede bajar de estado por corrección financiera
  administrativa (por ejemplo, borrar la asignación `deposit` de la única
  inscripción señada), no por cambios de roster.
- El estado de dominio (`impaga`/`señada`/`pagada`) gobierna orden, competencia
  y los importes agregados.
- Solo las coreografías señadas o pagadas cuentan para orden y competencia. Si
  una coreografía pierde su estado señada o pagada por una corrección
  financiera, deja de contar de inmediato para orden y competencia.
- Estar pagada no vuelve presentable a una coreografía operativamente
  incompleta.

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
- No existe columna `has_active_financial_link` ni gate de edición derivado de
  facturas activas; la restricción de edición es por rol.

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

## Sin auditoría en finanzas

- Finanzas **no audita cambios**. No hay entradas de auditoría para pagos,
  asignaciones ni inscripciones, ni para el roster de la coreografía en su
  dimensión financiera. Esto acota solo a finanzas; la auditoría del resto del
  sistema se mantiene hasta el follow-up correspondiente.
- Roles: un único `Administrador` (edita) y un único `Auditor` (solo lectura). El
  Auditor lee datos; en finanzas no hay registro de quién cambió qué.
- Los registros financieros **no** llevan campos de anulación (`annulled*`,
  `cancelled*`) ni de atribución de actor (`createdByUserId`); con un solo
  administrador no distinguen nada.
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
- `Precio de coreografía` es el importe derivado a partir de los precios de sus
  inscripciones activas: la **suma de los precios base por inscripción**. Es
  estimado mientras hay inscripciones sin congelar y final cuando todas están
  congeladas. La forma "precio aplicable × cantidad de inscripciones" es solo un
  caso particular válido **mientras todas las inscripciones comparten el mismo
  precio tentativo uniforme**; apenas una congela un precio distinto (por un
  cambio de fila de precio o por el flujo extraordinario), deja de valer y hay
  que sumar precio por precio.
- Un precio tiene dependencias operativas históricas cuando lo referencia el
  snapshot de una inscripción `señada` o `pagada`. Los precios tentativos no
  bloquean cambiar precios.
- Si falta un precio aplicable para una inscripción que aporta a `Seña adeudada`
  o `Saldo adeudado`, el importe afectado queda pendiente o incompleto, no cero.

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

## Pagos

- Administración puede registrar un pago antes o después de asignarlo.
- Un pago de V1 requiere academia, evento activo, fecha de pago, monto y método
  de pago. El monto debe ser positivo; las correcciones se hacen eliminando el
  pago equivocado, no registrando montos negativos o cero.
- La fecha de pago no puede ser futura.
- Métodos de pago de V1: transferencia, efectivo, mercado_pago y otro.
- Los pagos de V1 tienen un número interno visible, secuencial dentro del
  evento; no es un número fiscal.
- Referencia y nota interna del pago son opcionales en V1. Las notas internas no
  se muestran en el Portal de academias. La subida de comprobantes queda fuera
  de V1.
- Un pago registrado puede quedar como `Saldo disponible` de la academia hasta
  que se asigne a una o más inscripciones.
- Pagos y asignaciones no cruzan academias. Un pago registrado para la academia
  equivocada se elimina y se vuelve a registrar.
- El reintegro de dinero queda fuera de los flujos financieros de V1; los
  excedentes quedan como `Saldo disponible` en el evento activo.

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

### Cobro extraordinario por inscripción

- El cobro extraordinario es **por inscripción individual**, nunca por un
  subconjunto de inscripciones: la granularidad es una sola inscripción por
  acción, aunque varias huérfanas compartan la misma resolución. No existe un
  "cobro por subconjunto homogéneo".
- Cubre la **escalera completa** de una inscripción: `impaga` → `señada`
  (cobrar su seña) y `señada` → `pagada` (cobrar su saldo). El caso mixto
  `pagada` + `impaga` requiere recorrer los dos escalones sobre la huérfana
  (primero señarla, después pagarle el saldo) para llevarla al nivel de sus
  hermanas.
- El cobro de seña por inscripción usa el **flujo extraordinario** de selección
  explícita de fila de precio con piso descrito en "Selección de la fila de
  precio al congelar". Al señar la primera huérfana de una coreografía mixta, su
  precio congelado pasa a integrar el conjunto que define el piso para las
  siguientes huérfanas.
- El cobro individual solo se ofrece en coreografías **mixtas**. En una
  coreografía 100% `impaga`, el primer congelamiento (que fija el piso) es el del
  flujo normal por coreografía entera; la fila individual no ofrece cobro.

### Deshacer una asignación por inscripción (`delete-allocation`)

- Desde la vista financiera de la coreografía se puede **deshacer** una
  asignación de una inscripción como corrección financiera: bajar una etapa
  (`saldo` → devuelve la inscripción a `señada`; `seña` → devuelve a `impaga`)
  **manteniendo la inscripción** en el roster.
- Es una acción distinta de **quitar una inscripción del roster** (ver
  "Inscripciones"): quitar del roster elimina físicamente la inscripción; deshacer
  una asignación no la elimina, solo revierte un cobro por etapa. El monto
  liberado vuelve al `Saldo disponible` de la academia en el evento activo.
- Es una acción destructiva sobre dinero y pide confirmación. Se ejecuta sin
  motivo y sin dejar entrada de auditoría (ver "Sin auditoría en finanzas"). Si se
  deshace la seña de una inscripción que también tiene saldo pago, el orden es
  bajar `saldo` antes que `seña`.
- **Regla "fila uniforme solo deshace":** en una coreografía **uniforme** (todas
  sus inscripciones activas en el mismo estado), la operación por fila de una
  inscripción individual **solo permite deshacer**; el "pagar" sigue viviendo en
  el flujo por coreografía entera, para no degradar el caso común a N acciones
  individuales.

## Seña y saldo

- La seña se calcula por inscripción: un porcentaje de su precio congelado,
  redondeado a pesos enteros. La seña total de una coreografía es la suma de las
  señas de sus inscripciones activas.
- El porcentaje de seña es una configuración de `Bases del evento` a nivel
  evento y por defecto es 30%. Cambiarlo no es retroactivo: cada inscripción
  congela el porcentaje vigente al asignar la seña.
- El saldo se calcula por inscripción. Fórmula base:
  `saldo de inscripción = precio base - seña - descuentos aplicables a esa
inscripción`. El saldo total de una coreografía es la suma de los saldos de sus
  inscripciones activas.

### Importes tentativos y fijos

Los tres importes de una inscripción — precio base, seña y saldo — **siempre
tienen valor y siempre se muestran**. Lo que cambia con el estado es si ese
valor todavía puede moverse. Un importe tentativo no es un importe ausente:
sirve de referencia para administración y para la academia desde el primer día.

Se fijan de forma **escalonada**, no todos juntos:

| Estado   | Precio base | Seña      | Saldo     |
| -------- | ----------- | --------- | --------- |
| `impaga` | tentativo   | tentativo | tentativo |
| `señada` | fijo        | fijo      | tentativo |
| `pagada` | fijo        | fijo      | fijo      |

- Mientras la inscripción está `impaga`, los tres siguen el precio tentativo
  vigente: si cambia la fila de precio aplicable, cambian los tres.
- Pagar la seña congela precio base y seña (ver "Snapshots").
- El saldo de una inscripción `señada` **sigue siendo tentativo**: el `Descuento
por bailarín` recién se congela al asignar el saldo, así que hasta ese momento
  un cambio de roster puede moverlo (ver "Descuentos"). Este es el único estado
  donde los importes de una misma inscripción están mezclados.
- Una inscripción `impaga` no computa para el `Descuento por bailarín`, así que
  su saldo tentativo es la resta simple `precio base − seña`.
- La UI muestra los importes tentativos en texto atenuado, **por celda y no por
  fila**, justamente porque `señada` los mezcla.

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
- El cobro de saldo **por inscripción** (extraordinario) congela el `Descuento
por bailarín` contra el roster `señada`/`pagada` **vigente de ese bailarín al
  momento de pagar ese saldo**. Esto es **asimétrico** respecto de las
  inscripciones hermanas que ya pagaron su saldo antes: cada una congeló con el
  conteo vigente en su propio momento, así que dos inscripciones del mismo
  bailarín pueden terminar con descuentos congelados distintos. Es consecuencia
  intencional del congelamiento secuencial e irreversible, no un error.
- `Descuento administrativo` queda fuera del alcance y pendiente de definición.

## Importes agregados

### Por coreografía

Las tres métricas de una coreografía son **sumatorias directas de sus
inscripciones activas**, tentativas o fijas:

- `Seña` es la suma de las señas de sus inscripciones.
- `Saldo` es la suma de los saldos de sus inscripciones.
- `Pagado` es la suma de las asignaciones de pago de sus inscripciones.

`Pagado` **no tiene por qué coincidir** con `Seña` ni con `Saldo`: coincide con
`Seña` cuando la coreografía está señada y el roster no cambió desde entonces, y
diverge apenas se agrega o se quita una inscripción después de pagar una etapa.
Esa divergencia es información, no un error de cálculo.

### Por academia

**Una coreografía registrada se adeuda completa.** No hay deuda "todavía no
exigible": desde que la inscripción existe, su saldo se debe, aunque su seña no
esté paga. Esto es lo que hace comparables los adeudados con los importes de
referencia de las tablas.

- `Saldo disponible` es el total de pagos activos menos el total de asignaciones
  de pago activas.
- `Seña adeudada` es la suma de las señas de las inscripciones activas
  `impagas`, a precio tentativo vigente.
- `Saldo adeudado` es la suma de los saldos de las inscripciones activas que
  **no están `pagadas`** — es decir, `impagas` y `señadas`.

Tres reglas gobiernan ambas:

- **Se agregan por inscripción, nunca por coreografía.** El estado de una
  coreografía es una marca de agua derivada (ver "Estado financiero de
  coreografía"): agregar sobre él perdería las inscripciones `impagas` que viven
  dentro de una coreografía ya `señada` por un cambio de roster.
- **Son brutas**: ninguna descuenta `Saldo disponible`, que se muestra al lado
  como su propia métrica.
- **No son disjuntas.** Una inscripción `impaga` aporta a las dos: su seña a
  `Seña adeudada` y su saldo a `Saldo adeudado`. No se suman entre sí; son dos
  cortes distintos de la misma deuda, no dos partes de un total.

| Estado   | Aporta su seña a | Aporta su saldo a |
| -------- | ---------------- | ----------------- |
| `impaga` | `Seña adeudada`  | `Saldo adeudado`  |
| `señada` | —                | `Saldo adeudado`  |
| `pagada` | —                | —                 |

Por eso `Saldo adeudado` de una academia **no tiene por qué coincidir** con la
suma de la columna `Saldo` de su tabla de coreografías: esa columna incluye
también las inscripciones ya `pagadas`, que no se adeudan. La diferencia es
exactamente lo ya cobrado.

El Portal de academias y el Panel de administración usan el mismo cálculo, y los
importes primarios de ambos son `Seña adeudada`, `Saldo disponible` y `Saldo
adeudado`. El Portal de academias es de solo lectura en V1: las academias no
inician pagos ni suben comprobantes.

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
  y nunca gobierna el estado financiero.
- De finanzas sobreviven en la UI solo la **lista y el detalle financiero de
  coreografías** y la **lista de pagos**.
- **Datos existentes:** en producción no hay facturas, imputaciones, pagos ni
  asignaciones (finanzas arranca greenfield, sin backfill). Sí hay inscripciones:
  las filas existentes de `choreography_dancer` se preservan y se migran al nuevo
  modelo (id estable + snapshots en `null` → todas `impaga`). Se dropea la columna
  `has_active_financial_link`.
- **Profesores obligatorios** se aplica por validación de creación, sin constraint
  duro retroactivo, para no romper coreografías existentes sin profesor.

## Pendientes explícitos

- Definir si existe reintegro de dinero o algún mecanismo equivalente; por
  ahora, todo monto liberado queda como `Saldo disponible`.
- Definir `Descuento administrativo`.
- Definir el ciclo de vida de una coreografía sin inscripciones activas.
- Rediseñar facturas futuras, si se retoman, como documentos derivados.
