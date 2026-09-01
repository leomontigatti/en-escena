# VAT-exempt civil association as issuer (not monotributo): comprobante class, VAT exemption and notas de crédito

> Research against primary sources (RG 1415/2003 consolidated text, RG 4290/2018, RG 4291/2018,
> RG 5616/2024, RG 5700/2025, RG 5866/2026, RG 4540/2019, VAT Law 23.349 t.o. 1997 arts. 3, 4,
> 7 and 7.1, Law 20.628 t.o. 2019 art. 26, Decrees 493/2001, 496/2001, 845/2001 and 692/1998,
> Law 25.920, Law 16.656, Law 24.800, WSFEv1 developer manual v4.5 and ARCA's public registry) on the
> tax standing of En Escena's real issuer.
>
> Complements [ADR-0011](../adr/superseded/0011-invoicing-concept-portion-and-surfaces.md) (concept, portion
> and surfaces), [ADR-0012](../adr/superseded/0012-arca-unreachable-contingency-and-recovery.md)
> (contingency) and the two earlier research documents, no longer in the working tree:
> `git show 6ab0610:docs/research/arca-nota-credito-posterior.md` and
> `git show e252d96:docs/research/repr-impresa-factura-c-monotributo.md`.
>
> **Scope warning.** This is **not accounting or legal advice**. The document separates three planes:
> _what the rule says_, _what is on record in ARCA's registry_ and _what is arguable judgement_.
> Section [§7](#7-what-to-confirm-with-the-entitys-accountant) is the only one that matters before
> touching the tax standing: question 3 **cannot be settled from public sources**.

## Official sources consulted

- **RG 1415/2003 (AFIP) — Régimen de emisión de comprobantes**, consolidated text (art. 16 replaced
  by RG 5198/2022; Anexo II Título II inc. d replaced by RG 5700/2025 and reissued by RG 5866/2026):
  https://servicios.infoleg.gob.ar/infolegInternet/anexos/80000-84999/81316/texact.htm
  · https://biblioteca.afip.gob.ar/dcp/REAG01001415_2003_01_07
- **RG 4290/2018 (AFIP) — Obligación de emitir comprobantes electrónicos o por Controlador Fiscal**:
  https://www.argentina.gob.ar/normativa/nacional/resoluci%C3%B3n-4290-2018-313087/texto
- **RG 4291/2018 (AFIP) — R.E.C.E., the electronic comprobante operating regime**:
  https://biblioteca.afip.gob.ar/dcp/REAG01004291_2018_08_02
- **RG 5616/2024 (ARCA) — Condición frente al IVA del receptor**:
  https://www.argentina.gob.ar/normativa/nacional/resoluci%C3%B3n-5616-2024-407369/texto
- **RG 5614/2024 (ARCA) — Régimen de Transparencia Fiscal al Consumidor (Law 27.743)**:
  https://www.argentina.gob.ar/normativa/nacional/resoluci%C3%B3n-5614-2024-407183/texto
- **RG 4540/2019 (AFIP) — Notas de crédito y/o débito. Condiciones**, consolidated text:
  https://servicios.infoleg.gob.ar/infolegInternet/anexos/325000-329999/326036/texact.htm
- **VAT Law, t.o. 1997 (Decree 280/97)** — arts. 3, 4, 7 and the unnumbered article following
  art. 7 ("art. 7.1"): https://servicios.infoleg.gob.ar/infolegInternet/anexos/40000-44999/42701/texact.htm
  · table for art. 7 inc. h: https://www.consejo.org.ar/Bib_elect/BD_May/documentos/art7_leyIVA.htm
- **Decree 493/2001**: https://biblioteca.afip.gob.ar/dcp/DEC_C_000493_2001_04_27
  · **Decree 496/2001**: https://biblioteca.arca.gob.ar/dcp/DEC_C_000496_2001_04_28
  · **Decree 845/2001**: https://servicios.infoleg.gob.ar/infolegInternet/anexos/65000-69999/67460/norma.htm
  · **Decree 692/1998 (VAT regulatory decree), art. 33**: https://biblioteca.afip.gob.ar/dcp/DEC_C_000692_1998_06_11
- **Law 25.920** (3rd and 4th paragraphs of art. 7.1):
  https://www.argentina.gob.ar/normativa/nacional/ley-25920-98435/texto
- **Income Tax Law 20.628, t.o. 2019 (Decree 824/19), art. 26**:
  https://www.argentina.gob.ar/normativa/nacional/decreto-824-2019-332890/actualizacion
- **Law 24.800 (Ley Nacional del Teatro), art. 2**:
  https://servicios.infoleg.gob.ar/infolegInternet/anexos/40000-44999/42762/texact.htm
- **WSFEv1 — developer manual**:
  https://www.afip.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf
- **ARCA public registry** — Condición Tributaria file (RG 1817):
  https://www.afip.gob.ar/genericos/cInscripcion/archivoCompleto.asp
  · **Full RG 2681 listing** (income tax exemption certificates):
  https://servicioscf.afip.gob.ar/Publico/Rg2681/consulta.aspx

---

## 0. Executive summary

| Question                                                                             | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Confidence                                                                                                         |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1 — Which class does a VAT **Exento** or **No alcanzado** subject issue?             | **Class C.** RG 1415 **art. 16 inc. a)** (text as amended by RG 5198/2022). Not Anexo IV: the class is set by arts. 15/16/17 of the body of the RG. The **issuer's** condition decides C; the recipient's only splits A vs. B when the issuer is RI.                                                                                                                                                                                                                      | **High**                                                                                                           |
| 1b — Same grounds as a monotributista?                                               | **No.** Same article, **different subsections**: exempt → art. 16 inc. a); monotributo → art. 16 inc. b). Substantively: an exempt subject generates no separable output VAT; a monotributista replaced VAT with the integrated tax (Anexo Law 24.977 art. 28).                                                                                                                                                                                                           | **High**                                                                                                           |
| 2 — Does the income tax exemption carry the VAT one with it?                         | **No.** Different taxes and different techniques: income tax has a **subjective** exemption (art. 26 inc. f Law 20.628 + RG 2681 certificate); VAT **has no subjective exemption** for civil associations — art. 7 enumerates **transactions**. The income tax certificate says nothing about VAT.                                                                                                                                                                        | **High**                                                                                                           |
| 3 — Is the service (registration fee charged to academies) really VAT-exempt?        | **Probably NOT.** Art. 7 inc. h) ap. 6 does not require the recipient to be a member (a direct relationship with the entity's specific purposes is enough), but **art. 7.1 switches it off by express text** for "los espectáculos y reuniones de carácter artístico … **de danza** … deportivos". A dance competition is literally that.                                                                                                                                 | **Medium-high** on the literal reading; **the practical conclusion depends on facts only the accountant has** (§7) |
| 3b — Could Factura A/B apply instead of C?                                           | **Yes, if §3's reading is confirmed.** A civil association **cannot be a monotributista** (Anexo Law 24.977 art. 2: only natural persons and undivided estates), so the only options are **Exento** (class C) or **Responsable Inscripto** (classes A/B).                                                                                                                                                                                                                 | **High** on the option space                                                                                       |
| 3c — What does ARCA's registry say today?                                            | **CUIT 30-71761159-0 · Proyecciones Artísticas Asociación Civil · VAT = `EX` (Exento)**, income tax `EX` with an RG 2681 certificate valid 01/01/2026–31/12/2026, **inciso f**. Activities 949990 (association services n.e.c.) and **900021 (composition and performance of theatrical, musical and artistic works)**.                                                                                                                                                   | **High** (empirical, registry of 01/08/2026)                                                                       |
| 4 — Class C `CbteTipo` codes in WSFEv1                                               | **11** Factura C · **12** Nota de Débito C · **13** Nota de Crédito C · **15** Recibo C (plus 211/212/213 FCE MiPyME, a different regime). Validation 10007: _"11, 12, 13, 15, 211, 212, 213 para los clase C"_.                                                                                                                                                                                                                                                          | **High**                                                                                                           |
| 4b — Does an exempt issuer emit NC/ND under the same conditions as a monotributista? | **Yes, identically.** RG 4540/2019 draws no distinction by subject type in any article; RG 1415 art. 16 puts exempt subjects and monotributistas in the same class. **No difference at all**.                                                                                                                                                                                                                                                                             | **High**                                                                                                           |
| 5 — What differs operationally from monotributo?                                     | Four things: (a) the electronic invoicing obligation comes from **RG 4290 art. 6 inc. c)** (exempt subjects), not from the monotributo schedule; (b) RG 4291 art. 6 **bars exempt subjects from the RECE application** — WebService or "Comprobantes en línea" only; (c) the issuer legend is **"IVA EXENTO"** (RG 1415 Anexo II ap. A Tít. I), not "Responsable Monotributo"; (d) **no caps, categories or recategorization apply** — the entity cannot join the regime. | **High**                                                                                                           |
| 5b — Does the recipient's VAT condition apply?                                       | **Yes, and with no restriction on values in class C.** RG 5616/2024 art. 2. All **eleven** conditions are admissible for class C (the only class with no restriction).                                                                                                                                                                                                                                                                                                    | **High**                                                                                                           |
| 5c — Does the Régimen de Transparencia Fiscal (RG 5614/2024) apply?                  | **No.** Law 27.743 art. 98 and RG 5614 art. 2 pto. 5 land on the **responsable inscripto issuer**. A class C issuer has no "IVA Contenido" to display. Same as the monotributista: no change from the earlier research.                                                                                                                                                                                                                                                   | **High** on the rule; **medium** in practice (ARCA's public messaging is contradictory)                            |
| 6 — Different restrictions for an exempt issuer's nota de crédito?                   | **None.** Same art. 2 (original issuer only), same art. 3 (same recipient, associated comprobante or `PeriodoAsoc`, **15 calendar days**). RG 4540 art. 5 allows for specific RGs; **none exists for exempt entities**.                                                                                                                                                                                                                                                   | **High**                                                                                                           |
| **Collateral finding (not asked, but serious)**                                      | The system sends **`DocTipo` 99 / `DocNro` 0 (anonymous final consumer)** and a fixed `CondicionIVAReceptorId` 5. A **dance academy is a business, not a final consumer**: RG 1415 Anexo II ap. A Tít. II incs. a)/c)/e) require the **recipient's CUIT with no amount threshold**. The $10,000,000 threshold lives in **inc. d)**, which only governs "cuando se trate de un sujeto que revista el carácter de consumidor final".                                        | **High**                                                                                                           |

---

## 1. The comprobante class is set by the issuer's condition

The premise "the class comes from Anexo IV of RG 1415" is false. Anexo IV governs **special
situations** by transaction or activity (notas de crédito, transactions on behalf of third parties,
tolls, etc.). The class is set by **arts. 15, 16 and 17** of the body, Título II, Capítulo E.

**RG 1415 art. 16**, text in force per art. 10 pto. 2 of **RG 5198/2022** (B.O. 31/5/2022, effective
1/6/2022):

> "Deben estar identificados con la letra "C", los comprobantes previstos en el artículo 8°, inciso
> a) —excepto la factura de exportación y los tiques emitidos a través de Controladores Fiscales—,
> que emitan los responsables que se indican a continuación:
> **a) Sujetos exentos o no responsables, ante el impuesto al valor agregado.**
> **b) Sujetos adheridos al Régimen Simplificado para Pequeños Contribuyentes (RS)."**
> ([RG 1415 art. 16](https://servicios.infoleg.gob.ar/infolegInternet/anexos/80000-84999/81316/texact.htm))

**Confirmed: a VAT-exempt civil association issues Factura C.** And the grounds **do differ** from
the monotributista's, even though both land in the same article:

|                              | Regulatory basis            | Substantive basis                                                                                                |
| ---------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| VAT-exempt civil association | RG 1415 art. 16 **inc. a)** | There is no output VAT to separate out: the transaction is exempted by art. 7 of the VAT Law (if it is — see §3) |
| Monotributista               | RG 1415 art. 16 **inc. b)** | The integrated tax **replaces** VAT (Anexo Law 24.977 art. 28)                                                   |

Full issuer × recipient map:

| Issuer                                     | Recipient                                                | Class                  |
| ------------------------------------------ | -------------------------------------------------------- | ---------------------- |
| Responsable Inscripto                      | RI or Monotributo                                        | **A** (art. 15 inc. a) |
| Responsable Inscripto                      | Exempt, non-responsible, final consumer, non-categorized | **B** (art. 15 inc. b) |
| **Exempt / non-responsible / not covered** | anyone                                                   | **C** (art. 16 inc. a) |
| Monotributista                             | anyone                                                   | **C** (art. 16 inc. b) |
| Anyone, export transaction                 | —                                                        | **E** (art. 17)        |

**The class is not chosen: it follows from the issuer's registered condition.** That is why the
single-variant `comprobanteIssuerIvaCondition` enum in `app/db/schema/comprobantes.ts` is a correct
model, and also why **if the tax standing changes, the class changes** and so does the whole model
(see §8).

---

## 2. Income tax exemption ≠ VAT exemption

These are two taxes with **two different exemption techniques**.

**Income tax — subjective exemption.** Law 20.628 t.o. 2019 **art. 26 inc. f)** (formerly art. 20
inc. f):

> "Las ganancias que obtengan las asociaciones, fundaciones y entidades civiles de asistencia social,
> salud pública, caridad, beneficencia, educación e instrucción, científicas, literarias, **artísticas**,
> gremiales y las de cultura física o intelectual, siempre que tales ganancias y el patrimonio social
> se destinen a los fines de su creación, y en ningún caso se distribuyan, directa o indirectamente,
> entre los socios. **Se excluyen de esta exención aquellas entidades que obtienen sus recursos, en
> todo o en parte, de la explotación de espectáculos públicos**, juegos de azar, carreras de caballos
> y actividades similares […]"
> ([Law 20.628 t.o. 2019 art. 26 inc. f](https://www.argentina.gob.ar/normativa/nacional/decreto-824-2019-332890/actualizacion))

It is recognized through the **RG (AFIP) 2681/2009 exemption certificate**. The certificate is
declaratory, not constitutive, but without it the entity suffers withholdings.

> ⚠️ **Collateral risk, worth raising with the accountant.** The second paragraph of inc. f) excludes
> entities that obtain their resources "en todo o en parte" from **exploiting public performances**.
> A dance competition with a paying audience is a natural candidate for that characterization. The
> certificate is in force today and registered under inciso f, so ARCA has not applied it — but this
> is a latent exposure, not a settled question. **Medium** confidence (the text is clear; applying it
> to this case is judgement).

**VAT — objective exemption.** Law 23.349 t.o. 1997 **art. 7, first paragraph**:

> "Estarán exentas del impuesto establecido por la presente ley, las ventas, las locaciones indicadas
> en el inciso c) del artículo 3° y las importaciones definitivas que tengan por objeto las cosas
> muebles incluidas en este artículo **y las locaciones y prestaciones comprendidas en el mismo, que
> se indican a continuación** […]"

The technique is an **enumeration of transactions**. There is no "article of exempt subjects". The
only subjectively tinted door is art. 7 inc. h) ap. 6, which refers to the entities of art. 20 (today 26) of the income tax law — but **even that one is conditional**: it requires the service to "se
relacione en forma directa con sus fines específicos". And §3 shows there is a later rule that
switches it off.

**Immediate consequence**: the sentence "the association is exempt, that is why it issues Factura C"
is a shortcut. The correct reasoning is: the association is **registered as IVA Exento** in the
registry → RG 1415 art. 16 inc. a) → class C. Whether **that registration is the right one** is §3.

### 2.1. What ARCA's registry says about the real issuer

Empirical data pulled from ARCA's two public endpoints (Condición Tributaria file RG 1817 and the
full RG 2681 listing), both downloaded on **01/08/2026**:

| Field               | Value                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| CUIT                | 30-71761159-0                                                                                           |
| Name                | `PROYECCIONES ARTISTICAS ASOCIACION CIVIL`                                                              |
| **VAT**             | **`EX` — Exento**                                                                                       |
| Income tax          | `EX` — Exento (registered in Ganancias Sociedades, required to file returns)                            |
| Monotributo         | `NI` — Not registered                                                                                   |
| RG 2681 certificate | No. `2722026031151`, status **Certificado emitido**, **inciso f**, valid **01/01/2026 – 31/12/2026**    |
| Primary activity    | `949990` Association services n.e.c. (registered 05/2022)                                               |
| Secondary activity  | **`900021` Composition and performance of theatrical, musical and artistic works** (registered 05/2022) |
| Activity start      | 05/2022 · Tax domicile: Dr. Manuel Belgrano 81, Villa Carlos Paz, Córdoba                               |

**Reading.** As registered today, class C is the only class the entity **can** issue, and the repo's
code is correct. But the secondary registration under **900021 — performance of artistic works** is
exactly the activity that art. 7.1 of the VAT Law neutralizes (§3.2). The registry does not validate
the tax standing: it records what the taxpayer declared.

---

## 3. The critical question: is the service really VAT-exempt?

Positive framing first, because that is where everything starts: the registration fee is an
**onerous service supplied outside an employment relationship**, typified in **art. 3 inc. e) ap. 21**
("las restantes locaciones y prestaciones"), and the entity is a **taxable subject under art. 4
inc. e)** ("presten servicios gravados"), entirely regardless of it being non-profit. **There is no
"outside the scope" option here.** Either art. 7 exempts it, or it is taxed.

### 3.1. Art. 7 inc. h) ap. 6 does NOT require the recipient to be a member

Text in force (replaced by **Decree 493/2001** art. 1 inc. e):

> "**6)** Los servicios prestados por obras sociales creadas o reconocidas por normas legales
> nacionales o provinciales, por instituciones, entidades y asociaciones comprendidas en los incisos
> f), g) y m) del artículo 20 de la Ley de Impuesto a las Ganancias […], por instituciones políticas
> sin fines de lucro y legalmente reconocidas, y por los colegios y consejos profesionales, **cuando
> tales servicios se relacionen en forma directa con sus fines específicos**."
> ([art. 7 inc. h ap. 6](https://www.consejo.org.ar/Bib_elect/BD_May/documentos/art7_leyIVA.htm))

**The ticket's premise ("it exempts services to members") is wrong.** Ap. 6 is an
**objective-functional** test on the service, not a membership test. The academies being third
parties **does not disqualify it on its own**. The proof is in the law's own internal contrast: it
knows perfectly well how to demand a personal link when it wants to:

- **Ap. 7, 3rd paragraph** (health): the exemption does not apply "en la medida en que **los
  beneficiarios de la prestación no fueren matriculados o afiliados directos o integrantes de sus
  grupos familiares**".
- **Art. 7.1**: reserves exceptions for obras sociales serving "sus **afiliados obligatorios**" and
  for professional associations serving "sus **matriculados, afiliados directos y grupos familiares**".
- **Income tax art. 26 inc. g)** (mutuals): "los beneficios que **éstas proporcionen a sus asociados**".

None of those formulas appears in ap. 6.

A note on "membership dues": they do not appear in ap. 6. They fall outside VAT because they do not
pay for an individualized service under art. 3, not because some exemption names them. A
**registration fee charged to a non-member third party is consideration for a concrete service** — it
is not a membership due. **High** confidence.

Renumbering note: the VAT Law still refers to "los incisos f), g) y m) del artículo 20 … t.o. 1997".
In the **t.o. 2019** those subsections are **f), g) and l)** of **art. 26** (sports and physical
culture associations moved from m) to l). Nobody disputes the correspondence in practice.

### 3.2. Art. 7.1 switches off ap. 6 precisely for "de danza" — the decisive finding

The unnumbered article added after art. 7 ("art. 7.1"), text in force after
Decree 493/2001 → Decree 496/2001 → Law 25.920 → Law 26.115:

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
> ([Decree 496/2001](https://biblioteca.arca.gob.ar/dcp/DEC_C_000496_2001_04_28) ·
> [Law 25.920](https://www.argentina.gob.ar/normativa/nacional/ley-25920-98435/texto))

**A dance competition is, literally, a "reunión de carácter … de danza".** Art. 7.1 conditions
nothing on specific purposes or on the recipient's standing: it **blocks ap. 6 by subject matter**.
And the paradox is cruel: the more clearly the bylaws say "organize dance competitions", the more
sharply the service is described as a dance gathering and the more the block engages.

Full chronology, because it goes to the strength of the argument:

| Rule                           | What it did                                                                                                                                                                                                                       |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decree 493/2001 art. 1 inc. e) | Replaces **ap. 6** (the text in force today)                                                                                                                                                                                      |
| Decree 493/2001 art. 1 inc. f) | **Removes ap. 10, 11 and 21**. The ap. 10 of the time read exactly "los espectáculos y reuniones de carácter artístico, científico, cultural, teatral, musical, de canto, **de danza**, circenses, deportivos y cinematográficos" |
| Decree 493/2001 art. 1 inc. h) | Replaces art. 7.1 with the enumeration that includes "de danza"                                                                                                                                                                   |
| Decree 496/2001                | Reinstates as **ap. 10** only the theatrical performances of Law 24.800, and carves them out of art. 7.1                                                                                                                          |
| Decree 845/2001                | Adds **ap. 11** (amateur sport)                                                                                                                                                                                                   |
| Law 25.920 (9/9/2004)          | Adds the 3rd and 4th paragraphs to art. 7.1                                                                                                                                                                                       |
| Law 26.115 (19/7/2006)         | Repeals the word "teatrales" from the art. 7.1 carve-out                                                                                                                                                                          |

In other words: **the generic exemption for dance performances existed and was repealed in 2001.**
What remains is an express block.

### 3.3. Ap. 10 and 11 exempt ACCESS, not registration

Text in force:

> **10)** "Los espectáculos de carácter teatral comprendidos en la Ley Nº 24.800 y la contraprestación
> exigida para el ingreso a conciertos o recitales musicales **cuando la misma corresponda
> exclusivamente al acceso a dicho evento**."
>
> **11)** "Los espectáculos de carácter deportivo amateur, en las condiciones que al respecto
> establezca la reglamentación, **por los ingresos que constituyen la contraprestación exigida para
> el acceso a dichos espectáculos**."

And the **VAT regulatory decree (Decree 692/1998) art. 33**, text per Decree 1230/2001, closes ap. 11:

> "La exención dispuesta en el punto 11 […] comprende **los ingresos que constituyan la
> contraprestación exigida para el acceso a los espectáculos deportivos**, cuyos protagonistas sean
> **deportistas aficionados o amateurs**, entendiéndose por tales a aquellas personas físicas que
> **no perciben retribución por practicar un deporte**."

Reinforcement from another part of the statute: **art. 7 inc. c)** exempts "**billetes de acceso** a
espectáculos teatrales comprendidos en el artículo 7º, inciso h), apartado 10".

**Conclusion: an academy's registration fee is not an admission ticket.** It is the price of the
service of being admitted to compete — a different supply, with a different customer and a different
consideration, typified in art. 3 inc. e) ap. 21. **Even if audience tickets turned out to be exempt,
that would not exempt registration.** They are two separate taxable events. **High** confidence.

Ap. 10 via Law 24.800 deserves an honest mention, because it is the only non-frivolous argument on
the exemption side. **Art. 2 inc. b) of Law 24.800** includes among the theatrical forms "expresión
corporal, de cámara, **teatro danza** y otras que posean carácter experimental". But: (i) "teatro
danza" is a specific stage genre, not "dance competition"; (ii) art. 2 requires the "representación
de un hecho dramático" before an "auditorio"; (iii) **even if it fit, ap. 10 exempts the
performance/access, not the participant's fee**. Confidence that ap. 10 does **not** cover
registration: **medium-high**.

### 3.4. Generic exemptions from other laws do not save it either

The 4th paragraph of art. 7.1 rescues exemptions from "todo impuesto nacional" predating 9/9/2004,
expressly naming **Law 16.656 art. 3 inc. d)**. But that law exempts non-profit civil entities
devoted to **education, social assistance and public health** — organizing dance competitions is none
of the three, absent an educational framing that would have to be supported by facts.

Case law has also held that this rescue **does not operate** for the situations in the first
paragraph of art. 7.1. _QUETRA SA (TF 34577-I) c/ DGI_, CNACAF, 15/12/2022: "La excepción que
introdujo la ley 25.920 … no era aplicable respecto de los servicios enumerados en el primer párrafo
del artículo 7.1". **High** confidence that the holding exists, **medium** that it is settled.

### 3.5. The argument on the other side: Decree 493/2001 is unconstitutional

It is real and it is strong: Decree 493/2001 **removed exemptions by decree**, under the delegation
of Law 25.414, which collides with the principle that taxation is reserved to statute (art. 76 CN).
In _Club Atlético Huracán Asociación Civil c/ DGI_, the CNACAF declared **Decree 493/01
unconstitutional** insofar as it excluded sporting events from the exemption, with a concurring
opinion from the PGN.

Two observations that temper its practical usefulness:

1. **The "de danza" enumeration in art. 7.1 also comes from Decree 493/2001.** If the decree falls,
   the block falls with it. That is: the argument, if it prevails, resolves the case in the entity's
   favour.
2. **But it has to be litigated.** A taxpayer cannot self-assess as exempt by invoking an
   unconstitutionality that has not been declared as to them. At first instance the TFN had upheld
   ARCA's assessment in that same case. Meanwhile the entity carries the risk: assessment,
   interest (art. 37 Law 11.683) and an omission penalty (art. 45).

Confidence: **medium-high** that the ruling exists; **low** that ARCA will follow it at the
administrative stage.

### 3.6. Verdict

**On the literal reading of the rules in force, the registration fee charged to non-member academies
is subject to VAT.** If that is confirmed, the entity should be **Responsable Inscripto** and issue
**Factura A** to RI academies (with VAT itemized at 21%) and **Factura B** to exempt, monotributo or
final-consumer academies — **not class C**. That would change the whole model.

Honest counterweights, which keep the point from being closed here:

- The entity **has been registered as IVA Exento since 06/2022** and holds a current income tax
  certificate under inciso f. Someone adopted that standing and ARCA has not challenged it in four
  years.
- Ap. 6's "direct relationship with specific purposes" requirement is **comfortably met** if the
  bylaws say the entity's object is organizing dance competitions. Where the entity loses is
  art. 7.1, not ap. 6.
- If the fee substantially pays for a **teaching / training** service (clinics, masterclasses,
  technical feedback from the jury) rather than participation in a performance, a different framing
  opens up — but it needs real, documented support, not a label.
- If the entity were RI, it would **recover input VAT** on the entire cost of the event (venue,
  sound, staging, jury). The net impact of the 21% may be far smaller than it looks. It would also
  bring in the obligation to **apportion input VAT** (art. 13) for having both taxed and untaxed
  transactions.

**This is exactly what has to be taken to the accountant (§7), not a conclusion the system can reach
on its own.**

---

## 4. Notas de crédito and débito: no difference at all from being exempt

### 4.1. Class C `CbteTipo` codes in WSFEv1

Validation **10007** of the developer manual enumerates the full universe:

> "Campo CbteTipo sea: … **- 11, 12, 13, 15, 211, 212, 213 para los clase C.** … Consultar método
> `FEParamGetTiposCbte`."

| Code            | Manual label                                                             | Used in En Escena?                 |
| --------------- | ------------------------------------------------------------------------ | ---------------------------------- |
| **11**          | `Factura C`                                                              | Yes (`FACTURA_C_CBTE_TIPO`)        |
| **12**          | `Nota de Débito C`                                                       | No (no use case today)             |
| **13**          | `Nota de Crédito C`                                                      | Yes (`NOTA_CREDITO_C_CBTE_TIPO`)   |
| **15**          | `Recibo C`                                                               | No                                 |
| 211 / 212 / 213 | `Factura / Nota de Débito / Nota de Crédito electrónica MiPyMEs (FCE) C` | No — a different regime (FCE), n/a |

Corroborated within the same manual by observation **10188** ("…o **11 - Factura C** o **15 -
Recibo C**…") and validation **812**. **High** confidence.

> ⚠️ Several third-party SDKs (e.g. `afipts.com`) publish a **wrong** mapping
> ("12 Recibo C / 13 ND C / 14 NC C"). ARCA's manual refutes it. The repo's values (11 and 13) are
> correct.

The literal `Desc` values from `FEParamGetTiposCbte` are not in the manual (only the
`Id`/`Desc`/`FchDesde`/`FchHasta` schema). If the exact string ever matters for the printed
representation, it is worth dumping it from homologación with `scripts/arca-spike-homo.ts` and
freezing it as a fixture. **Medium** confidence on the exact bytes.

### 4.2. RG 4540/2019 draws no distinction by subject type

Read in full: **no article of RG 4540 mentions the issuer's VAT condition**. Art. 1 applies it to
"los diversos regímenes de facturación vigentes", generically. The four hard rules already collected
in the nota de crédito research hold identically for an exempt issuer:

1. **Issuer**: only whoever issued the original (art. 2).
2. **Recipient**: only the original's recipient (art. 3).
3. **Linkage**: associated comprobante **or** `PeriodoAsoc`; if the adjustment is for a price or
   quantity difference, **individual** identification (art. 3).
4. **Deadline**: **15 calendar days** from when the triggering fact arises (art. 3, last paragraph).

**Art. 5** allows a specific RG to displace RG 4540 — and **no specific RG exists for exempt
entities**. **High** confidence.

On the technical side, WSFEv1 also gates nothing on the issuer's condition:

- Validation **10040**: "Para 12 o 13 pueden asociarse **11, 12, 13 y 15**" — an NC C can chain onto
  another NC/ND C, or associate a Recibo C.
- `CbtesAsoc` is **optional** for 12/13: WSFEv1 grants a CAE to an NC C **with no association**.
  RG 4540's linkage obligation is **legal**, and the app has to enforce it on its own — ARCA will not
  reject on that ground. (Only the FCE regime makes it mandatory.) This is already implemented in
  `emit-nota-credito.server.ts`.
- Errors **10247/10248** (inactive or untrustworthy recipient CUIT) are blocking "salvo si el tipo de
  comprobante informado es Nota de Crédito" — there is a deliberate waiver for notas de crédito.
- Observation **10237** (nota de crédito amount higher than the associated one) remains
  **non-blocking**.

**Difference from a monotributista: none.** The only nuance is still the one already recorded in the
earlier research, and it is now simpler: neither the exempt issuer nor the monotributista settles
VAT, so neither has the input-VAT need that makes a nota de crédito mandatory for an RI (VAT Law
art. 12 inc. b). **High** confidence.

---

## 5. What differs operationally from monotributo

### 5.1. The obligation to invoice electronically

The universalization is **not** RG 4291 (that is the operating regime, the R.E.C.E.). The subjective
obligation is in **RG 4290/2018**:

- **Art. 2**: covered subjects — a) VAT RI; b) those in the RS; **c) VAT-exempt subjects**; d) those
  outside the scope of VAT.
- **Art. 6**: "Se encuentran obligados a utilizar […] 'Controlador Fiscal' **y/o a emitir comprobantes
  electrónicos originales en los términos de la Resolución General N° 4.291** […] **c) Los exentos en
  el impuesto al valor agregado.**"
- **Anexo, schedule for exempt subjects**: prior calendar year billing ≥ $1,000,000 → from
  **1/11/2018**; < $1,000,000 → from **1/1/2019**.

**A restriction specific to exempt subjects**, and the only substantive operational difference —
**RG 4291 art. 6**:

> "Los sujetos adheridos al Régimen Simplificado para Pequeños Contribuyentes (RS) **y los sujetos que
> revistan la calidad de exentos en el impuesto al valor agregado, únicamente podrán efectuar la
> solicitud de autorización de emisión de comprobantes electrónicos originales mediante las opciones
> indicadas en los incisos b) y c)**"

That is: **WebService** or **"Comprobantes en línea"**. The RECE application (inc. a) is off limits.
En Escena uses WebService, so it complies. **High** confidence.

### 5.2. The recipient's VAT condition — RG 5616/2024

The premise "it is RG 5198/2022" is wrong: RG 5198 implements the "Facturador" for monotributistas.
**The rule is RG (ARCA) 5616/2024** (B.O. 18/12/2024), **art. 2, second paragraph**:

> "En los comprobantes electrónicos a emitir en los términos de la citada resolución general se deberá
> identificar la condición ante el impuesto al valor agregado del cliente (comprador, locatario o
> prestatario) con relación a la operación que se documenta."

It draws no distinction by class or by issuer condition: **it is mandatory in class C as well**. Its
art. 4 inc. a) made the WebService mandatory from **15/4/2025**; ARCA kept postponing _rejection_ for
omitting it through the developer manual rather than by resolution (today, 1/8/2026, the manual
carries error **10246** as a **blocking** validation). **High** confidence on the obligation, **low**
on the exact chronology of the extensions — which does not matter: it always has to be sent, and
sending it never causes a rejection.

Admissible values, from `FEParamGetCondicionIvaReceptor` (the method accepts a `ClaseCmp` filter with
values `A`, `ALEY`, `B`, `C` or `49`):

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

**Class C is the only one with no restriction: all eleven conditions are admissible.** **High**
confidence on the list of values; **medium-high** on the column assignment (ARCA's PDF renders the
matrix with offsets that do not line up with the headers). If certainty matters, call
`FEParamGetCondicionIvaReceptor` with `ClaseCmp = "C"` in homologación and freeze the response.

Errors to code against: **10242** (value not allowed), **10243** (not valid for the class), **10246**
(mandatory).

### 5.3. Printed-representation legends specific to an exempt issuer

**RG 1415 Anexo II, Apartado A, Título I** (regarding the issuer) requires the condition legend from
the catalogue `"IVA RESPONSABLE INSCRIPTO"`, **`"IVA EXENTO"`**, `"NO RESPONSABLE IVA"`,
`"RESPONSABLE MONOTRIBUTO"`, `"MONOTRIBUTO TRABAJADOR INDEPENDIENTE PROMOVIDO"`,
`"MONOTRIBUTISTA SOCIAL"`, as applicable. **It is the only legend that changes relative to a
monotributista**, and the repo already has it right (`EMISOR_CONDICION_IVA_LABEL = "IVA Exento"`).

What an exempt issuer does **NOT** carry:

- **The Law 27.618 input-VAT legend** (RG 1415 art. 15 inc. a, text per RG 5003/2021) belongs to an
  **RI issuer invoicing an A to a monotributista**. It applies neither to an exempt issuer nor to
  class C.
- **The Transparencia Fiscal block (Law 27.743 / RG 5614/2024).** Law 27.743 **art. 98** replaces
  art. 39 of the VAT Law and the obliged subject is "**un responsable inscripto**"; exempt subjects
  and monotributistas appear there as **recipients**. And RG 5614 art. 2 pto. 5 replaces Anexo II
  ap. A **Título IV inciso a) — "Emisor responsable inscripto en el impuesto al valor agregado"**,
  and only that one. A class C issuer has no "IVA Contenido" to display. **Same conclusion as the
  monotributo research: the block does not go in.** **High** confidence on the rule; **medium** in
  practice, because ARCA's public messaging page says the measure reaches "a todo el universo de
  contribuyentes" — outreach material that clashes with the text of the RG. Empirically verifiable:
  issue a test Factura C in "Comprobantes en Línea" and see whether the PDF carries the block.
- **Nothing about the exemption certificate.** Neither RG 1415 Anexo II nor RG 2681/2009 requires the
  certificate number or validity period on the comprobante. On the contrary: the certificate template
  places the burden on the third party, who must "verificar en el citado sitio 'web' la condición de
  exento del beneficiario". **Medium-high** confidence (negative evidence).

### 5.4. Nothing from Monotributo applies

**Anexo to Law 24.977, art. 2** defines a **closed** subjective universe:

> "A los fines de lo dispuesto en este régimen, se consideran pequeños contribuyentes: 1) **Las
> personas humanas** que realicen venta de cosas muebles, locaciones, prestaciones de servicios y/o
> ejecuciones de obras […]; 2) **Las personas humanas** integrantes de cooperativas de trabajo […];
> y 3) **Las sucesiones indivisas** continuadoras de causantes adheridos al Régimen Simplificado […]"

A civil association (a legal person under art. 168 CCyC) **cannot join Monotributo under any
hypothesis**. Therefore **none of these apply**: annual gross-revenue caps by category (art. 8),
half-yearly recategorization (art. 9), maximum unit price, activity limits or automatic exclusion
(art. 20). **High** confidence. Consistent with the registry: Monotributo `NI`.

The correct standing, as a table:

| Axis              | VAT-exempt civil association                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| VAT               | **Exempt** subject — by transaction (art. 7), not by subject. See §3                                                   |
| Income tax        | Exempt under art. 26 inc. f) Law 20.628 t.o. 2019, with an RG 2681/2009 certificate                                    |
| Invoicing         | **General regime of RG 1415/2003** — there is no special regime. Class C under art. 16 inc. a)                         |
| Modality          | Electronic invoicing required by RG 4290 art. 6 inc. c); operating rules RG 4291, **WS or Comprobantes en línea only** |
| Libro IVA Digital | Covered — it is the reason stated in the recitals of RG 5616/2024                                                      |

> **Unread and pending**: **Anexo IV, Apartado B, ptos. 6 and 7** of RG 1415 ("Entidades deportivas y
> asociaciones comprendidas en los incisos f) y m) del art. 26 de la Ley de Impuesto a las Ganancias"
> and "instituciones educativas de gestión privada"), **both replaced by RG 5866/2026 effective
> 1/7/2026**. They may contain exceptions to the obligation to issue a comprobante, or authorization
> to consolidate monthly transactions into a single electronic comprobante. **This has to be read
> before closing any modelling decision.**

---

## 6. Collateral finding: the recipient is not a final consumer

It was not among the questions, but it is the most actionable correction in this whole research.

Today the system invariably sends:

```
DocTipo: 99          // anonymous final consumer
DocNro:  0
CondicionIVAReceptorId: 5   // Consumidor Final (env ARCA_CONDICION_IVA_RECEPTOR_ID)
```

**A dance academy is a business, not a final consumer for VAT purposes.** The amount threshold below
which the recipient may stay anonymous lives in **Anexo II, Apartado A, Título II, inciso d)** of
RG 1415, and that subsection opens with "**Cuando se trate de un sujeto que revista el carácter de
consumidor final en el impuesto al valor agregado**". The other subsections of the same Título require
a **CUIT with no amount threshold at all**:

| Subsection | Recipient               | Required data                                                                                                                                     |
| ---------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| a)         | Responsable inscripto   | Surname/company name · commercial address · **CUIT** · legend "IVA RESPONSABLE INSCRIPTO"                                                         |
| c)         | Exempt or not covered   | Same · **CUIT** · legend "NO RESPONSABLE IVA" or "IVA EXENTO"                                                                                     |
| d)         | **Final consumer**      | Legend "A CONSUMIDOR FINAL"; DNI/CUIL/CDI only if the amount is ≥ **$10,000,000** (text per RG 5700/2025, reissued by RG 5866/2026 art. 1 inc. f) |
| e)         | Monotributo             | Same · **CUIT** · legend "Responsable Monotributo" / "Monotributista social" / …                                                                  |
| f)         | Non-categorized subject | Same · **CUIT** · legend "SUJETO NO CATEGORIZADO"                                                                                                 |

And point 10 of the same Título places a burden on the buyer: "deberá informar al sujeto que emite y
entrega el comprobante su Clave Única de Identificación Tributaria (C.U.I.T.) y su condición frente al
impuesto al valor agregado".

RG 5866/2026 also added, in inc. d), a duty **independent of the amount**: the recipient must be
identified by CUIT "en caso de que el responsable lo requiera a los fines de poder computar la
correspondiente deducción en su declaración jurada del impuesto a las ganancias" — which is exactly
what an academy will want to do with this invoice.

**Correct payload for the real use case**: `DocTipo = 80` + the academy's CUIT +
`CondicionIVAReceptorId` with the academy's real condition (1, 4, 6, 13 or 16 in practice). **High**
confidence.

A technical nuance, so nobody confuses "ARCA does not reject me" with "this is legal": the WSFEv1
validations that block `DocTipo 99` above the threshold (**10014/10015**, the CAE path) are worded
**only for "tipo B"**; their CAEA-path twins (**1417/1418/1419**) say "**B o C**". Read literally,
WSFEv1 would **not** enforce the rule on a Factura C via `FECAESolicitar`. That is a technical gap,
not a permission: RG 1415 still governs, and the control has to live in the app. **Medium**
confidence (it is a reading of the manual's wording, which could be an editorial omission).

---

## 7. What to confirm with the entity's accountant

None of these questions can be settled from public sources. They are in order of impact: the first
three decide whether the system's model is correct or has to be redone.

1. **What is the literal text of the statutory purpose?** Does it say "organizar
   certámenes/competencias de danza"? Does it say "educación", "formación artística", "cultura
   física"? The word _educación_ opens the Law 16.656 + _Club 20 de Febrero_ route (CSJN, 26/9/2006);
   the phrase _organizar competencias_ triggers the art. 7.1 block.
2. **Did anyone decide to treat registration as exempt, and on what written grounds?** The IVA Exento
   registration dates from 06/2022. Is there a professional opinion, a binding ruling (RG 4497), or
   was it simply assumed that "civil association = exempt"? If it is the latter, there is a
   contingency for the periods still open to assessment.
3. **How is art. 7.1 of the VAT Law addressed** ("espectáculos y reuniones de carácter … **de danza**
   … deportivos"), which expressly switches off the art. 7 inc. h) ap. 6 exemption for this subject
   matter? This is THE question. With no answer, the correct standing is probably Responsable
   Inscripto → Factura A/B.
4. **What exactly does the registration fee buy?** Only the right to compete? Does it include tickets
   for companions? Does it include clinics, workshops, technical feedback from the jury? Are there
   separable items with distinct prices? Separability may allow different treatment per component —
   and a genuine training component changes the analysis.
5. **Are tickets sold to the public?** Who issues them, and for what amount relative to
   registrations? This decides two things: whether ap. 10/11 applies (partially), and whether the
   exclusion in **income tax art. 26 inc. f), 2nd paragraph** kicks in ("entidades que obtienen sus
   recursos, en todo o en parte, de la explotación de espectáculos públicos"), which would put the
   current exemption certificate at risk.
6. **Is the discipline federated as a sport** (dancesport) with a recognized federation, or presented
   as an artistic activity? Are the dancers paid? (Regulatory decree art. 33 requires that they are
   **not**, for ap. 11.)
7. **What VAT condition do the client academies have?** RI, exempt, monotributo. It decides A vs. B
   if the standing changes, and it decides the correct `CondicionIVAReceptorId` **right now** (§6).
8. **Why is invoicing going to an anonymous final consumer** instead of identifying the academy by
   CUIT? Was it a deliberate decision or an inherited assumption? (See §6: it probably breaches
   RG 1415 Anexo II ap. A Tít. II incs. a/c/e.)
9. **Does RG 1415 Anexo IV Apartado B pto. 6 apply** (entities under income tax art. 26 inc. f), text
   per RG 5866/2026 in force since 1/7/2026? There may be a monthly consolidation regime that changes
   the granularity of the comprobante.
10. **How large is registration revenue relative to the total?** Relevant to the quantitative
    "specific purposes" test and to sizing the contingency for periods still open to assessment.

---

## 8. Implications for the system

### 8.1. Inventory of "monotributo" or "class C" assumptions in the tree

The bulk of the correction is **already done** (issue #426): the code knows the issuer is exempt, not
a monotributista. These points remain:

| Location                                                                           | Assumption                                                                                                                  | Status                                                                                                                                                            |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CONTEXT.md:275`                                                                   | `comprobante` glossary entry: _"Factura C **for monotributo**, issued against ARCA/WSFEv1"_                                 | ❌ **Out of date.** It is the last place in the tree that says "monotributo". It should say "VAT-exempt issuer"                                                   |
| `app/db/schema/comprobantes.ts:17-25`                                              | Comment + `comprobanteIssuerIvaCondition = ["exento"]` enum                                                                 | ✅ Correct (#426). The comment "issues class C just like a monotributista" is accurate as to the outcome, even though the grounds are a different subsection (§1) |
| `app/lib/comprobantes/impreso.ts:6-23`                                             | `EMISOR_CONDICION_IVA_LABEL = "IVA Exento"` with a comment explaining the difference                                        | ✅ Correct. The rule spells the legend `"IVA EXENTO"` (uppercase, RG 1415 Anexo II ap. A Tít. I) — a cosmetic difference                                          |
| `app/lib/comprobantes/emit-factura-c.server.ts:37-39`                              | `ISSUER_IVA_CONDITION = "exento"`                                                                                           | ✅ Correct                                                                                                                                                        |
| `app/lib/comprobantes/arca/factura-c.ts:13,17`                                     | `FACTURA_C_CBTE_TIPO = 11`, `NOTA_CREDITO_C_CBTE_TIPO = 13`                                                                 | ✅ Correct (§4.1)                                                                                                                                                 |
| `app/lib/comprobantes/arca/factura-c.ts:18-19,152-153`                             | `DOC_TIPO_CONSUMIDOR_FINAL = 99` / `DOC_NRO_CONSUMIDOR_FINAL = 0` **hardcoded in `buildClassCVoucher`**                     | ❌ **Legally wrong** for the real use case (§6). The recipient is an academy with a CUIT                                                                          |
| `.env.example:83` · `emit-factura-c.server.ts:482`                                 | `ARCA_CONDICION_IVA_RECEPTOR_ID = "5"` (Consumidor Final), fixed per environment                                            | ❌ **Should be derived from the academy**, not be a deployment constant (§5.2, §6)                                                                                |
| `impreso.ts:23` · `print/model.ts:82` · `print/view.tsx:132`                       | `RECEPTOR_CONDICION_IVA_LABEL = "Consumidor Final"`                                                                         | ❌ A consequence of the above                                                                                                                                     |
| `print/view.tsx` (recipient block)                                                 | Missing the **"A CONSUMIDOR FINAL"** legend (or, once the above is fixed, CUIT + company name + address + condition legend) | ❌ Gap already flagged in the printed-representation research                                                                                                     |
| `print/view.tsx` (issuer block)                                                    | Missing **Ingresos Brutos**, **activity start date** and **commercial address** (RG 1415 Anexo II ap. A Tít. I)             | ❌ Pre-existing gap, not specific to the exempt standing                                                                                                          |
| `arca/client.server.ts:120-153` · `format.ts` · `list/server.ts` · `list/view.tsx` | Universe closed to types 11 and 13                                                                                          | ✅ Correct for the current scope. **Nota de Débito C (12)** exists and is not implemented — there is no use case today                                            |
| `app/lib/comprobantes/emit-nota-credito.server.ts`                                 | Mandatory linkage via `CbtesAsoc`                                                                                           | ✅ Correct **and necessary**: ARCA does not require it technically for class C (§4.2), so the control has to live here                                            |

### 8.2. What this research does **not** change

- Class C is correct **given the registered standing**. Nothing has to change because the issuer is a
  civil association rather than a monotributista: it is the same article, a different subsection.
- Codes 11/13, `Concepto: 2`, the absence of an `<Iva>` array, `ImpNeto = ImpTotal`, the nota de
  crédito linkage and the 15-day deadline: all still hold identically.
- The Transparencia Fiscal regime still does not apply, for the same substantive reason as before
  (there is no VAT to display), though by a different regulatory route (RI issuer, not "is not a
  monotributista").

### 8.3. What does need deciding

1. **Fix `CONTEXT.md:275`** — a minute's work, and it removes the last "monotributo" from the tree.
2. **Model the recipient** (`DocTipo` 80 + CUIT + the academy's `CondicionIVAReceptorId`). It is the
   correction with the largest real tax exposure and it is **independent** of how §3 is resolved. It
   requires persisting each academy's CUIT and VAT condition, and propagating it to the payload, the
   snapshot and the printed representation.
3. **Do not touch the class standing until the accountant answers §7.** If the answer is "Responsable
   Inscripto", the impact is structural: classes A/B by recipient, `ImpNeto` ≠ `ImpTotal`, an `<Iva>`
   array with rate 5 (21%), `CbteTipo` 1/2/3 and 6/7/8, and a printed representation with itemized
   VAT plus the RG 5614/2024 Transparencia Fiscal block. **The single-variant enum and the hardcoded
   `buildClassCVoucher` are the right cut point for that change**: both would fail loudly rather than
   silently emit a misclassified comprobante.

---

## 9. Confidence by question

| Question                                                         | Confidence                                                                                      | Why                                                                                                                                                                                                              |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 · Class C for an exempt issuer                                 | **High**                                                                                        | Express text of RG 1415 art. 16 inc. a), read from the consolidated text                                                                                                                                         |
| 1b · Grounds differ from monotributo                             | **High**                                                                                        | Different subsections of the same article; substantive bases documented                                                                                                                                          |
| 2 · Income tax ≠ VAT                                             | **High**                                                                                        | Incompatible exemption techniques, read from both statutes                                                                                                                                                       |
| 3 · The service is probably **not** exempt                       | **Medium-high** on the literal reading                                                          | Art. 7.1 names "de danza" in so many words. What lowers it: (a) the unconstitutionality of Decree 493/01 has appellate and PGN backing; (b) the entity has been registered as exempt for four years unchallenged |
| 3b · A/B could apply                                             | **High** on the option space (RI or Exempt; never monotributo); **medium** on which one applies | Depends on the facts in §7                                                                                                                                                                                       |
| 4 · Codes 11/12/13/15                                            | **High**                                                                                        | Validation 10007 of the manual, verbatim, corroborated by 10188 and 812                                                                                                                                          |
| 4b · No nota de crédito differences for an exempt issuer         | **High**                                                                                        | RG 4540 read in full: zero mentions of the issuer's condition                                                                                                                                                    |
| 5 · Operational differences (RG 4290/4291, legend, no caps)      | **High**                                                                                        | Express text on all four points                                                                                                                                                                                  |
| 5b · `CondicionIVAReceptorId` mandatory and unrestricted in C    | **High** on the obligation and the list; **medium-high** on the column matrix                   | The matrix was extracted from a PDF with ambiguous offsets — verifiable in homologación                                                                                                                          |
| 5c · Transparencia Fiscal does not apply                         | **High** on the rule; **medium** in practice                                                    | ARCA's public messaging contradicts the text of RG 5614                                                                                                                                                          |
| 6 · No different restrictions for an exempt issuer's NC          | **High**                                                                                        | RG 4540 art. 5 allows specific RGs and none exists for exempt subjects                                                                                                                                           |
| Collateral · The recipient cannot be an anonymous final consumer | **High**                                                                                        | The threshold is in inc. d), which only governs final consumers                                                                                                                                                  |
| Collateral · WSFEv1 would not enforce the rule in class C        | **Medium**                                                                                      | A reading of the manual's wording (10014/10015 say "tipo B"; 1417/1418/1419 say "B o C")                                                                                                                         |
