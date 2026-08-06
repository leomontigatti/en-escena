# Seña perdida — ¿la plata retenida sigue siendo contraprestación?

> Research contra fuentes primarias (CCyC, Ley 24.240, RG 4540/2019, RG 1415/2003, Ley de IVA,
> manual WSFEv1) para la pregunta de [#654](https://github.com/leomontigatti/en-escena/issues/654):
> cuando un bailarín se baja después de facturado el elenco y el reglamento retiene la seña,
> **¿esa plata sigue siendo precio, o es una indemnización que debe salir de la factura?**
>
> Complementa `docs/research/arca-nota-credito-posterior.md` (rama
> `research/arca-nota-credito-posterior`, commit `6ab0610`) — cuyo §4.3 se revisa acá — y
> `docs/research/arca-identificacion-individual-nc.md` (rama
> `research/arca-identificacion-individual-nc`, commit `8de74b6`).
>
> **Advertencia de alcance.** Como en los research previos, este documento separa _lo que dice
> la norma_ de _lo que se infiere_ de ella. Cada hallazgo lleva su nivel de confianza. La
> sección [§8](#8-lo-que-no-se-pudo-resolver) es la que hay que leer antes de decidir. Esto
> **no es asesoramiento contable ni legal**: la pregunta central del ticket **no está resuelta
> por ninguna norma relevada**, y eso es en sí mismo el hallazgo más importante.
>
> **El texto de las normas se cita en español, textual. El análisis está en inglés.**

## Fuentes

| #   | Fuente                                                                                                                                                                                                                                                                                                                            | Tipo                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| F1  | **CCyC (Ley 26.994), texto actualizado** — <https://servicios.infoleg.gob.ar/infolegInternet/anexos/235000-239999/235975/texact.htm>                                                                                                                                                                                              | Primaria                |
| F2  | **Ley 24.240 (Defensa del Consumidor), texto actualizado** — <https://servicios.infoleg.gob.ar/infolegInternet/anexos/0-4999/638/texact.htm>                                                                                                                                                                                      | Primaria                |
| F3  | **RG 4540/2019 (AFIP), texto actualizado** (art. 6 sust. por RG 4701/2020) — <https://servicios.infoleg.gob.ar/infolegInternet/anexos/325000-329999/326036/texact.htm>                                                                                                                                                            | Primaria                |
| F4  | **RG 1415/2003 (AFIP), texto actualizado** (incl. RG 5866/2026 ARCA) — <https://biblioteca.afip.gob.ar/dcp/REAG01001415_2003_01_07>                                                                                                                                                                                               | Primaria                |
| F5  | **Ley de IVA 23.349 (t.o. 1997), texto actualizado** — <https://servicios.infoleg.gob.ar/infolegInternet/anexos/40000-44999/42701/texact.htm>                                                                                                                                                                                     | Primaria                |
| F6  | **WSFEv1 — Manual para el desarrollador, RG 4291 / Proyecto FE v4.5**, rev. 1/9/2026 — <https://www.afip.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf>                                                                                                                                                    | Primaria                |
| F7  | **AFIP — Acta Grupo de Enlace AFIP–CPCECABA del 4/11/2009**, que transcribe la **Res. 10/09 (SDG TLI)** y el **Dictamen 12/2009 (DAT)** — <https://biblioteca.afip.gob.ar/estaticos/enlaces/CONSEJO_AFIP_04_11_09.pdf>                                                                                                            | Primaria (AFIP-hosted)  |
| F8  | **Cód. Civil (Ley 340) art. 1202** y **Cód. de Comercio (Ley 2637) art. 475**, derogados — <https://servicios.infoleg.gob.ar/infolegInternet/anexos/105000-109999/109481/texactley340_libroII_S3_tituloI.htm> · <https://servicios.infoleg.gob.ar/infolegInternet/anexos/105000-109999/109500/texactley2637_libroII_tituloIV.htm> | Primaria (antecedentes) |
| F9  | Repo `en-escena`: `docs/domain/finances.md`, research previas, issues #547 / #548 / #599 / #600 / #610 / #650                                                                                                                                                                                                                     | Evidencia local         |

Infoleg rechaza `curl` (HTTP 403); los textos se recuperaron por scraping de las URLs de arriba.

---

## 0. Resumen ejecutivo

| #   | Pregunta                                                                                        | Respuesta                                                                                                                                                                                                                                                                              | Confianza                                                        |
| --- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1   | ¿La seña es **confirmatoria** por defecto en el CCyC?                                           | **Sí.** Art. 1059: "se interpreta como confirmatoria del acto, excepto que las partes convengan la facultad de arrepentirse". El gatillo penitencial es **la convención expresa**, no el monto ni la palabra "pierde".                                                                 | **Alta** (texto expreso)                                         |
| 2   | ¿En cuál cae _"si se baja, la seña se pierde, salvo certificado médico"_?                       | **Ni una ni otra limpiamente: se lee como cláusula penal** (art. 790), no como seña penitencial. La excepción por certificado tiene la forma del art. 792 ("causa extraña"). Pero **la redacción es ambigua**, y toda regla interpretativa la resuelve contra el predisponente.        | **Media-alta**                                                   |
| 3   | Bajo esas dos lecturas, ¿la plata retenida es contraprestación?                                 | **No.** Cláusula penal ⇒ **indemnización** (art. 793: "suple la indemnización de los daños"). Seña penitencial ⇒ **precio del arrepentimiento**, no de un servicio. Ninguna de las dos es precio de una prestación.                                                                    | **Alta**                                                         |
| 4   | ¿Hay una redacción que la vuelva **a cuenta de precio**?                                        | **Sí, y es el entregable principal** (§3). Requiere tres piezas: imputación expresa a precio + negación expresa del arrepentimiento y de la pena + una **prestación divisible efectivamente cumplida** a la cual imputar (art. 1081 inc. b) + reducción parcial convenida (art. 1077). | **Media-alta** (construcción, sin jurisprudencia verificada)     |
| 5   | ¿"NC parcial por rescisión reteniendo una penalidad" es **lectura directa** de RG 4540 art. 2?  | **No, como se afirmó en #650.** El art. 2 aporta la causal ("rescisiones") y las reglas de emisor y vinculación. **Es silencioso sobre el importe y sobre la penalidad.** Las palabras _indemnización_, _cláusula penal_, _seña_, _penalidad_ no aparecen en toda la RG.               | **Alta** (hallazgo negativo sobre un texto corto leído entero)   |
| 6   | ¿Una indemnización exige comprobante bajo RG 1415?                                              | **No.** El art. 1 enumera en forma **cerrada** (sin "etc.") operaciones de intercambio oneroso. Una indemnización no es ninguna. Pero tampoco hay exclusión expresa: es ausencia, no prohibición.                                                                                      | **Media-alta**                                                   |
| 7   | ¿Las indemnizaciones están fuera del objeto del IVA?                                            | **La ley es silenciosa.** Ni el art. 1 ni el art. 3 las mencionan. La respuesta es **doctrina**: Res. 10/09 (SDG TLI), consulta vinculante. Y en Factura C el punto **casi no muerde** (§5.3).                                                                                         | **Media** (doctrina, no texto)                                   |
| 8   | ¿Sobrevive el §4.3 del research anterior (_"anticipo a facturar contra una operación futura"_)? | **La conclusión sobre la NC sí; el destino del dinero no.** Sin operación futura no hay anticipo. Pero la cláusula recomendada **fabrica** una operación futura en la rama del certificado médico, y ahí §4.3 revive intacto.                                                          | **Alta** para la NC; **media** para el resto                     |
| 9   | ¿WSFEv1 reacciona distinto a una NC C parcial que deja residuo en la FC?                        | **No.** 10237 es **no excluyente** y **unidireccional**: sólo se dispara si la NC **supera** al asociado. No existe validación que exija ΣNC = total de la FC.                                                                                                                         | **Alta** para el texto; **media-alta** para el hallazgo negativo |
| 10  | ¿Queda invalidada la forma B?                                                                   | **No, pero tampoco queda confirmada por ninguna norma.** Es _no prohibida_, no _autorizada_. Su legitimidad viene del reglamento, no de ARCA. Ver §6 y §9.                                                                                                                             | **Alta**                                                         |

---

## 1. La seña en el CCyC — el default es confirmatoria

**Confianza: ALTA. Texto expreso, verificado en F1.**

> **ARTICULO 1059.- Disposiciones generales.** La entrega de señal o arras **se interpreta como
> confirmatoria del acto, excepto que las partes convengan la facultad de arrepentirse**; en tal
> caso, quien entregó la señal la pierde en beneficio de la otra, **y quien la recibió, debe
> restituirla doblada**.

> **ARTICULO 1060.- Modalidad.** Como señal o arras pueden entregarse dinero o cosas muebles. Si
> es de la misma especie que lo que debe darse por el contrato, **la señal se tiene como parte de
> la prestación si el contrato se cumple**; pero no si ella es de diferente especie **o si la
> obligación es de hacer o no hacer**.

(Ubicación, para la cita: Libro Tercero, Título II, **Capítulo 9, Sección 5ª "Señal"**.)

Three things the text settles, and one it does not.

**(a) The default is confirmatoria, and the only trigger for the penitencial reading is an express
agreement conferring a _facultad de arrepentirse_.** Not the amount, not the label "seña", not the
verb "pierde". The trigger is _convención_.

**(b) The penitencial regime is symmetric.** If it fires, the receiving party who repents "debe
restituirla **doblada**". A reglamento that forfeits the dancer's money and says nothing about the
entity's reciprocal double-restitution is _not_ the art. 1059 institution — it is a one-way penalty
wearing its vocabulary.

**(c) The CCyC unified a split, and it chose the commercial solution.** The antecedents (F8):

> **Cód. Civil art. 1202** (derogado). "Si se hubiere dado una señal para asegurar el contrato o su
> cumplimiento, **quien la dio puede arrepentirse** del contrato, o puede dejar de cumplirlo
> perdiendo la señal. […]" — civil default: **penitencial**.

> **Cód. de Comercio art. 475** (derogado). "Las cantidades que con el nombre de señal o arras se
> suelen entregar en las ventas, **se entiende siempre que lo han sido por cuenta del precio y en
> signo de ratificación del contrato, sin que pueda ninguna de las partes retractarse**, perdiendo
> las arras. Cuando el vendedor y el comprador convengan en que, mediante la pérdida de las arras
> […] les sea lícito arrepentirse […] **deberán expresarlo así por cláusula especial del
> contrato**." — commercial default: **confirmatoria**, penitencial only by special clause.

Art. 1059 is art. 475 CCom generalised; art. 1060 preserves the second half of old art. 1202.
Confidence **high** — all three texts read in full.

**(d) What art. 1060 does _not_ give us.** Two literal limits, and both bite here:

- The automatic imputación a cuenta de precio is excluded "**si la obligación es de hacer o no
  hacer**". A competition inscription is an obligación de hacer on the entity's side. Read
  literally, **art. 1060's automatic imputation does not operate by force of law in this
  contract.** This is an inference from the text, not something art. 1060 says about competitions
  — confidence **medium-high**. It is precisely why the reglamento has to state the imputación
  expressly rather than lean on art. 1060.
- The imputación operates "**si el contrato se cumple**". A withdrawal is the case where it does
  not. Art. 1060 is therefore silent on exactly our scenario, and the gap has to be filled by
  convention (arts. 957–959, 1077, 1081).

---

## 2. Which framing is _"se pierde salvo certificado médico"_?

**Answer: it reads as a _cláusula penal_, not as a seña penitencial. Confidence: MEDIUM-HIGH.**
The stance comment's hypothesis ("sounds penitencial as described") is **corrected, not
confirmed** — but the correction lands somewhere _worse_ for form B, not better.

### 2.1 The two institutions, precisely

> **ARTICULO 790.- Concepto.** La cláusula penal es aquella por la cual una persona, **para
> asegurar el cumplimiento de una obligación**, se sujeta a una **pena o multa en caso de retardar
> o de no ejecutar la obligación**.

> **ARTICULO 792.- Incumplimiento.** El deudor que no cumple la obligación en el tiempo convenido
> debe la pena, **si no prueba la causa extraña que suprime la relación causal**. La eximente del
> caso fortuito debe ser interpretada y aplicada restrictivamente.

> **ARTICULO 793.- Relación con la indemnización.** La pena o multa impuesta en la obligación
> **suple la indemnización de los daños** cuando el deudor se constituyó en mora; y el acreedor no
> tiene derecho a otra indemnización, aunque pruebe que la pena no es reparación suficiente.

> **ARTICULO 796.- Opciones del deudor.** El deudor puede eximirse de cumplir la obligación con el
> pago de la pena **únicamente si se reservó expresamente este derecho**.

- **Seña penitencial** = the parties _agreed_ an exit right. Withdrawal is **lawful**. The money is
  the **precio del arrepentimiento** — consideration for an option, not for a service.
- **Cláusula penal** = withdrawal is **unlawful**, a breach. The money is **indemnización
  tarifada** (art. 793).

### 2.2 Why the described clause is breach-framing

**Signal 1 — the medical certificate. Decisive.** Art. 792's template is _"debe la pena, **si no
prueba la causa extraña**"_. A certificado médico is nothing other than proof of a supervening
impossibility excusing non-performance. The clause therefore has the shape **"you forfeit unless
you prove an excuse"**. A _facultad de arrepentimiento_ has no logical room for excuses: if backing
out is a right you paid for, you exercise it and nobody asks why. **Demanding a justification
presupposes the withdrawal is, absent justification, wrongful.** Confidence **high** as textual
analysis; **medium-high** that a court would weigh it as decisively (doctrinal inference from
arts. 790/792, not a verified holding).

**Signal 2 — no facultad de arrepentirse is "convenida".** Art. 1059 requires that the parties
_convengan la facultad de arrepentirse_; art. 796 requires the penal-clause analogue to be
_reservado expresamente_. **Describing the consequence of a withdrawal is not conferring the right
to withdraw.** The wording as described contains no such conferral.

**Signal 3 — the clause is unilateral**, whereas art. 1059's penitencial regime obliges the
receiver to restore _doblada_.

**The counter-signal, stated honestly.** The verb **"se pierde"** is _literally_ art. 1059's
penitencial vocabulary ("quien entregó la señal **la pierde** en beneficio de la otra"). A dancer's
lawyer would argue that calling the payment "seña" and saying it "se pierde" is exactly the
art. 1059-second-clause formula. And every interpretive rule available resolves the ambiguity
against the entity:

> **ARTICULO 987.- Interpretación.** Las cláusulas ambiguas predispuestas por una de las partes se
> interpretan **en sentido contrario a la parte predisponente**.

> **ART. 37 in fine, Ley 24.240.** La interpretación del contrato se hará **en el sentido más
> favorable para el consumidor**. Cuando existan dudas sobre los alcances de su obligación, se
> estará a la que sea **menos gravosa**.

**This is the real finding of §2:** the current wording is **ambiguous between two institutions,
neither of which yields "price"**, and ambiguity is resolved against the drafter. That is the
argument for rewriting, independent of which framing wins.

### 2.3 So — is the retained money contraprestación?

| Framing                                                                | Nature of the retained money                        | Basis                                                                                     |
| ---------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Cláusula penal                                                         | **Indemnización** tarifada                          | art. 793 "suple la indemnización de los daños"                                            |
| Seña penitencial                                                       | **Precio del arrepentimiento** (price of an option) | art. 1059 2ª cláusula                                                                     |
| Seña confirmatoria imputada a precio, operación **cumplida**           | **Precio**                                          | art. 1060 "se tiene como parte de la prestación si el contrato se cumple"                 |
| Seña confirmatoria imputada a precio + **reducción parcial convenida** | **Precio de la porción efectivamente prestada**     | arts. 957/958/959 + art. 1077 ("extinguido **total o parcialmente**") + art. 1081 inc. b) |

**Under neither of the two framings the current reglamento plausibly falls into is the money
contraprestación.** Confidence **high** — this follows directly from arts. 793 and 1059.

**Only the fourth row yields "a cuenta de precio", and it is available.** The load-bearing article:

> **ARTICULO 1081.- Contrato bilateral.** Si se trata de la extinción de un contrato bilateral:
> […] b) **las prestaciones cumplidas quedan firmes y producen sus efectos en cuanto resulten
> equivalentes, si son divisibles y han sido recibidas sin reserva** respecto del efecto
> cancelatorio de la obligación; […]

> **ARTICULO 1077.- Extinción por declaración de una de las partes.** El contrato puede ser
> extinguido **total o parcialmente** por la declaración de una de las partes, mediante rescisión
> unilateral, revocación o resolución, en los casos en que el mismo contrato, o la ley, le
> atribuyen esa facultad.

So: the reglamento must (i) identify a **divisible service actually rendered at inscription**,
(ii) impute the retained sum to it **as price**, and (iii) frame the withdrawal as a **partial
extinction** of the operación, not as a forfeit. That is exactly form B's economic story — the
obligation is _reduced_, not extinguished. **Form B has a contractual shape that makes it
coherent; the current reglamento is not that shape.**

---

## 3. EL ENTREGABLE — cláusula recomendada para el reglamento

Tres opciones, en orden decreciente de robustez jurídica para el fin buscado. Están redactadas para
insertarse tal cual en un reglamento. **Recomendación: Opción B.**

### Reglas de redacción transversales (aplican a las tres)

1. **Nunca usar "pierde", "penalidad", "multa", "sanción".** Esas palabras mapean, respectivamente,
   contra la segunda cláusula del art. 1059 y contra el art. 790 — las dos lecturas que producen
   _no-precio_.
2. **Declarar las negaciones expresamente**: "no se conviene facultad de arrepentimiento" (mata el
   art. 1059 penitencial) y "no constituye pena ni multa" (mata arts. 790/793/794).
3. **Nombrar la prestación divisible efectivamente cumplida.** El art. 1081 inc. b) es el artículo
   que sostiene todo y necesita un referente real.
4. **No condicionar la retención a la ausencia de una excusa.** Convertir el caso del certificado
   médico en una **opción de traslado o sustitución**, no en una exención de una penalidad. _Este es
   el cambio de mayor palanca respecto de la redacción actual_, porque la excepción médica es la
   señal de incumplimiento más fuerte (§2.2).
5. Dado el art. 987 y el art. 37 in fine LDC, la redundancia en la redacción es una virtud.

### Opción B — precio desagregado (**recomendada**)

> **Artículo \_\_. Precio. Componentes e imputación.**
>
> **1.** El precio total del servicio se compone de dos conceptos **autónomos y divisibles**:
>
> **(a) Derecho de inscripción y gestión de cupo:** PESOS \_\_\_\_\_ ($ \_\_\_\_), equivalente al
> \_\_\_% del precio total. Retribuye la gestión administrativa de la inscripción, la reserva y
> bloqueo de cupo, la asignación de horario y orden de presentación, y la inclusión del participante
> en grillas, programación y difusión. **Este servicio se presta y se agota íntegramente en el acto
> de la inscripción**, momento en el cual el concepto se devenga en forma definitiva.
>
> **(b) Derecho de participación:** PESOS \_\_\_\_\_ ($ \_\_\_\_), correspondiente a la actuación
> del participante en pista, su evaluación por el jurado y la devolución técnica, que **se devenga
> con la realización del evento**.
>
> **2. Imputación.** Todo importe abonado se imputa, en primer término y en su totalidad, al
> concepto del inciso 1 (a). Dicho anticipo reviste carácter de **seña confirmatoria** (art. 1059,
> primera parte, CCyCN) y de **pago a cuenta de precio**; las partes **no convienen facultad de
> arrepentimiento alguna**, y el anticipo **no constituye pena, multa ni indemnización**.
>
> **3. Baja del participante.** La baja del participante **no genera derecho a la restitución del
> concepto 1 (a)**, por tratarse del precio de un servicio ya prestado y devengado, y **extingue la
> obligación de abonar el concepto 1 (b)**, que se tendrá por no devengado. Las partes convienen que
> ello importa una **reducción parcial de la operación** (arts. 1077 y 1081, inc. b), CCyCN). Lo
> abonado en exceso del concepto 1 (a) será reintegrado dentro de los \_\_\_ días hábiles.
>
> **4.** Acreditada por certificado médico una imposibilidad sobreviniente, el participante podrá
> optar por el **traslado** del concepto 1 (a), a cuenta de precio, a la edición siguiente, o por la
> **sustitución** del participante por otro que reúna los requisitos reglamentarios, sin cargo
> adicional.

**What it achieves.** The retained money is _never_ characterised as a forfeit, because there is
nothing to forfeit: one component of price was **earned**, the other was not. This is the framing
under which form B is not merely defensible but _descriptively accurate_ — the factura documents
price for a service rendered, and the NC credits the component that was never devengado. It removes
the "se pierde" vocabulary entirely (defusing arts. 987 / 37 LDC), and the neutrality of "la baja …
no genera derecho a la restitución" is itself further evidence that this is not a pena, because
there is no excuse to plead. If the relationship turns out to be a consumer one, it engages the
art. 1121 inc. a) shelter:

> **ARTICULO 1121.- Límites.** **No pueden ser declaradas abusivas: a) las cláusulas relativas a la
> relación entre el precio y el bien o el servicio procurado**; […]

**Weakness.** The entity must **actually price the two components honestly and disclose them before
contracting**. If "derecho de inscripción" is set at 30% with no genuine administrative cost behind
it, the art. 1121 a) shelter is arguable but not guaranteed — art. 1119 tests abusiveness "por
objeto **o por efecto**", and art. 1118 says express acceptance does not immunise a clause.
Re-labelling without substance is transparent. Confidence that art. 1121 a) actually holds as a
shield: **medium-low** (no verified jurisprudence).

### Opción A — seña confirmatoria + imputación expresa + reducción parcial convenida

Mantiene un precio único y una única "seña", agregando las tres piezas que faltan.

> **Artículo \_\_. Naturaleza del anticipo y efectos de la baja.**
>
> **1. Naturaleza.** El importe abonado al momento de la inscripción, equivalente al TREINTA POR
> CIENTO (30%) del precio total, reviste el carácter de **seña confirmatoria** en los términos del
> artículo 1059, primera parte, del Código Civil y Comercial de la Nación, y se **imputa
> íntegramente a cuenta del precio** del servicio contratado. Las partes dejan expresa constancia de
> que **no se conviene facultad de arrepentimiento alguna** en favor de ninguna de ellas, ni el
> anticipo constituye pena, multa ni indemnización.
>
> **2. Servicios comprendidos en el anticipo.** El anticipo retribuye los servicios que la
> Organización presta y agota con la sola inscripción, a saber: (i) gestión y auditoría
> administrativa de la inscripción; (ii) reserva y bloqueo del cupo en la categoría, disciplina y
> modalidad elegidas; (iii) asignación de horario y orden de presentación; (iv) inclusión del
> participante en las grillas de competencia, en la programación y en los materiales de difusión; y
> (v) afectación de jurados, personal, sala y logística en función del cupo reservado. Las partes
> convienen que dichos servicios son **divisibles** y quedan **íntegramente cumplidos y firmes** con
> la inscripción, conforme al artículo 1081, inciso b), del Código Civil y Comercial.
>
> **3. Baja del participante.** Si el participante comunicare su baja con posterioridad a la
> inscripción, las partes convienen, de común acuerdo y con efectos hacia el futuro, la **reducción
> parcial de la operación** (arts. 957, 958, 959, 1076 y 1077 CCyCN), que quedará circunscripta a
> los servicios enunciados en el inciso 2. En consecuencia: (a) el anticipo queda **imputado como
> precio** de dichos servicios y no se restituye, por corresponder a prestaciones efectivamente
> cumplidas; (b) el participante queda liberado del pago del saldo de precio, correspondiente a la
> participación en pista, que no será prestada; y (c) ninguna de las partes deberá a la otra suma
> alguna en concepto de pena, multa o indemnización por la baja.
>
> **4. Certificado médico.** Acreditada mediante certificado médico una imposibilidad sobreviniente,
> el participante podrá optar, en lugar de lo previsto en el inciso 3, por (i) el **traslado** del
> anticipo, con imputación a cuenta de precio, a la próxima edición o a otro evento organizado por
> la Organización dentro de los \_\_\_ meses, o (ii) la **sustitución** del participante.

**Achieves** the same reframing with less commercial disruption (no need to publish a split price).
**Weakness**: it still calls the whole 30% a "seña", so it stays one interpretive step closer to
art. 1059, and it leans harder on the enumerated services in inc. 2 being real.

### Opción C — escala decreciente por proximidad al evento

Igual núcleo que A, pero la fracción imputada escala con cuánto del servicio se prestó realmente:

> **2.** En caso de baja comunicada por el participante, las partes convienen la **reducción parcial
> de la operación** (arts. 1077 y 1081 inc. b) CCyCN), quedando la Organización facultada a imputar
> a precio de los servicios ya prestados, y a restituir el remanente, conforme la siguiente escala,
> que refleja el grado de afectación de recursos ya comprometidos al momento de la comunicación:
> a) hasta \_\_\_ días corridos antes del evento: se imputa el \_\_\_% del anticipo y se restituye
> el \_\_\_%; b) entre \_\_\_ y \_\_\_ días corridos antes: se imputa el \_\_\_% y se restituye el
> \_\_\_%; c) dentro de los \_\_\_ días corridos previos, **o una vez publicadas las grillas y el
> orden de presentación**: se imputa la totalidad del anticipo, por encontrarse íntegramente
> prestados los servicios de programación, asignación de horario e inclusión en grillas.
>
> **4.** La Organización acompañará, a requerimiento del participante, el detalle de los servicios
> efectivamente prestados a la fecha de la comunicación de la baja.

**Achieves** proportionality, which is the single best defence against art. 1119's "desequilibrio
**significativo**" and against art. 794's judicial reduction ("los jueces pueden reducir las penas
cuando su monto desproporcionado con la gravedad de la falta que sancionan … configuran un abusivo
aprovechamiento de la situación del deudor"). Tying the fraction to a **verifiable milestone** (the
publication of the grillas) makes the "service rendered" claim empirically checkable.
**Weakness**: administratively heavier, and its last tier is functionally identical to today's
clause, so it inherits the same exposure for late withdrawals — it only narrows it. **Note for the
model**: a scale makes the retained amount a computed function of `withdrawnAt` rather than
"whatever was allocated", a real cost to form B's simplicity. Prefer A or B.

### 3.1 Capa de derecho del consumidor — y una advertencia sobre _quién_ es la contraparte

**Confianza: MEDIA, con una corrección específica del repo.**

The abstract analysis says a competition inscription is likely a **relación de consumo** (art. 2
LDC: a proveedor acting "de manera profesional, aun ocasionalmente"; art. 1092 CCyC: consumer as
_destinatario final_). **But in this system the factura's receptor is the academia, not the
dancer** — the academy contracts the roster in the course of its own professional activity, which
weakens the _destinatario final_ characterisation considerably. Whether the reglamento binds the
**academia** (business-to-business) or the **bailarín / su familia** (consumer) is a **factual
question this research cannot settle**, and it changes the exposure materially. Flagged as open
(§8).

Even if it is _not_ a consumer relationship, the reglamento is almost certainly a **contrato por
adhesión**, so arts. 985–988 apply anyway:

> **ARTICULO 988.- Cláusulas abusivas.** En los contratos previstos en esta sección, se deben tener
> por no escritas: a) las cláusulas que **desnaturalizan las obligaciones del predisponente**; b)
> las que importan **renuncia o restricción a los derechos del adherente**, o amplían derechos del
> predisponente que resultan de normas supletorias; c) las que por su contenido, redacción o
> presentación, no son razonablemente previsibles.

There is no drafting scenario in which the entity escapes abusiveness control entirely (confidence
**high**). The downside is bounded, though: art. 1122 inc. b) has abusive clauses "se tienen por no
convenidas" and inc. c) lets the judge **integrate** the contract — so a badly drafted clause does
not mean the entity keeps nothing, it means a judge sets the figure.

### 3.2 Una regla imperativa que ninguna redacción puede curar — la revocación de 10 días

**Confianza: ALTA sobre la norma; MEDIA sobre si aplica de hecho.**

> **ARTICULO 1110.- Revocación.** En los contratos celebrados **fuera de los establecimientos
> comerciales y a distancia**, el consumidor tiene el **derecho irrenunciable de revocar la
> aceptación dentro de los diez días** computados a partir de la celebración del contrato. […] Las
> cláusulas, pactos o cualquier modalidad aceptada por el consumidor durante este período que tengan
> por resultado la imposibilidad de ejercer el derecho de revocación **se tienen por no escritos**.

> **ART. 34, Ley 24.240.** […] el consumidor tiene derecho a revocar la aceptación durante el plazo
> de DIEZ (10) días corridos […] **sin responsabilidad alguna**. Esta facultad **no puede ser
> dispensada ni renunciada**.

**If** the relationship is a consumer one **and** inscriptions are taken online / by WhatsApp / by
form (art. 1105: "con el uso exclusivo de medios de comunicación a distancia"), then for a
withdrawal inside the 10-day window **no retention of any kind survives** — not pena, not precio del
arrepentimiento, not "a cuenta de precio". Art. 1113: "las partes quedan liberadas de sus
obligaciones correspectivas y deben restituirse recíproca y simultáneamente las prestaciones que han
cumplido." And art. 1111 says the right "**no se extingue si el consumidor no ha sido informado
debidamente**", so an undisclosed right arguably never starts its clock.

A purely in-person inscription at the entity's premises falls **outside** arts. 1104/1105 and
arts. 32/33 LDC, and the revocation right does not apply (confidence **high** on the norm).

**Consequence for the model, if the consumer characterisation holds:** there exists a bounded window
in which the withdrawn inscription's derived total must be **zero**, i.e. form A, regardless of the
reglamento. That is not a fiscal constraint — it is a contractual one — but it is the one input that
could force the NC amount to the full billed line in specific cases. **This research cannot
determine whether it applies; it depends on facts (who contracts, and how) that live outside the
repo.**

If inscriptions are taken online, every option in §3 needs a preamble in the prominent form art. 1111
demands:

> **Artículo \_\_. Derecho de revocación.** Cuando la inscripción se perfeccione por medios
> electrónicos, telefónicos o similares, o fuera del establecimiento de la Organización, el
> participante tiene el **derecho irrenunciable de revocar su aceptación dentro de los DIEZ (10)
> días corridos** contados desde la celebración, **sin responsabilidad alguna y con reintegro
> íntegro de todo importe abonado** (arts. 1110 a 1113 CCyCN y art. 34 de la Ley 24.240). Las
> disposiciones del artículo \_\_ rigen únicamente una vez vencido dicho plazo.

---

## 4. RG 4540/2019 — qué sostiene realmente el art. 2

**Confianza: ALTA (hallazgo negativo sobre un texto corto leído íntegro, F3).**

> **ARTÍCULO 2°.-** Sólo los sujetos que emitieron los comprobantes por las operaciones originarias
> podrán emitir las notas de crédito y/o débito **en concepto de descuentos, bonificaciones, quitas,
> devoluciones, rescisiones, intereses, etc.**, siempre que se encuentren relacionadas a una o más
> facturas o documentos equivalentes emitidos previamente.
>
> Cuando los descuentos y/o bonificaciones estén acordados y sean determinables al momento de la
> emisión de una factura o documento equivalente, y éstos sean relacionados de manera directa con
> ese comprobante, dichos conceptos deberán ser aplicados en el documento original que respalda la
> operación.

Art. 2 does exactly three things: **(i)** restricts the issuer to whoever emitted the original;
**(ii)** gives an **open, illustrative** causal list — the "**etc.**" is in the text; **(iii)**
requires linkage to a previously emitted factura o documento equivalente, and pushes _pre-agreed,
determinable_ discounts onto the original document instead.

### 4.1 La afirmación bajo verificación — **matizada, no confirmada**

> Aserción de #650: _"a partial NC documenting a rescisión where part of the consideration is
> retained as a penalty is a direct reading of RG 4540 art. 2."_

| Componente de la afirmación                                                                      | Veredicto contra el texto                                                                                                                         |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Una NC por **rescisión**, emitida por el emisor original, vinculada a la FC                      | **Sostenida.** "rescisiones" está literalmente enumerada. Confianza **alta**.                                                                     |
| Que la NC pueda ser **parcial**                                                                  | **El art. 2 es SILENCIOSO.** No dice nada sobre el importe — ni autoriza ni prohíbe la parcialidad.                                               |
| Que parte de la contraprestación pueda **retenerse como penalidad**, dejando un residuo en la FC | **El art. 2 es SILENCIOSO.** Las palabras _indemnización_, _cláusula penal_, _seña_, _penalidad_, _retención_ **no aparecen en toda la RG 4540**. |
| Algo en los arts. 1 a 6 que **contradiga** el diseño                                             | **Nada.**                                                                                                                                         |

**La formulación honesta, y la corrección que #654 pedía:** el art. 2 aporta la **causal** y las
reglas de **emisor y vinculación**; es **silencioso sobre el importe y sobre la caracterización de
la penalidad**. Llamar al diseño entero "lectura directa del art. 2" **fabrica un respaldo que el
texto no da**. La mitad "parcial" se apoya en la _ausencia de prohibición_ más la contemplación por
el art. 3 de "diferencias de precio y/o cantidad" — un argumento de estructura y silencio, que es
exactamente el tipo de argumento que #548 y #610 ya insistieron en rotular como tal.

Esto **no** invalida la forma B. Le reubica el pie: **la forma B no está prohibida por ARCA; tampoco
está autorizada por ARCA. Su legitimidad viene del contrato, no de la RG.** Que es precisamente por
qué el entregable 1 (la cláusula) es el entregable operativo.

### 4.2 La regla que el diseño debe cumplir y es fácil pasar por alto

> **ARTÍCULO 3°.-** […] Las respectivas notas de crédito y/o débito deberán emitirse **dentro de los
> QUINCE (15) días corridos desde que surja el hecho o situación que requiera su documentación**
> mediante los citados comprobantes.

Ya está en el mapa (#600 decisión 7, reloj desde `withdrawnAt`). Se reitera porque el matiz de §4.1
no la toca: cualquiera sea el importe retenido, **la NC por la parte liberada se debe dentro de los
15 días corridos**.

---

## 5. ¿Una indemnización es siquiera algo que lleve comprobante?

### 5.1 RG 1415 art. 1 — la enumeración es cerrada, y la indemnización no está

**Confianza: ALTA para el texto; MEDIA-ALTA para la conclusión.**

> **ARTICULO 1°.-** Establécese un régimen de emisión de comprobantes, aplicable a las operaciones
> que se detallan a continuación:
> a) Compraventa de cosas muebles.
> b) Locaciones y prestaciones de servicios.
> c) Locaciones de cosas.
> d) Locaciones de obras.
> **e) Señas o anticipos que congelen el precio de las operaciones.**
> f) Traslado y entrega de productos primarios o manufacturados.
> g) Pesaje de productos agropecuarios.

Three observations.

**(a) The list is closed in form** — no "etc.", unlike RG 4540 art. 2 — and consists exclusively of
**onerous exchange transactions**. An indemnización or cláusula penal is none of them: not a sale,
not a locación, not a prestación, and **not a "seña o anticipo que congele el precio"**, because a
forfeited seña has stopped being an advance against a future price. So an indemnización is
**outside the facturación regime**: no comprobante fiscal is owed for it. Confidence **medium-high**
— it rests on the closed form of the enumeration, **not** on an express exclusion. Art. 2 of RG 1415
is _sujetos obligados_, not exclusions ("Están alcanzados por el presente régimen los sujetos …
que realicen en forma habitual las operaciones mencionadas en el artículo anterior"); the exceptions
live in arts. 5–7 + Anexo I Apartado A, and **none of its thirteen incisos mentions indemnizaciones,
resarcimientos or forfeited señas**. It is an argument from silence, weaker than one from citation.

**(b) Inciso e) is the article that put the seña on a factura in the first place** — and it matches
the repo's own model exactly. `docs/domain/finances.md`: _"The **deposit allocation is the event
that freezes the price**."_ That is inciso e) in domain terms, and it corroborates that emitting the
FC on the seña was correct.

**(c) The gap this exposes, and it is the central one.** At the moment it was received, the seña
_was_ within inciso e) and therefore inside the comprobante regime. **What art. 1 does not tell you
is what its characterisation becomes retroactively once the operación is rescinded and the advance
is retained.** RG 1415 has no re-characterisation rule. **No norm relevada bridges this.** Said
plainly: _the question #654 asks is not answered by the facturación regime._

> **Aside, adjacent to the entity's activity and worth knowing.** RG 1415 Anexo I Apartado A inc. g)
> exempts from emitting comprobantes to "Las empresas o empresarios de actividades de espectáculos
> públicos, juegos mecánicos y/o electrónicos, parques de diversiones, **bailes**, conferencias, y
> similares, **únicamente cuando el derecho al servicio y/o admisión se concrete mediante la venta
> de entradas, boletos numerados o fichas**". It plainly does **not** reach a competition roster
> invoiced by name to an academy, but it is close enough to the activity to be worth recording so
> nobody re-discovers it and over-reads it.

### 5.2 Dos correcciones a research previa del repo

- **RG 1415 art. 8 no es el artículo de plazos.** Enumera los _vehículos documentales_ ("El respaldo
  documental de las operaciones realizadas … se efectuará mediante la emisión y entrega … de los
  comprobantes"), con notas de crédito/débito en el inc. a) punto 5. **El plazo vive en el art. 13**,
  cuyo texto vigente viene de la RG 5866/2026. `arca-nota-credito-posterior.md` y #548 citan el
  art. 8 correctamente para _"la factura documenta la operación, no el pago"_ — esa frase ("La
  obligación establecida en este artículo se cumplirá, en todos los casos, **con independencia de la
  modalidad de pago utilizada**") sí está en el art. 8 —, pero cualquier afirmación de que el art. 8
  fija _cuándo_ emitir debe reapuntarse al art. 13.
- **La Ley de IVA art. 10 no tiene párrafo de señas.** La regla de señas/anticipos está
  exclusivamente en el **último párrafo del art. 5**: "cuando se reciban señas o anticipos que
  congelen precios, el hecho imponible se perfeccionará, respecto del importe recibido, en el
  momento en que tales señas o anticipos se hagan efectivos". El art. 10 es sólo base imponible.

### 5.3 Ley de IVA — la ley calla, la respuesta es doctrina, y Factura C le saca el filo

**Confianza: ALTA para las citas; MEDIA para la conclusión.**

Ni el art. 1 ni el art. 3 mencionan indemnización, resarcimiento, cláusula penal o daños y
perjuicios. **No hay inclusión expresa ni exclusión expresa.** La cláusula residual que sostiene
todo:

> **Art. 3º inc. e) ap. 21.** **Las restantes locaciones y prestaciones, siempre que se realicen sin
> relación de dependencia y a título oneroso**, con prescindencia del encuadre jurídico que les
> resulte aplicable o que corresponda al contrato que las origina.

The doctrinal test follows from it: the gravamen attaches to a _prestación_ rendered _a título
oneroso_; in a resarcimiento there is no service rendered in exchange, so onerosidad fails for want
of a counterpart. Note "con prescindencia del encuadre jurídico" cuts **against** formalist
labelling — you cannot escape IVA by renaming a service — **but it does not manufacture a prestación
where none was rendered**. That cuts both ways for our clause: it warns that re-labelling a penalty
as "price" fails unless the service is real (§3, Opción B's weakness), and it is simultaneously why
a genuinely rendered inscription service _is_ gravada.

The best AFIP-hosted doctrine located (F7) transcribes **Res. 10/09 (SDG TLI)**, a consulta
vinculante of 4/5/2009:

> "**Una indemnización por daños y perjuicios por incumplimiento de los términos de los contratos de
> una concesión no se encuentra alcanzado por el Impuesto al Valor Agregado, no desvirtuándose dicha
> conclusión por el hecho de que el monto del resarcimiento se calcule en función de los ingresos
> que la demandante dejó de percibir por culpa del incumplimiento** de los términos del citado
> acuerdo. Los intereses que se abonen junto con el pago de dicha indemnización, tampoco se
> encuentran alcanzados por el Impuesto al Valor Agregado."

Two caveats, both material: **(i)** a consulta vinculante binds only the consulting taxpayer for the
consulted facts — persuasive doctrine, not erga omnes; **(ii)** the second sentence — that the
resarcimiento stays outside IVA _even when computed as a function of income not earned_ — is the one
most analogous to a seña calculated as a percentage of the invoiced price, **but that analogy is
ours, not AFIP's**. Confidence that this doctrine has been applied by ARCA to a forfeited seña
specifically: **low — no source found.** The antecedent, **Dictamen 12/2009 (DAT)**, escalated the
question precisely because of "la existencia de antecedentes jurisprudenciales contrapuestos sobre
la cuestión" — which is itself a warning against treating this as settled.

> **No citar el Dictamen DAT 18/03** para sostener que las penalidades están fuera del IVA. Su
> título menciona "cláusula penal", pero al leerlo trata de un pago a una contraparte del exterior
> bajo un contrato de protección de penalidades de obra, y concluye que se asemeja a un **seguro**
> del art. 1 inc. d) de la Ley de IVA — es decir, lo encuentra **gravado**, sobre hechos ajenos. Se
> lo señala porque el título invita a la mala cita.

**¿Factura C le saca el filo? Sí, casi por completo — como anticipaba el comentario de postura.** The
entity is Monotributista: Monotributo substitutes IVA and Ganancias, no IVA is discriminated or
ingressed either way, and there is no crédito fiscal for a receptor Consumidor Final to compute. The
IVA analysis matters here **only as the conceptual backdrop** for whether the retained amount is
"consideration for a taxable operation". **The practical question genuinely does collapse to whether
the factura is the right document for the retained amount** — which is §5.1's question, and §5.1
says the facturación regime does not answer it.

**One residual bite that is _not_ blunted, and is outside this ticket's scope**: whether the retained
amount counts toward **ingresos brutos** for Monotributo categorisation. Anexo Ley 24.977 art. 3
defines ingresos brutos as "el producido de las **ventas, locaciones o prestaciones** … **excluidas
aquellas que hubieran sido dejadas sin efecto**" — an indemnización is arguably not a "producido de
prestaciones" at all, whereas price for a rendered inscription service plainly is. **Not researched.
Flagged as the open question with the most practical money attached for a Monotributista**, and the
one place where the price-vs-indemnización distinction could still cost something real.

---

## 6. ¿Sobrevive el §4.3 del research anterior? ¿Y si la retención debe salir de la factura?

### 6.1 El pasaje del §4.3, releído

`arca-nota-credito-posterior.md` §4.3 dice: _"El deber de documentar el ajuste **no depende del
destino del dinero** … el dinero retenido pasa a ser un **anticipo/crédito a facturar cuando se
defina la nueva operación**."_

Hay que partirlo en dos, porque las dos mitades corren suertes distintas.

**The first half survives intact. Confidence: high.** "El deber de documentar el ajuste no depende
del destino del dinero" is grounded in RG 4540 art. 2 listing rescisión as an **autonomous** causal;
nothing conditions the NC on restitution. A withdrawal owes an NC whether or not money moves. That
is the load-bearing sentence and it is unaffected by the absence of a future operación.

**The second half does not survive. Confidence: high.** An _anticipo_ is, by definition, an advance
**against something**. RG 1415 art. 1 inc. e) says "señas o anticipos **que congelen el precio de
las operaciones**" — a price it freezes, an operación it belongs to. With the dancer withdrawn and
no future operación, there is no price to freeze and nothing to be an advance of. **§4.3's framing
presupposes a future operación that this scenario does not have.**

**But it does not argue _against_ form B either — it argues against a _third_ option.** §4.3
describes what happens under **form A** when the money is not returned: full NC, obligation to zero,
money parked as a client credit awaiting a future invoice. #650 read that passage as "retention is a
business option the fiscal design is indifferent to", which is a fair reading of what it says. What
§4.3 does **not** do is bless the retained money as _price_. It is silent on form B, not supportive
of it.

**And note the loop the recommended clause closes.** Every option in §3 routes the medical-certificate
case into **traslado a la edición siguiente o sustitución del participante** — which _is_ a future
operación. In that branch, §4.3's reasoning revives verbatim and the retained money genuinely is an
anticipo. The clause therefore produces two clean paths and no residue:

| Camino                                      | Forma contractual                       | Consecuencia en comprobantes                                                      |
| ------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------- |
| Baja sin certificado                        | Reducción parcial convenida (art. 1077) | **NC parcial** por el componente no devengado. Residuo = precio. **Forma B.**     |
| Baja con certificado → traslado/sustitución | Operación mantenida o sustituida        | Sin NC (sustitución), o NC + nueva FC al definirse la operación. **§4.3 aplica.** |

### 6.2 Si la retención _debe_ salir de la factura — el cambio mínimo

Pregunta abierta 3 del ticket. Se responde condicionalmente, porque §5.1 no pudo cerrar el
antecedente.

1. **NC total** por toda la línea facturada — forma A. RG 4540 art. 2 (rescisión) + art. 3 2º párr.
   (identificación individual, o sea `CbtesAsoc` con la FC), dentro de los 15 días corridos.
2. **Ningún comprobante fiscal para la penalidad.** Bajo §5.1 una indemnización queda fuera de la
   enumeración del art. 1 de RG 1415, así que **no se debe factura, ni nota de débito, ni comprobante
   electrónico alguno**. No hay tipo de comprobante que nombrar — esa es la respuesta a "name the
   document type if one is required": **ninguno**. Confianza **media-alta**, argumento por silencio.
3. **Un documento no fiscal en su lugar**: un recibo / liquidación de resarcimiento, documento propio
   de la app. Nótese que RG 1415 art. 10 inc. d) define al recibo como "**comprobante que respalda el
   pago —total o parcial— de una operación que debe ser documentada mediante la emisión de
   facturas**" y lo declara **no válido como factura** — lo cual acá no molesta, precisamente porque
   **no hay deber de facturar**. El recibo no está sustituyendo a una factura; no hay factura que
   sustituir.
4. **Consecuencia de modelo**: el total derivado de la fila dada de baja va a cero (restaurando el
   "a withdrawn inscription owes zero" de #600 sin la excepción acotada), y la plata retenida pasa a
   ser tesorería pura — visible en `Saldo disponible` y reembolsable, nunca asignada. Esa es la
   versión del modelo que la decisión 4 de #650 rechazó por razones internas; **esas razones internas
   quedan intactas por este research**.

---

## 7. WSFEv1 — nada reacciona a una NC parcial que deja residuo

**Confianza: ALTA para los textos (F6, rev. 1/9/2026); MEDIA-ALTA para el hallazgo negativo.** El
anclaje en estrella (`CbtesAsoc` = la factura) ya está resuelto en #610 y no se re-deriva.

> **10237** — tabla **Validaciones NO Excluyentes**, campo `<FECAEDetRequest>/ImpTotal</CbteAsoc>`:
> "**El importe de la nota de crédito supera el monto del comprobante asociado que estás
> ajustando.** Verificá los montos ingresados y de tratarse de un error, tenés que efectuar el
> ajuste o anulación de la operación según corresponda."

> **10197** — tabla **Validaciones Excluyentes**: "**Si el comprobante es Debito o Credito, se deberá
> informar de forma obligatoria los campos Fecha Comprobantes Asociados Desde/Hasta, o al menos un
> comprobante asociado.**"

> "Cabe aclarar que **las validaciones excluyentes son aquellas que en el caso de no ser superadas
> provocan un rechazo y las validaciones no excluyentes aprueban la solicitud pero con
> observaciones**."

1. **10237 is one-directional and non-excluding.** It fires only when the NC **supera** the associated
   comprobante. **An NC whose `ImpTotal` is _less_ than the FC's does not trip it at all** — a partial
   NC leaving a residue standing on the FC is invisible to WSFEv1. Its CAEA twin is **818**, with
   materially identical wording; both were added in manual rev. 3.4 (17/5/2024).
2. **No validation requires ΣNC = FC total.** An exhaustive read of the NC-amount validations finds
   only 10237 and 818, both phrased against a **single** associated comprobante ("el comprobante
   asociado que estás ajustando"). Nothing aggregates across multiple NCs, nothing tracks a running
   balance, nothing requires closure to zero. Confidence **medium-high** — exhaustive search of the
   official manual, but a negative finding cannot exclude an undocumented server-side rule.
3. **10197 is excluding** and is satisfied by the star: at least one `CbtesAsoc` entry.
4. **Conclusion for #654's open question 4: WSFEv1 does not react differently to form B.** It does not
   react to form B at all. The web service is indifferent between crediting the full line and
   crediting part of it. **The choice is normative and contractual, never technical.**

---

## 8. Lo que no se pudo resolver

Se lista explícitamente, por el pedido de #654 de distinguir lo que la norma dice de lo que se
infiere.

1. **La pregunta central no está respondida por ninguna norma relevada.** Ninguna norma de AFIP/ARCA,
   dictamen, entrada del ABC ni manual aborda si una NC parcial es el instrumento _correcto_ cuando
   parte de la plata cobrada se retiene. RG 4540 calla sobre importes; RG 1415 calla sobre la
   recaracterización de una seña tras la rescisión. **El diseño no está prohibido, pero tampoco
   autorizado.** Ése es el hueco, y es real.
2. **Recaracterización retroactiva de una seña.** RG 1415 art. 1 inc. e) mete a la seña que congela
   precio en el régimen _cuando se percibe_; nada dice en qué se convierte una vez rescindida la
   operación y retenido el anticipo. Ninguna norma tiende ese puente.
3. **El texto real del reglamento.** Todo el §2 depende de una redacción que este research sólo tiene
   parafraseada. Los arts. 1064/1065 hacen decisivo el contexto: si el reglamento confiere en otro
   lado una facultad de arrepentimiento, si obliga recíprocamente a la entidad, si llama al pago
   "seña", "anticipo", "derecho de inscripción" o "matrícula". **Es la mayor incógnita individual.**
4. **Quién es la contraparte contractual** — academia (probablemente no consumidora) o bailarín /
   familia (probablemente consumidor). Invierte §3.1 y §3.2, y §3.2 es el único hallazgo que podría
   forzar la forma A en casos concretos.
5. **Cómo se perfecciona la inscripción** — presencial vs. online. Determina si aplica la revocación
   irrenunciable de 10 días del art. 1110.
6. **Si la fracción retenida es proporcionada** a costos reales incurridos en la inscripción. El
   art. 794 2º párr. y el art. 1119 dependen de una comparación fáctica para la que no hay datos.
7. **Jurisprudencia.** No se relevó — el encargo era sólo fuentes primarias. Si los tribunales
   argentinos de hecho recalifican cláusulas de "seña que se pierde" como cláusulas penales, y si el
   art. 1121 inc. a) ampara una retención re-etiquetada, quedan **sin verificar**. Todo el §2 y el §3
   son texto legal más razonamiento, no holdings.
8. **Tratamiento del importe retenido en ingresos brutos de Monotributo** (§5.3). Sin investigar;
   probablemente la pregunta con más plata detrás.
9. **Si ARCA aplica algún control agregado no documentado del lado del servidor sobre NC asociadas.**
   Sólo verificable empíricamente en homologación — el mismo pendiente que #610 ya arrastra para 10237.
10. **La entrada del ABC sobre señas que no congelan precio** (`id=12668523`, que los buscadores
    resumen como _"Si el anticipo o seña no congela precio no nace el hecho imponible…"_) está
    **muerta**; el ABC actual no devuelve resultado para ese ID. No se la usó. **No se encontró
    ninguna entrada del ABC sobre indemnización o cláusula penal.**

---

## 9. Implicancias para el sistema

1. **La forma B no queda invalidada, y tampoco queda avalada por ARCA.** Su pie se corre del art. 2
   de RG 4540 (que calla) al **reglamento**. La justificación fiscal de la decisión 4 de #650 debería
   reformularse: no _"lectura directa del art. 2"_ sino _"no prohibida por ninguna norma relevada, y
   vuelta exacta por la cláusula del §3"_.
2. **La cláusula es el entregable, y no es un artefacto del repo.** El reglamento vive fuera del
   código y es de la entidad. Si se adopta, nada del spec se mueve; §3 es un hand-off, no una tarea.
3. **La Opción B tiene un dividendo de modelado.** Partir el precio en _derecho de inscripción_ +
   _derecho de participación_ hace que el total derivado de la fila dada de baja sea **exactamente el
   primer componente** — una cifra definida y con nombre, en lugar de "lo que hubiera quedado
   asignado". Es un invariante más limpio que el que la forma B tiene hoy, y sobrevive a la regla de
   ADR-0009 (sin estado financiero persistido) porque ambos componentes son precios, ya
   snapshot-eables.
4. **La Opción C dolería.** Una escala que decae con el tiempo vuelve al importe retenido una función
   de `withdrawnAt`, que el modelo derivado tendría que cargar. Preferir A o B.
5. **La rama del certificado médico debería ser _traslado/sustitución_, no una exención.** Es el
   cambio jurídico de mayor palanca (§3), y además es la rama bajo la cual el §4.3 del research
   anterior (_anticipo a facturar contra una operación futura_) aplica limpiamente.
6. **Dos correcciones de cita a arrastrar** (§5.2): RG 1415 **art. 13**, no art. 8, es el artículo de
   plazos; Ley de IVA **art. 5** último párrafo, no art. 10, lleva la regla de señas.
7. **Técnicamente no cambia nada.** WSFEv1 es indiferente (§7). Ningún tipo de comprobante nuevo,
   ninguna validación nueva, ningún camino de emisión nuevo.
