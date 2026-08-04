# ARCA / WSFEv1 — validaciones sobre `CbteFch`

Investigación sobre si WSFEv1 exige que la fecha de un comprobante sea mayor o igual
a la del último autorizado en la misma serie (PtoVta + CbteTipo), y sobre las ventanas
de fecha por Concepto y por tipo de comprobante.

## Fuentes

| # | Fuente | Tipo |
|---|--------|------|
| F1 | **ARCA — «Manual para el desarrollador» WSFEv1 (RECE), v4.0** — <https://www.afip.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG-v4-0.pdf> (121 pp., descargado 2026-08-04) | Primaria |
| F2 | RG (AFIP) 1415/2003, texto y Anexo II — <https://servicios.infoleg.gob.ar/infolegInternet/anexos/80000-84999/81316/texact.htm>, <https://archivo.consejo.org.ar/Bib_elect/junio04_CT/documentos/rafip1415anexoII.htm> | Primaria |
| F3 | RG (AFIP) 4540/2019, texto original — <https://www.argentina.gob.ar/normativa/nacional/norma-326036/texto> | Primaria |
| F4 | Repo `en-escena`: spike de homologación, ADR-0011/0012, docs de research previas, código de `app/lib/comprobantes/` | Evidencia local |

Todas las citas de F1 son textuales del PDF v4.0; se indica la página.

---

## Resumen ejecutivo

| # | Pregunta | Respuesta | Confianza |
|---|----------|-----------|-----------|
| 1 | ¿Monotonía cronológica de `CbteFch` dentro de la serie? | **Sí. Código 10016, validación EXCLUYENTE (rechaza).** | **Alta** (texto literal de F1) |
| 2 | Ventana ±10 (Concepto 2/3) y ±5 (Concepto 1) | **Confirmado**, medido contra la fecha de envío del pedido de autorización. Código 10016. Concepto 1 además no puede exceder el mes de presentación (10152). | **Alta** |
| 3 | ¿Difiere para NC C (13) / ND C (12) vs. Factura C (11)? | **No.** 10016 no distingue por `CbteTipo`. La `CbteFch` de la NC/ND **no** se valida contra la del asociado (salvo FCE MiPyME); se valida contra hoy y contra el último de su propia serie. | **Alta** para el texto; **Media** para la ausencia de reglas no documentadas |
| 4 | ¿Alguna RG obliga a fechar la NC/ND con la fecha del hecho? | **No.** RG 1415 exige «Fecha de emisión»; RG 4540 art. 3 da **15 días corridos desde el hecho para emitirla**. La fecha correcta es la de emisión. | **Alta** |
| 5 | ¿Emitir N con fecha de hoy impide para siempre emitir N+1 con fecha de hace 3 días? | **Sí**, en esa serie. | **Alta** (deducción directa de 10016) |

---

## 1. Monotonía cronológica dentro de la serie — código 10016

**Confianza: ALTA — verificado en fuente primaria.**

F1, p. 41, sección «Controles aplicados al objeto `<FeDetReq>` → **Validaciones
Excluyentes**», fila del código **10016**, campo `<CbteDesde>` / `<CbteFch>`:

> El campo `<CbteFch>` podrá ser:
>
> - Nulo o comprendido en el rango N-5 y N+5 siendo N la fecha de envío del pedido de
>   autorización, para Concepto= 01 Productos. La misma no podrá exceder el mes de
>   presentación.
>
> - Para Concepto 02, 03 el campo CbteFch puede ser nulo o comprendido en el rango N-10
>   y N+10 siendo N la fecha de envío del pedido de autorización.
>
> - **Deberá ser mayor o igual al del ultimo comprobante emitido para ese tipo y punto
>   de venta**
>
> - Para comprobantes MiPyMEs (FCE) estar comprendido en el rango N-5 y N+1 siendo N la
>   fecha de envío del pedido de autorización. De tratarse de notas de débito o crédito,
>   la fecha del comprobante puede ser hasta N-5.

(sic, incluyendo «ultimo» sin tilde en el original.)

La misma fila 10016 contiene, unos renglones antes, la regla de correlatividad numérica:

> El número de comprobante informado `<CbteDesde>` debe ser mayor en 1 al último
> informado para igual punto de venta y tipo de comprobante. Consultar método
> FECompUltimoAutorizado

Es decir: **10016 es un único código que cubre correlatividad numérica y correlatividad
de fecha**. El repo lo tenía registrado sólo en su mitad numérica (ver §6).

### Excluyente vs. no excluyente

**EXCLUYENTE — rechaza, no observa.** Confianza: ALTA.

- F1 p. 12: «las validaciones excluyentes son aquellas que en el caso de no ser superadas
  provocan un rechazo y las validaciones no excluyentes aprueban la solicitud pero con
  observaciones».
- El bloque «Controles aplicados al objeto `<FeDetReq>` — Validaciones Excluyentes»
  empieza en F1 p. 38 y el bloque «Validaciones No Excluyentes» empieza en F1 p. 69.
  10016 está en p. 41, dentro de las excluyentes.
- La grilla de no excluyentes (F1 pp. 69-72) contiene 10017, 10041, 10063, 10188, 10209,
  10217, 10234, 10235, 10236, 10237, 10238, 10245 — **ninguna sobre `CbteFch`**.

Consecuencia práctica: el comprobante **no obtiene CAE**. `Resultado = "R"`, sin CAE, con
el motivo en `Obs`/`Errors`.

### Corroboración independiente dentro del mismo manual

F1 p. 72, sección «Operatoria ante errores» de `FECAESolicitar` (y su gemela en la
sección de CAEA):

> Rechazo parcial: se da cuando alguno de los comprobantes incluidos en el request es
> rechazado. […] se aprueban los comprobantes del 51 al 100, 101 saldrá rechazado y del
> 102 al 150 saldrá como no procesado; esto se debe a que **como debe existir
> correlatividad numérica y fecha**, ante una inconsistencia los comprobantes
> subsiguientes también se rechazaran.

Esto confirma que ARCA trata número y fecha como dos ejes de correlatividad de la serie.

### Mensaje de error

El mensaje que ARCA devuelve para 10016 es, según el fixture del repo y el uso corriente
en la comunidad:

> `El numero o fecha del comprobante no se corresponde con el proximo a autorizar`

**Confianza: MEDIA.** El manual publica el código y la descripción de la validación, no la
cadena `Msg`. El texto anterior está tomado de
`app/lib/comprobantes/arca/fixtures.ts:90-104` (fixture escrito a mano, no observado
contra ARCA). La redacción «numero **o fecha**» es en sí misma consistente con que 10016
cubra ambos ejes.

---

## 2. Ventanas de fecha por Concepto

**Confianza: ALTA — verificado en fuente primaria. Concepto 1 = ±5 días, confirmado.**

### Fecha de referencia

**No es «hoy» del emisor: es la fecha de envío del pedido de autorización** (la fecha de
proceso de ARCA). F1 p. 41 la llama literalmente «la fecha de envío del pedido de
autorización»; la tabla de campos (F1 p. 26) la llama «la fecha de generación». Son la
misma cosa desde la perspectiva del servicio. Relevante por zona horaria: cerca de
medianoche, el «hoy» del emisor y el «hoy» de ARCA pueden diferir.

### Tabla de campos de `FECAEDetRequest` (F1 p. 26)

> `CbteFch` — String (8) — Fecha del comprobante (yyyymmdd). Para concepto igual a 1, la
> fecha de emisión del comprobante puede ser hasta **5 días anteriores o posteriores**
> respecto de la fecha de generación: La misma no podrá exceder el mes de presentación.
> Si se indica **Concepto igual a 2 ó 3** puede ser hasta **10 días anteriores o
> posteriores** a la fecha de generación. **Si no se envía la fecha del comprobante se
> asignará la fecha de proceso.**
>
> Para comprobantes del tipo MiPyMEs (FCE) del tipo Factura, la fecha de emisión del
> comprobante debe ser desde 5 días anteriores y hasta 1 día posterior respecto de la
> fecha de generación. Para notas de débito y crédito es hasta 5 dias anteriores y tiene
> que ser posterior o igual a la fecha del comprobante asociado.

Resumen:

| Concepto | Ventana | Código |
|---|---|---|
| 1 — Productos | N−5 … N+5, y sin exceder el mes de presentación | 10016 (excluyente) |
| 2 — Servicios | N−10 … N+10 | 10016 (excluyente) |
| 3 — Productos y Servicios | N−10 … N+10 | 10016 (excluyente) |
| FCE MiPyME, Factura | N−5 … N+1 | 10016 (excluyente) |
| FCE MiPyME, NC/ND | hasta N−5, y ≥ fecha del asociado | 10016 / 10159 |

`CbteFch` es **opcional** (`Obligatorio = N`); si se omite, ARCA asigna la fecha de proceso.

### Regla adicional del mes de presentación — código 10152

F1 p. 60, excluyente:

> Si informa fecha de comprobante `<CbteFch>` para el Concepto del tipo "01 – Productos"
> con fecha superior a la fecha de envío de autorización, el mes de la fecha del
> comprobante `<CbteFch>` debe coincidir con el mes de la fecha de envío de autorización.

Es decir: la restricción «no podrá exceder el mes de presentación» sólo muerde hacia
adelante (fechas futuras) y sólo para Concepto 1. Un `CbteFch` **anterior** de mes
distinto no cae en 10152 — sólo debe respetar N−5 y la monotonía de 10016.

**Inferencia (confianza MEDIA):** el manual no impone la regla del mes para Concepto 2/3,
de modo que una factura de servicios con `CbteFch = N+10` puede caer en el mes siguiente.
No está verificado empíricamente.

### CAEA (contingencia) — códigos 1440-1445

F1 p. 90 replica las mismas ventanas pero medidas contra `CbteFchHsGen` (fecha/hora de
generación en contingencia) en lugar de contra la fecha de envío. Código **1445**,
excluyente. Adicionalmente 781 («la fecha de alta del punto de venta deberá ser menor o
igual a la fecha del comprobante») y 783 (formato `yyyymmdd`).

---

## 3. ¿Difieren las reglas para NC C (13) y ND C (12) vs. Factura C (11)?

**Confianza: ALTA para lo que el manual dice; MEDIA para la afirmación negativa.**

### 3.1 La ventana y la monotonía no distinguen por `CbteTipo`

La validación 10016 está redactada en términos de `<CbteFch>` y `<Concepto>`, y sus únicas
excepciones explícitas por tipo son las de **FCE MiPyME** (201, 202, 203, 206, 207, 208,
211, 212, 213). Los tipos 11, 12 y 13 (Factura C, ND C, NC C) no reciben tratamiento
diferenciado en ninguna parte de la grilla.

Por lo tanto:

- La NC C y la ND C tienen **cada una su propia serie correlativa** por (PtoVta,
  CbteTipo) y su propia cadena de fechas monótona. La NC C no consume números ni fechas de
  la serie de Factura C.
- La ventana ±5 / ±10 se aplica igual a la NC/ND según su `Concepto`.

### 3.2 La `CbteFch` de la NC/ND **no** se valida contra la del asociado

Salvo FCE MiPyME, **no existe** una validación del tipo «la NC debe ser posterior o igual
a la factura que ajusta». Lo único que hay, y va en la dirección contraria, es el código
**10210** (F1 p. 66, **excluyente**):

> Si el comprobante asociado se autorizó de forma electrónica y **tiene una fecha de
> emisión posterior a la fecha de emisión del comprobante por el cual se está solicitando
> la autorización**, ambos deberán ser del mismo mes/año.

Léase: si la NC es **anterior** a la factura que ajusta, ARCA lo tolera siempre que ambas
caigan en el mismo mes/año. No hay tope superior respecto del asociado: una NC puede
llevar `CbteFch` arbitrariamente posterior a la factura asociada. **El límite de la NC es
contra hoy (N±5 / N±10), no contra la factura.**

Otras validaciones sobre `<CbtesAsoc><CbteFch>` (todas excluyentes, F1 p. 66):

| Código | Regla |
|---|---|
| 10211 | Informar la fecha de emisión del asociado es **obligatorio** si el PtoVta del asociado es Controlador Fiscal o FactuWeb y el tipo asociado es Factura, Recibo, ND o NC |
| 10212 | Si el PtoVta del asociado es Controlador Fiscal o FactuWeb, esa fecha **no puede ser posterior al día de hoy** |
| 10213 | Si se informa, formato `yyyymmdd` |

Y las de FCE MiPyME, que **sí** atan NC/ND al asociado (F1 pp. 61-62, excluyentes):

| Código | Regla |
|---|---|
| 10158 | FCE ND/NC: es obligatorio informar la fecha del comprobante asociado |
| 10159 | FCE ND/NC: la fecha del asociado tiene que ser **igual o menor** a la del comprobante que se está autorizando |
| 10160 | FCE ND/NC: el asociado debe existir autorizado con la misma fecha informada |

Nada de esto alcanza a los tipos 11/12/13 no-FCE.

### 3.3 Sobre el asociado, como observación (no excluyente)

Código **10041** (F1 p. 69, **no excluyente**): si el PtoVta del asociado es electrónico,
el número debe obrar en las bases del organismo. Es observación: el comprobante se
autoriza igual, con `Obs`.

Código **10237** (no excluyente): «El importe de la nota de crédito supera el monto del
comprobante asociado que estás ajustando.» También observación.

### 3.4 Advertencia sobre la afirmación negativa

**Confianza MEDIA** en «no hay ninguna otra regla». El manual es la especificación
publicada, pero WSFEv1 históricamente aplica controles no documentados (padrón, regímenes
particulares). La única forma de cerrar esto es homologación — y el repo **no lo hizo**
(ver §6).

---

## 4. ¿Exige alguna RG que la NC/ND lleve la fecha del hecho ajustado?

**Confianza: ALTA — verificado en fuente primaria. La respuesta es NO: va la fecha de
emisión.**

### RG 1415/2003

- **Anexo II, Apartado A** (datos que deben contener los comprobantes) exige, inciso d),
  literalmente «**Fecha de emisión**». No existe campo ni requisito de «fecha del hecho
  ajustado».
- **Artículo 13** (Capítulo C — «Momento de emisión y entrega del comprobante»):

  > La factura y los demás comprobantes, previstos en el artículo 8°, inciso a), deberán
  > encontrarse emitidos al momento en que se perfeccione la operación económica, y serán
  > entregados dentro de los DIEZ (10) días corridos contados a partir de la fecha de
  > emisión.

  La regla es «emitir cuando ocurre», no «fechar hacia atrás cuando ocurrió». El
  incumplimiento es de oportunidad de emisión, no de fecha consignada.

### RG 4540/2019

Regula las condiciones de emisión de NC/ND. **Artículo 3°, último párrafo**:

> Las respectivas notas de crédito y/o débito deberán emitirse dentro de los QUINCE (15)
> días corridos desde que surja el hecho o situación que requiera su documentación
> mediante los citados comprobantes.

Esto es decisivo: la norma da un **plazo para emitir contado desde el hecho**, lo que sólo
tiene sentido si la fecha del comprobante es la de emisión (si la NC llevara la fecha del
hecho, el plazo sería trivialmente inobservable e inverificable).

El resto del art. 3° exige identificar el comprobante ajustado o el período que ajusta, y
el **art. 4°** ordena que, hasta que los sistemas prevean campos específicos, «el período
que se ajusta» se consigne «en la cabecera del documento de ajuste o en algún lugar
destinado a leyendas o datos adicionales de libre ingreso».

**Conclusión.** El hecho económico se documenta por **referencia** (`CbtesAsoc`,
`PeriodoAsoc`, o una leyenda), no por retrofechado. La `CbteFch` de la NC/ND es y debe ser
la fecha de emisión.

**Corolario de diseño (inferencia, confianza ALTA):** un sistema que necesita saber
*cuándo ocurrió el ajuste* debe guardar esa fecha en su propio dominio, separada de
`cbteFch`. Fechar el comprobante «el día del descuento» es a la vez innecesario
legalmente e imposible técnicamente cuando ese día quedó fuera de la ventana o antes del
último comprobante de la serie.

---

## 5. Consecuencia práctica: ¿queda bloqueado N+1 con fecha anterior?

**Sí. Confianza: ALTA como deducción del texto de 10016; NO verificado empíricamente.**

Dado (PtoVta=1, CbteTipo=11) con último autorizado N con `CbteFch = 20260804`:

- Emitir N+1 con `CbteFch = 20260801` → viola «Deberá ser mayor o igual al del ultimo
  comprobante emitido para ese tipo y punto de venta» → **rechazo 10016, sin CAE**.
- El bloqueo es **permanente e irreversible**: la serie sólo avanza, y el «último
  autorizado» nunca retrocede. No hay forma de intercalar. Ni siquiera anular con NC
  restablece la posibilidad, porque la NC vive en su propia serie (13) y no toca el
  máximo de la serie 11.
- El *piso* de fecha de una serie es, entonces, `max(fecha del último autorizado, hoy−5 o
  hoy−10)`. Cuanto más adelante se fecha un comprobante, más se sube el piso para todos
  los siguientes de esa serie.

**Riesgo operativo derivado (inferencia):** emitir un comprobante con `CbteFch` futuro
(N+5/N+10) es un compromiso irreversible — durante los días siguientes, ninguna emisión de
esa serie podrá llevar fecha real. Fechar siempre «hoy» es la política segura.

Excepción teórica: si `CbteFch` se omite, ARCA asigna la fecha de proceso, que siempre es
≥ la de cualquier comprobante anterior fechado en el pasado. Omitir el campo nunca
dispara la mitad-fecha de 10016 (sí puede dispararla si un comprobante previo fue fechado
en el futuro).

---

## 6. Evidencia local del repo

**Lo relevante: el repo no tiene ninguna evidencia empírica sobre `CbteFch`.**

### Lo que el spike de homologación sí estableció

`scripts/arca-spike-homo.ts` emite **una** Factura C por corrida, siempre con
`CbteFch: today()`. Corridas registradas: 2026-07-22 (PtoVta 1, Nro 1, CAE
86290639416950, `cbteFch "20260722"`) y 2026-07-30 (Nro 4, CAE 86310699304854). En ambas,
ARCA devolvió la misma fecha enviada, y `FECompConsultar` la devolvió sin alterar.

Empírico, entonces: **para una fecha del mismo día, ARCA no normaliza ni sobrescribe
`CbteFch`**. Nada más.

### Lo que NO se probó

- Ninguna corrida usó una fecha distinta de hoy — ni pasada, ni futura, ni fuera de
  ventana.
- **Nunca se emitió un comprobante retrofechado después de uno con fecha posterior en la
  misma serie.** La mitad-fecha de 10016 no tiene confirmación empírica en este repo.
- Ninguna NC/ND se emitió contra homologación.

### Lo que el repo asume sin verificar

- `docs/research/arca-nota-credito-posterior.md` (rama `research/arca-nota-credito-posterior`,
  no mergeada; `git show 6ab0610:docs/research/arca-nota-credito-posterior.md`) es el único
  lugar del repo que registra la mitad-fecha de 10016, y lo hace correctamente, derivado
  del manual. También concluye ya que «la restricción de fecha de la NC es contra hoy, no
  contra la factura».
- `docs/research/arca-wsfev1-factura-c.md` (rama `research/arca-wsfev1`, no mergeada)
  describe 10016 **omitiendo la mitad-fecha**.
- `app/lib/comprobantes/arca/responses.ts:79` — el único 10016 del código de producción,
  comentado como «validación 10016: último + 1»: **sólo la mitad numérica**.
- `app/lib/comprobantes/arca/factura-c.ts` valida `CbteFch` **sólo por formato**
  (`/^\d{8}$/`). No hay chequeo de ventana ni de orden. No hay ningún esquema zod sobre
  `cbteFch`. `app/db/schema/comprobantes.ts:67` lo guarda como `text` sin constraint.
- `emit-factura-c.server.ts:119` y `emit-nota-credito.server.ts:89` usan
  `deps.cbteFch ?? toArcaDate(getBusinessDateOnly())`, y `deps.cbteFch` sólo lo inyectan
  los tests. **Producción siempre emite con la fecha de hoy en Córdoba.**
- Los tests que ejercitan 10016 (`responses.test.ts:47`,
  `emit-factura-c.server.db.test.ts:329`, `emit-nota-credito.server.db.test.ts:474`)
  corren contra un fixture escrito a mano; establecen el comportamiento de la app ante un
  rechazo simulado, no cuándo ARCA rechaza.
- ADR-0011 afirma que Concepto 2 «amplía la tolerancia de `CbteFch` de N±5 a N±10 días» —
  correcto según el manual, no verificado.

### Lectura de riesgo

Que producción emita siempre con la fecha de hoy es lo que hoy hace **inalcanzable** el
rechazo por 10016-fecha, y también lo que explica que nadie lo haya enforced. La
mitad-fecha de 10016 se vuelve relevante en el momento en que se introduzca cualquier
`cbteFch` elegido por el usuario, un reintento diferido que cruce la medianoche, o una
emisión retroactiva.

---

## Apéndice — códigos citados

| Código | Excl. | Campo | Regla |
|---|---|---|---|
| 10016 | Sí | `<CbteDesde>` / `<CbteFch>` | Correlativo = último+1; `CbteFch` en ventana por Concepto **y ≥ la del último de la serie** |
| 10152 | Sí | `<CbteFch>`/`<Concepto>` | Concepto 1 con fecha futura: mismo mes que la fecha de envío |
| 10158-10160 | Sí | FCE `<CbtesAsoc><CbteFch>` | Sólo FCE MiPyME: fecha del asociado obligatoria, ≤ la del comprobante, y coincidente con la registrada |
| 10164 | Sí | `<FchVtoPago>`/`<CbteFch>` | Sólo FCE: `FchVtoPago` ≥ `CbteFch` o ≥ hoy, la posterior |
| 10206-10208 | Sí | `<PeriodoAsoc>` | Fechas > 01/01/2006; `FchHasta` ≥ `FchDesde`; `FchHasta` ≤ fecha de emisión |
| 10210 | Sí | `<CbteFch>`/`<CbtesAsoc><CbteFch>` | Si el asociado es posterior, ambos del mismo mes/año |
| 10211-10213 | Sí | `<CbtesAsoc><CbteFch>` | Obligatoria y ≤ hoy para PtoVta de Controlador Fiscal / FactuWeb; formato `yyyymmdd` |
| 10041 | **No** | `<CbteAsoc>` | El asociado electrónico debe existir en las bases (observación) |
| 10237 | **No** | `ImpTotal`/`<CbteAsoc>` | El importe de la NC supera el del asociado (observación) |
| 781 / 783 / 1445 | Sí | CAEA | Alta del PtoVta ≤ `CbteFch`; formato; ventanas ±5/±10 contra `CbteFchHsGen` |

Códigos 10042, 10043, 10064, 10070, 10072 no aparecen relacionados con `CbteFch` en F1.
