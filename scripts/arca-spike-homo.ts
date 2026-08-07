import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Arca, FileSystemTicketStorage } from "@arcasdk/core";

// De-risking spike (#428): emits ONE Factura C end to end against ARCA's
// HOMOLOGACIÓN environment to confirm the whole circuit (WSAA + TA cache +
// WSFEv1 → CAE) closes, before building the real `Comprobante` model (#326),
// the emission logic, the UX (#339), NC (#328) and the printable (#329/#334).
//
// Flow (documented in research #321, branch research/arca-wsfev1):
//   1. WSAA: CMS-sign the TRA with cert+key and `loginCms` → Token+Sign. The TA
//      is cached on disk (~12h) because ARCA rejects repeated requests.
//   2. WSFEv1: `FECompUltimoAutorizado` for the correlative and `FECAESolicitar`
//      (via createNextVoucher, which auto-numbers) to obtain the CAE.
//   3. `FECompConsultar` (added in #499): verifies the ADR-0012 assumptions
//      about recovery after a timeout — that consulting the voucher just
//      emitted returns the same CAE, amount and date, and that a
//      never-authorized correlative returns `null` instead of throwing.
//   4. Amendments (added in #686): emits a Nota de débito C (`CbteTipo` 12) and
//      four Notas de crédito C (`CbteTipo` 13) against the Factura C just
//      emitted, plus two deliberately malformed probes, to collect empirical
//      evidence for the four points of #686. See AMENDMENT SEQUENCE below.
//
// The issuer is Proyecciones Artísticas Asociación Civil (CUIT 30717611590),
// EXENTA for IVA. Exempt subjects also issue class C, so the Factura C
// (`CbteTipo` 11) and the WSFEv1 payload stay intact.
//
// No `Comprobante` is persisted to the database: for a spike it is enough to
// dump the result to a local JSON (see OUTPUT_DIR). The real schema is #326.
//
// Comments are English per `.sandcastle/CODING_STANDARDS.md`; the console
// output stays Spanish, as it is what the operator running the spike reads.
//
// AMENDMENT SEQUENCE (#686). Seven FECAESolicitar calls after the Factura C,
// ordered so each one isolates a single hypothesis. `FC` is the Factura C this
// run emits, for $1000. Every amendment anchors at `FC` — never at another
// amendment — because that is the star anchoring #599/#610 committed to.
//
//   a. NC 13, importe 300, NO CbtesAsoc  → probes 10197 (#686 point 2).
//   b. ND 12, importe 300, NO CbtesAsoc  → probes 10197 on the other document.
//   c. ND 12, importe  500, asoc [FC]    → does the ND payload close at all
//                                          (#686 point 3). No prior art in repo.
//   d. NC 13, importe  400, asoc [FC]    → partial NC leaving a residue. Per
//                                          #654 this should be invisible to the
//                                          web service: no 10237, no Obs.
//   e. NC 13, importe  200, asoc [FC,ND] → is a MULTI-ENTRY CbtesAsoc accepted?
//                                          (#610's reserved per-case exit).
//                                          Runs while ΣNC is still under FC, so
//                                          any Obs here is attributable to the
//                                          multi-entry array and not to
//                                          over-crediting.
//   f. NC 13, importe  900, asoc [FC]    → 900 < FC individually, but takes ΣNC
//                                          to 1500 > FC = 1000, while
//                                          FC + ΣND = 1500 still covers it.
//                                          This is exactly #686 point 1: it
//                                          discriminates whether 10237 reads
//                                          CUMULATIVE credit or PER-DOCUMENT.
//   g. NC 13, importe 1500, asoc [FC]    → exceeds FC on its own, so 10237 must
//                                          fire under either reading. Confirms
//                                          whether it is NON-EXCLUDING (CAE
//                                          granted + Observaciones) as the norms
//                                          say, or excluding (Resultado R).
//
// A rejected FECAESolicitar does NOT advance the 10016 ratchet, so probes (a)
// and (b) cost no correlative and the accepted calls stay contiguous. The
// correlatives of 11, 12 and 13 are snapshotted before and after the whole
// sequence to confirm they ratchet independently (#686 point 4, #578).
//
// LIMITATION, so the evidence is not over-read: like the Factura C above, every
// amendment goes out as `Concepto: 1` (products) with no service dates, which is
// what #428 froze. The real emitter (#657) will use `Concepto: 2` per ADR-0011
// and will therefore also carry `FchServDesde`/`FchServHasta`/`FchVtoPago`. This
// run says nothing about how ARCA validates those on an amendment.
//
// A second limitation on point 2: `PeriodoAsoc` is NOT in the SDK's `IVoucher`
// (see @arcasdk/core domain/types/voucher.types), so "neither is sent" is the
// only reachable variant of the 10197 probe. The spike cannot show that
// `PeriodoAsoc` alone satisfies the validation, only that its absence together
// with an absent `CbtesAsoc` is rejected.
//
// The amendment sequence never fails the process: a rejection or an unexpected
// Observación IS the finding, so every attempt is recorded and printed verbatim
// and the exit code stays governed by the ADR-0012 checks. What is under test is
// a hypothesis about ARCA, not a regression in this repo.
//
// Run:  ARCA_CERT_HOMO_B64=... ARCA_KEY_HOMO_B64=... \
//       ARCA_CUIT=30717611590 ARCA_PTOVTA_HOMO=1 \
//       node --import tsx scripts/arca-spike-homo.ts

// Factura C. Class C is what an IVA-exempt issuer emits; see the header.
const CBTE_TIPO_FACTURA_C = 11;
// Nota de débito C and Nota de crédito C, the two amendments #686 verifies.
// Neither has ever been sent to ARCA from this repo before this spike.
const CBTE_TIPO_NOTA_DEBITO_C = 12;
const CBTE_TIPO_NOTA_CREDITO_C = 13;

// The validation #686 point 1 is about: ARCA's check that a Nota de crédito does
// not credit more than its associated comprobante.
const OBS_CODE_10237 = 10237;
// The validation #686 point 2 is about: an amendment needs `CbtesAsoc` or
// `PeriodoAsoc`.
const ERR_CODE_10197 = 10197;

// Importe of the Factura C every amendment below is measured against.
const IMPORTE_FACTURA = 1000;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    console.error(`Falta la variable de entorno ${name}.`);
    process.exit(1);
  }
  return value;
}

function decodePem(base64: string, kind: string): string {
  const pem = Buffer.from(base64, "base64").toString("utf8");
  if (!pem.includes("-----BEGIN")) {
    console.error(
      `${kind} no parece un PEM válido tras decodificar base64 ` +
        `(no contiene "-----BEGIN"). ¿La variable está bien codificada?`,
    );
    process.exit(1);
  }
  return pem;
}

function yesNo(value: boolean): string {
  return value ? "sí" : "NO";
}

type AbsentProbe = {
  cbteNro: number;
  /** What `FECompConsultar` did: came back empty, returned a voucher, or threw. */
  outcome: "null" | "voucher" | "threw";
  error: string | null;
};

// Consults a correlative we expect ARCA to have no record of, and classifies
// what came back. Note `getVoucherInfo` takes positional args in an order that
// is easy to transpose (number, salesPoint, type).
async function probeAbsentCorrelative(
  billing: Arca["electronicBillingService"],
  cbteNro: number,
  ptoVta: number,
): Promise<AbsentProbe> {
  try {
    const absent = await billing.getVoucherInfo(
      cbteNro,
      ptoVta,
      CBTE_TIPO_FACTURA_C,
    );
    return {
      cbteNro,
      outcome: absent === null ? "null" : "voucher",
      error: null,
    };
  } catch (error) {
    return {
      cbteNro,
      outcome: "threw",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// The SDK does not re-export `INextVoucher` from the package root, so its shape
// is derived from the parameter of `createNextVoucher` (the FECAESolicitar
// payload with the correlative left to the SDK).
type NextVoucher = Parameters<
  Arca["electronicBillingService"]["createNextVoucher"]
>[0];
type CbteAsoc = NonNullable<NextVoucher["CbtesAsoc"]>[number];
type CodedMessage = { Code?: number; Msg?: string };

// One FECAESolicitar attempt for an amendment, recorded whole. `Obs` and
// `Errors` are kept verbatim rather than reduced to a boolean: per #686 the
// observations ARE the finding, so summarising them away would defeat the run.
type AmendmentAttempt = {
  label: string;
  /** What this single call is meant to discriminate. Printed with the result. */
  hypothesis: string;
  /** What ARCA is expected to answer, in prose. Never asserted, only compared. */
  expectation: string;
  cbteTipo: number;
  importe: number;
  cbtesAsoc: CbteAsoc[] | null;
  sentVoucher: NextVoucher | null;
  /** "A" (authorized), "P" (partial), "R" (rejected), or null if it threw. */
  resultado: string | null;
  cbteNro: number | null;
  cae: string | null;
  caeFchVto: string | null;
  observaciones: CodedMessage[];
  errors: CodedMessage[];
  events: CodedMessage[];
  /** Set when FECAESolicitar (or the SDK's own validation) threw. */
  threw: string | null;
  rawResponse: unknown;
};

// Builds the FECAESolicitar payload of an amendment. Deliberately hand-built
// rather than reusing `buildNotaCreditoCVoucher` from app/lib: the spike exists
// to test the raw payload against ARCA, and importing the model would make the
// run evidence about our builder instead of about the web service.
//
// Mirrors the Factura C above field for field — Concepto 1, anonymous final
// consumer, no itemized IVA (`ImpNeto = ImpTotal`, no `<Iva>` array) — so the
// only variables between calls are `CbteTipo`, `ImpTotal` and `CbtesAsoc`.
function buildAmendmentVoucher(params: {
  ptoVta: number;
  cbteTipo: number;
  importe: number;
  condicionIvaReceptorId: number;
  cbtesAsoc: CbteAsoc[] | null;
}): NextVoucher {
  return {
    CantReg: 1,
    PtoVta: params.ptoVta,
    CbteTipo: params.cbteTipo,
    Concepto: 1, // Products, mirroring the Factura C this run emitted.
    DocTipo: 99, // Anonymous final consumer
    DocNro: 0,
    CbteFch: today(),
    ImpTotal: params.importe,
    ImpTotConc: 0,
    ImpNeto: params.importe,
    ImpOpEx: 0,
    ImpIVA: 0,
    ImpTrib: 0,
    MonId: "PES",
    MonCotiz: 1,
    CondicionIVAReceptorId: params.condicionIvaReceptorId,
    // Omitted entirely — not sent as an empty array — when there is nothing to
    // associate, which is the condition probes (a) and (b) put under test.
    ...(params.cbtesAsoc ? { CbtesAsoc: params.cbtesAsoc } : {}),
  };
}

// Emits one amendment and records everything ARCA answered. Never throws and
// never exits: a rejection is a result here, not a failure (see the header).
async function emitAmendment(
  billing: Arca["electronicBillingService"],
  params: {
    label: string;
    hypothesis: string;
    expectation: string;
    ptoVta: number;
    cbteTipo: number;
    importe: number;
    condicionIvaReceptorId: number;
    cbtesAsoc: CbteAsoc[] | null;
  },
): Promise<AmendmentAttempt> {
  const base = {
    label: params.label,
    hypothesis: params.hypothesis,
    expectation: params.expectation,
    cbteTipo: params.cbteTipo,
    importe: params.importe,
    cbtesAsoc: params.cbtesAsoc,
  };

  let voucher: NextVoucher | null = null;
  try {
    voucher = buildAmendmentVoucher(params);
    const result = await billing.createNextVoucher(voucher);
    const det = result.response.FeDetResp?.FECAEDetResponse?.[0];

    return {
      ...base,
      sentVoucher: voucher,
      // `FeCabResp.Resultado` is the fallback: a payload rejected before it
      // reaches the detail level answers at the header only.
      resultado: det?.Resultado ?? result.response.FeCabResp?.Resultado ?? null,
      cbteNro: typeof det?.CbteDesde === "number" ? det.CbteDesde : null,
      // The SDK blanks both to "" unless Resultado is "A"; normalize to null so
      // the JSON dump does not read as "ARCA returned an empty CAE".
      cae: result.cae || null,
      caeFchVto: result.caeFchVto || null,
      observaciones: det?.Observaciones?.Obs ?? [],
      errors: result.response.Errors?.Err ?? [],
      events: result.response.Events?.Evt ?? [],
      threw: null,
      rawResponse: result.response,
    };
  } catch (error) {
    return {
      ...base,
      sentVoucher: voucher,
      resultado: null,
      cbteNro: null,
      cae: null,
      caeFchVto: null,
      observaciones: [],
      errors: [],
      events: [],
      threw: error instanceof Error ? error.message : String(error),
      rawResponse: null,
    };
  }
}

function formatCoded(messages: CodedMessage[]): string {
  if (messages.length === 0) {
    return "(ninguna)";
  }
  return messages.map((m) => `[${m.Code}] ${m.Msg}`).join(" | ");
}

function hasCode(messages: CodedMessage[], code: number): boolean {
  return messages.some((m) => m.Code === code);
}

// Prints an attempt in full. The verbatim Obs/Errors lines are the deliverable
// of this spike: they are what gets pasted into the #686 comment.
function printAttempt(attempt: AmendmentAttempt): void {
  const asoc = attempt.cbtesAsoc
    ? attempt.cbtesAsoc.map((c) => `${c.Tipo}-${c.PtoVta}-${c.Nro}`).join(", ")
    : "(sin CbtesAsoc)";

  console.log(
    `\n→ ${attempt.label}  ·  CbteTipo ${attempt.cbteTipo} · $${attempt.importe} · asoc: ${asoc}`,
  );
  console.log(`   Qué discrimina: ${attempt.hypothesis}`);
  console.log(`   Se esperaba:    ${attempt.expectation}`);
  if (attempt.threw) {
    console.log(`   ✗ Lanzó una excepción: ${attempt.threw}`);
    return;
  }
  console.log(
    `   Resultado:      ${attempt.resultado ?? "(ausente)"}${
      attempt.cbteNro === null ? "" : ` · Nro ${attempt.cbteNro}`
    }`,
  );
  console.log(
    `   CAE:            ${attempt.cae ?? "(ausente)"}${
      attempt.caeFchVto ? ` (vence ${attempt.caeFchVto})` : ""
    }`,
  );
  console.log(`   Observaciones:  ${formatCoded(attempt.observaciones)}`);
  console.log(`   Errores:        ${formatCoded(attempt.errors)}`);
  console.log(`   Eventos:        ${formatCoded(attempt.events)}`);
}

// Snapshot of `FECompUltimoAutorizado` for the three series this spike touches.
// #578 collapsed the per-document getters into one on the premise that the 10016
// ratchet is per `(ptoVta, cbteTipo)`; comparing two snapshots is what turns that
// premise into evidence (#686 point 4).
type Correlatives = {
  facturaC: number;
  notaDebitoC: number;
  notaCreditoC: number;
};

async function readCorrelatives(
  billing: Arca["electronicBillingService"],
  ptoVta: number,
): Promise<Correlatives> {
  // Sequential on purpose: the three calls share one SOAP client and one TA, and
  // ARCA throttles concurrent requests from the same CUIT.
  const facturaC = await billing.getLastVoucher(ptoVta, CBTE_TIPO_FACTURA_C);
  const notaDebitoC = await billing.getLastVoucher(
    ptoVta,
    CBTE_TIPO_NOTA_DEBITO_C,
  );
  const notaCreditoC = await billing.getLastVoucher(
    ptoVta,
    CBTE_TIPO_NOTA_CREDITO_C,
  );
  return {
    facturaC: facturaC.cbteNro,
    notaDebitoC: notaDebitoC.cbteNro,
    notaCreditoC: notaCreditoC.cbteNro,
  };
}

function today(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

async function main(): Promise<void> {
  const cert = decodePem(requireEnv("ARCA_CERT_HOMO_B64"), "El certificado");
  const key = decodePem(requireEnv("ARCA_KEY_HOMO_B64"), "La clave privada");
  const cuit = Number(requireEnv("ARCA_CUIT"));
  const ptoVta = Number(process.env.ARCA_PTOVTA_HOMO ?? "1");
  const taDir = process.env.ARCA_TA_DIR ?? "./.arca-ta";

  if (!Number.isInteger(cuit)) {
    console.error(`ARCA_CUIT="${process.env.ARCA_CUIT}" no es un entero.`);
    process.exit(1);
  }

  const outputDir = fileURLToPath(
    new URL("../scripts/.arca-spike-output/", import.meta.url),
  );
  mkdirSync(outputDir, { recursive: true });
  mkdirSync(taDir, { recursive: true });

  console.log("→ ARCA spike (HOMOLOGACIÓN)");
  console.log(`  CUIT emisor: ${cuit}  ·  Punto de venta: ${ptoVta}`);
  console.log(`  Cache de TA: ${taDir}\n`);

  // production:false points the SDK at the homologación endpoints
  // (wsaahomo/wswhomo). FileSystemTicketStorage caches the TA per (CUIT,
  // environment, service) to respect the ~12h window.
  const arca = new Arca({
    production: false,
    cert,
    key,
    cuit,
    ticketStorage: new FileSystemTicketStorage({
      ticketPath: taDir,
      cuit,
      production: false,
    }),
  });

  const billing = arca.electronicBillingService;

  // 1. Connectivity + WSAA sanity check (triggers loginCms and caches the TA).
  const status = await billing.getServerStatus();
  console.log(
    `✓ WSFEv1 dummy: app=${status.appServer} db=${status.dbServer} auth=${status.authServer}\n`,
  );

  // 2. Receiver's IVA condition (RG 5616): not hardcoded, resolved at runtime
  //    against the class "C" codes.
  const ivaReceptors = await billing.getIvaReceptorTypes("C");
  const consumidorFinal =
    ivaReceptors.resultGet?.condicionIvaReceptor?.find((c) =>
      c.desc.toLowerCase().includes("consumidor final"),
    ) ?? null;
  if (!consumidorFinal) {
    console.error(
      "No se encontró 'Consumidor Final' en FEParamGetCondicionIvaReceptor(C). " +
        `Códigos devueltos: ${JSON.stringify(ivaReceptors.resultGet?.condicionIvaReceptor)}`,
    );
    process.exit(1);
  }
  console.log(
    `✓ CondicionIVAReceptorId = ${consumidorFinal.id} (${consumidorFinal.desc})\n`,
  );

  // 3. Last authorized for the three series, before anything is emitted. Also
  //    narrates the Factura C correlative (createNextVoucher resolves it on its
  //    own anyway). The snapshot is compared against a second one at the end to
  //    show the three ratchets move independently (#686 point 4).
  const correlativesBefore = await readCorrelatives(billing, ptoVta);
  console.log(`✓ FECompUltimoAutorizado(PtoVta=${ptoVta}) antes de emitir:`);
  console.log(
    `    Factura C (11):        ${correlativesBefore.facturaC}  → siguiente ${correlativesBefore.facturaC + 1}`,
  );
  console.log(
    `    Nota de débito C (12): ${correlativesBefore.notaDebitoC}  → siguiente ${correlativesBefore.notaDebitoC + 1}`,
  );
  console.log(
    `    Nota de crédito C (13):${correlativesBefore.notaCreditoC}  → siguiente ${correlativesBefore.notaCreditoC + 1}\n`,
  );

  // 4. Factura C to an anonymous final consumer (DocTipo 99 / DocNro 0).
  //    No itemized IVA: ImpNeto = subtotal, the rest 0, ImpTotal = ImpNeto.
  const importe = IMPORTE_FACTURA;
  const voucher = {
    CantReg: 1,
    PtoVta: ptoVta,
    CbteTipo: CBTE_TIPO_FACTURA_C,
    Concepto: 1, // Products
    DocTipo: 99, // Anonymous final consumer
    DocNro: 0,
    CbteFch: today(),
    ImpTotal: importe,
    ImpTotConc: 0,
    ImpNeto: importe,
    ImpOpEx: 0,
    ImpIVA: 0,
    ImpTrib: 0,
    MonId: "PES",
    MonCotiz: 1,
    CondicionIVAReceptorId: Number(consumidorFinal.id),
  };

  console.log("→ Emitiendo Factura C…");
  const result = await billing.createNextVoucher(voucher);

  const det = result.response.FeDetResp?.FECAEDetResponse?.[0];
  const resultado = det?.Resultado ?? result.response.FeCabResp?.Resultado;

  // The correlative to consult in step 5 comes from `det`; without it the
  // arithmetic below would silently produce NaN, so it is required from here on.
  const emittedCbteNro = det?.CbteDesde;

  if (
    resultado !== "A" ||
    !result.cae ||
    !det ||
    typeof emittedCbteNro !== "number"
  ) {
    console.error("\n✗ ARCA NO autorizó el comprobante.");
    console.error(`  Resultado: ${resultado}`);
    console.error(`  CAE: ${result.cae ?? "(ausente)"}`);
    console.error(`  CbteDesde: ${emittedCbteNro ?? "(ausente)"}`);
    console.error(
      `  Observaciones: ${JSON.stringify(det?.Observaciones?.Obs ?? [])}`,
    );
    console.error(
      `  Errores: ${JSON.stringify(result.response.Errors?.Err ?? [])}`,
    );
    const errPath = `${outputDir}rechazo-${Date.now()}.json`;
    writeFileSync(errPath, JSON.stringify({ voucher, result }, null, 2));
    console.error(`\n  Respuesta completa: ${errPath}`);
    process.exit(1);
  }

  console.log("\n✓✓ CAE OBTENIDO");
  console.log(`   CAE:        ${result.cae}`);
  console.log(`   Vencimiento:${result.caeFchVto}`);
  console.log(
    `   Comprobante: PtoVta ${ptoVta} · Nro ${det.CbteDesde} · Tipo ${CBTE_TIPO_FACTURA_C}`,
  );

  // 5. FECompConsultar (#499 / ADR-0012). The contingency design rests on being
  //    able to ask ARCA, after a timeout on FECAESolicitar, whether the voucher
  //    we attempted was actually authorized. Both halves of that assumption are
  //    checked here against a real service, because the unit tests run against a
  //    mocked billing port and can only ever confirm our own mock.
  //
  //    Everything below is recorded in the JSON dump before the process exits,
  //    so a failed or throwing check never costs us the record of a voucher
  //    that was really authorized in homologación.
  let consulted: Awaited<ReturnType<typeof billing.getVoucherInfo>> = null;
  let consultError: string | null = null;
  try {
    consulted = await billing.getVoucherInfo(
      emittedCbteNro,
      ptoVta,
      CBTE_TIPO_FACTURA_C,
    );
  } catch (error) {
    consultError = error instanceof Error ? error.message : String(error);
  }

  // 5a. The voucher we just authorized must come back, carrying the same CAE,
  //     amount and date. Recovery persists a comprobante from exactly these
  //     fields, and only when impTotal and cbteFch match WHAT WAS SUBMITTED
  //     (ADR-0012, decision 4) — hence the comparison against `voucher`, not
  //     against the values FECAESolicitar echoed back. Comparing against the
  //     echo would only prove ARCA is self-consistent, and would miss ARCA
  //     normalizing or overriding the submitted date, which is exactly what
  //     would break recovery in production.
  //
  //     The comparisons are strict and un-coerced on purpose: the assumption
  //     under test is that these fields arrive as the SDK declares them
  //     (`impTotal?: number`, `cbteFch?: string`). Coercing would let
  //     `"1000.00"`, `20260730` — or two `undefined`s — read as a match and
  //     green-light a production check that does not coerce.
  const consultChecks = {
    returnsVoucher: consulted !== null,
    impTotalIsNumber: typeof consulted?.impTotal === "number",
    cbteFchIsString: typeof consulted?.cbteFch === "string",
    caeMatches: consulted?.codAutorizacion === result.cae,
    impTotalMatches: consulted?.impTotal === voucher.ImpTotal,
    cbteFchMatches: consulted?.cbteFch === voucher.CbteFch,
  };

  console.log("\n→ FECompConsultar sobre el comprobante recién emitido");
  if (consultError) {
    console.log(`   ✗ Lanzó una excepción: ${consultError}`);
  }
  console.log(
    `   Devuelve el comprobante:  ${yesNo(consultChecks.returnsVoucher)}`,
  );
  console.log(
    `   impTotal llega numérico:  ${yesNo(consultChecks.impTotalIsNumber)}  (typeof ${typeof consulted?.impTotal})`,
  );
  console.log(
    `   cbteFch llega string:     ${yesNo(consultChecks.cbteFchIsString)}  (typeof ${typeof consulted?.cbteFch})`,
  );
  console.log(
    `   codAutorizacion == CAE:   ${yesNo(consultChecks.caeMatches)}  (${consulted?.codAutorizacion} vs ${result.cae})`,
  );
  console.log(
    `   impTotal == el enviado:   ${yesNo(consultChecks.impTotalMatches)}  (${consulted?.impTotal} vs ${voucher.ImpTotal})`,
  );
  console.log(
    `   cbteFch == el enviado:    ${yesNo(consultChecks.cbteFchMatches)}  (${consulted?.cbteFch} vs ${voucher.CbteFch})`,
  );
  // Diagnostic only, not a verdict: if cbteFch does not match what we sent, this
  // says whether FECAESolicitar had already echoed a different date back.
  console.log(
    `   (FECAESolicitar devolvió CbteFch=${det.CbteFch}; enviado=${voucher.CbteFch})`,
  );

  // 5b. A correlative that was never authorized must come back as `null` rather
  //     than throwing. If it threw instead, the recovery branch would misread
  //     "nothing was authorized" as "could not verify" and gate a retry that is
  //     in fact free (ADR-0012, decision 3).
  //
  //     Two correlatives are probed. `+ 1` is the case recovery actually hits:
  //     decision 3 consults `last + 1`, the very next number in the sequence,
  //     and we know it is unused because we just authorized `last`. `+ 100_000`
  //     is far outside the range ARCA has ever seen for this ptoVta. If the two
  //     answer differently, ADR-0012 needs to know before decision 3 ships.
  const absentProbes = {
    next: await probeAbsentCorrelative(billing, emittedCbteNro + 1, ptoVta),
    farOutOfRange: await probeAbsentCorrelative(
      billing,
      emittedCbteNro + 100_000,
      ptoVta,
    ),
  };
  const absentChecks = {
    nextReturnsNull: absentProbes.next.outcome === "null",
    farOutOfRangeReturnsNull: absentProbes.farOutOfRange.outcome === "null",
  };

  console.log("\n→ FECompConsultar sobre correlativos nunca autorizados");
  for (const [label, probe] of Object.entries(absentProbes)) {
    console.log(
      `   ${label} (${probe.cbteNro}): ${probe.outcome}${probe.error ? ` — ${probe.error}` : ""}`,
    );
  }
  console.log(
    `   Ambos devuelven null en lugar de lanzar: ${yesNo(
      Object.values(absentChecks).every(Boolean),
    )}`,
  );
  // The SDK collapses two distinct paths into `null`: `mapVoucherInfo`
  // returning null on an absent ResultGet, and `isAfipNotFoundError` catching
  // ARCA error 602 / "no existe". From the outside they are indistinguishable,
  // so a bare `null` is weaker evidence of "nothing was authorized" than it
  // looks. Flagged for ADR-0012 rather than silently treated as verified.
  console.log(
    "   Nota: el SDK devuelve null tanto por error 602 como por ResultGet ausente;",
  );
  console.log(
    "         el spike no puede distinguirlos (ver electronic-billing-repository).",
  );

  const allChecksPassed =
    Object.values(consultChecks).every(Boolean) &&
    Object.values(absentChecks).every(Boolean) &&
    consultError === null;
  console.log(
    `\n${allChecksPassed ? "✓✓" : "✗✗"} Supuestos de ADR-0012 sobre FECompConsultar: ${
      allChecksPassed ? "CONFIRMADOS" : "NO confirmados (ver arriba)"
    }`,
  );

  // 6. Amendments (#686). The order and the reason for each call are in the
  //    AMENDMENT SEQUENCE block at the top of this file; the labels below match
  //    it letter for letter. Nothing here can fail the run: a rejection is the
  //    finding, so every attempt is recorded and the process keeps going.
  const emisorCuit = String(cuit);
  const condicionIvaReceptorId = Number(consumidorFinal.id);
  // Every amendment anchors HERE, at the factura — never at another amendment.
  // That is the star anchoring of #599/#610, and it is the whole reason 10237 is
  // worth probing: chained anchoring would never produce the case.
  const facturaAsoc: CbteAsoc = {
    Tipo: CBTE_TIPO_FACTURA_C,
    PtoVta: ptoVta,
    Nro: emittedCbteNro,
    Cuit: emisorCuit,
    CbteFch: voucher.CbteFch,
  };

  const IMPORTE_PROBE = 300;
  const IMPORTE_ND = 500;
  const IMPORTE_NC_PARCIAL = 400;
  const IMPORTE_NC_MULTI = 200;
  const IMPORTE_NC_ACUMULADO = 900;
  const IMPORTE_NC_EXCEDE = 1500;

  const attempts: AmendmentAttempt[] = [];
  type AttemptSpec = Omit<
    Parameters<typeof emitAmendment>[1],
    "ptoVta" | "condicionIvaReceptorId"
  >;
  const run = async (spec: AttemptSpec): Promise<AmendmentAttempt> => {
    const attempt = await emitAmendment(billing, {
      ...spec,
      ptoVta,
      condicionIvaReceptorId,
    });
    attempts.push(attempt);
    printAttempt(attempt);
    return attempt;
  };

  console.log(
    `\n════════ Notas de débito y de crédito (#686) ════════\n` +
      `   Factura C de referencia: PtoVta ${ptoVta} · Nro ${emittedCbteNro} · $${importe}`,
  );

  const probeNcSinAsoc = await run({
    label: "(a) NC sin CbtesAsoc ni PeriodoAsoc",
    hypothesis: "si 10197 es excluyente para la Nota de crédito",
    expectation: "rechazo (Resultado R) con el código 10197",
    cbteTipo: CBTE_TIPO_NOTA_CREDITO_C,
    importe: IMPORTE_PROBE,
    cbtesAsoc: null,
  });

  const probeNdSinAsoc = await run({
    label: "(b) ND sin CbtesAsoc ni PeriodoAsoc",
    hypothesis: "si 10197 también es excluyente para la Nota de débito",
    expectation: "rechazo (Resultado R) con el código 10197",
    cbteTipo: CBTE_TIPO_NOTA_DEBITO_C,
    importe: IMPORTE_PROBE,
    cbtesAsoc: null,
  });

  const notaDebito = await run({
    label: "(c) ND asociada a la Factura C",
    hypothesis: "si el payload de la ND cierra (CbteTipo 12, sin arte previo)",
    expectation: "CAE otorgado, sin observaciones",
    cbteTipo: CBTE_TIPO_NOTA_DEBITO_C,
    importe: IMPORTE_ND,
    cbtesAsoc: [facturaAsoc],
  });

  const ncParcial = await run({
    label: "(d) NC parcial que deja remanente",
    hypothesis:
      "si una NC parcial es invisible al web service (no exige ΣNC = FC)",
    expectation: "CAE otorgado, sin observaciones y sin 10237",
    cbteTipo: CBTE_TIPO_NOTA_CREDITO_C,
    importe: IMPORTE_NC_PARCIAL,
    cbtesAsoc: [facturaAsoc],
  });

  // (e) needs the ND of (c) to exist. If (c) was rejected there is no second
  // comprobante to associate, and emitting a multi-entry array pointing at a
  // number ARCA never authorized would test a different thing entirely.
  let ncMultiAsoc: AmendmentAttempt | null = null;
  if (notaDebito.cae !== null && notaDebito.cbteNro !== null) {
    ncMultiAsoc = await run({
      label: "(e) NC con CbtesAsoc múltiple [FC, ND]",
      hypothesis:
        "si ARCA acepta más de una entrada en CbtesAsoc (salida reservada por #610)",
      expectation:
        "CAE otorgado; ΣNC sigue por debajo de la FC, así que " +
        "cualquier observación acá es atribuible al array múltiple",
      cbteTipo: CBTE_TIPO_NOTA_CREDITO_C,
      importe: IMPORTE_NC_MULTI,
      cbtesAsoc: [
        facturaAsoc,
        {
          Tipo: CBTE_TIPO_NOTA_DEBITO_C,
          PtoVta: ptoVta,
          Nro: notaDebito.cbteNro,
          Cuit: emisorCuit,
          CbteFch: notaDebito.sentVoucher?.CbteFch,
        },
      ],
    });
  } else {
    console.log(
      "\n→ (e) NC con CbtesAsoc múltiple: OMITIDA. La ND de (c) no obtuvo CAE, " +
        "así que no hay un segundo comprobante real que asociar.",
    );
  }

  const ncAcumulado = await run({
    label: "(f) NC que lleva ΣNC por encima de la FC",
    hypothesis:
      "si 10237 lee el crédito ACUMULADO o sólo el documento individual",
    expectation:
      `$${IMPORTE_NC_ACUMULADO} < $${importe} por sí sola, pero acumula por ` +
      `encima de la FC mientras FC + ΣND todavía la cubre: con lectura ` +
      `acumulada aparece 10237, con lectura por documento no aparece`,
    cbteTipo: CBTE_TIPO_NOTA_CREDITO_C,
    importe: IMPORTE_NC_ACUMULADO,
    cbtesAsoc: [facturaAsoc],
  });

  const ncExcede = await run({
    label: "(g) NC que excede la FC por sí sola",
    hypothesis:
      "si 10237 es NO excluyente (CAE + Observaciones) o excluyente (Resultado R)",
    expectation:
      `$${IMPORTE_NC_EXCEDE} > $${importe}: 10237 debería dispararse ` +
      `con cualquiera de las dos lecturas`,
    cbteTipo: CBTE_TIPO_NOTA_CREDITO_C,
    importe: IMPORTE_NC_EXCEDE,
    cbtesAsoc: [facturaAsoc],
  });

  // 7. Correlatives after the sequence (#686 point 4). A rejected
  //    FECAESolicitar must not have advanced anything, so each series should
  //    have moved by exactly the number of vouchers of that type that got a CAE.
  const correlativesAfter = await readCorrelatives(billing, ptoVta);
  const wasAccepted = (attempt: AmendmentAttempt | null): boolean =>
    attempt !== null && attempt.resultado === "A" && attempt.cae !== null;

  const acceptedNotasDebito = [notaDebito].filter(wasAccepted).length;
  const acceptedNotasCredito = [
    ncParcial,
    ncMultiAsoc,
    ncAcumulado,
    ncExcede,
  ].filter(wasAccepted).length;

  const correlativeCheck = {
    facturaCDelta: correlativesAfter.facturaC - correlativesBefore.facturaC,
    notaDebitoCDelta:
      correlativesAfter.notaDebitoC - correlativesBefore.notaDebitoC,
    notaCreditoCDelta:
      correlativesAfter.notaCreditoC - correlativesBefore.notaCreditoC,
    expectedFacturaCDelta: 1,
    expectedNotaDebitoCDelta: acceptedNotasDebito,
    expectedNotaCreditoCDelta: acceptedNotasCredito,
  };
  const correlativesAdvancedIndependently =
    correlativeCheck.facturaCDelta === correlativeCheck.expectedFacturaCDelta &&
    correlativeCheck.notaDebitoCDelta ===
      correlativeCheck.expectedNotaDebitoCDelta &&
    correlativeCheck.notaCreditoCDelta ===
      correlativeCheck.expectedNotaCreditoCDelta;

  console.log("\n→ Correlativos después de la secuencia");
  console.log(
    `   Factura C (11):        ${correlativesBefore.facturaC} → ${correlativesAfter.facturaC}  (Δ ${correlativeCheck.facturaCDelta}, esperado ${correlativeCheck.expectedFacturaCDelta})`,
  );
  console.log(
    `   Nota de débito C (12): ${correlativesBefore.notaDebitoC} → ${correlativesAfter.notaDebitoC}  (Δ ${correlativeCheck.notaDebitoCDelta}, esperado ${correlativeCheck.expectedNotaDebitoCDelta})`,
  );
  console.log(
    `   Nota de crédito C (13):${correlativesBefore.notaCreditoC} → ${correlativesAfter.notaCreditoC}  (Δ ${correlativeCheck.notaCreditoCDelta}, esperado ${correlativeCheck.expectedNotaCreditoCDelta})`,
  );
  console.log(
    `   Los tres avanzan de forma independiente: ${yesNo(correlativesAdvancedIndependently)}`,
  );

  // 8. What was observed, point by point. Deliberately phrased as observations
  //    and not as a verdict: whether 10237 turning out excluding invalidates the
  //    star anchoring is a model decision (#599/#610), not something this script
  //    gets to decide. Hence no exit code is derived from any of it.
  const carries10237 = (attempt: AmendmentAttempt | null): boolean =>
    attempt !== null &&
    (hasCode(attempt.observaciones, OBS_CODE_10237) ||
      hasCode(attempt.errors, OBS_CODE_10237));
  const carries10197 = (attempt: AmendmentAttempt): boolean =>
    hasCode(attempt.errors, ERR_CODE_10197) ||
    hasCode(attempt.observaciones, ERR_CODE_10197);

  const findings = {
    // Point 2: is 10197 excluding, and on both documents?
    validacion10197: {
      notaCredito: {
        resultado: probeNcSinAsoc.resultado,
        rejected: probeNcSinAsoc.resultado === "R",
        carries10197: carries10197(probeNcSinAsoc),
        errors: probeNcSinAsoc.errors,
        observaciones: probeNcSinAsoc.observaciones,
      },
      notaDebito: {
        resultado: probeNdSinAsoc.resultado,
        rejected: probeNdSinAsoc.resultado === "R",
        carries10197: carries10197(probeNdSinAsoc),
        errors: probeNdSinAsoc.errors,
        observaciones: probeNdSinAsoc.observaciones,
      },
      // The spike cannot show PeriodoAsoc alone satisfies 10197: the SDK's
      // IVoucher has no such field (see the header).
      periodoAsocNotProbed: true,
    },
    // Point 3: does the ND payload close at all?
    notaDebitoPayload: {
      resultado: notaDebito.resultado,
      cae: notaDebito.cae,
      cbteNro: notaDebito.cbteNro,
      observaciones: notaDebito.observaciones,
      errors: notaDebito.errors,
      closed: wasAccepted(notaDebito),
    },
    // Point 1: how 10237 behaves under star anchoring.
    validacion10237: {
      partialLeavesResidue: {
        importe: IMPORTE_NC_PARCIAL,
        resultado: ncParcial.resultado,
        carries10237: carries10237(ncParcial),
        observaciones: ncParcial.observaciones,
      },
      cumulativeOverFactura: {
        importe: IMPORTE_NC_ACUMULADO,
        sumaNotasCreditoAntes:
          IMPORTE_NC_PARCIAL + (ncMultiAsoc ? IMPORTE_NC_MULTI : 0),
        importeFactura: importe,
        importeNotaDebito: IMPORTE_ND,
        resultado: ncAcumulado.resultado,
        carries10237: carries10237(ncAcumulado),
        observaciones: ncAcumulado.observaciones,
      },
      exceedsFacturaAlone: {
        importe: IMPORTE_NC_EXCEDE,
        importeFactura: importe,
        resultado: ncExcede.resultado,
        carries10237: carries10237(ncExcede),
        observaciones: ncExcede.observaciones,
        // The claim under test: non-excluding means a CAE is granted anyway.
        nonExcluding: wasAccepted(ncExcede) && carries10237(ncExcede),
        excluding: ncExcede.resultado === "R",
      },
    },
    // #610's reserved per-case exit.
    multiEntryCbtesAsoc:
      ncMultiAsoc === null
        ? { probed: false as const, reason: "la ND de (c) no obtuvo CAE" }
        : {
            probed: true as const,
            resultado: ncMultiAsoc.resultado,
            accepted: wasAccepted(ncMultiAsoc),
            observaciones: ncMultiAsoc.observaciones,
            errors: ncMultiAsoc.errors,
          },
    // Point 4: independent ratchets per (ptoVta, cbteTipo) (#578).
    correlatives: {
      before: correlativesBefore,
      after: correlativesAfter,
      ...correlativeCheck,
      advancedIndependently: correlativesAdvancedIndependently,
    },
  };

  console.log("\n════════ Lo observado, punto por punto (#686) ════════");
  console.log(
    `   1. 10237 con anclaje en estrella:\n` +
      `      NC parcial con remanente:    ${ncParcial.resultado ?? "?"}, 10237: ${yesNo(carries10237(ncParcial))}\n` +
      `      NC que acumula sobre la FC:  ${ncAcumulado.resultado ?? "?"}, 10237: ${yesNo(carries10237(ncAcumulado))}\n` +
      `      NC que excede la FC sola:    ${ncExcede.resultado ?? "?"}, 10237: ${yesNo(carries10237(ncExcede))}\n` +
      `      → no excluyente (CAE + Obs): ${yesNo(findings.validacion10237.exceedsFacturaAlone.nonExcluding)}`,
  );
  console.log(
    `   2. 10197 sin comprobante asociado:\n` +
      `      NC: ${probeNcSinAsoc.resultado ?? "?"}, código 10197: ${yesNo(carries10197(probeNcSinAsoc))}\n` +
      `      ND: ${probeNdSinAsoc.resultado ?? "?"}, código 10197: ${yesNo(carries10197(probeNdSinAsoc))}`,
  );
  console.log(
    `   3. El payload de la ND cierra: ${yesNo(findings.notaDebitoPayload.closed)}`,
  );
  console.log(
    `   4. Correlativos independientes: ${yesNo(correlativesAdvancedIndependently)}`,
  );
  console.log(
    `   Extra · CbtesAsoc múltiple: ${
      ncMultiAsoc === null
        ? "no se probó (la ND de (c) no obtuvo CAE)"
        : yesNo(wasAccepted(ncMultiAsoc))
    }`,
  );
  console.log(
    "\n   Esto es evidencia, no un veredicto: si 10237 resulta excluyente, " +
      "revisar\n   el anclaje en estrella (#599/#610) es una decisión de modelo, " +
      "no de este script.",
  );

  // Minimal persistence of the "comprobante" (local JSON, not the database).
  const comprobante = {
    environment: "homologacion",
    cuitIssuer: cuit,
    ptoVta,
    cbteTipo: CBTE_TIPO_FACTURA_C,
    cbteNro: emittedCbteNro,
    cbteFchSubmitted: voucher.CbteFch,
    cbteFchEchoed: det.CbteFch,
    cae: result.cae,
    caeFchVto: result.caeFchVto,
    condicionIvaReceptorId: voucher.CondicionIVAReceptorId,
    impTotal: voucher.ImpTotal,
    emittedAt: new Date().toISOString(),
    rawResponse: result.response,
    // Evidence for the ADR-0012 assumptions about FECompConsultar.
    consult: {
      checks: { ...consultChecks, ...absentChecks },
      error: consultError,
      voucherInfo: consulted,
      absentProbes,
      allAssumptionsConfirmed: allChecksPassed,
    },
    // Evidence for #686. `attempts` holds every FECAESolicitar of the amendment
    // sequence with its raw response; `findings` is the same data indexed by the
    // four verification points, for pasting into the issue.
    amendments: {
      facturaAsoc,
      attempts,
      findings,
    },
  };
  const outPath = `${outputDir}comprobante-${emittedCbteNro}.json`;
  writeFileSync(outPath, JSON.stringify(comprobante, null, 2));
  console.log(`\n   Persistido en: ${outPath}`);

  // Exit non-zero once the evidence is safely on disk: an unconfirmed ADR-0012
  // assumption is a failed run, and every other failure branch here exits 1.
  // The #686 amendment sequence deliberately does NOT feed this: an unexpected
  // answer from ARCA there is the finding the run went to collect, not a
  // regression, and failing the process would only hide the JSON's own verdict.
  if (!allChecksPassed) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("\n✗ El spike falló con una excepción:");
  console.error(error);
  process.exit(1);
});
