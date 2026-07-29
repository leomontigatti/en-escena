# Nota de Crédito C posterior a la factura — ¿obligatoria? Plazos y restricciones de WSFEv1

> Research contra fuentes primarias (ARCA/AFIP, resoluciones generales, Ley de IVA, Anexo
> Monotributo) para dos casos concretos de la operatoria de En Escena:
> **(1)** descuento otorgado después de emitida la Factura C, y **(2)** baja de una
> inscripción ya facturada.
>
> Complementa [ADR-0011](../adr/0011-invoicing-concept-portion-and-surfaces.md) (concepto,
> porción y superficies del comprobante) y el research de emisión
> `docs/research/arca-wsfev1-factura-c.md`, que ya no está en el árbol de trabajo: se lo
> recupera con `git show 8c941da:docs/research/arca-wsfev1-factura-c.md`.
>
> **Advertencia de alcance.** Este documento distingue explícitamente tres planos:
> _lo que dice la norma_, _lo que es práctica estándar_ y _lo que está sin resolver_.
> La sección [§7 Confianza](#7-confianza-por-caso) es la que hay que leer antes de tomar
> una decisión arquitectónica. Esto **no es asesoramiento contable ni legal**: para el caso
> 1, en particular, la norma no cierra el punto de forma inequívoca.

## Fuentes oficiales consultadas

- **RG 1415/2003 (AFIP) — Régimen de emisión de comprobantes**, texto actualizado (incluye
  las sustituciones de la RG 5866/2026 ARCA):
  https://biblioteca.afip.gob.ar/dcp/REAG01001415_2003_01_07
  (espejo: https://biblioteca.arca.gob.ar/dcp/REAG01001415_2003_01_07)
- **RG 4540/2019 (AFIP) — Emisión de notas de crédito y/o débito. Condiciones**, texto
  actualizado (art. 6 sustituido por RG 4701/2020):
  https://servicios.infoleg.gob.ar/infolegInternet/anexos/325000-329999/326036/texact.htm
  · https://www.argentina.gob.ar/normativa/nacional/resoluci%C3%B3n-4540-2019-326036/actualizacion
- **ARCA — ABC Consultas Frecuentes, categoría "Emisión de notas de crédito y/o débito"**:
  https://servicioscf.afip.gob.ar/publico/abc/ABCpaso2.aspx?cat=2629
- **WSFEv1 — Manual para el desarrollador, RG 4291 / Proyecto FE v4.5**, revisión del
  **2 de julio de 2026**:
  https://www.afip.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf
  (misma ruta bajo `arca.gob.ar`; **la URL `manual-desarrollador-COMPG-v4.pdf` devuelve 404**)
- **Índice de WS de Factura Electrónica**: https://www.arca.gob.ar/ws/documentacion/ws-factura-electronica.asp
- **Ley de IVA, t.o. 1997** (arts. 11 y 12): https://biblioteca.afip.gob.ar/dcp/TOR_C_020631_1997_03_26
- **Ley 24.977, Anexo — Régimen Simplificado (Monotributo)** (art. 3, texto vigente según
  Ley 26.565): https://biblioteca.afip.gob.ar/dcp/LEY_C_024977_1998_06_03

---

## 0. Resumen ejecutivo

| Pregunta                                                                      | Respuesta                                                                                                                                                                                                                                                                                                                                                                                            | Confianza                                                                                          |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Caso 1 — ¿la NC es obligatoria por un descuento posterior?                    | **Sí, en la lectura estándar de la norma**: el descuento es un "hecho o situación que requiere documentación" y la NC es el instrumento previsto (RG 4540 art. 3; RG 1415 Anexo IV, A.2). Arrastrar el descuento a la próxima factura documenta mal _dos_ operaciones.                                                                                                                               | **Media-alta**. Ninguna norma dice literalmente "debés emitir una NC ante un descuento posterior". |
| Caso 1 — ¿cambia porque la factura documentaba plata cobrada?                 | **No.** Bajo RG 1415 la factura documenta _la operación_, no el pago; el comprobante que respalda el pago es el **recibo**, que expresamente **no** es válido como factura (art. 10 inc. d). La premisa de la distinción no se sostiene.                                                                                                                                                             | **Alta**                                                                                           |
| Caso 1 — ¿cambia Factura C (monotributo) vs. Responsable Inscripto?           | **En el deber formal, no** (RG 1415 y RG 4540 son de procedimiento y aplican a todos los regímenes). **En la consecuencia, sí**: el RI necesita la NC para computar crédito fiscal (Ley IVA art. 12 inc. b, que exige que el descuento "se facture"); el monotributista no liquida IVA, y su norma de fondo (Anexo art. 3) admite ingresos "neto de descuentos" sin exigir literalmente facturarlos. | **Alta** para el RI; **media** para el monotributo.                                                |
| Caso 2 — ¿la NC es obligatoria si se da de baja una inscripción ya facturada? | **Sí.** Es una rescisión/devolución: causal expresamente nominada en RG 4540 art. 2 y en RG 1415 Anexo IV A.2. El comprobante original quedó respaldando un servicio que no se prestará.                                                                                                                                                                                                             | **Alta**                                                                                           |
| Caso 2 — ¿total o parcial?                                                    | La norma **no** impone ninguna de las dos: la NC debe reflejar el ajuste real. Si la baja alcanza una parte del comprobante, NC parcial; si lo vacía, NC por el total. WSFEv1 no exige que la NC iguale al asociado.                                                                                                                                                                                 | **Alta**                                                                                           |
| Caso 2 — ¿y si la plata no se devuelve y queda como crédito?                  | El destino del dinero **no altera** el deber de documentar el ajuste de la operación. La NC va igual; el dinero retenido pasa a ser un anticipo/crédito a facturar cuando se defina la nueva operación.                                                                                                                                                                                              | **Media-alta** (la parte del _timing_ de la nueva factura sí es criterio contable).                |
| ¿Hay plazo para emitir la NC?                                                 | **Sí: 15 días corridos** desde que surge el hecho, contados desde que el emisor **toma conocimiento** (RG 4540 art. 3, último párrafo + ABC 24675312). No hay plazo de caducidad: pasados los 15 días la NC sigue siendo emitible (y debe emitirse), solo que fuera de término.                                                                                                                      | **Alta**                                                                                           |
| ¿El CAE del original vence / caduca la posibilidad de ajustar?                | **No.** `CAEFchVto` hace a la vigencia del comprobante autorizado, no a una ventana de asociación. WSFEv1 no valida vencimiento del CAE del asociado.                                                                                                                                                                                                                                                | **Alta**                                                                                           |
| ¿La NC debe caer en el mismo mes o período fiscal?                            | **No hay tal exigencia**, ni en RG 1415/4540 ni en WSFEv1. La única regla de mes en WSFEv1 corre en sentido inverso (validación 10210) y para MiPyMEs (FCE).                                                                                                                                                                                                                                         | **Alta**                                                                                           |
| ¿WSFEv1 impide que la NC supere al comprobante asociado?                      | **No lo impide**: lo **observa** (código 10237, _validación NO excluyente_). El comprobante igual obtiene CAE, con `Observaciones`.                                                                                                                                                                                                                                                                  | **Alta**                                                                                           |

---

## 1. Qué documenta una factura (y qué no)

Este punto decide el Caso 1 y conviene fijarlo primero.

### 1.1 La factura respalda la operación; el recibo respalda el pago

RG 1415 art. 8º (texto vigente según RG 5198/2022) enumera los comprobantes que respaldan
la operación realizada — facturas, tiques, recibos de profesionales, **notas de débito y/o
crédito** (inciso a, punto 5), documentos equivalentes — y cierra con la frase decisiva:

> "La obligación establecida en este artículo se cumplirá, en todos los casos, **con
> independencia de la modalidad de pago utilizada**."
> ([RG 1415 art. 8º](https://biblioteca.afip.gob.ar/dcp/REAG01001415_2003_01_07))

Y el art. 10 excluye al recibo del universo de comprobantes-factura:

> "**No son considerados comprobantes válidos como factura o documento equivalente** los
> que, entre otros, se detallan a continuación: […] d) **Recibos, comprobante que respalda
> el pago —total o parcial— de una operación que debe ser documentada mediante la emisión
> de facturas.**"
> ([RG 1415 art. 10 inc. d](https://biblioteca.afip.gob.ar/dcp/REAG01001415_2003_01_07))

El Anexo IV, apartado A, punto 10 lo refuerza: esos recibos se identifican con letra "X" y
la leyenda "DOCUMENTO NO VALIDO COMO FACTURA"
([RG 1415 Anexo IV A.10](https://biblioteca.afip.gob.ar/dcp/REAG01001415_2003_01_07)).

**Consecuencia para el Caso 1.** La idea de que "esta factura documentaba plata efectivamente
recibida, no una deuda, así que no hay nada que revertir" no tiene apoyo normativo. En el
régimen argentino la factura **nunca** documenta un pago: documenta la operación. Que el pago
haya ocurrido antes, después o simultáneamente es indiferente al deber de emitirla y al
contenido que debe reflejar. El comprobante que documenta el cobro es el recibo "X", que no
es un comprobante fiscal de operación.

> **Matiz honesto sobre el "Recibo C" (WSFEv1 tipo 15).** El art. 8º inc. a) punto 4 sí
> incluye "Recibos emitidos por profesionales universitarios y demás prestadores de
> servicios" entre los comprobantes que respaldan la operación, y WSFEv1 expone
> `CbteTipo` 15 = Recibo C. Ese recibo _fiscal_ es un documento equivalente a la factura,
> no el recibo "X" del art. 10 inc. d. No usamos tipo 15 en el sistema; se menciona solo
> para que la distinción no se confunda.

### 1.2 Cuándo nace la obligación de facturar (y por qué la seña se factura)

RG 1415 art. 13, texto vigente según RG 5866/2026 ARCA, es una tabla operación → fecha
límite de emisión. Filas relevantes
([RG 1415 art. 13](https://biblioteca.afip.gob.ar/dcp/REAG01001415_2003_01_07)):

| Operación                                                    | Fecha límite para su emisión                                                                                                           |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Locaciones y prestaciones de servicios / Locaciones de obras | "Día en que se concluya la prestación o ejecución **o en que se perciba —en forma total o parcial— el precio, el que fuera anterior**" |
| Anticipos que fijan precio                                   | "Día en que se perciba —en forma total o parcial— el importe del anticipo"                                                             |

Esto valida la decisión 4 de ADR-0011 (la porción se deriva de lo cobrado) y confirma que la
Factura C de seña es **correcta y obligatoria** al percibir. Pero también implica que esa
factura documenta el precio de una prestación, no un movimiento de caja: si el precio de esa
prestación cambia o la prestación se cae, el comprobante dejó de decir la verdad.

Cierre del círculo, RG 1415 art. 11: la documentación emitida sin cumplir requisitos y
condiciones "será considerada como comprobante **no válido para respaldar la operación
efectuada**"
([RG 1415 art. 11](https://biblioteca.afip.gob.ar/dcp/REAG01001415_2003_01_07)).

---

## 2. El régimen de notas de crédito: RG 1415 + RG 4540/2019

### 2.1 RG 1415 — la NC es un comprobante del régimen

- Art. 8º inc. a) punto 5: "Notas de débito y/o crédito y tiques notas de débito y/o
  crédito" son comprobantes que **respaldan la operación realizada**.
- Art. 23 inc. a) punto 2 remite al Anexo IV, cuyo apartado A punto 2 dice:

  > "**Las notas de crédito y/o de débito que se emitan en concepto de descuentos,
  > bonificaciones, quitas, devoluciones, rescisiones, intereses, etc., se ajustarán a los
  > requisitos que se deben cumplir con relación a los comprobantes emitidos por las
  > operaciones originarias.**"
  > ([RG 1415 Anexo IV A.2, texto vigente según RG 5866/2026 ARCA](https://biblioteca.afip.gob.ar/dcp/REAG01001415_2003_01_07))

  Nótese que la norma **enumera las causales** ("descuentos, bonificaciones, quitas,
  devoluciones, rescisiones") como el universo natural de la NC. No dice "deberás emitirla":
  regula _cómo_ se emite. Ese matiz es la fuente de la incertidumbre del Caso 1.

### 2.2 RG 4540/2019 — condiciones y plazo

Es la norma específica y **la fuente principal** para ambos casos. Texto operativo:

> **ARTÍCULO 2°.-** "Sólo los sujetos que emitieron los comprobantes por las operaciones
> originarias podrán emitir las notas de crédito y/o débito **en concepto de descuentos,
> bonificaciones, quitas, devoluciones, rescisiones, intereses, etc.**, siempre que se
> encuentren relacionadas a una o más facturas o documentos equivalentes emitidos
> previamente.
>
> **Cuando los descuentos y/o bonificaciones estén acordados y sean determinables al momento
> de la emisión de una factura o documento equivalente, y éstos sean relacionados de manera
> directa con ese comprobante, dichos conceptos deberán ser aplicados en el documento
> original que respalda la operación.**"
>
> **ARTÍCULO 3°.-** "Las notas de crédito y/o débito deberán cumplir con los requisitos y
> las formalidades exigidos para los comprobantes emitidos por las operaciones originarias.
> Asimismo serán emitidas **únicamente al mismo receptor** de los comprobantes originales
> para modificar las facturas o documentos equivalentes generados con anterioridad,
> **consignándose el número de las facturas o documentos equivalentes asociados o el período
> al cual ajustan** […]
>
> No obstante lo indicado en el párrafo precedente, **cuando la nota de débito o crédito se
> emita por un ajuste vinculado a diferencias de precio y/o cantidad** entre lo pautado por
> las partes, lo documentado en el comprobante original y lo efectivamente entregado, la
> citada nota de crédito y/o débito **deberá identificar individualmente a la factura o
> documento equivalente que ajusta** […]
>
> **Las respectivas notas de crédito y/o débito deberán emitirse dentro de los QUINCE (15)
> días corridos desde que surja el hecho o situación que requiera su documentación mediante
> los citados comprobantes.**"
>
> ([RG 4540/2019, texto actualizado](https://servicios.infoleg.gob.ar/infolegInternet/anexos/325000-329999/326036/texact.htm))

Cuatro reglas duras se leen de ahí:

1. **Emisor**: solo quien emitió el original (art. 2).
2. **Receptor**: solo el mismo receptor del original (art. 3).
3. **Vinculación**: número de comprobante asociado **o** período ajustado; y si el ajuste es
   por **diferencia de precio o cantidad**, identificación **individual** del comprobante.
4. **Plazo**: 15 días corridos.

El ABC de ARCA agrega el punto de partida del cómputo:

> "Finalmente, el citado plazo deberá computarse **desde que el emisor del comprobante
> original (Factura o documento equivalente) tome conocimiento del hecho o situación que de
> origen al ajuste**."
> ([ARCA ABC id 24675312](https://servicioscf.afip.gob.ar/publico/abc/ABCpaso2.aspx?cat=2629))

Y responde explícitamente al escenario del descuento pactado de antemano:

> "**¿Pueden ser aplicados a una nota de crédito los descuentos y/o bonificaciones acordados
> al momento de la emisión de la factura?** — **No**, cuando los descuentos y/o
> bonificaciones estén acordados y sean determinables al momento de la emisión de una
> factura o documento equivalente, y éstos sean relacionados de manera directa con ese
> comprobante, dichos conceptos deberán ser aplicados en el documento original que respalda
> la operación."
> ([ARCA ABC id 24546225, fuente Art. 2 RG 4540/19](https://servicioscf.afip.gob.ar/publico/abc/ABCpaso2.aspx?cat=2629))

Léase al revés, que es lo que importa acá: **el descuento que NO era determinable al momento
de facturar es, por construcción, el que va por nota de crédito.** El art. 2 divide el
universo en dos y no deja una tercera puerta ("aplicarlo en un comprobante futuro distinto").

### 2.3 Vigencia y modificaciones

RG 4540/2019 rige desde el 1/7/2020 (art. 6, sustituido por
[RG 4701/2020](https://servicios.infoleg.gob.ar/infolegInternet/anexos/325000-329999/326036/texact.htm)).
Su art. 5 aclara que ante una norma particular con requisitos propios se aplica esa, y la
4540 **de manera supletoria** — no hay norma particular para Factura C de monotributo que
desplace estas condiciones.

---

## 3. Caso 1 — "descuento posterior" sin nota de crédito

### 3.1 Los hechos

Factura C ya autorizada (con CAE) por una inscripción cobrada a una academia. Después se
otorga a esa misma academia un descuento que reduce lo que habría debido por un servicio ya
facturado. El plan es **no** emitir NC y arrastrar el descuento no realizado, aplicándolo en
la próxima factura.

### 3.2 Lo que dice la norma

- El descuento posterior es exactamente una de las causales nominadas de NC: RG 4540 art. 2
  ("descuentos, bonificaciones, quitas…") y RG 1415 Anexo IV A.2 (misma enumeración).
- No era determinable al momento de emitir el original ⇒ **no** cae en el supuesto del
  segundo párrafo del art. 2 (aplicar en el documento original). Cae en el primero.
- Si es un ajuste de precio respecto de lo pautado, RG 4540 art. 3 segundo párrafo obliga a
  **identificar individualmente** la factura ajustada. Aplicarlo dentro del importe de una
  factura futura distinta es, literalmente, lo contrario de identificar individualmente el
  comprobante que se ajusta.
- Plazo: 15 días corridos desde que se toma conocimiento del descuento (RG 4540 art. 3
  último párrafo; ABC 24675312). Arrastrar el descuento "hasta la próxima factura" es, por
  definición, un plazo indeterminado.

**El defecto simétrico.** Aplicar el descuento en la próxima factura produce dos
comprobantes falsos, no cero: la factura vieja sobredeclara el precio de su operación y la
nueva subdeclara el de la suya. Ninguna de las dos respalda correctamente "la operación
realizada" (RG 1415 art. 8º). En cambio, un descuento genuinamente pactado **para la próxima
operación** y determinable al emitirla sí puede ir neto en esa factura (RG 4540 art. 2,
segundo párrafo) — pero entonces no es "el descuento arrastrado", es un descuento nuevo.

### 3.3 ¿Cambia porque el comprobante documentaba plata cobrada?

**No.** Ver §1.1: la factura documenta la operación con independencia de la modalidad de
pago (RG 1415 art. 8º), y el comprobante del pago —el recibo— no es
válido como factura (art. 10 inc. d). El hecho de que la Factura C haya sido emitida al
percibir (RG 1415 art. 13, filas de servicios y de anticipos) no la convierte en un recibo.

Sí hay un efecto **económico** real y es el que probablemente motiva la pregunta: si el
dinero ya entró y no se devuelve, la NC no genera un pago; genera un **saldo a favor del
cliente**. Eso es un hecho patrimonial, no una excusa documental: la NC documenta el ajuste
del precio de la operación; el saldo resultante es un pasivo/crédito que el sistema
administra por su lado (ver ADR-0009 / ADR-0011: el comprobante es derivado e inmutable, no
gobierna el estado financiero).

### 3.4 Factura C (monotributo) vs. Responsable Inscripto

**El deber formal es el mismo.** RG 1415 y RG 4540 son normas de procedimiento dictadas al
amparo del art. 33 de la Ley 11.683; RG 4540 art. 1 alcanza a "los diversos regímenes de
facturación vigentes". No hay excepción para el Régimen Simplificado.

**La consecuencia sustantiva difiere:**

- **Responsable Inscripto.** Ley de IVA art. 12 inc. b): el vendedor computa como crédito
  fiscal el gravamen sobre "los descuentos, bonificaciones, quitas, devoluciones o
  rescisiones que, respecto de los precios netos, se otorguen en el período fiscal […]
  **siempre que aquellos estén de acuerdo con las costumbres de plaza, se facturen y
  contabilicen**"
  ([Ley IVA art. 12 inc. b](https://biblioteca.afip.gob.ar/dcp/TOR_C_020631_1997_03_26)).
  El "se facturen" es la exigencia de black-letter más nítida de todo este documento: sin NC,
  el RI simplemente **no puede** reducir su IVA. El espejo está en el art. 11 segundo
  párrafo para el comprador
  ([Ley IVA art. 11](https://biblioteca.afip.gob.ar/dcp/TOR_C_020631_1997_03_26)).
- **Monotributista (Factura C).** No liquida IVA, con lo cual el art. 12 inc. b) no le
  aplica. Su parámetro relevante es el ingreso bruto, definido en el Anexo de la Ley 24.977:

  > "A los efectos del presente régimen, se consideran ingresos brutos obtenidos en las
  > actividades, al producido de las ventas, locaciones o prestaciones correspondientes a
  > operaciones realizadas por cuenta propia o ajena, **excluidas aquellas que hubieran sido
  > dejadas sin efecto y neto de descuentos efectuados de acuerdo con las costumbres de
  > plaza**."
  > ([Ley 24.977 Anexo art. 3, texto vigente según Ley 26.565](https://biblioteca.afip.gob.ar/dcp/LEY_C_024977_1998_06_03))

  O sea: el monotributista **puede** netear descuentos y excluir operaciones dejadas sin
  efecto para categorizarse/recategorizarse — y, a diferencia del art. 12 inc. b) de la Ley
  de IVA, el texto **no** condiciona ese neteo a que el descuento "se facture". La NC no es
  el título habilitante del neteo, pero sí es el único respaldo documental que ARCA va a
  encontrar cuando cruce los comprobantes electrónicos contra los ingresos declarados.

> **Conclusión del contraste**: la Factura C no relaja el deber; relaja la _sanción
> económica inmediata_ por incumplirlo. En monotributo, no emitir la NC no cuesta IVA
> (no hay), cuesta consistencia entre los comprobantes emitidos y los ingresos declarados.

---

## 4. Caso 2 — baja de una inscripción ya facturada

### 4.1 Lo que dice la norma

Este caso es **más claro** que el 1, porque la causal está nominada en su forma más pura:
**rescisión** (y, si hay devolución de dinero, **devolución**). RG 4540 art. 2 y RG 1415
Anexo IV A.2 la enumeran textualmente. Además:

- El comprobante original pasó a respaldar un servicio que no se prestará: deja de cumplir
  el art. 8º ("respaldo documental de las operaciones realizadas").
- RG 4540 art. 3, segundo párrafo: si el ajuste se vincula a diferencias de **cantidad**
  entre lo pautado, lo documentado y lo efectivamente entregado — que es exactamente una
  inscripción de menos — la NC **debe identificar individualmente** la factura ajustada. En
  WSFEv1 eso es `CbtesAsoc` con el comprobante concreto, no `PeriodoAsoc`.
- Plazo: 15 días corridos desde que se toma conocimiento de la baja.

**Confirmación operativa desde el propio ARCA**: el "Facturador" de ARCA implementa la
anulación de un comprobante C generando automáticamente una **Nota de Crédito C asociada** al
original; no existe borrado. Esto está descripto en material periodístico que cita al
organismo y se corresponde con el diseño de WSFEv1 (numeración correlativa irreversible +
CAE), pero **no logramos localizar la página del ABC oficial que lo enuncie como tal**; se
consigna como práctica del propio organismo, no como cita normativa.

### 4.2 NC total vs. parcial

**Ninguna norma impone una u otra.** El criterio es de contenido: la NC debe reflejar el
ajuste realmente ocurrido (RG 4540 art. 3: "para modificar las facturas […] generados con
anterioridad").

- Si la Factura C cubría varias inscripciones y se cae una ⇒ **NC parcial** por el importe de
  esa inscripción.
- Si la factura cubría solo esa inscripción ⇒ **NC total**, que la deja sin efecto.

WSFEv1 no obliga a que el importe de la NC iguale al del asociado, ni prohíbe varias NC
parciales sucesivas sobre el mismo comprobante (ver §6). El único límite técnico es una
**observación** (no un rechazo) si la NC excede al asociado.

> **Ojo con el criterio de ADR-0011 §5**: la anulación se dispara desde el detalle del
> comprobante y el estado se refleja en la coreografía. Una NC parcial rompe la lectura
> binaria "vigente / anulado": el comprobante queda _parcialmente_ ajustado. Es una
> consecuencia de diseño a considerar, no una cuestión normativa.

### 4.3 Si el dinero no se devuelve y queda como crédito

El deber de documentar el ajuste **no depende del destino del dinero**. Ninguna de las normas
citadas condiciona la NC a la restitución: RG 4540 art. 2 enumera "descuentos, bonificaciones,
quitas, devoluciones, **rescisiones**, intereses, etc." como causales autónomas, y la
rescisión existe se devuelva o no la plata.

Secuencia consistente con la norma:

1. **NC C** por la baja, asociada a la Factura C original (documenta que esa operación se
   redujo o se dejó sin efecto).
2. El dinero retenido queda como **saldo a favor del cliente** en la contabilidad del emisor.
   No hay comprobante fiscal para "el saldo": no es una operación.
3. Cuando ese saldo se aplique a una nueva prestación, se emite la **Factura C nueva** por
   esa operación, con su fecha límite propia según RG 1415 art. 13 (día en que se concluya
   la prestación o se perciba el precio, el que fuera anterior; o, si fija precio de un
   anticipo, el día de la percepción).

**Lo que queda sin resolver acá.** Si la plata retenida "fija precio" de una operación futura
ya identificada, un criterio conservador diría que estamos ante un _anticipo que fija precio_
y que RG 1415 art. 13 exige facturarlo **en el momento en que se percibió** — momento que ya
pasó. La secuencia NC + factura nueva desplaza esa fecha. En la práctica contable habitual
esto se resuelve con NC y nueva factura al definirse la nueva operación, pero **la norma no
tiene una regla explícita para "el dinero ya percibido cuya operación fue rescindida y se
reasigna"**. Ver §7.

---

## 5. Plazos, CAE y período fiscal

| Pregunta                                                           | Respuesta                                                                                                                                                                                                                                                                                                                              | Fuente                                                                                                                                                  |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ¿Plazo para emitir la NC?                                          | **15 días corridos** desde que surge el hecho, computados **desde que el emisor toma conocimiento**.                                                                                                                                                                                                                                   | RG 4540 art. 3 último párrafo; [ABC 24550323 y 24675312](https://servicioscf.afip.gob.ar/publico/abc/ABCpaso2.aspx?cat=2629)                            |
| ¿Vencido el plazo, se pierde la posibilidad?                       | **No.** No es un plazo de caducidad: la NC sigue siendo el instrumento debido, emitida fuera de término (exposición a la sanción formal del art. 39 Ley 11.683, no a la imposibilidad). _Esto es interpretación: la norma no lo dice._                                                                                                 | —                                                                                                                                                       |
| ¿El plazo del art. 13 de RG 1415 alcanza a la NC?                  | Ambiguo. El art. 13 rige "la factura y los demás comprobantes previstos en el artículo 8º incisos a) y c)" — y la NC está en el inc. a) punto 5 —, pero **la tabla de fechas límite no tiene fila para notas de crédito**: sus filas son tipos de operación (compraventa, servicios, anticipos…). El plazo operativo es el de RG 4540. | [RG 1415 arts. 8º y 13](https://biblioteca.afip.gob.ar/dcp/REAG01001415_2003_01_07)                                                                     |
| ¿Importa el CAE del comprobante original? ¿Vence?                  | El `CAEFchVto` es la fecha de vencimiento del CAE del comprobante autorizado. **WSFEv1 no valida el vencimiento del CAE del comprobante asociado** al autorizar una NC: no existe validación con ese contenido en el manual.                                                                                                           | [WSFEv1 Manual v4.5, `FeDetResp`/validaciones sobre `CbtesAsoc`](https://www.afip.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf) |
| ¿La NC debe caer en el mismo mes / período fiscal que la factura?  | **No.** No hay norma que lo exija, ni validación de WSFEv1 en ese sentido. Es _práctica contable recomendada_ (para que el cruce de IVA cierre en una sola DDJJ), irrelevante para un monotributista que no liquida IVA.                                                                                                               | Ver §6.3 (validación 10210, que corre en sentido inverso)                                                                                               |
| ¿La NC puede llevar `CbteFch` muy posterior a la factura asociada? | **Sí**, sin límite respecto de la factura. El límite es respecto de **hoy**: N±10 días para `Concepto` 2/3.                                                                                                                                                                                                                            | Validación **10016**, [WSFEv1 Manual v4.5](https://www.afip.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf)                       |

---

## 6. WSFEv1 — restricciones técnicas de la Nota de Crédito C (tipo 13)

Fuente única de esta sección: **WSFEv1 Manual para el desarrollador, RG 4291 / Proyecto FE
v4.5, revisión 2/7/2026**
(https://www.afip.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf).

El manual separa **validaciones excluyentes** (rechazan: `Resultado = R` + `Errors`) de
**validaciones NO excluyentes** (el comprobante obtiene CAE igual y vuelve con
`Observaciones`). La distinción es crítica y se marca en cada fila.

### 6.1 Tipos y asociación

| Regla                                                                                                                                                                                      | Código                | Tipo                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- | ------------------------------- |
| La NC C es `CbteTipo` **13**. El grupo "tipo C" es 11, 12, 13, 15.                                                                                                                         | 10061                 | excluyente                      |
| Si se envía `CbtesAsoc`, el `CbteTipo` a autorizar debe pertenecer a {01, 02, 03, 06, 07, 08, **12, 13**, 51, 52, 53, 201, 206, 211}. **"Para 12 o 13 pueden asociarse 11, 12, 13 y 15."** | **10040**             | **excluyente**                  |
| Si se envía `<CbtesAsoc>`, `<CbteAsoc>` es obligatorio (y no vacío).                                                                                                                       | 10062 / 800           | excluyente                      |
| "Si el comprobante es Débito o Crédito, se deberá informar de forma obligatoria los campos Fecha Comprobantes Asociados Desde/Hasta, **o al menos un comprobante asociado**."              | **10197**             | **excluyente**                  |
| Si el comprobante es Factura, **no** se deben informar esos campos.                                                                                                                        | 10198                 | excluyente                      |
| `PtoVta` del asociado entre 1 y 99999; `Nro` entre 1 y 99999999; `Tipo` > 0; los asociados **no pueden repetirse**.                                                                        | 802 / 803 / 805 / 804 | excluyente                      |
| Si el `PtoVta` del asociado es electrónico, el número debe existir en las bases del organismo para ese punto de venta y tipo.                                                              | **10041 / 801**       | **NO excluyente** (observación) |

**Lectura para el sistema**: la asociación es obligatoria para tipo 13, pero admite dos
formas — `CbtesAsoc` (comprobante puntual) o `PeriodoAsoc` (`FchDesde`/`FchHasta`). Como
tanto el Caso 1 (diferencia de precio) como el Caso 2 (diferencia de cantidad) caen en el
segundo párrafo del art. 3 de RG 4540, **la forma correcta es `CbtesAsoc` con el comprobante
individual**, no `PeriodoAsoc`.

### 6.2 Importe

> "**El importe de la nota de crédito supera el monto del comprobante asociado que estás
> ajustando.** Verificá los montos ingresados y de tratarse de un error, tenés que efectuar
> el ajuste o anulación de la operación según corresponda."
> — código **10237**, tabla **"Validaciones No Excluyentes"** de `FECAESolicitar`

Es decir: **WSFEv1 no impide técnicamente emitir una NC por más que el comprobante asociado**;
la autoriza y devuelve la observación. El control de que la NC no exceda al original —ni que
la suma de NC parciales lo exceda— **es responsabilidad de la aplicación**, no del web
service. Correlato: WSFEv1 tampoco impide emitir **varias** NC parciales contra la misma
factura (no hay validación de "comprobante ya ajustado"; sí la hay en el Facturador web de
ARCA, que es otra herramienta).

Reglas de importes de la NC C: idénticas a las de la Factura C —
`ImpTotConc = ImpOpEx = ImpIVA = 0`, `ImpNeto` = subtotal, `ImpTotal = ImpNeto + ImpTrib`,
sin array `<Iva>` (validaciones 10018–10023: "No aplica para comprobantes tipo C"),
`CbteHasta = CbteDesde` (10012). Ver §3.3 del research de emisión
(`git show 8c941da:docs/research/arca-wsfev1-factura-c.md`).
`ImpTotal` no puede ser menor a cero (10065): **la NC se emite con importes positivos**, su
signo es semántico (lo da el tipo 13), no aritmético.

### 6.3 Fechas

| Regla                                                                                                                                                                                                                                                                                                                          | Código                              | Tipo                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- | ------------------------ |
| `CbteFch` puede ser nulo o estar en el rango **N−5 a N+5** para `Concepto` = 1 (sin exceder el mes de presentación), y **N−10 a N+10** para `Concepto` = 2 o 3, siendo N la fecha de envío del pedido de autorización. Además debe ser **mayor o igual** a la del último comprobante emitido _para ese tipo y punto de venta_. | **10016**                           | **excluyente**           |
| "Si el comprobante asociado se autorizó de forma electrónica y **tiene una fecha de emisión posterior** a la fecha de emisión del comprobante por el cual se está solicitando la autorización, **ambos deberán ser del mismo mes/año**."                                                                                       | **10210**                           | **excluyente**           |
| `PeriodoAsoc.FchHasta` debe ser **anterior o igual** a la fecha de emisión del comprobante que se autoriza; `FchHasta >= FchDesde`; ambas posteriores al 01/01/2006; formato `YYYYMMDD`.                                                                                                                                       | 10208 / 10207 / 10206 / 10204-10205 | excluyente               |
| `CbtesAsoc.CbteFch` obligatoria solo si el PtoVta del asociado es **Controlador Fiscal o FactuWeb**; en ese caso no puede ser posterior a hoy. Formato `yyyymmdd`.                                                                                                                                                             | 10211 / 10212 / 10213               | excluyente               |
| Para comprobantes **MiPyMEs (FCE)** de débito/crédito, la fecha del asociado debe ser igual o menor a la del comprobante autorizado, y `CbteFch` hasta N−5.                                                                                                                                                                    | 10152-10160                         | excluyente, **solo FCE** |

**Las tres consecuencias que importan:**

1. **No existe ventana de asociación.** Una NC C emitida hoy puede asociarse a una Factura C
   de hace un año sin problema técnico. La validación 10210 corre en el sentido _inverso_
   (asociado **posterior** a la NC), que es el caso patológico.
2. **La restricción de fecha de la NC es contra hoy, no contra la factura.** Con
   `Concepto = 2` (servicios, según ADR-0011 decisión 1), `CbteFch` ∈ [hoy−10, hoy+10]. No
   se puede fechar la NC "el día del descuento" si ese día quedó a más de 10 días.
   → **Diseño**: el plazo de 15 días de RG 4540 y la ventana de ±10 días de WSFEv1 no son la
   misma restricción y la segunda es más corta hacia atrás. Emitir tarde no solo es
   extemporáneo: obliga a fechar la NC con fecha reciente.
3. **`Concepto = 2` obliga `FchServDesde` / `FchServHasta` / `FchVtoPago`** también en la NC
   (validación 10049). ADR-0011 decisión 2 ya previó que la NC debe poder espejar las fechas
   de servicio del comprobante que ajusta. `FchVtoPago >= CbteFch`.

### 6.4 Numeración y receptor

- La NC C tiene **su propia serie correlativa** por (PtoVta, `CbteTipo` = 13):
  `FECompUltimoAutorizado(PtoVta, 13)` + 1 (validación 10016). No consume números de la serie
  de Factura C.
- `DocTipo`/`DocNro` deben ser los del receptor original (exigencia de RG 4540 art. 3, no de
  WSFEv1). WSFEv1 aporta un dato revelador en sentido contrario: las validaciones **10247**
  y **10248** (CUIT receptora inactiva/inválida, o caracterizada como no confiable) son
  "excluyente**s** salvo si el tipo de comprobante informado es **Nota de Crédito**" — ARCA
  deja pasar la NC incluso contra receptores bloqueados, precisamente porque quiere que el
  ajuste se documente.
- `CondicionIVAReceptorId` sigue siendo obligatorio por RG 5616 (validación 10245).

---

## 7. Confianza por caso

### Caso 1 — descuento posterior

**Lo que la norma dice (confianza alta):**

- La factura documenta la operación, no el pago (RG 1415 arts. 8º y 10 inc. d). La distinción
  "documentaba plata cobrada, no una deuda" **no cambia nada**.
- La NC es el instrumento nominado para descuentos/bonificaciones/quitas (RG 4540 art. 2;
  RG 1415 Anexo IV A.2).
- Un descuento acordado y determinable al momento de facturar **debe** ir en el documento
  original y **no** puede ir por NC (RG 4540 art. 2 2º párr.; ABC 24546225). Simétricamente,
  el que no era determinable es el que va por NC.
- Hay plazo de 15 días corridos desde el conocimiento (RG 4540 art. 3; ABC 24675312).
- Para un RI el descuento debe "facturarse" para computarse (Ley IVA art. 12 inc. b).

**Lo que es práctica estándar (confianza media-alta):**

- Emitir NC ante todo descuento posterior a la factura, asociada individualmente al
  comprobante ajustado, dentro de los 15 días.
- No arrastrar descuentos entre comprobantes.

**Lo que está sin resolver (decir esto en voz alta):**

- **Ninguna norma relevada contiene una oración de la forma "ante un descuento posterior
  deberá emitirse una nota de crédito".** RG 4540 regula _cómo_ se emite una NC y _en qué
  plazo_, partiendo de la base de que existe "un hecho o situación que requiera su
  documentación mediante los citados comprobantes" — **pero no enumera cuáles son esos
  hechos**. La obligatoriedad se construye por integración (art. 8º de RG 1415 + causales del
  art. 2 de RG 4540 + plazo del art. 3), no por texto expreso.
- La contra-lectura no es absurda: si el descuento se pacta como **bonificación de la próxima
  operación**, determinable al emitir esa próxima factura y directamente relacionada con ella,
  el segundo párrafo del art. 2 de RG 4540 la manda al documento original de **esa** operación.
  La diferencia entre "descuento sobre lo ya facturado, arrastrado" y "bonificación pactada
  sobre lo próximo" es **de sustancia económica, no de forma**, y la norma no da un test para
  distinguirlas.
- Para un **monotributista** específicamente, la consecuencia sustantiva de no emitir la NC
  es débil: el Anexo art. 3 de la Ley 24.977 le permite computar ingresos "neto de descuentos
  efectuados de acuerdo con las costumbres de plaza" **sin exigir que se facturen**, a
  diferencia del art. 12 inc. b) de la Ley de IVA. **No encontramos jurisprudencia ni
  dictamen que resuelva si esa diferencia de redacción es deliberada.**

**Veredicto operativo**: tratar la NC como **requerida**. El costo de emitirla es bajo y
técnicamente irrestricto (§6); el costo de no emitirla es una inconsistencia permanente entre
los comprobantes electrónicos registrados en ARCA y los ingresos declarados, que además
contamina dos comprobantes en lugar de uno.

### Caso 2 — baja de inscripción ya facturada

**Lo que la norma dice (confianza alta):**

- Rescisión y devolución son causales expresamente nominadas de NC (RG 4540 art. 2;
  RG 1415 Anexo IV A.2).
- El comprobante original dejó de respaldar una operación realizada (RG 1415 art. 8º).
- El ajuste por diferencia de cantidad exige identificación **individual** del comprobante
  ajustado (RG 4540 art. 3 2º párr.).
- Plazo de 15 días corridos desde el conocimiento de la baja.
- Total vs. parcial: lo determina el ajuste real; ninguna norma ni validación de WSFEv1
  impone una u otra.

**Lo que está sin resolver (confianza media):**

- El tratamiento del dinero **retenido** tras la NC. La norma no regula el "saldo a favor del
  cliente": no es una operación y no tiene comprobante. Cuándo debe facturarse su aplicación
  a un servicio futuro depende de cuándo se perfecciona esa nueva operación según RG 1415
  art. 13 — y si se lo considera "anticipo que fija precio", el criterio literal apuntaría al
  día de la percepción original, que ya pasó. **Esto es criterio contable, no regla escrita.**

### Transversal — plazos y WSFEv1

**Confianza alta** en todo el §6: proviene íntegramente del manual oficial vigente
(revisión 2/7/2026), citando código de validación y su carácter excluyente / no excluyente.
La única afirmación por **ausencia** —"WSFEv1 no valida vencimiento del CAE del asociado, ni
período fiscal, ni ventana de asociación"— es un argumento negativo: se verificó que no
existe validación con ese contenido en las tablas de `FECAESolicitar`, pero un argumento por
ausencia es más débil que uno por cita. **Confianza alta, no total.**

---

## 8. Implicancias para el sistema

1. **La NC no es opcional en el modelo de dominio.** Tanto "descuento posterior" como "baja
   de inscripción facturada" desembocan en emitir una Nota de Crédito C (tipo 13) asociada
   individualmente al comprobante ajustado. No hay una rama "ajustar sin comprobante".
2. **Hace falta NC parcial, no solo anulación total.** ADR-0011 §5 modela la anulación como
   binaria (badge `Vigente`/`Desactualizada`, sin estado `Anulado`). El Caso 2 con baja de
   una de varias inscripciones exige NC parcial, y el Caso 1 es parcial por definición.
   El invariante "un comprobante tiene a lo sumo una NC" **no** viene impuesto por WSFEv1.
3. **El control de importe es de la app.** WSFEv1 solo observa (10237). Si se admiten NC
   parciales sucesivas, la app debe garantizar que Σ NC ≤ importe de la factura asociada.
4. **La ventana de ±10 días es una restricción de producto.** No se puede fechar una NC en el
   pasado remoto: `CbteFch` ∈ [hoy−10, hoy+10] con `Concepto = 2`. Un descuento conocido hace
   un mes se documenta con una NC fechada hoy. El sistema debe registrar por separado la
   fecha del hecho económico y la fecha del comprobante.
5. **`Concepto = 2` en la NC arrastra las fechas de servicio.** `FchServDesde`/`FchServHasta`/
   `FchVtoPago` son obligatorias (10049); ADR-0011 decisión 2 ya dejó las fechas de servicio
   preparadas para ser espejadas por la NC.
6. **Plazo de 15 días como señal de UI, no como bloqueo.** RG 4540 art. 3 cuenta desde que el
   emisor toma conocimiento. Vencido, la NC sigue siendo debida.
