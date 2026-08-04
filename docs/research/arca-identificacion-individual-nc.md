# Identificación individual bajo anclaje en estrella — ¿alcanza `CbtesAsoc` con la factura?

Investigación de la pregunta del issue [#610](https://github.com/leomontigatti/en-escena/issues/610):
el mapa #547 / ticket #599 decidió que **todo documento de ajuste ancla en la FACTURA**. La ND
apunta a la FC; la NC apunta a la FC **incluso cuando acredita un importe que originalmente
documentó una ND asociada a esa factura**. `CbtesAsoc` lleva siempre exactamente la factura,
nunca la ND. La profundidad de la cadena es permanentemente 1 — una **estrella**, no una cadena.

La pregunta es si esa estrella satisface el deber de **identificación individual** del
art. 3°, segundo párrafo, de la RG 4540/2019.

## Fuentes

| # | Fuente | Tipo |
|---|--------|------|
| F1 | **RG (AFIP) 4540/2019 — «Emisión de notas de crédito y/o débito. Condiciones»**, texto original completo — <https://www.argentina.gob.ar/normativa/nacional/norma-326036/texto> (arts. 1° a 7° leídos íntegros). Texto actualizado cotejado en <https://www.argentina.gob.ar/normativa/nacional/resoluci%C3%B3n-4540-2019-326036/actualizacion> y en la Biblioteca Electrónica de ARCA: **arts. 2°, 3° y 4° no fueron modificados** (sólo el art. 6°, por RG 4701/2020). | Primaria |
| F2 | **RG (AFIP) 1415/2003**, texto con todas sus versiones — <https://biblioteca.afip.gob.ar/dcp/REAG01001415_2003_01_07> (arts. 3°, 8°, 9°, 10, 11, 13, 18, 19 leídos) | Primaria |
| F3 | **RG 1415/2003, Anexo II, Apartado A** (texto original 2003) — <https://archivo.consejo.org.ar/Bib_elect/junio04_CT/documentos/rafip1415anexoII.htm> | Primaria (espejo) |
| F4 | **ARCA — «Manual para el desarrollador» WSFEv1, v4.0** — <https://www.afip.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG-v4-0.pdf> (descargado 2026-08-04). Citas textuales con página. | Primaria |
| F5 | Research previa del repo: `docs/research/arca-nota-credito-posterior.md` (rama `research/arca-nota-credito-posterior`) y `docs/research/arca-cbtefch-validaciones.md` (rama `research/arca-cbtefch-validaciones`) | Evidencia local |
| F6 | Documentación de terceros (TusFacturasAPP, Finnegans, foro `pyafipws`) | **Secundaria** — se usa sólo como corroboración de práctica, nunca como fundamento |

No es asesoramiento contable ni legal.

---

## Resumen ejecutivo

| # | Pregunta | Respuesta | Confianza |
|---|----------|-----------|-----------|
| 1 | ¿RG 4540 art. 3° 2° párr. permite identificar la FACTURA cuando el importe acreditado lo documentó una ND asociada? | **Sí.** El artículo manda identificar «la factura o documento equivalente que ajusta»; **nunca nombra a la nota de débito como objeto ajustable**. El universo de destinos que la RG contempla es el de los comprobantes de la *operación originaria*. | **Alta** para el texto; **media-alta** para la conclusión |
| 2 | ¿Hay norma que exija identificar el documento *más cercano* al importe? | **No se encontró ninguna.** Ni en RG 4540 (texto íntegro leído) ni en RG 1415 (arts. 3, 8, 9, 10, 11, 13, 18, 19, Anexo II A). | **Media-alta** (argumento por ausencia) |
| 3 | ¿La leyenda del art. 4° puede cargar el detalle que la estrella omite y cierra la cuestión? | **Puede cargarlo; no cierra la cuestión por sí sola.** El art. 4° remite **expresamente al *primer* párrafo** del art. 3° (período y documentos comerciales no fiscales), no al segundo. Es una mitigación válida, no la habilitación. | **Alta** (lectura literal) |
| 4 | ¿WSFEv1 impone algo más allá de 10237 y 10210? | Sí, pero **nada que impida la estrella**: 10197 (excluyente, asociado o período obligatorio), 10040 (tipos asociables), 10060, 10041/801, 10211-10213. **`CbtesAsoc` es un array multi-entrada** y **10040 admite explícitamente asociar una ND C (12) a una NC C (13)**: ARCA soporta técnicamente ambas formas. | **Alta** |
| 5 | ¿La estrella es defendible? | **Sí, es defendible**, con un riesgo residual concreto y acotado (observación 10237) y una mitigación barata (leyenda). No hace falta caer a NC por padre ni a `CbtesAsoc` multi-entrada. | **Media-alta** |

**Corrección al título del issue.** El issue pregunta si «`CbtesAsoc` en la factura satisface
**RG 1415 art. 3**». El art. 3° de la RG 1415 **no trata de esto**: regula quiénes están
obligados a utilizar el equipamiento «Controlador Fiscal» (F2, verificado en el texto). El deber
de identificación individual vive **únicamente** en el art. 3°, segundo párrafo, de la
**RG 4540/2019**. La RG 1415 aporta el contenido mínimo del comprobante (art. 18 → Anexo II,
Apartado A) y el estatuto de la NC/ND como comprobante que respalda la operación (art. 8° inc. a)
punto 5).

---

## 1. Qué dice exactamente la RG 4540/2019

Texto verificado en F1, íntegro y sin abreviar en las partes relevantes.

### Art. 2° — el universo de destinos

> **ARTÍCULO 2°.-** Sólo los sujetos que emitieron los comprobantes por **las operaciones
> originarias** podrán emitir las notas de crédito y/o débito en concepto de descuentos,
> bonificaciones, quitas, devoluciones, rescisiones, intereses, etc., **siempre que se encuentren
> relacionadas a una o más facturas o documentos equivalentes emitidos previamente**.
>
> Cuando los descuentos y/o bonificaciones estén acordados y sean determinables al momento de la
> emisión de una factura o documento equivalente, y éstos sean relacionados de manera directa con
> ese comprobante, dichos conceptos deberán ser aplicados en el documento original que respalda la
> operación.

### Art. 3° — vinculación e identificación individual

> **ARTÍCULO 3°.-** Las notas de crédito y/o débito deberán cumplir con los requisitos y las
> formalidades exigidos para los comprobantes emitidos por las operaciones originarias. Asimismo
> serán emitidas únicamente al mismo receptor de los comprobantes originales **para modificar las
> facturas o documentos equivalentes generados con anterioridad**, consignándose el número de las
> facturas o documentos equivalentes asociados **o el período al cual ajustan**, referenciando los
> datos comerciales consignados o vinculados a los comprobantes originales, de corresponder
> (vg. artículos comercializados, notas de pedido, órdenes de compra u otro documento no fiscal de
> ajuste emitido entre las partes, etc.).
>
> No obstante lo indicado en el párrafo precedente, cuando la nota de débito o crédito se emita por
> un ajuste vinculado a diferencias de precio y/o cantidad entre lo pautado por las partes, lo
> documentado en el comprobante original y lo efectivamente entregado, la citada nota de crédito
> y/o débito **deberá identificar individualmente a la factura o documento equivalente que ajusta**,
> referenciando asimismo, los datos comerciales consignados o vinculados a los comprobantes
> originales conforme lo indicado en el párrafo anterior.
>
> Las respectivas notas de crédito y/o débito deberán emitirse dentro de los QUINCE (15) días
> corridos desde que surja el hecho o situación que requiera su documentación mediante los citados
> comprobantes.

### Art. 4° — la leyenda (texto completo)

> **ARTÍCULO 4°.-** Hasta tanto se adecuen los sistemas de emisión de comprobantes, a los fines de
> prever campos específicos para el ingreso **del período que se ajusta** a través de las
> respectivas notas de crédito y/o débito, **conforme lo dispuesto en el primer párrafo del
> artículo precedente** y la vinculación a otros documentos comerciales no fiscales, la información
> deberá encontrarse contenida **en la cabecera del documento de ajuste o en algún lugar destinado a
> leyendas o datos adicionales de libre ingreso**.
>
> De tratarse de una micro, pequeña o mediana empresa alcanzada por el Régimen de "Factura de
> Crédito Electrónica MiPyMEs", idéntico tratamiento se aplicará cuando deba emitir un comprobante
> de ajuste sobre una factura o documento equivalente emitido con anterioridad a la implementación
> del citado régimen.
>
> La novedad sobre la habilitación de campos específicos mencionados en el primer párrafo, será
> publicada en los micrositios correspondientes a los regímenes de facturación disponibles en el
> sitio "web" institucional (www.afip.gob.ar).

---

## 2. Pregunta 1 — ¿la estrella satisface la identificación individual?

**Respuesta: sí. Confianza alta en el texto, media-alta en la conclusión.**

Tres argumentos textuales, en orden de fuerza.

### 2.1 La RG nunca contempla a la ND como objeto ajustable

Éste es el argumento decisivo y **no** es el que #599 usó. Todo el articulado define el destino
del ajuste con la misma fórmula, sin excepción:

- art. 2°: «relacionadas a una o más **facturas o documentos equivalentes** emitidos previamente»;
- art. 3° 1° párr.: «para modificar **las facturas o documentos equivalentes** generados con
  anterioridad», «consignándose el número de **las facturas o documentos equivalentes** asociados»;
- art. 3° 2° párr.: «identificar individualmente a **la factura o documento equivalente** que ajusta»;
- art. 4°: «un comprobante de ajuste sobre **una factura o documento equivalente** emitido con
  anterioridad».

La nota de débito **no** es un «documento equivalente» en el sentido de la RG 1415: su art. 9°
define documento equivalente como «el instrumento que, de acuerdo con los usos y costumbres,
**haga las veces o sustituya el empleo de la factura o remito**» y enumera certificados de obra,
cuentas de venta y líquido producto, liquidaciones de granos, cartas de porte. La ND figura
**aparte**, en el art. 8° inc. a) punto **5** («Notas de débito y/o crédito»), mientras que
«Documentos equivalentes a los indicados precedentemente» es el punto **8** de la misma
enumeración (F2, verificado).

Es decir: cuando la RG 4540 dice «identificar individualmente a la factura o documento equivalente
que ajusta», **el objeto que manda identificar es, por definición del propio régimen, el
comprobante de la operación originaria — la factura**. La norma no ofrece la opción de apuntar a
una ND, porque no la contempla como destino.

Bajo esa lectura, la estrella no es una concesión ni un atajo: **es la única forma que el texto
describe**.

### 2.2 El contraste que traza el 2° párrafo es «individual vs. período», no «cercano vs. ancla»

El 2° párrafo abre con «No obstante lo indicado en el párrafo precedente». Lo indicado en el
párrafo precedente es la **alternativa**: consignar el número del comprobante asociado **o el
período al cual ajustan**. Lo que el 2° párrafo hace es **cerrar la puerta del período** para los
ajustes por diferencias de precio y/o cantidad: ahí no vale `PeriodoAsoc`, hay que nombrar un
comprobante concreto.

«Individualmente» significa entonces *un comprobante identificado por tipo, punto de venta y
número*, en oposición a *un rango de fechas*. **No** significa *el documento más próximo al
importe*. Nombrar la Factura C 00001-00000042 satisface literalmente ese estándar.

### 2.3 El criterio de la norma es la operación, no el importe

El art. 2° ata la facultad de emitir la NC a los sujetos «que emitieron los comprobantes por **las
operaciones originarias**». La unidad de análisis de toda la RG es la **operación** y su
comprobante originario. En el modelo del sistema, la ND y la FC documentan la misma operación —
la coreografía —; la ND sólo existe como ajuste de esa factura. Apuntar la NC a la factura
identifica la operación ajustada de forma inequívoca.

Éste es el argumento que #599 usó y que el issue calificaba de confianza media. **Sigue siendo
inferencia**, pero ahora está sostenido por §2.1, que es textual.

### 2.4 Lo que debilita la conclusión (honestidad intelectual)

- «La factura … **que ajusta**» admite la lectura de que la NC debe apuntar al comprobante cuyo
  importe efectivamente modifica. Si un importe nació en la ND, en un sentido aritmético estricto
  la NC ajusta la ND, no la FC. La norma no da un test para dirimirlo.
- **No se encontró ABC, dictamen ni jurisprudencia** de ARCA/AFIP que aborde directamente el caso
  «NC que acredita un importe documentado por una ND». La búsqueda cubrió el ABC de la categoría
  «Emisión de notas de crédito y/o débito» y búsqueda web general. Ausencia de fuente, no fuente
  en contra.
- WSFEv1 **sí** permite asociar una ND a una NC (validación 10040, §5.2). Que ARCA lo permita
  técnicamente es un indicio de que no considera anómalo el anclaje en la ND — pero *permitir* no
  es *exigir*.
- Corroboración secundaria (F6, **no fundante**): la documentación de TusFacturasAPP describe la
  NC como anulación de «la factura **o nota de débito**» asociada, lo que muestra que la práctica
  de la industria contempla el anclaje en la ND como una forma normal — no como la única.

---

## 3. Pregunta 2 — ¿existe una regla de «documento más cercano»?

**Respuesta: no se encontró ninguna. Confianza media-alta (argumento por ausencia).**

Se leyó íntegramente:

- **RG 4540/2019**, arts. 1° a 7° (F1). No hay ninguna mención a jerarquía, proximidad, cadena ni
  orden entre documentos de ajuste. Las únicas reglas de encadenamiento son la del **emisor**
  (art. 2°: sólo quien emitió el original) y la del **receptor** (art. 3°: sólo el mismo receptor).
- **RG 1415/2003**, arts. 3°, 8°, 9°, 10, 11, 13, 18, 19 y **Anexo II, Apartado A** (F2, F3).
  El Anexo II, Apartado A enumera los datos mínimos del comprobante clase «C»: respecto del emisor
  y del comprobante (I), del comprador (II), **de la operación efectuada (III)** y del tratamiento
  del IVA (IV). El punto III exige:

  > «a) **Descripción que permita identificar** el bien vendido, el servicio prestado, la cosa, obra
  > o servicio locado, o el trabajo efectuado. […] b) Cantidad de los bienes enajenados.
  > c) Precios unitarios y totales. […] e) **Todo otro concepto que incida cuantitativamente en el
  > importe total de la operación**.»

  Nada sobre vinculación entre comprobantes de ajuste. El Anexo II impone **descripción**, no
  jerarquía documental.

- **WSFEv1** (F4). No hay validación de proximidad. Ver §5.

**Advertencia sobre el peso de esta respuesta.** Es un argumento por ausencia sobre dos RG leídas
íntegras y sobre el manual del web service. Es fuerte pero no total: no se relevaron dictámenes de
la Dirección de Asesoría Técnica ni normas particulares de otros regímenes de facturación. El
art. 5° de la RG 4540 prevé que una norma particular la desplace; **no existe una norma particular
para Factura C de monotributo que lo haga** — esto ya lo estableció F5.

---

## 4. Pregunta 3 — ¿la leyenda del art. 4° cierra la cuestión?

**Respuesta: puede cargar el detalle, pero el art. 4° no es la habilitación que se buscaba.
Confianza alta (lectura literal).**

### 4.1 El art. 4° está atado al *primer* párrafo del art. 3°

El texto completo está en §1. La cláusula clave:

> «…a los fines de prever campos específicos para el ingreso **del período que se ajusta** […],
> **conforme lo dispuesto en el primer párrafo del artículo precedente** y la vinculación a otros
> documentos comerciales no fiscales, la información deberá encontrarse contenida en la cabecera
> del documento de ajuste o en algún lugar destinado a leyendas o datos adicionales de libre
> ingreso.»

El art. 4° cubre **dos cosas y sólo dos**: (a) el **período** que se ajusta, y (b) la vinculación a
**documentos comerciales no fiscales** (notas de pedido, órdenes de compra). Ambas provienen del
**primer** párrafo del art. 3°, citado expresamente. **El art. 4° no menciona el segundo párrafo ni
la identificación individual.**

Además es una norma **transitoria** («Hasta tanto se adecuen los sistemas de emisión de
comprobantes, a los fines de prever campos específicos…»). Para el período, WSFEv1 **ya tiene**
campo específico: la estructura `PeriodoAsoc` (`FchDesde`/`FchHasta`), validaciones 10199-10208
(F4, pp. 63-65). La necesidad transitoria que el art. 4° atendía está, para ese punto,
técnicamente satisfecha.

**Conclusión:** el art. 4° **no** es una cláusula general de escape del tipo «si `CbtesAsoc` no
puede expresarlo, ponelo en una leyenda». Invocarlo como fundamento de la estrella sería una
sobrelectura.

### 4.2 Pero la leyenda sigue siendo válida y recomendable — por otra vía

Que el art. 4° no la habilite para este fin no la prohíbe. La base para incluirla es otra y es
sólida:

- **RG 1415 Anexo II, Apartado A, punto III inc. a)** exige una «descripción que permita
  identificar … el servicio prestado» (F3). Ese es el campo natural del detalle.
- **RG 1415 art. 19, 2° párrafo**: «Los datos obligatorios no contemplados en el citado Anexo II y
  aquellos que deban incorporarse en función de la actividad o modalidad operativa, **podrán ser
  consignados en el comprobante sin sujeción respecto de su distribución**, siempre que resulten
  legibles y permitan identificar los conceptos e importes correspondientes a la operación
  efectuada» (F2, verificado).
- **RG 4540 art. 3°, ambos párrafos**, mandan «referenciar los datos comerciales consignados o
  vinculados a los comprobantes originales». Consignar «ajusta el importe documentado por la Nota
  de Débito C 00001-00000007, asociada a la Factura C 00001-00000042» es exactamente eso.

### 4.3 Limitación técnica que hay que decir en voz alta

**La leyenda no viaja a ARCA.** `FECAESolicitar` de WSFEv1 **no transmite renglones de detalle ni
ningún campo de texto libre**: el request lleva importes, fechas, receptor, `CbtesAsoc`,
`PeriodoAsoc`, `Tributos`, `IVA`, `Opcionales` (identificadores codificados de uso reservado),
`Compradores` y `Actividades` (F4, pp. 25-27, tabla de `FECAEDetRequest`). La palabra «leyenda» no
aparece en el manual como campo del request (F4, verificado por búsqueda sobre el texto completo).

Consecuencia: la leyenda vive en la **representación impresa/PDF** del comprobante, que es
justamente donde la RG 1415 y el art. 4° la ubican («cabecera del documento de ajuste o algún lugar
destinado a leyendas»). ARCA no la ve al autorizar; la ve en una fiscalización. Es un respaldo
real, no un dato del CAE.

**Veredicto sobre la pregunta 3:** la leyenda **no resuelve la pregunta por sí sola** — la
respuesta afirmativa se apoya en §2, no en el art. 4°. Pero es una mitigación de costo casi nulo
que convierte una omisión en una referencia explícita, y conviene implementarla.

---

## 5. Pregunta 4 — qué impone WSFEv1

**Todo lo de esta sección proviene de F4 (manual v4.0). Confianza alta.**

F5 ya estableció que **10237 es no excluyente** (observa, no rechaza) y **10210 es excluyente**
(si el asociado es *posterior* a la NC, ambos del mismo mes/año). Eso no se re-deriva. Lo que sigue
es lo adicional.

### 5.1 `CbtesAsoc` **es un array multi-entrada** — respuesta directa a la pregunta

Tabla de `FECAEDetRequest` (F4, p. 26):

> `CbtesAsoc` — **Array** — «Array para informar los comprobantes asociados `<CbteAsoc>`» —
> Obligatorio: **N**

Y F4 p. 27: «`CbtesAsoc`: Detalle de **los comprobantes** relacionados con el comprobante que se
solicita autorizar (**array**)».

Confirmación por la vía de las validaciones — código **10060** (excluyente, F4 p. 51):

> «De enviarse el tag `CbteAsoc`, **los comprobantes no deben repetirse**.»

Una regla de no-repetición sólo tiene sentido si se admiten múltiples entradas distintas.

**Respuesta:** **sí**, WSFEv1 acepta un `CbtesAsoc` multi-entrada para una Nota de Crédito C
(`CbteTipo` 13). **No se encontró en el manual ningún tope documentado** a la cantidad de entradas
(búsqueda por «cantidad de comprobantes asociados», «máximo … asociad» sobre el texto completo:
sin resultados). *Ausencia de tope documentado ≠ ausencia de tope real; confianza media sobre el
límite práctico.*

### 5.2 Una NC C **puede** asociar una ND C — validación 10040 (excluyente)

F4 p. 46, código **10040**, campo `<CbtesAsoc>` / `<CbteTipo>`:

> «De enviarse el tag `<CbtesAsoc>`, entonces el campo "código de tipo de comprobante"
> `<CbteTipo>` a autorizar tiene que ser 01, 02, 03, 06, 07, 08, 12, 13, 51, 52, 53, 201, 206 o 211
> […]
> **Para 12 o 13 pueden asociarse 11, 12, 13 y 15.**»

Es decir: para una ND C (12) o una **NC C (13)**, los tipos asociables son Factura C (11),
**Nota de Débito C (12)**, Nota de Crédito C (13) y Recibo C (15).

**Consecuencia doble y honesta:**

1. La estrella es **técnicamente legal**: asociar la Factura C (11) a una NC C (13) está
   expresamente admitido.
2. La cadena **también** lo estaría: ARCA contempla explícitamente que una NC C apunte a una ND C.
   **WSFEv1 no decide la cuestión** — soporta ambas formas. La decisión es normativa y de modelo,
   no técnica.

### 5.3 Las demás validaciones sobre asociados (no-FCE, tipos 11/12/13)

| Código | Excl. | Regla (F4, pág.) |
|---|---|---|
| **10197** | **Sí** | «Si el comprobante es Débito o Crédito, se deberá informar de forma obligatoria los campos Fecha Comprobantes Asociados Desde/Hasta, **o al menos un comprobante asociado**.» (p. 64) |
| 10198 | Sí | Si el comprobante es Factura, **no** se deben informar los campos de fechas de comprobantes asociados (p. 64) |
| 10040 | Sí | Tipos asociables — ver §5.2 (p. 46) |
| 10057 / 10058 / 10059 | Sí | `Tipo` > 0; `PtoVta` > 0 y < 99999; `Nro` > 0 y < 99999999 (p. 51) |
| 10060 | Sí | Los comprobantes asociados **no deben repetirse** (p. 51) |
| 10062 / 800 | Sí | Si se envía `<CbtesAsoc>`, `<CbteAsoc>` es obligatorio (p. 51) |
| 10210 | Sí | Asociado electrónico con fecha **posterior** a la NC → ambos del mismo mes/año (p. 66) |
| 10211 / 10212 / 10213 | Sí | `CbtesAsoc.CbteFch` obligatoria y ≤ hoy sólo si el PtoVta del asociado es Controlador Fiscal o FactuWeb; formato `yyyymmdd` (pp. 66-67) |
| **10041 / 801** | **No** | Si el PtoVta del asociado es electrónico, el número debe obrar en las bases del organismo — **observación** (p. 69) |
| **10237** | **No** | «El importe de la nota de crédito supera el monto **del comprobante asociado** que estás ajustando…» — **observación** (p. 71) |

Validaciones **10153-10160, 10181-10187, 10193, 10194, 10196**: todas **exclusivas de FCE MiPyMEs**
(tipos 201-213). No alcanzan a 11/12/13. Se destaca una por su valor interpretativo:

> **10183** — «Si el comprobante ES de anulación, para autorizar un débito, el tipo de comprobante
> a asociar debe ser crédito y **para autorizar un crédito, el tipo de comprobante a asociar debe
> ser una factura o un débito**.» (F4, p. 60)

Está en el bloque FCE (el «comprobante de anulación» es una figura del régimen de Factura de
Crédito Electrónica), de modo que **no aplica** a la Factura C. Pero muestra que ARCA concibe como
normal que un crédito ajuste un débito. **Inferencia, confianza media** — corrobora §2.4, no lo
resuelve.

### 5.4 El único riesgo técnico real de la estrella: la observación 10237

10237 compara el importe de la NC contra «el comprobante asociado». Bajo la estrella, el asociado
es siempre la factura. Si el importe acreditado nació en una ND, es posible que
`Σ NC > ImpTotal(factura)` aun cuando `Σ NC ≤ ImpTotal(factura) + Σ ND`.

**Consecuencia:** el comprobante **obtiene CAE igual** (10237 es no excluyente, F4 p. 71 y F5) y
vuelve con `Observaciones`. No hay rechazo. Pero el sistema recibirá observaciones que, bajo el
anclaje en la ND o con `CbtesAsoc` multi-entrada, no se producirían.

**Inferencia, confianza media.** El manual no especifica si la comparación de 10237 suma los
importes de *todos* los asociados informados ni si acumula NC previas sobre el mismo asociado.
No hay evidencia empírica en el repo: el spike de homologación **nunca emitió una NC ni una ND**
contra ARCA (F5, §6). Esto es verificable en homologación y **debería verificarse** antes de
producción con importes que crucen ese umbral.

---

## 6. Pregunta 5 — veredicto

**La estrella es defendible. Confianza media-alta. No hace falta volver atrás sobre #599.**

### Lo que la sostiene (verificado en fuente primaria)

1. RG 4540 define el destino del ajuste, en sus arts. 2°, 3° y 4°, **siempre** como «factura o
   documento equivalente». La nota de débito no es documento equivalente bajo la RG 1415 art. 9° y
   figura en enumeración separada en el art. 8° inc. a) punto 5. **La norma nunca contempla a la ND
   como objeto ajustable.**
2. «Identificar individualmente» se opone, en la estructura del propio art. 3°, a «el período al
   cual ajustan» — no a «el ancla de la operación». Nombrar un comprobante concreto por tipo,
   punto de venta y número satisface el estándar literal.
3. No existe norma relevada que imponga proximidad documental.
4. WSFEv1 admite la estrella sin ninguna validación excluyente en contra.

### Lo que queda como riesgo (declarado, no minimizado)

| Riesgo | Severidad | Mitigación |
|---|---|---|
| Lectura alternativa de «la factura **que ajusta**» como el comprobante cuyo importe se modifica | Interpretativa; sin fuente que la respalde ni que la refute | Leyenda (§6.1) |
| Observación **10237** cuando lo acreditado excede el importe de la factura sola | Baja — obtiene CAE, sólo `Observaciones` | Verificar en homologación; registrar la observación sin tratarla como error |
| No hay ABC, dictamen ni jurisprudencia sobre el caso puntual | Es lo que impide subir a confianza alta | — |
| La estrella pierde, en el dato que ARCA recibe, la traza de que el importe vino por la ND | Baja | Leyenda + trazabilidad en el dominio propio |

### 6.1 Recomendación operativa

1. **Mantener la estrella.** `CbtesAsoc` con exactamente la factura, profundidad 1.
2. **Agregar la leyenda en la representación impresa de la NC** cuando el importe acreditado
   provenga de una ND: «Ajusta la Nota de Débito C {PtoVta}-{Nro} del {fecha}, asociada a la
   Factura C {PtoVta}-{Nro}». Fundamento: RG 1415 Anexo II A.III.a y art. 19 2° párr.; RG 4540
   art. 3° («referenciando los datos comerciales … vinculados a los comprobantes originales»).
   **No** citar el art. 4° como fundamento — ver §4.1.
3. **Registrar en el dominio propio** el vínculo NC → ND que `CbtesAsoc` no expresa. Es información
   del sistema, no del comprobante.
4. **Verificar 10237 en homologación** antes de producción, con una NC cuyo importe supere el de la
   factura asociada. Hoy no hay ninguna evidencia empírica de NC/ND contra ARCA en este repo (F5).
5. **Si aparece un caso donde el ajuste no sea imputable a la operación de la factura**, la salida
   natural **no** es abandonar la estrella globalmente: es usar `CbtesAsoc` multi-entrada para ese
   caso puntual, que WSFEv1 soporta nativamente (§5.1).

### 6.2 Lo que este documento **no** establece

- No verifica empíricamente ninguna emisión de NC/ND contra homologación de ARCA.
- No releva dictámenes de la Dirección de Asesoría Técnica ni jurisprudencia del TFN.
- No cierra la lectura alternativa de §2.4: no se encontró fuente que la descarte, sólo la
  ausencia de norma que la imponga.
