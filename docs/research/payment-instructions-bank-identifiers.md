# Argentine bank identifiers: CBU, CVU and alias formats, check digits and what a transfer form asks for

> Research against primary sources (BCRA Com. "A" 2622/1997, the BCRA CIMPRA ordering, the BCRA
> texto ordenado "Sistema Nacional de Pagos – Servicios de Pago" as of 18/08/2025, the texto
> ordenado "Sistema Nacional de Pagos – Transferencias" as of 07/08/2025 and its "normas
> complementarias" as of 14/05/2026, Com. "A" 6044/2016, Com. "A" 6215/2017, Com. "A" 6510/2018
> and ARCA's public FAQ) for issue [#868](https://github.com/leomontigatti/en-escena/issues/868),
> part of the `paymentInstructions` map [#867](https://github.com/leomontigatti/en-escena/issues/867).
>
> The goal is narrow: what an academy types into home banking to pay En Escena by transfer, and
> what the admin form for `paymentInstructions` can validate without guessing. Anything marked
> **unverified** was not found in a primary source and should not be relied on for a hard
> validation rule.

## Official sources consulted

- **BCRA Com. "A" 2622 (14/11/1997) — Clave Bancaria Uniforme (CBU)**, original text (Boletín
  Oficial 28/11/1997):
  https://www.argentina.gob.ar/normativa/nacional/comunicaci%C3%B3n-2622-1997-47564/texto
- **BCRA — Ordenamiento actualizado de Boletines CIMPRA, Sección 2, §2.3 "Clave Bancaria Uniforme
  (CBU)"** (structure plus a worked check-digit example):
  https://www.bcra.gob.ar/archivos/Pdfs/Medios_pago/SNP0220.PDF
- **BCRA texto ordenado "Sistema Nacional de Pagos – Servicios de Pago"** (t.o. 18/08/2025, last
  communication incorporated "A" 8303). Section 1 is the CBU, Section 2 the CVU, Section 3 the
  alias: https://www.bcra.gob.ar/archivos/Pdfs/Texord/t-snp-spd.pdf
- **BCRA texto ordenado "Sistema Nacional de Pagos – Transferencias"** (t.o. 07/08/2025, last
  communication incorporated "A" 8295): https://www.bcra.gob.ar/archivos/Pdfs/Texord/t-snp-tr.pdf
- **BCRA texto ordenado "Sistema Nacional de Pagos – Transferencias – Normas complementarias"**
  (t.o. 14/05/2026, last communication incorporated "A" 8436):
  https://www.bcra.gob.ar/archivos/Pdfs/Texord/t-snp-tr-nc.pdf
- **BCRA Com. "A" 6044 (17/08/2016) — creation of the "alias CBU" facility**:
  https://www.bcra.gob.ar/archivos/Pdfs/comytexord/A6044.pdf
- **BCRA Com. "A" 6215 (03/04/2017) — automatic alias assignment by COELSA**:
  https://www.bcra.gob.ar/archivos/Pdfs/comytexord/A6215.pdf
- **BCRA Com. "A" 6510 (15/05/2018) — creation of the Clave Virtual Uniforme (CVU)**:
  https://www.bcra.gob.ar/archivos/Pdfs/comytexord/a6510.pdf
- **BCRA public pages** "Alias CBU" (https://www.bcra.gob.ar/alias-cbu/) and "Clave Virtual
  Uniforme (CVU)" (https://www.bcra.gob.ar/clave-virtual-uniforme-cvu/).
- **ARCA FAQ 26145125 — "¿Qué es la Clave Única de Identificación Tributaria (CUIT)?"**
  (published 10/12/2024): https://servicioscf.afip.gob.ar/publico/abc/ABCpaso2.aspx?cat=3040
- **Argentina.gob.ar "Ley simple: Alias CBU"** (a government explainer of Com. "A" 6044, marked
  by the site itself as informational, not normative):
  https://www.argentina.gob.ar/justicia/derechofacil/leysimple/alias-cbu
- **Banco de la Nación Argentina FAQ** (a bank's own description of what the payer enters):
  https://bna.com.ar/Personas/CajaDeAhorrosEnPesosYDolares/PreguntasFrecuentesCajaDeAhorrosEnPesosYDolares
  and https://bna.com.ar/Personas/BNAMas/PreguntasFrecuentesBNAmas
- **Mercado Pago help 19761 — "¿Qué son mis CVU y alias?"** (a PSP's own description):
  https://www.mercadopago.com.ar/ayuda/19761

Secondary, used only for cross-checking and flagged where relied on: Wikipedia ES "Clave
Bancaria Uniforme" and "Clave Única de Identificación Tributaria".

## 1. CBU (Clave Bancaria Uniforme)

### 1.1 Length and structure

22 digits, all numeric, in two blocks. From Com. "A" 2622 and, verbatim in the current
consolidated text, t.o. "SNP – Servicios de Pago" §1.1:

| Block | Positions | Content |
| --- | --- | --- |
| 1 | 1–3 | Entity (bank) number, "número asignado por la cámara compensadora" |
| 1 | 4–7 | Branch number, zero-padded on the left |
| 1 | 8 | Check digit over positions 1–7 |
| 2 | 9–21 | "Identificación de la cuenta individual" (13 positions) |
| 2 | 22 | Check digit over positions 9–21 |

The CIMPRA ordering §2.3.2 adds how banks fill the 13-position account block: the first two
digits are "características de la cuenta" chosen by the bank ("ej.: tipo y moneda de la
cuenta") and the next eleven are the account number, zero-padded on the left. That split is a
bank convention, not something a payee's validator can check.

Sources: Com. "A" 2622
(https://www.argentina.gob.ar/normativa/nacional/comunicaci%C3%B3n-2622-1997-47564/texto);
t.o. SNP – Servicios de Pago §1.1 (https://www.bcra.gob.ar/archivos/Pdfs/Texord/t-snp-spd.pdf);
CIMPRA §2.3.2 (https://www.bcra.gob.ar/archivos/Pdfs/Medios_pago/SNP0220.PDF).

### 1.2 The two check digits

Both BCRA texts state the rule in one sentence: "Para el cálculo de los dígitos verificadores
deben aplicar la clave 10 con el ponderador 9713" (Com. "A" 2622; t.o. SNP – Servicios de Pago
§1.1). The CIMPRA ordering says the same ("módulo 10 y el ponderador 9713") and gives a worked
example, which pins the direction and the alignment of the weights:

- Block 1, `0110138` → check digit **2**.
- Block 2, `0201110037766` → check digit **4**.
- Full CBU of the example: `0110138202011100377664`.

The rule that reproduces both results (verified by computation while writing this document):

1. Take the digits of the block **without** its check digit.
2. Multiply them, **from right to left**, by the cyclic weights `3, 1, 7, 9, 3, 1, 7, 9, …`
   (the "9713" sequence read from the right). Written left to right that is
   `7 1 3 9 7 1 3` for the 7-digit block and `3 9 7 1 3 9 7 1 3 9 7 1 3` for the 13-digit block.
3. Sum the products, take the last digit (`sum mod 10`), and the check digit is
   `(10 - sum mod 10) mod 10`.

Worked block 1: `0·7 + 1·1 + 1·3 + 0·9 + 1·7 + 3·1 + 8·3 = 38` → `(10 − 8) mod 10 = 2`.
Worked block 2: sum is 176 → `(10 − 6) mod 10 = 4`.

The explicit left-to-right patterns `7139713` / `3971397139713` do not appear in the BCRA texts
retrieved here; they are the expansion of "ponderador 9713" that the worked example forces.
Wikipedia ES attributes the same expansion to a BCRA document (SNP3016.pdf, p. 23) that could
not be retrieved from bcra.gob.ar at the time of writing — **that citation is unverified**, but
the expansion itself is verified against the BCRA example above.

The two check digits are independent: each protects only its own block. A 22-digit string
therefore passes as a CBU iff the 8th digit checks positions 1–7 and the 22nd checks 9–21.

Sources: Com. "A" 2622; t.o. SNP – Servicios de Pago §1.1; CIMPRA §2.3.2 (worked example);
Wikipedia ES "Clave Bancaria Uniforme" note 2 for the SNP3016 attribution (secondary).

### 1.3 What a validator cannot tell

- Whether the 3-digit entity code is a real bank. BCRA does not publish the clearing-house entity
  table in the texts consulted; a validator would need a maintained list, which is out of scope
  for this effort.
- Whether the account exists or belongs to the stated holder. That lookup is what the payer's
  bank does at transfer time (§5).

## 2. CVU (Clave Virtual Uniforme)

### 2.1 Same length, same check digits

Created by Com. "A" 6510 (15/05/2018) for accounts at payment service providers (PSPs) such as
Mercado Pago, "con un formato compatible con el de la Clave Bancaria Uniforme". The current
consolidated text (t.o. SNP – Servicios de Pago §2.3) is explicit: "La CVU tendrá el mismo
formato que la CBU", 22 digits, and "los dígitos verificadores se calculan de acuerdo con lo
indicado para CBU en el segundo párrafo del punto 1.1". So the algorithm in §1.2 validates a CVU
unchanged.

### 2.2 How a validator tells a CVU from a CBU

t.o. SNP – Servicios de Pago §2.3:

| Block | Positions | CVU content |
| --- | --- | --- |
| 1 | 1–3 | "Código que indica clave virtual (3 posiciones). Se completa con **000**." |
| 1 | 4–7 | PSP code, unique system-wide, assigned by the CEC-BV (COELSA) |
| 1 | 8 | Check digit |
| 2 | 9 | "Reservado (1 posición). Se completa con **0**." |
| 2 | 10–21 | Client identifier, 12 positions, free for the PSP |
| 2 | 22 | Check digit 2 |

A 22-digit key starting with `000` is a CVU; anything else is a CBU. A stricter CVU check may
also require position 9 to be `0`.

### 2.3 Does it matter for a payee?

For En Escena, no. BCRA requires banks to process transfers to a CVU "en idénticas condiciones a
las transferencias inmediatas entre CBU de manera tal que, por ejemplo, no requieran pasos
adicionales ni el uso de interfaces gráficas diferenciadas" (t.o. SNP – Servicios de Pago §2.2),
and Banco Nación's FAQ describes outgoing transfers as made "con CBU, CVU o alias del
destinatario". Two practical differences a spec may care about:

- A CVU means the receiving account is at a PSP (a wallet), not a bank. The holder's institution
  shown on the payer's confirmation screen will be the PSP.
- Transfers in US dollars go only to CBUs (Banco Nación FAQ: "En dólares solo a CBU"). Irrelevant
  while En Escena collects in pesos.

Sources: Com. "A" 6510 (https://www.bcra.gob.ar/archivos/Pdfs/comytexord/a6510.pdf); t.o. SNP –
Servicios de Pago §§2.1–2.3 (https://www.bcra.gob.ar/archivos/Pdfs/Texord/t-snp-spd.pdf); BCRA
CVU page (https://www.bcra.gob.ar/clave-virtual-uniforme-cvu/); BNA FAQ
(https://bna.com.ar/Personas/BNAMas/PreguntasFrecuentesBNAmas).

## 3. Alias (alias-CBU / alias-CVU)

### 3.1 Character set, length, case

The normative definition is t.o. SNP – Servicios de Pago §3.7.2.1 (i) "Conformación del alias",
in force since Com. "A" 8114 (09/10/2024):

- Maximum 20 characters, minimum 6.
- Valid characters: digits `0-9`, uppercase `A-Z`, lowercase `a-z`, and the special characters
  `.` (punto) and `-` (guion medio). "El resto de los caracteres se considerarán inválidos."
- "El uso de mayúsculas y minúsculas será indistinto (no se distinguirá entre uno y otro)." An
  alias is case-insensitive; `EN.ESCENA.MP` and `en.escena.mp` are the same alias.

There is no rule in the text about position (an alias may start or end with `.` or `-`), about
consecutive separators, or about a minimum number of letters. BCRA's public page summarises it as
"una combinación entre 6 y 20 caracteres que admite letras y números"; the Ley Simple explainer
adds the period and hyphen, matching the norm. The original Com. "A" 6044 (2016) set a maximum
of 14 characters; that limit is superseded, so aliases of 15–20 characters are legitimate.

### 3.2 Content restrictions beyond the character set

§3.7.2.1 (ii): besides length and character validity, the alias must not already exist in the
central registry, and there is a blacklist "para evitar, por ejemplo, la utilización de lenguaje
grosero u ofensivo", which also includes brand names. None of that is checkable client-side.

### 3.3 Uniqueness, portability, and whether the holder can change it

- Unique and unrepeatable across the whole national financial system, bound one-to-one to a
  CBU/CVU (§3.6 and Com. "A" 6044 Anexo §4 "Validación única").
- Portable: the holder may unlink it from one CBU/CVU and link it to another, including at a
  different bank or PSP (§3.6, §3.7.6; BCRA alias page: "es portable").
- The holder can create and update aliases from home banking / mobile banking under
  "Administración de cuentas de transferencias", available 24×7 (§3.5, §3.7.2). Mercado Pago's
  help says the same for CVU aliases ("podés cambiarlo cuando quieras").
- Accounts without a user-chosen alias got one assigned automatically by COELSA from 1/6/2017,
  built from three common Spanish words (Com. "A" 6215). Those default aliases look like
  `palabra.palabra.palabra` and are also changeable.
- **Unverified**: the Ley Simple explainer says the holder may change the alias "1 vez por día y
  10 veces al año como máximo". That cap is not in the current BCRA texto ordenado retrieved
  here, and no Com. "A" stating it was found; treat it as a bank-side policy that may vary.

Consequence for the map's "the alias on the card stopped working" scenario: it is a real
failure mode. An alias is a mutable pointer the holder can re-point at any time from home
banking, and it can be released and later taken by someone else. A CBU/CVU is stable for the life
of the account (Mercado Pago: "El CVU … no puede modificarse"), which is why the card should
carry the CBU/CVU alongside the alias rather than the alias alone.

Sources: t.o. SNP – Servicios de Pago Section 3
(https://www.bcra.gob.ar/archivos/Pdfs/Texord/t-snp-spd.pdf); Com. "A" 6044
(https://www.bcra.gob.ar/archivos/Pdfs/comytexord/A6044.pdf); Com. "A" 6215
(https://www.bcra.gob.ar/archivos/Pdfs/comytexord/A6215.pdf); BCRA alias page
(https://www.bcra.gob.ar/alias-cbu/); Ley Simple
(https://www.argentina.gob.ar/justicia/derechofacil/leysimple/alias-cbu); Mercado Pago help 19761
(https://www.mercadopago.com.ar/ayuda/19761).

## 4. CUIT / CUIL of the holder

### 4.1 Format

ARCA FAQ 26145125: 11 digits — a 2-digit prefix ("aleatorios, de carácter genérico y no binario
en términos de género"), 8 digits (the DNI for natural persons, an assigned company number for
legal persons), and 1 check digit. For natural persons the CUIT coincides with the CUIL issued by
ANSES, so one validator covers both. Conventional display is `XX-XXXXXXXX-X`; the hyphens are
presentation only.

Source: https://servicioscf.afip.gob.ar/publico/abc/ABCpaso2.aspx?cat=3040

### 4.2 Check digit

**No ARCA/AFIP normative text publishing the algorithm was found**; the algorithm below is the
one universally implemented and is **verified here against real CUITs** (ARCA's own
`33-69345023-9` and Banco de la Nación Argentina's `30-50001091-2`). Treat the algorithm as
verified by computation, its official citation as unverified.

1. Take the first 10 digits.
2. Multiply them, left to right, by the weights `5, 4, 3, 2, 7, 6, 5, 4, 3, 2`.
3. `r = sum mod 11`.
4. Check digit: `0` if `r = 0`; otherwise `11 − r`. If `r = 1` the result would be `10`, which is
   not a digit; ARCA then issues the number under a different prefix (Wikipedia ES documents the
   prefix substitution table, e.g. 20→23, 27→23, 30→33). For a **validator** the practical
   consequence is that a well-formed CUIT never produces `r = 1`, so the check is simply
   `digit == (r == 0 ? 0 : 11 − r)` and `r = 1` means invalid.

Source for the substitution rule: Wikipedia ES "Clave Única de Identificación Tributaria"
(secondary, **unverified** against an official text).

### 4.3 Do banks require the holder's CUIT to match on a transfer?

Two different regimes:

- **Immediate transfers from home banking** (the case for an academy paying En Escena): the payer
  enters a CBU, CVU or alias, not the CUIT. BCRA requires every immediate-transfer scheme to offer
  a real-time "consulta de cuentas activas" service holding, at minimum, the account holders, the
  CBU/CVU and alias, the currency and the CUIT/CUIL/CDI (t.o. SNP – Transferencias – Normas
  complementarias §2.4). The payer's bank resolves the CUIT and holder name from the key and
  shows them for confirmation (§5). The payer does not have to know or type the CUIT, and En
  Escena's card cannot cause a rejection by omitting it.
- **Batch transfers** (payroll, supplier payments, files sent through the clearing houses): the
  originating file must carry "el número de CUIT, CUIL o CDI del beneficiario" (t.o. SNP –
  Transferencias §1.2), the clearing house verifies it "en la base de titulares de cuentas
  informada por las entidades" (§1.5.1), and a mismatch is rejection reason **R40 "No coincide
  CUIT, CUIL o CDI"**, which applies when the CUIT "es erróneo o no coincide con el correspondiente
  a cualquiera de los titulares de la cuenta receptora". An academy that pays through a company
  batch-payment product will need the holder's CUIT, and it must be one of the account's holders.

So the holder's CUIT is informational for the normal home-banking flow and mandatory for batch
payments. Publishing it on the card is useful for both: it lets the academy compare against the
confirmation screen, and it is what a company treasury needs.

Sources: t.o. SNP – Transferencias §1.2, §1.5.1 and reason code R40
(https://www.bcra.gob.ar/archivos/Pdfs/Texord/t-snp-tr.pdf); t.o. SNP – Transferencias – Normas
complementarias §2.4 (https://www.bcra.gob.ar/archivos/Pdfs/Texord/t-snp-tr-nc.pdf).

## 5. Does the payer's bank display the holder name on confirmation?

Yes, by regulation, at two moments:

- **Before confirming** (when the payer enters an alias): t.o. SNP – Servicios de Pago §3.7.3
  requires "una pantalla de confirmación que, como mínimo, tenga los siguientes datos: tipo de
  cuenta de destino, CBU/CVU, alias, **nombre real del destinatario**, número de cuenta, entidad
  financiera o PSPCP de destino, monto de la transacción y CUIT/CUIL/CDI/DNI del receptor",
  and the operation "sólo podrá confirmarse cuando seleccione efectivamente la opción
  correspondiente". The same wording has been in force since Com. "A" 6044 Anexo §5 (2016).
  The text literally conditions this on alias entry; **whether the identical pre-confirmation
  screen is mandatory when the payer types the 22 digits is not spelled out in the texts
  retrieved** (unverified as a rule, though in practice every bank and wallet shows the same
  screen because the lookup in §2.4 of the normas complementarias is the same).
- **After the transfer**, on the receipt and statement: t.o. SNP – Transferencias §3.2.1.1
  requires the originator to receive, at minimum, the amount, the date, "el nombre del cliente
  receptor" (the "Nombre de Fantasía" if available, instead of the account holder's name), the
  receptor's CUIT/CUIL/CDI and the unique reference.

Two caveats for the card copy:

- What is displayed is the name as registered at the receiving bank or PSP, or a registered
  trade name ("Nombre de Fantasía"), not whatever the admin types into `paymentInstructions`. The
  card's "Nombre del titular" should therefore be exactly the registered name, so the academy can
  match it.
- For a CVU the "entidad de destino" shown is the PSP (e.g. Mercado Pago), which academies may
  not expect if the card says "Banco".

Sources: t.o. SNP – Servicios de Pago §3.7.3
(https://www.bcra.gob.ar/archivos/Pdfs/Texord/t-snp-spd.pdf); Com. "A" 6044 Anexo §5
(https://www.bcra.gob.ar/archivos/Pdfs/comytexord/A6044.pdf); t.o. SNP – Transferencias §3.2.1
(https://www.bcra.gob.ar/archivos/Pdfs/Texord/t-snp-tr.pdf); t.o. SNP – Transferencias – Normas
complementarias §2.4 and §2.8 (https://www.bcra.gob.ar/archivos/Pdfs/Texord/t-snp-tr-nc.pdf).

## 6. Other facts worth knowing for the field ticket

- Every interface that shows a CBU or CVU must also show its alias (t.o. SNP – Transferencias –
  Normas complementarias §2.8), so the holder can always read both from their own home banking;
  the admin form can ask for both without friction.
- Since 1/6/2017 every account has an alias (Com. "A" 6215), so "no alias" is never a real
  state for a bank account; it may still be a valid admin choice not to publish it.
- Payment requests ("solicitudes de pago activas") are addressed "hacia un identificador de una
  cuenta específica, tal como un alias o una CBU/CVU" (normas complementarias §3.2.4.2), so the
  same identifiers cover any future "cobrar por solicitud" flow.

## Implications for validation

Recommended per-field rules for the `paymentInstructions` admin form. Strip whitespace and
hyphens before validating the numeric keys; store them normalised.

| Field | Rule |
| --- | --- |
| **CBU / CVU** (one field) | `^\d{22}$` after stripping spaces. Then: check digit 8 = mod-10 over digits 1–7 with weights `7 1 3 9 7 1 3`; check digit 22 = mod-10 over digits 9–21 with weights `3 9 7 1 3 9 7 1 3 9 7 1 3`; each computed as `(10 − sum mod 10) mod 10`. Starts with `000` ⇒ it is a CVU (optionally require digit 9 = `0`); otherwise a CBU. Same algorithm for both, so one field and one validator; a derived label ("CBU" / "CVU") can be shown from the prefix. |
| **Alias** | `^[A-Za-z0-9.-]{6,20}$`. Case-insensitive: normalise for comparison (BCRA does not distinguish case); display as entered or upper-cased. Do not try to check the blacklist or existence. Since the holder can re-point or release an alias at any time, the card should always carry the CBU/CVU too; consider requiring the CBU/CVU whenever an alias is given. |
| **Holder CUIT/CUIL** | `^\d{11}$` after stripping hyphens; mod-11 with weights `5 4 3 2 7 6 5 4 3 2` over the first 10 digits, `r = sum mod 11`, expected digit `0` if `r = 0`, `11 − r` otherwise, invalid if `r = 1`. Display as `XX-XXXXXXXX-X`. Optional for home-banking payers, needed by batch payers. |
| **Holder name** | Free text; must be the name registered at the bank/PSP (or the registered trade name), since that is what the payer's bank shows on confirmation. No structural validation. |
| **Bank / PSP name** | Free text or omitted. Cannot be derived from the CBU without an entity table BCRA does not publish in the texts consulted; when the key is a CVU the institution is a PSP, not a bank. |

Reference implementation of the two check-digit routines, as verified against the BCRA example
`0110138202011100377664` and the CUITs `33693450239` / `30500010912`:

```ts
function mod10Check(digits: string, weights: number[]): number {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) sum += Number(digits[i]) * weights[i];
  return (10 - (sum % 10)) % 10;
}

export function isValidCbuOrCvu(raw: string): boolean {
  const key = raw.replace(/\s+/g, "");
  if (!/^\d{22}$/.test(key)) return false;
  const block1 = key.slice(0, 7);
  const block2 = key.slice(8, 21);
  return (
    Number(key[7]) === mod10Check(block1, [7, 1, 3, 9, 7, 1, 3]) &&
    Number(key[21]) === mod10Check(block2, [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3])
  );
}

export function isCvu(key: string): boolean {
  return key.startsWith("000");
}

export function isValidCuit(raw: string): boolean {
  const cuit = raw.replace(/[-\s]/g, "");
  if (!/^\d{11}$/.test(cuit)) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(cuit[i]) * weights[i];
  const r = sum % 11;
  if (r === 1) return false;
  const expected = r === 0 ? 0 : 11 - r;
  return Number(cuit[10]) === expected;
}

export const aliasPattern = /^[A-Za-z0-9.-]{6,20}$/;
```

## What could not be verified

- The explicit weight patterns `7139713` / `3971397139713` as printed in a BCRA text (the BCRA
  texts say "ponderador 9713" and give a worked example that the patterns reproduce; the
  SNP3016.pdf that Wikipedia cites was not retrievable).
- An official ARCA/AFIP document publishing the CUIT mod-11 algorithm and the prefix substitution
  for remainder 1 (verified by computation against real CUITs only).
- The "1 change per day, 10 per year" alias-change cap stated by the Ley Simple explainer (not
  found in the current BCRA texto ordenado).
- Whether the pre-confirmation screen listing holder name and CUIT is mandatory when the payer
  types a CBU/CVU directly rather than an alias (the rule as written is conditioned on alias
  entry; practice is the same either way).
