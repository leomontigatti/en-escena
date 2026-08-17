# Emisor asociación civil exenta (no monotributista): clase de comprobante, exención de IVA y notas de crédito

> Research contra fuentes primarias (RG 1415/2003 texto actualizado, RG 4290/2018, RG 4291/2018,
> RG 5616/2024, RG 5700/2025, RG 5866/2026, RG 4540/2019, Ley de IVA 23.349 t.o. 1997 arts. 3, 4,
> 7 y 7.1, Ley 20.628 t.o. 2019 art. 26, Decretos 493/2001, 496/2001, 845/2001 y 692/1998,
> Ley 25.920, Ley 16.656, Ley 24.800, manual WSFEv1 v4.5 y padrón público de ARCA) sobre el
> encuadre fiscal del emisor real de En Escena.
>
> Complementa [ADR-0011](../adr/superseded/0011-invoicing-concept-portion-and-surfaces.md) (concepto, porción
> y superficies), [ADR-0012](../adr/superseded/0012-arca-unreachable-contingency-and-recovery.md)
> (contingencia) y los dos research previos, que ya no están en el árbol de trabajo:
> `git show 6ab0610:docs/research/arca-nota-credito-posterior.md` y
> `git show e252d96:docs/research/repr-impresa-factura-c-monotributo.md`.
>
> **Advertencia de alcance.** Esto **no es asesoramiento contable ni legal**. El documento distingue
> tres planos: _lo que dice la norma_, _lo que está registrado en el padrón de ARCA_ y _lo que es
> criterio discutible_. La sección [§7](#7-lo-que-hay-que-confirmar-con-el-contador-de-la-entidad)
> es la única que importa antes de tocar el encuadre: la pregunta 3 **no se resuelve desde fuentes
> públicas**.

## Fuentes oficiales consultadas

- **RG 1415/2003 (AFIP) — Régimen de emisión de comprobantes**, texto actualizado (art. 16 sustituido
  por RG 5198/2022; Anexo II Título II inc. d sustituido por RG 5700/2025 y reeditado por RG 5866/2026):
  https://servicios.infoleg.gob.ar/infolegInternet/anexos/80000-84999/81316/texact.htm
  · https://biblioteca.afip.gob.ar/dcp/REAG01001415_2003_01_07
- **RG 4290/2018 (AFIP) — Obligación de emitir comprobantes electrónicos o por Controlador Fiscal**:
  https://www.argentina.gob.ar/normativa/nacional/resoluci%C3%B3n-4290-2018-313087/texto
- **RG 4291/2018 (AFIP) — R.E.C.E., régimen operativo del comprobante electrónico**:
  https://biblioteca.afip.gob.ar/dcp/REAG01004291_2018_08_02
- **RG 5616/2024 (ARCA) — Condición frente al IVA del receptor**:
  https://www.argentina.gob.ar/normativa/nacional/resoluci%C3%B3n-5616-2024-407369/texto
- **RG 5614/2024 (ARCA) — Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)**:
  https://www.argentina.gob.ar/normativa/nacional/resoluci%C3%B3n-5614-2024-407183/texto
- **RG 4540/2019 (AFIP) — Notas de crédito y/o débito. Condiciones**, texto actualizado:
  https://servicios.infoleg.gob.ar/infolegInternet/anexos/325000-329999/326036/texact.htm
- **Ley de IVA, t.o. 1997 (Decreto 280/97)** — arts. 3, 4, 7 y el artículo sin número a continuación
  del 7 ("art. 7.1"): https://servicios.infoleg.gob.ar/infolegInternet/anexos/40000-44999/42701/texact.htm
  · tabla del art. 7 inc. h: https://www.consejo.org.ar/Bib_elect/BD_May/documentos/art7_leyIVA.htm
- **Decreto 493/2001**: https://biblioteca.afip.gob.ar/dcp/DEC_C_000493_2001_04_27
  · **Decreto 496/2001**: https://biblioteca.arca.gob.ar/dcp/DEC_C_000496_2001_04_28
  · **Decreto 845/2001**: https://servicios.infoleg.gob.ar/infolegInternet/anexos/65000-69999/67460/norma.htm
  · **Decreto 692/1998 (DR de IVA), art. 33**: https://biblioteca.afip.gob.ar/dcp/DEC_C_000692_1998_06_11
- **Ley 25.920** (párrafos 3° y 4° del art. 7.1):
  https://www.argentina.gob.ar/normativa/nacional/ley-25920-98435/texto
- **Ley de Impuesto a las Ganancias 20.628, t.o. 2019 (Decreto 824/19), art. 26**:
  https://www.argentina.gob.ar/normativa/nacional/decreto-824-2019-332890/actualizacion
- **Ley 24.800 (Ley Nacional del Teatro), art. 2**:
  https://servicios.infoleg.gob.ar/infolegInternet/anexos/40000-44999/42762/texact.htm
- **WSFEv1 — Manual para el desarrollador**:
  https://www.afip.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf
- **Padrón público de ARCA** — archivo de Condición Tributaria (RG 1817):
  https://www.afip.gob.ar/genericos/cInscripcion/archivoCompleto.asp
  · **Listado completo RG 2681** (certificados de exención en Ganancias):
  https://servicioscf.afip.gob.ar/Publico/Rg2681/consulta.aspx

---

## 0. Resumen ejecutivo

| Pregunta                                                                         | Respuesta                                                                                                                                                                                                                                                                                                                                                                                                                           | Confianza                                                                                                          |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1 — ¿Qué clase emite un sujeto **Exento** o **No alcanzado** en IVA?             | **Clase C.** RG 1415 **art. 16 inc. a)** (texto según RG 5198/2022). No es el Anexo IV: la clase la fijan los arts. 15/16/17 del cuerpo de la RG. La condición del **emisor** decide C; la del receptor sólo subdivide A vs. B cuando el emisor es RI.                                                                                                                                                                              | **Alta**                                                                                                           |
| 1b — ¿Mismo fundamento que el monotributista?                                    | **No.** Mismo artículo, **incisos distintos**: exento → art. 16 inc. a); monotributo → art. 16 inc. b). Sustantivamente: el exento no genera débito fiscal discriminable; el monotributista sustituyó el IVA por el impuesto integrado (Anexo Ley 24.977 art. 28).                                                                                                                                                                  | **Alta**                                                                                                           |
| 2 — ¿La exención de Ganancias arrastra la de IVA?                                | **No.** Son impuestos distintos y técnicas distintas: Ganancias tiene exención **subjetiva** (art. 26 inc. f Ley 20.628 + certificado RG 2681); IVA **no tiene exención subjetiva** para asociaciones civiles — el art. 7 enumera **operaciones**. El certificado de Ganancias no dice nada sobre IVA.                                                                                                                              | **Alta**                                                                                                           |
| 3 — ¿El servicio (inscripción cobrada a academias) está realmente exento de IVA? | **Probablemente NO.** El art. 7 inc. h) ap. 6 no exige que el receptor sea socio (basta la relación directa con los fines específicos), pero el **art. 7.1 lo desactiva por texto expreso** para "los espectáculos y reuniones de carácter artístico … **de danza** … deportivos". Un certamen de danza es literalmente eso.                                                                                                        | **Media-alta** en la lectura literal; **la conclusión práctica depende de hechos que sólo tiene el contador** (§7) |
| 3b — ¿Podría corresponder Factura A/B en vez de C?                               | **Sí, si el criterio del §3 se confirma.** Una asociación civil **no puede ser monotributista** (Anexo Ley 24.977 art. 2: sólo personas humanas y sucesiones indivisas), así que las únicas opciones son **Exento** (clase C) o **Responsable Inscripto** (clases A/B).                                                                                                                                                             | **Alta** sobre el espacio de opciones                                                                              |
| 3c — ¿Qué dice hoy el padrón de ARCA?                                            | **CUIT 30-71761159-0 · Proyecciones Artísticas Asociación Civil · IVA = `EX` (Exento)**, Ganancias `EX` con certificado RG 2681 vigente 01/01/2026–31/12/2026, **inciso f**. Actividades 949990 (servicios de asociaciones n.c.p.) y **900021 (composición y representación de obras teatrales, musicales y artísticas)**.                                                                                                          | **Alta** (dato empírico, padrón del 01/08/2026)                                                                    |
| 4 — Códigos `CbteTipo` clase C en WSFEv1                                         | **11** Factura C · **12** Nota de Débito C · **13** Nota de Crédito C · **15** Recibo C (y 211/212/213 FCE MiPyME, otro régimen). Validación 10007: _"11, 12, 13, 15, 211, 212, 213 para los clase C"_.                                                                                                                                                                                                                             | **Alta**                                                                                                           |
| 4b — ¿El exento emite NC/ND en las mismas condiciones que un monotributista?     | **Sí, idénticas.** RG 4540/2019 no distingue por tipo de sujeto en ningún artículo; RG 1415 art. 16 mete a exentos y monotributistas en la misma clase. **Ninguna diferencia**.                                                                                                                                                                                                                                                     | **Alta**                                                                                                           |
| 5 — ¿Qué difiere operativamente del monotributo?                                 | Cuatro cosas: (a) la obligación de FE nace de **RG 4290 art. 6 inc. c)** (exentos), no del cronograma de monotributo; (b) RG 4291 art. 6 **prohíbe al exento el aplicativo RECE** — sólo WebService o "Comprobantes en línea"; (c) la leyenda del emisor es **"IVA EXENTO"** (RG 1415 Anexo II ap. A Tít. I), no "Responsable Monotributo"; (d) **no aplican topes, categorías ni recategorización** — no puede adherir al régimen. | **Alta**                                                                                                           |
| 5b — ¿Aplica la condición IVA del receptor?                                      | **Sí, y sin restricción de valores en clase C.** RG 5616/2024 art. 2. Las **once** condiciones son admisibles para clase C (única clase sin restricción).                                                                                                                                                                                                                                                                           | **Alta**                                                                                                           |
| 5c — ¿Aplica el Régimen de Transparencia Fiscal (RG 5614/2024)?                  | **No.** Ley 27.743 art. 98 y RG 5614 art. 2 pto. 5 recaen sobre el **emisor responsable inscripto**. Un emisor clase C no tiene "IVA Contenido" que exhibir. Igual que el monotributista: sin cambio respecto del research previo.                                                                                                                                                                                                  | **Alta** en la norma; **media** en la práctica (la divulgación de ARCA es contradictoria)                          |
| 6 — ¿Restricciones distintas para la NC de un exento?                            | **Ninguna.** Mismo art. 2 (sólo el emisor original), mismo art. 3 (mismo receptor, comprobante asociado o `PeriodoAsoc`, **15 días corridos**). RG 4540 art. 5 admite RG específicas; **no existe una para entidades exentas**.                                                                                                                                                                                                     | **Alta**                                                                                                           |
| **Hallazgo colateral (no preguntado, pero grave)**                               | El sistema manda **`DocTipo` 99 / `DocNro` 0 (consumidor final anónimo)** y `CondicionIVAReceptorId` 5 fijo. Una **academia de danza es un negocio, no un consumidor final**: RG 1415 Anexo II ap. A Tít. II incs. a)/c)/e) exigen **CUIT del receptor sin umbral de importe**. El umbral de $10.000.000 vive en el **inc. d)**, que sólo rige "cuando se trate de un sujeto que revista el carácter de consumidor final".          | **Alta**                                                                                                           |

---

## 1. La clase de comprobante la fija la condición del emisor

La premisa "la clase sale del Anexo IV de la RG 1415" es falsa. El Anexo IV regula **situaciones
especiales** por operación o actividad (notas de crédito, operaciones por cuenta de terceros, peaje,
etc.). La clase la fijan los **arts. 15, 16 y 17** del cuerpo, Título II, Capítulo E.

**RG 1415 art. 16**, texto vigente según el art. 10 pto. 2 de la **RG 5198/2022** (B.O. 31/5/2022,
vigencia 1/6/2022):

> "Deben estar identificados con la letra "C", los comprobantes previstos en el artículo 8°, inciso
> a) —excepto la factura de exportación y los tiques emitidos a través de Controladores Fiscales—,
> que emitan los responsables que se indican a continuación:
> **a) Sujetos exentos o no responsables, ante el impuesto al valor agregado.**
> **b) Sujetos adheridos al Régimen Simplificado para Pequeños Contribuyentes (RS)."**
> ([RG 1415 art. 16](https://servicios.infoleg.gob.ar/infolegInternet/anexos/80000-84999/81316/texact.htm))

**Confirmado: una asociación civil exenta en IVA emite Factura C.** Y el fundamento **sí difiere**
del monotributista, aunque ambos caigan en el mismo artículo:

|                         | Base reglamentaria          | Base sustantiva                                                                                                      |
| ----------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Asociación civil exenta | RG 1415 art. 16 **inc. a)** | No hay débito fiscal que discriminar: la operación está eximida por el art. 7 de la Ley de IVA (si lo está — ver §3) |
| Monotributista          | RG 1415 art. 16 **inc. b)** | El impuesto integrado **sustituye** al IVA (Anexo Ley 24.977 art. 28)                                                |

Mapa completo emisor × receptor:

| Emisor                                     | Receptor                                                  | Clase                  |
| ------------------------------------------ | --------------------------------------------------------- | ---------------------- |
| Responsable Inscripto                      | RI o Monotributo                                          | **A** (art. 15 inc. a) |
| Responsable Inscripto                      | Exento, no responsable, consumidor final, no categorizado | **B** (art. 15 inc. b) |
| **Exento / no responsable / no alcanzado** | cualquiera                                                | **C** (art. 16 inc. a) |
| Monotributista                             | cualquiera                                                | **C** (art. 16 inc. b) |
| Cualquiera, operación de exportación       | —                                                         | **E** (art. 17)        |

**La clase no se elige: se deriva de la condición registrada del emisor.** Es la razón por la que el
enum `comprobanteIssuerIvaCondition` de una sola variante en `app/db/schema/comprobantes.ts` es una
modelización correcta, y también la razón por la que **si el encuadre cambia, cambia la clase** y
el modelo entero (ver §8).

---

## 2. Exención de Ganancias ≠ exención de IVA

Son dos impuestos con **dos técnicas exentivas distintas**.

**Ganancias — exención subjetiva.** Ley 20.628 t.o. 2019 **art. 26 inc. f)** (ex art. 20 inc. f):

> "Las ganancias que obtengan las asociaciones, fundaciones y entidades civiles de asistencia social,
> salud pública, caridad, beneficencia, educación e instrucción, científicas, literarias, **artísticas**,
> gremiales y las de cultura física o intelectual, siempre que tales ganancias y el patrimonio social
> se destinen a los fines de su creación, y en ningún caso se distribuyan, directa o indirectamente,
> entre los socios. **Se excluyen de esta exención aquellas entidades que obtienen sus recursos, en
> todo o en parte, de la explotación de espectáculos públicos**, juegos de azar, carreras de caballos
> y actividades similares […]"
> ([Ley 20.628 t.o. 2019 art. 26 inc. f](https://www.argentina.gob.ar/normativa/nacional/decreto-824-2019-332890/actualizacion))

Se reconoce mediante el **certificado de exención de la RG (AFIP) 2681/2009**. Es declarativo, no
constitutivo, pero sin él la entidad sufre retenciones.

> ⚠️ **Riesgo colateral, digno de mención al contador.** El segundo párrafo del inc. f) excluye a las
> entidades que obtienen sus recursos "en todo o en parte" de la **explotación de espectáculos
> públicos**. Un certamen de danza con público pagante es candidato natural a esa calificación. El
> certificado hoy está vigente e inscripto bajo el inciso f, así que ARCA no lo aplicó — pero es una
> exposición latente, no una cuestión cerrada. Confianza **media** (el texto es claro; su aplicación
> a este caso es criterio).

**IVA — exención objetiva.** Ley 23.349 t.o. 1997 **art. 7, primer párrafo**:

> "Estarán exentas del impuesto establecido por la presente ley, las ventas, las locaciones indicadas
> en el inciso c) del artículo 3° y las importaciones definitivas que tengan por objeto las cosas
> muebles incluidas en este artículo **y las locaciones y prestaciones comprendidas en el mismo, que
> se indican a continuación** […]"

La técnica es de **enumeración de operaciones**. No existe un "artículo de sujetos exentos". La única
puerta subjetivamente teñida es el art. 7 inc. h) ap. 6, que remite a las entidades del art. 20 (hoy 26) de Ganancias — pero **incluso ésa es condicional**: exige que el servicio "se relacione en forma
directa con sus fines específicos". Y en §3 se ve que hay una regla posterior que la desactiva.

**Consecuencia inmediata**: la frase "la asociación es exenta, por eso factura C" es un atajo. El
razonamiento correcto es: la asociación está **registrada como IVA Exento** en el padrón → RG 1415
art. 16 inc. a) → clase C. La pregunta de si esa **registración es la correcta** es §3.

### 2.1. Qué dice el padrón de ARCA sobre el emisor real

Dato empírico obtenido de los dos endpoints públicos de ARCA (archivo de Condición Tributaria RG 1817
y listado completo RG 2681), ambos descargados el **01/08/2026**:

| Dato                  | Valor                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| CUIT                  | 30-71761159-0                                                                                          |
| Denominación          | `PROYECCIONES ARTISTICAS ASOCIACION CIVIL`                                                             |
| **IVA**               | **`EX` — Exento**                                                                                      |
| Ganancias             | `EX` — Exento (inscripta en Ganancias Sociedades, obligada a presentar DDJJ)                           |
| Monotributo           | `NI` — No inscripto                                                                                    |
| Certificado RG 2681   | N° `2722026031151`, estado **Certificado emitido**, **inciso f**, vigencia **01/01/2026 – 31/12/2026** |
| Actividad principal   | `949990` Servicios de asociaciones n.c.p. (alta 05/2022)                                               |
| Actividad secundaria  | **`900021` Composición y representación de obras teatrales, musicales y artísticas** (alta 05/2022)    |
| Inicio de actividades | 05/2022 · Domicilio fiscal: Dr. Manuel Belgrano 81, Villa Carlos Paz, Córdoba                          |

**Lectura.** Tal como está hoy empadronada, la clase C es la única que la entidad **puede** emitir, y
el código del repo es correcto. Pero el alta secundaria en **900021 — representación de obras
artísticas** es exactamente la actividad que el art. 7.1 de la Ley de IVA neutraliza (§3.2). El
padrón no valida el encuadre: registra lo que el contribuyente declaró.

---

## 3. La pregunta crítica: ¿el servicio está realmente exento de IVA?

Encuadre positivo primero, porque es donde arranca todo: la cuota de inscripción es una **prestación
onerosa sin relación de dependencia**, tipificada en el **art. 3 inc. e) ap. 21** ("las restantes
locaciones y prestaciones"), y la entidad es **sujeto pasivo por el art. 4 inc. e)** ("presten
servicios gravados"), con total independencia de que no persiga fines de lucro. **No hay "no
alcanzado" acá.** O está exenta por el art. 7, o está gravada.

### 3.1. El art. 7 inc. h) ap. 6 NO exige que el receptor sea socio

Texto vigente (sustituido por el **Decreto 493/2001** art. 1 inc. e):

> "**6)** Los servicios prestados por obras sociales creadas o reconocidas por normas legales
> nacionales o provinciales, por instituciones, entidades y asociaciones comprendidas en los incisos
> f), g) y m) del artículo 20 de la Ley de Impuesto a las Ganancias […], por instituciones políticas
> sin fines de lucro y legalmente reconocidas, y por los colegios y consejos profesionales, **cuando
> tales servicios se relacionen en forma directa con sus fines específicos**."
> ([art. 7 inc. h ap. 6](https://www.consejo.org.ar/Bib_elect/BD_May/documentos/art7_leyIVA.htm))

**La premisa del ticket ("exime servicios a los socios") es incorrecta.** El ap. 6 es un test
**objetivo-funcional** sobre el servicio, no un test de membresía. Que las academias sean terceros
**no lo descalifica por sí solo**. La prueba está en el contraste interno de la propia ley, que sí
sabe exigir el vínculo personal cuando quiere:

- **Ap. 7, 3er párrafo** (sanidad): la exención no aplica "en la medida en que **los beneficiarios de
  la prestación no fueren matriculados o afiliados directos o integrantes de sus grupos familiares**".
- **Art. 7.1**: reserva excepciones para obras sociales "a sus **afiliados obligatorios**" y para
  colegios profesionales "a sus **matriculados, afiliados directos y grupos familiares**".
- **Ganancias art. 26 inc. g)** (mutuales): "los beneficios que **éstas proporcionen a sus asociados**".

Ninguna de esas fórmulas está en el ap. 6.

Nota sobre "cuotas sociales": no figuran en el ap. 6. Quedan fuera de IVA porque no retribuyen una
prestación individualizada del art. 3, no porque una exención las nombre. Una **cuota de inscripción
cobrada a un tercero no socio es contraprestación de un servicio concreto** — no es una cuota social.
Confianza **alta**.

Nota de renumeración: la Ley de IVA sigue remitiendo a "los incisos f), g) y m) del artículo 20 …
t.o. 1997". En el **t.o. 2019** esos incisos son **f), g) y l)** del **art. 26** (las asociaciones
deportivas y de cultura física pasaron de m) a l). Nadie discute la correspondencia en la práctica.

### 3.2. El art. 7.1 desactiva el ap. 6 justamente para "de danza" — el hallazgo decisivo

El artículo sin número agregado a continuación del art. 7 ("art. 7.1"), texto vigente tras
Dto. 493/2001 → Dto. 496/2001 → Ley 25.920 → Ley 26.115:

> "Respecto de los servicios de asistencia sanitaria, médica y paramédica y de los **espectáculos y
> reuniones de carácter artístico, científico, cultural, teatral, musical, de canto, DE DANZA,
> circenses, DEPORTIVOS y cinematográficos** —excepto para los espectáculos comprendidos en el punto
> 10, del inciso h) del primer párrafo del artículo 7º y para los servicios brindados por las obras
> sociales […] a sus afiliados obligatorios y por los colegios y consejos profesionales y las cajas
> de previsión social para profesionales, a sus matriculados, afiliados directos y grupos
> familiares—, **no serán de aplicación las exenciones previstas en el punto 6, del inciso h) del
> primer párrafo del artículo 7º, ni las dispuestas por otras leyes nacionales —generales, especiales
> o estatutarias—, decretos o cualquier otra norma de inferior jerarquía**, que incluya taxativa o
> genéricamente al impuesto de esta ley, excepto las otorgadas en virtud de regímenes de promoción
> económica […]
>
> Sin perjuicio de las previsiones del primer párrafo de este artículo, en ningún caso serán de
> aplicación respecto del impuesto de esta ley las exenciones genéricas de impuestos, en cuanto no lo
> incluyan taxativamente.
>
> La limitación establecida en el párrafo anterior no será de aplicación cuando la exención referida
> a todo impuesto nacional se encuentre prevista en leyes vigentes a la fecha de entrada en vigencia
> de la ley por la que se incorpora dicho párrafo, incluida la dispuesta por el **artículo 3°, inciso
> d) de la Ley 16.656** […]"
> ([Dto. 496/2001](https://biblioteca.arca.gob.ar/dcp/DEC_C_000496_2001_04_28) ·
> [Ley 25.920](https://www.argentina.gob.ar/normativa/nacional/ley-25920-98435/texto))

**Un certamen de danza es, literalmente, una "reunión de carácter … de danza".** El art. 7.1 no
condiciona nada a los fines específicos ni a la calidad del receptor: **bloquea el ap. 6 por la
materia de la prestación**. Y la paradoja es cruel: cuanto más claramente el estatuto diga "organizar
competencias de danza", más nítidamente la prestación queda descripta como una reunión de danza y
más se activa el bloqueo.

Cronología completa, porque hace a la fuerza del argumento:

| Norma                        | Qué hizo                                                                                                                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dto. 493/2001 art. 1 inc. e) | Sustituye el **ap. 6** (texto vigente hoy)                                                                                                                                                                                            |
| Dto. 493/2001 art. 1 inc. f) | **Elimina los ap. 10, 11 y 21**. El ap. 10 de entonces era exactamente "los espectáculos y reuniones de carácter artístico, científico, cultural, teatral, musical, de canto, **de danza**, circenses, deportivos y cinematográficos" |
| Dto. 493/2001 art. 1 inc. h) | Sustituye el art. 7.1 con la enumeración que incluye "de danza"                                                                                                                                                                       |
| Dto. 496/2001                | Reincorpora como **ap. 10** sólo los espectáculos teatrales de la Ley 24.800, y los exceptúa en el art. 7.1                                                                                                                           |
| Dto. 845/2001                | Incorpora el **ap. 11** (deportivo amateur)                                                                                                                                                                                           |
| Ley 25.920 (9/9/2004)        | Agrega los párrafos 3° y 4° al art. 7.1                                                                                                                                                                                               |
| Ley 26.115 (19/7/2006)       | Deroga la palabra "teatrales" de la salvedad del art. 7.1                                                                                                                                                                             |

O sea: **la exención genérica de espectáculos de danza existió y fue derogada en 2001.** Lo que quedó
es un bloqueo expreso.

### 3.3. Los ap. 10 y 11 eximen el ACCESO, no la inscripción

Texto vigente:

> **10)** "Los espectáculos de carácter teatral comprendidos en la Ley Nº 24.800 y la contraprestación
> exigida para el ingreso a conciertos o recitales musicales **cuando la misma corresponda
> exclusivamente al acceso a dicho evento**."
>
> **11)** "Los espectáculos de carácter deportivo amateur, en las condiciones que al respecto
> establezca la reglamentación, **por los ingresos que constituyen la contraprestación exigida para
> el acceso a dichos espectáculos**."

Y el **DR de IVA (Dto. 692/1998) art. 33**, texto según Dto. 1230/2001, cierra el ap. 11:

> "La exención dispuesta en el punto 11 […] comprende **los ingresos que constituyan la
> contraprestación exigida para el acceso a los espectáculos deportivos**, cuyos protagonistas sean
> **deportistas aficionados o amateurs**, entendiéndose por tales a aquellas personas físicas que
> **no perciben retribución por practicar un deporte**."

Refuerzo desde otro lado del articulado: el **art. 7 inc. c)** exime los "**billetes de acceso** a
espectáculos teatrales comprendidos en el artículo 7º, inciso h), apartado 10".

**Conclusión: la cuota de inscripción de una academia no es un billete de acceso.** Es el precio del
servicio de admisión a competir — una prestación distinta, con otro prestatario y otra
contraprestación, tipificada en el art. 3 inc. e) ap. 21. **Aunque las entradas al público
resultaran exentas, eso no eximiría la inscripción.** Son dos hechos imponibles separados.
Confianza **alta**.

El ap. 10 vía Ley 24.800 merece una mención honesta, porque es el único argumento no frívolo del
lado de la exención. El **art. 2 inc. b) de la Ley 24.800** incluye entre las modalidades teatrales
"expresión corporal, de cámara, **teatro danza** y otras que posean carácter experimental". Pero:
(i) "teatro danza" es un género escénico específico, no "certamen de danza"; (ii) el art. 2 exige
"representación de un hecho dramático" ante un "auditorio"; (iii) **aun encuadrando, el ap. 10 exime
el espectáculo/acceso, no el arancel del participante**. Confianza de que el ap. 10 **no** cubre la
inscripción: **media-alta**.

### 3.4. Las exenciones genéricas de otras leyes tampoco salvan

El 4° párrafo del art. 7.1 rescata las exenciones de "todo impuesto nacional" anteriores al 9/9/2004,
mencionando expresamente la **Ley 16.656 art. 3 inc. d)**. Pero esa ley exime a las entidades civiles
sin fines de lucro dedicadas a **educación, asistencia social y salud pública** — organizar certámenes
de danza no es ninguna de las tres, salvo un encuadre educativo que habría que sostener con hechos.

Además, la jurisprudencia entendió que ese rescate **no opera** para los supuestos del primer párrafo
del art. 7.1. _QUETRA SA (TF 34577-I) c/ DGI_, CNACAF, 15/12/2022: "La excepción que introdujo la ley
25.920 … no era aplicable respecto de los servicios enumerados en el primer párrafo del artículo
7.1". Confianza **alta** sobre la existencia del criterio, **media** sobre que sea pacífico.

### 3.5. El argumento del otro lado: inconstitucionalidad del Dto. 493/2001

Es real y es fuerte: el Decreto 493/2001 **eliminó exenciones por decreto**, en uso de la delegación
de la Ley 25.414, lo que colisiona con el principio de reserva de ley tributaria (art. 76 CN). La
CNACAF, en _Club Atlético Huracán Asociación Civil c/ DGI_, declaró **inconstitucional el Dto. 493/01**
en cuanto excluía espectáculos deportivos de la exención, con dictamen concordante de la PGN.

Dos observaciones que matizan su utilidad práctica:

1. **La enumeración "de danza" del art. 7.1 también proviene del Dto. 493/2001.** Si el decreto cae,
   cae el bloqueo. Es decir: el argumento, de prosperar, resuelve el caso a favor de la entidad.
2. **Pero hay que litigarlo.** Un contribuyente no puede autoliquidar como exento invocando una
   inconstitucionalidad no declarada respecto de él. En primera instancia el TFN había confirmado el
   ajuste de ARCA en el mismo caso. Mientras tanto, el riesgo lo soporta la entidad: determinación de
   oficio, intereses (art. 37 Ley 11.683) y multa por omisión (art. 45).

Confianza: **media-alta** sobre la existencia del fallo; **baja** sobre que ARCA lo acate en sede
administrativa.

### 3.6. Veredicto

**En la lectura literal y vigente de la norma, la cuota de inscripción cobrada a academias no socias
está gravada en IVA.** Si eso se confirma, la entidad debería estar **Responsable Inscripta** y emitir
**Factura A** a academias RI (con IVA discriminado al 21%) y **Factura B** a academias exentas, de
monotributo o consumidores finales — **no clase C**. Eso cambiaría el modelo entero.

Contrapesos honestos, que impiden cerrar el punto desde acá:

- La entidad **está empadronada como IVA Exento desde 06/2022** y con certificado de Ganancias vigente
  bajo el inciso f. Alguien tomó ese encuadre y ARCA no lo objetó en cuatro años.
- El requisito de "relación directa con los fines específicos" del ap. 6 **se cumple con holgura** si
  el estatuto dice que el objeto es organizar certámenes de danza. Donde la entidad pierde es en el
  art. 7.1, no en el ap. 6.
- Si la inscripción retribuye sustancialmente un servicio de **enseñanza / formación** (clínicas,
  masterclasses, devoluciones técnicas del jurado) más que la participación en un espectáculo, se
  abre otro encuadre — pero requiere sustento real y documentado, no una etiqueta.
- Si la entidad fuera RI, **recuperaría crédito fiscal** de todo el costo del evento (alquiler de sala,
  sonido, escenografía, jurados). El impacto neto del 21% puede ser mucho menor de lo que parece.
  También aparecería la obligación de **prorratear crédito fiscal** (art. 13) por tener operaciones
  gravadas y no gravadas.

**Esto es exactamente lo que hay que llevarle al contador (§7), no una conclusión que el sistema
pueda tomar por su cuenta.**

---

## 4. Notas de crédito y débito: sin ninguna diferencia por ser exento

### 4.1. Códigos `CbteTipo` de clase C en WSFEv1

La validación **10007** del manual del desarrollador enumera el universo completo:

> "Campo CbteTipo sea: … **- 11, 12, 13, 15, 211, 212, 213 para los clase C.** … Consultar método
> `FEParamGetTiposCbte`."

| Código          | Etiqueta del manual                                                      | ¿Se usa en En Escena?              |
| --------------- | ------------------------------------------------------------------------ | ---------------------------------- |
| **11**          | `Factura C`                                                              | Sí (`FACTURA_C_CBTE_TIPO`)         |
| **12**          | `Nota de Débito C`                                                       | No (no hay caso de uso hoy)        |
| **13**          | `Nota de Crédito C`                                                      | Sí (`NOTA_CREDITO_C_CBTE_TIPO`)    |
| **15**          | `Recibo C`                                                               | No                                 |
| 211 / 212 / 213 | `Factura / Nota de Débito / Nota de Crédito electrónica MiPyMEs (FCE) C` | No — otro régimen (FCE), no aplica |

Corroborado dentro del mismo manual por la observación **10188** ("…o **11 - Factura C** o **15 -
Recibo C**…") y la validación **812**. Confianza **alta**.

> ⚠️ Varios SDK de terceros (p. ej. `afipts.com`) publican un mapeo **erróneo**
> ("12 Recibo C / 13 ND C / 14 NC C"). El manual de ARCA lo refuta. Los valores del repo (11 y 13)
> son correctos.

Los `Desc` literales de `FEParamGetTiposCbte` no están en el manual (sólo el esquema `Id`/`Desc`/
`FchDesde`/`FchHasta`). Si el string exacto llegara a importar para el impreso, conviene volcarlo
desde homologación con `scripts/arca-spike-homo.ts` y congelarlo como fixture. Confianza **media**
sobre los bytes exactos.

### 4.2. RG 4540/2019 no distingue por tipo de sujeto

Leída completa: **ningún artículo de la RG 4540 menciona la condición del emisor frente al IVA**. El
art. 1 la aplica a "los diversos regímenes de facturación vigentes", genéricamente. Las cuatro reglas
duras ya recogidas en el research de notas de crédito valen idénticas para un exento:

1. **Emisor**: sólo quien emitió el original (art. 2).
2. **Receptor**: sólo el mismo receptor del original (art. 3).
3. **Vinculación**: comprobante asociado **o** `PeriodoAsoc`; si el ajuste es por diferencia de precio
   o cantidad, identificación **individual** (art. 3).
4. **Plazo**: **15 días corridos** desde que surge el hecho (art. 3, último párrafo).

El **art. 5** admite que una RG específica desplace a la RG 4540 — y **no existe una RG específica
para entidades exentas**. Confianza **alta**.

Del lado técnico, WSFEv1 tampoco pone ninguna compuerta por condición del emisor:

- Validación **10040**: "Para 12 o 13 pueden asociarse **11, 12, 13 y 15**" — una NC C puede
  encadenar sobre otra NC/ND C, o asociar un Recibo C.
- `CbtesAsoc` es **opcional** para 12/13: WSFEv1 otorga CAE a una NC C **sin asociación**. La
  obligación de vincular de la RG 4540 es **legal**, y la app tiene que hacerla cumplir sola — ARCA
  no rechaza por eso. (Sólo el régimen FCE la hace obligatoria.) Esto ya está implementado en
  `emit-nota-credito.server.ts`.
- Errores **10247/10248** (CUIT del receptor inactivo o no confiable) son excluyentes "salvo si el
  tipo de comprobante informado es Nota de Crédito" — hay una dispensa deliberada para NC.
- Observación **10237** (importe de la NC superior al asociado) sigue siendo **no excluyente**.

**Diferencia con el monotributista: ninguna.** El único matiz sigue siendo el ya registrado en el
research previo, y ahora es más simple: ni el exento ni el monotributista liquidan IVA, así que
ninguno de los dos tiene la necesidad de crédito fiscal que hace obligatoria la NC para un RI
(Ley de IVA art. 12 inc. b). Confianza **alta**.

---

## 5. Qué difiere operativamente del monotributo

### 5.1. La obligación de facturar electrónicamente

La universalización **no** es la RG 4291 (ésa es el régimen operativo, el R.E.C.E.). La obligación
subjetiva está en la **RG 4290/2018**:

- **Art. 2**: sujetos comprendidos — a) RI en IVA; b) adheridos al RS; **c) exentos en el IVA**;
  d) no alcanzados.
- **Art. 6**: "Se encuentran obligados a utilizar […] 'Controlador Fiscal' **y/o a emitir comprobantes
  electrónicos originales en los términos de la Resolución General N° 4.291** […] **c) Los exentos en
  el impuesto al valor agregado.**"
- **Anexo, cronograma para exentos**: facturación del último año calendario ≥ $1.000.000 → desde el
  **1/11/2018**; < $1.000.000 → desde el **1/1/2019**.

**Restricción propia del exento**, y es la única diferencia operativa de fondo — **RG 4291 art. 6**:

> "Los sujetos adheridos al Régimen Simplificado para Pequeños Contribuyentes (RS) **y los sujetos que
> revistan la calidad de exentos en el impuesto al valor agregado, únicamente podrán efectuar la
> solicitud de autorización de emisión de comprobantes electrónicos originales mediante las opciones
> indicadas en los incisos b) y c)**"

Es decir: **WebService** o **"Comprobantes en línea"**. El aplicativo RECE (inc. a) está vedado. En
Escena usa WebService, así que cumple. Confianza **alta**.

### 5.2. Condición frente al IVA del receptor — RG 5616/2024

La premisa "es la RG 5198/2022" es incorrecta: la RG 5198 implementa el "Facturador" para
monotributistas. **La norma es la RG (ARCA) 5616/2024** (B.O. 18/12/2024), **art. 2, segundo párrafo**:

> "En los comprobantes electrónicos a emitir en los términos de la citada resolución general se deberá
> identificar la condición ante el impuesto al valor agregado del cliente (comprador, locatario o
> prestatario) con relación a la operación que se documenta."

No distingue por clase ni por condición del emisor: **es obligatorio también en clase C**. Su art. 4
inc. a) fijó el WebService como de uso obligatorio desde el **15/4/2025**; ARCA fue postergando el
_rechazo_ por omisión a través del manual del desarrollador y no por resolución (hoy, 1/8/2026, el
manual trae el error **10246** como validación **excluyente**). Confianza **alta** sobre la
obligatoriedad, **baja** sobre la cronología exacta de las prórrogas — que da igual: hay que enviarlo
siempre, y enviarlo nunca produce rechazo.

Valores admisibles, de `FEParamGetCondicionIvaReceptor` (el método acepta un filtro `ClaseCmp` con
valores `A`, `ALEY`, `B`, `C` o `49`):

| Id  | Desc                                           | A/ALEY |  B  | **C** | 49  |
| --- | ---------------------------------------------- | :----: | :-: | :---: | :-: |
| 1   | IVA Responsable Inscripto                      |   X    |     | **X** |     |
| 4   | IVA Sujeto Exento                              |        |  X  | **X** |     |
| 5   | Consumidor Final                               |        |  X  | **X** |  X  |
| 6   | Responsable Monotributo                        |   X    |     | **X** |     |
| 7   | Sujeto No Categorizado                         |        |  X  | **X** |     |
| 8   | Proveedor del Exterior                         |        |  X  | **X** |     |
| 9   | Cliente del Exterior                           |        |  X  | **X** |     |
| 10  | IVA Liberado – Ley N° 19.640                   |        |  X  | **X** |     |
| 13  | Monotributista Social                          |   X    |     | **X** |     |
| 15  | IVA No Alcanzado                               |        |  X  | **X** |     |
| 16  | Monotributo Trabajador Independiente Promovido |   X    |     | **X** |     |

**La clase C es la única sin restricción: las once condiciones son admisibles.** Confianza **alta**
sobre la lista de valores; **media-alta** sobre la asignación de columnas (el PDF de ARCA renderiza
la matriz con offsets que no alinean con los encabezados). Si la certeza importa, llamar a
`FEParamGetCondicionIvaReceptor` con `ClaseCmp = "C"` en homologación y congelar la respuesta.

Errores a codificar contra: **10242** (valor no permitido), **10243** (no válido para la clase),
**10246** (obligatorio).

### 5.3. Leyendas del impreso específicas del emisor exento

**RG 1415 Anexo II, Apartado A, Título I** (respecto del emisor) exige la leyenda de condición del
catálogo `"IVA RESPONSABLE INSCRIPTO"`, **`"IVA EXENTO"`**, `"NO RESPONSABLE IVA"`,
`"RESPONSABLE MONOTRIBUTO"`, `"MONOTRIBUTO TRABAJADOR INDEPENDIENTE PROMOVIDO"`,
`"MONOTRIBUTISTA SOCIAL"`, según corresponda. **Es la única leyenda que cambia respecto del
monotributista**, y el repo ya la tiene bien (`EMISOR_CONDICION_IVA_LABEL = "IVA Exento"`).

Lo que **NO** lleva un emisor exento:

- **La leyenda de crédito fiscal de la Ley 27.618** (RG 1415 art. 15 inc. a, texto según RG 5003/2021)
  es del **emisor RI que factura A a un monotributista**. No aplica ni al exento ni a la clase C.
- **El bloque de Transparencia Fiscal (Ley 27.743 / RG 5614/2024).** Ley 27.743 **art. 98** sustituye
  el art. 39 de la Ley de IVA y el sujeto obligado es "**un responsable inscripto**"; exentos y
  monotributistas aparecen ahí como **receptores**. Y la RG 5614 art. 2 pto. 5 sustituye el
  Anexo II ap. A **Título IV inciso a) — "Emisor responsable inscripto en el impuesto al valor
  agregado"**, y sólo ése. Un emisor clase C no tiene "IVA Contenido" que exhibir. **Conclusión
  idéntica a la del research de monotributo: el bloque no va.** Confianza **alta** en la norma;
  **media** en la práctica, porque la página de divulgación de ARCA dice que la medida alcanza "a
  todo el universo de contribuyentes" — material de divulgación que choca con el texto de la RG.
  Verificable empíricamente: emitir una Factura C de prueba en "Comprobantes en Línea" y ver si el
  PDF trae el bloque.
- **Nada sobre el certificado de exención.** Ni la RG 1415 Anexo II ni la RG 2681/2009 exigen
  consignar número ni vigencia del certificado en el comprobante. Al contrario: el modelo de
  certificado pone la carga en el tercero, que debe "verificar en el citado sitio 'web' la condición
  de exento del beneficiario". Confianza **media-alta** (evidencia negativa).

### 5.4. Nada del Monotributo aplica

**Anexo de la Ley 24.977, art. 2** define un universo subjetivo **cerrado**:

> "A los fines de lo dispuesto en este régimen, se consideran pequeños contribuyentes: 1) **Las
> personas humanas** que realicen venta de cosas muebles, locaciones, prestaciones de servicios y/o
> ejecuciones de obras […]; 2) **Las personas humanas** integrantes de cooperativas de trabajo […];
> y 3) **Las sucesiones indivisas** continuadoras de causantes adheridos al Régimen Simplificado […]"

Una asociación civil (persona jurídica del art. 168 CCyC) **no puede adherir al Monotributo bajo
ninguna hipótesis**. Por lo tanto **no aplican**: topes anuales de ingresos brutos por categoría
(art. 8), recategorización semestral (art. 9), precio máximo unitario, límite de actividades ni
exclusión de pleno derecho (art. 20). Confianza **alta**. Consistente con el padrón: Monotributo `NI`.

Encuadre correcto, en una tabla:

| Eje               | Asociación civil exenta                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| IVA               | Sujeto **exento** — por operación (art. 7), no por sujeto. Ver §3                                 |
| Ganancias         | Exenta por art. 26 inc. f) Ley 20.628 t.o. 2019, con certificado RG 2681/2009                     |
| Facturación       | **Régimen general de la RG 1415/2003** — no hay régimen especial. Clase C por art. 16 inc. a)     |
| Modalidad         | FE obligatoria por RG 4290 art. 6 inc. c); operativa RG 4291, **sólo WS o Comprobantes en línea** |
| Libro IVA Digital | Alcanzada — es el motivo declarado en los considerandos de la RG 5616/2024                        |

> **Pendiente no leído**: el **Anexo IV, Apartado B, ptos. 6 y 7** de la RG 1415 ("Entidades
> deportivas y asociaciones comprendidas en los incisos f) y m) del art. 26 de la Ley de Impuesto a
> las Ganancias" e "instituciones educativas de gestión privada"), **ambos sustituidos por la
> RG 5866/2026 con vigencia 1/7/2026**. Puede contener excepciones a la obligación de emitir
> comprobante o autorización para consolidar operaciones mensuales en un único comprobante
> electrónico. **Hay que leerlo antes de cerrar cualquier decisión de modelo.**

---

## 6. Hallazgo colateral: el receptor no es un consumidor final

No estaba en las preguntas, pero es la corrección más accionable de todo este research.

El sistema manda hoy, invariablemente:

```
DocTipo: 99          // consumidor final anónimo
DocNro:  0
CondicionIVAReceptorId: 5   // Consumidor Final (env ARCA_CONDICION_IVA_RECEPTOR_ID)
```

**Una academia de danza es un negocio, no un consumidor final en el IVA.** El umbral de importe por
debajo del cual el receptor puede quedar anónimo vive en el **Anexo II, Apartado A, Título II,
inciso d)** de la RG 1415, y ese inciso arranca con "**Cuando se trate de un sujeto que revista el
carácter de consumidor final en el impuesto al valor agregado**". Los demás incisos del mismo Título
exigen **CUIT sin ningún umbral de importe**:

| Inciso | Receptor               | Datos exigidos                                                                                                                                       |
| ------ | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| a)     | Responsable inscripto  | Apellido/razón social · domicilio comercial · **CUIT** · leyenda "IVA RESPONSABLE INSCRIPTO"                                                         |
| c)     | Exento o no alcanzado  | Ídem · **CUIT** · leyenda "NO RESPONSABLE IVA" o "IVA EXENTO"                                                                                        |
| d)     | **Consumidor final**   | Leyenda "A CONSUMIDOR FINAL"; DNI/CUIL/CDI sólo si el importe ≥ **$10.000.000** (texto según RG 5700/2025, reeditado por RG 5866/2026 art. 1 inc. f) |
| e)     | Monotributo            | Ídem · **CUIT** · leyenda "Responsable Monotributo" / "Monotributista social" / …                                                                    |
| f)     | Sujeto no categorizado | Ídem · **CUIT** · leyenda "SUJETO NO CATEGORIZADO"                                                                                                   |

Y el punto 10 del mismo Título pone una carga sobre el comprador: "deberá informar al sujeto que
emite y entrega el comprobante su Clave Única de Identificación Tributaria (C.U.I.T.) y su condición
frente al impuesto al valor agregado".

La RG 5866/2026 agregó además, en el inc. d), un deber **independiente del importe**: hay que
identificar al receptor con CUIT "en caso de que el responsable lo requiera a los fines de poder
computar la correspondiente deducción en su declaración jurada del impuesto a las ganancias" — que es
exactamente lo que una academia querrá hacer con esta factura.

**Payload correcto para el caso de uso real**: `DocTipo = 80` + CUIT de la academia +
`CondicionIVAReceptorId` con la condición real de la academia (1, 4, 6, 13 o 16 en la práctica).
Confianza **alta**.

Matiz técnico, para que nadie confunda "ARCA no me rechaza" con "es legal": las validaciones de
WSFEv1 que impiden `DocTipo 99` por encima del umbral (**10014/10015**, camino CAE) están redactadas
**sólo para "tipo B"**; sus gemelas del camino CAEA (**1417/1418/1419**) dicen "**B o C**". Leído
literalmente, WSFEv1 **no** haría cumplir la regla en una Factura C vía `FECAESolicitar`. Eso es una
laguna técnica, no un permiso: la RG 1415 sigue rigiendo, y el control tiene que estar en la app.
Confianza **media** (es una lectura de la redacción del manual, que podría ser una omisión editorial).

---

## 7. Lo que hay que confirmar con el contador de la entidad

Ninguna de estas preguntas se resuelve con fuentes públicas. Están en orden de impacto: las tres
primeras deciden si el modelo del sistema es correcto o hay que rehacerlo.

1. **¿Cuál es el texto literal del objeto estatutario?** ¿Dice "organizar certámenes/competencias de
   danza"? ¿Dice "educación", "formación artística", "cultura física"? La palabra _educación_ abre la
   vía Ley 16.656 + _Club 20 de Febrero_ (CSJN, 26/9/2006); la frase _organizar competencias_ activa
   el bloqueo del art. 7.1.
2. **¿Tomó alguien la decisión de encuadrar la inscripción como exenta, y con qué fundamento
   escrito?** El alta en IVA Exento data de 06/2022. ¿Hay dictamen profesional, consulta vinculante
   (RG 4497) o simplemente se asumió que "asociación civil = exenta"? Si es lo último, hay una
   contingencia por los períodos no prescriptos.
3. **¿Cómo se enfrenta el art. 7.1 de la Ley de IVA** ("espectáculos y reuniones de carácter …
   **de danza** … deportivos"), que desactiva expresamente la exención del art. 7 inc. h) ap. 6 para
   esta materia? Ésta es LA pregunta. Si no hay respuesta, el encuadre correcto probablemente sea
   Responsable Inscripto → Factura A/B.
4. **¿Qué se compra exactamente con la cuota de inscripción?** ¿Sólo el derecho a competir? ¿Incluye
   entradas para acompañantes? ¿Incluye clínicas, workshops, devoluciones técnicas del jurado? ¿Hay
   ítems separables con precios diferenciados? La separabilidad puede permitir tratamientos distintos
   por componente — y un componente formativo genuino cambia el análisis.
5. **¿Hay venta de entradas al público?** ¿Quién las emite y por qué importe relativo frente a las
   inscripciones? Esto decide dos cosas: si aplica (parcialmente) el ap. 10/11, y si se activa la
   exclusión del **art. 26 inc. f) 2° párrafo de Ganancias** ("entidades que obtienen sus recursos, en
   todo o en parte, de la explotación de espectáculos públicos"), que pondría en riesgo el certificado
   de exención vigente.
6. **¿La disciplina está federada como deporte** (danza deportiva) ante alguna federación reconocida,
   o se presenta como actividad artística? ¿Los bailarines perciben retribución? (El DR art. 33 exige
   que **no** la perciban para el ap. 11.)
7. **¿Qué condición frente al IVA tienen las academias clientes?** RI, exentas, monotributo. Decide
   A vs. B si el encuadre cambia, y decide el `CondicionIVAReceptorId` correcto **hoy mismo** (§6).
8. **¿Por qué se está facturando a consumidor final anónimo** en lugar de identificar a la academia
   con su CUIT? ¿Fue una decisión consciente o un supuesto heredado? (Ver §6: probablemente incumple
   RG 1415 Anexo II ap. A Tít. II incs. a/c/e.)
9. **¿Aplica el Anexo IV Apartado B pto. 6 de la RG 1415** (entidades del art. 26 inc. f de Ganancias),
   texto según RG 5866/2026 vigente desde 1/7/2026? Puede haber un régimen de consolidación mensual
   que cambie la granularidad del comprobante.
10. **¿Cuál es la magnitud de los ingresos por inscripciones sobre el total?** Relevante para el test
    cuantitativo de "fines específicos" y para dimensionar la contingencia de períodos no prescriptos.

---

## 8. Implicancias para el sistema

### 8.1. Inventario de supuestos "monotributo" o "clase C" en el árbol

El grueso de la corrección **ya está hecho** (issue #426): el código sabe que el emisor es exento, no
monotributista. Quedan estos puntos:

| Ubicación                                                                          | Supuesto                                                                                                                           | Estado                                                                                                                                             |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CONTEXT.md:275`                                                                   | Glosario de `comprobante`: _"Factura C **for monotributo**, issued against ARCA/WSFEv1"_                                           | ❌ **Desactualizado.** Es el último lugar del árbol que dice "monotributo". Debería decir "emisor exento en IVA"                                   |
| `app/db/schema/comprobantes.ts:17-25`                                              | Comentario + enum `comprobanteIssuerIvaCondition = ["exento"]`                                                                     | ✅ Correcto (#426). El comentario "emite clase C igual que un monotributista" es exacto en el resultado, aunque el fundamento sea otro inciso (§1) |
| `app/lib/comprobantes/impreso.ts:6-23`                                             | `EMISOR_CONDICION_IVA_LABEL = "IVA Exento"` con comentario explicando la diferencia                                                | ✅ Correcto. La norma escribe la leyenda como `"IVA EXENTO"` (mayúsculas, RG 1415 Anexo II ap. A Tít. I) — diferencia cosmética                    |
| `app/lib/comprobantes/emit-factura-c.server.ts:37-39`                              | `ISSUER_IVA_CONDITION = "exento"`                                                                                                  | ✅ Correcto                                                                                                                                        |
| `app/lib/comprobantes/arca/factura-c.ts:13,17`                                     | `FACTURA_C_CBTE_TIPO = 11`, `NOTA_CREDITO_C_CBTE_TIPO = 13`                                                                        | ✅ Correctos (§4.1)                                                                                                                                |
| `app/lib/comprobantes/arca/factura-c.ts:18-19,152-153`                             | `DOC_TIPO_CONSUMIDOR_FINAL = 99` / `DOC_NRO_CONSUMIDOR_FINAL = 0` **hardcodeados en `buildClassCVoucher`**                         | ❌ **Legalmente incorrecto** para el caso de uso real (§6). El receptor es una academia con CUIT                                                   |
| `.env.example:83` · `emit-factura-c.server.ts:482`                                 | `ARCA_CONDICION_IVA_RECEPTOR_ID = "5"` (Consumidor Final), fijo por entorno                                                        | ❌ **Debería derivarse de la academia**, no ser una constante de despliegue (§5.2, §6)                                                             |
| `impreso.ts:23` · `print/model.ts:82` · `print/view.tsx:132`                       | `RECEPTOR_CONDICION_IVA_LABEL = "Consumidor Final"`                                                                                | ❌ Consecuencia de lo anterior                                                                                                                     |
| `print/view.tsx` (bloque Receptor)                                                 | Falta la leyenda **"A CONSUMIDOR FINAL"** (o, corregido el punto anterior, CUIT + razón social + domicilio + leyenda de condición) | ❌ Gap ya señalado en el research de representación impresa                                                                                        |
| `print/view.tsx` (bloque Emisor)                                                   | Faltan **Ingresos Brutos**, **fecha de inicio de actividades** y **domicilio comercial** (RG 1415 Anexo II ap. A Tít. I)           | ❌ Gap preexistente, no específico del encuadre exento                                                                                             |
| `arca/client.server.ts:120-153` · `format.ts` · `list/server.ts` · `list/view.tsx` | Universo cerrado a tipos 11 y 13                                                                                                   | ✅ Correcto para el alcance actual. La **Nota de Débito C (12)** existe y no está implementada — no hay caso de uso hoy                            |
| `app/lib/comprobantes/emit-nota-credito.server.ts`                                 | Vinculación obligatoria vía `CbtesAsoc`                                                                                            | ✅ Correcto **y necesario**: ARCA no la exige técnicamente para clase C (§4.2), así que el control tiene que estar acá                             |

### 8.2. Lo que este research **no** cambia

- La clase C es correcta **dado el encuadre registrado**. No hay que tocar nada por el hecho de que
  el emisor sea una asociación civil en vez de un monotributista: es el mismo artículo, otro inciso.
- Los códigos 11/13, el `Concepto: 2`, la ausencia de array `<Iva>`, `ImpNeto = ImpTotal`, la
  vinculación de la NC y el plazo de 15 días: todos siguen valiendo idénticos.
- El régimen de Transparencia Fiscal sigue sin aplicar, por la misma razón sustantiva que antes (no
  hay IVA que exhibir), aunque por un camino normativo distinto (emisor RI, no "no es monotributo").

### 8.3. Lo que sí habría que decidir

1. **Corregir `CONTEXT.md:275`** — trabajo de un minuto, elimina el último "monotributo" del árbol.
2. **Modelar el receptor** (`DocTipo` 80 + CUIT + `CondicionIVAReceptorId` de la academia). Es la
   corrección con mayor exposición fiscal real y es **independiente** de cómo se resuelva §3. Requiere
   persistir CUIT y condición IVA de cada academia, y propagarlo al payload, al snapshot y al impreso.
3. **No tocar el encuadre de clase hasta que el contador responda §7.** Si la respuesta es
   "Responsable Inscripto", el impacto es estructural: clases A/B según receptor, `ImpNeto` ≠
   `ImpTotal`, array `<Iva>` con la alícuota 5 (21%), `CbteTipo` 1/2/3 y 6/7/8, y un impreso con IVA
   discriminado más el bloque de Transparencia Fiscal de la RG 5614/2024. **El enum de una sola
   variante y el `buildClassCVoucher` hardcodeado son el punto de corte correcto para ese cambio**:
   ambos fallarían ruidosamente en vez de emitir un comprobante silenciosamente mal clasificado.

---

## 9. Confianza por pregunta

| Pregunta                                                         | Confianza                                                                                                | Por qué                                                                                                                                                                                                              |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 · Clase C para emisor exento                                   | **Alta**                                                                                                 | Texto expreso de RG 1415 art. 16 inc. a), leído del texto actualizado                                                                                                                                                |
| 1b · Fundamento distinto del monotributo                         | **Alta**                                                                                                 | Incisos distintos del mismo artículo; bases sustantivas documentadas                                                                                                                                                 |
| 2 · Ganancias ≠ IVA                                              | **Alta**                                                                                                 | Técnicas exentivas incompatibles, leídas de ambas leyes                                                                                                                                                              |
| 3 · El servicio probablemente **no** está exento                 | **Media-alta** en la lectura literal                                                                     | El art. 7.1 nombra "de danza" con todas las letras. Baja el nivel: (a) la inconstitucionalidad del Dto. 493/01 tiene respaldo de Cámara y PGN; (b) la entidad lleva cuatro años empadronada como exenta sin objeción |
| 3b · Podría corresponder A/B                                     | **Alta** sobre el espacio de opciones (RI o Exento; nunca monotributo); **media** sobre cuál corresponde | Depende de hechos de §7                                                                                                                                                                                              |
| 4 · Códigos 11/12/13/15                                          | **Alta**                                                                                                 | Validación 10007 del manual, verbatim, corroborada por 10188 y 812                                                                                                                                                   |
| 4b · Sin diferencias en NC para el exento                        | **Alta**                                                                                                 | RG 4540 leída completa: cero menciones a la condición del emisor                                                                                                                                                     |
| 5 · Diferencias operativas (RG 4290/4291, leyenda, sin topes)    | **Alta**                                                                                                 | Texto expreso en los cuatro puntos                                                                                                                                                                                   |
| 5b · `CondicionIVAReceptorId` obligatorio y sin restricción en C | **Alta** en la obligatoriedad y la lista; **media-alta** en la matriz de columnas                        | La matriz se extrajo de un PDF con offsets ambiguos — verificable en homologación                                                                                                                                    |
| 5c · Transparencia Fiscal no aplica                              | **Alta** en la norma; **media** en la práctica                                                           | La divulgación de ARCA contradice el texto de la RG 5614                                                                                                                                                             |
| 6 · Sin restricciones distintas para la NC del exento            | **Alta**                                                                                                 | RG 4540 art. 5 admite RG específicas y no existe una para exentos                                                                                                                                                    |
| Colateral · El receptor no puede ser CF anónimo                  | **Alta**                                                                                                 | El umbral está en el inc. d), que sólo rige para consumidores finales                                                                                                                                                |
| Colateral · WSFEv1 no haría cumplir la regla en clase C          | **Media**                                                                                                | Lectura de la redacción del manual (10014/10015 dicen "tipo B"; 1417/1418/1419 dicen "B o C")                                                                                                                        |
