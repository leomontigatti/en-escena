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
// Run:  ARCA_CERT_HOMO_B64=... ARCA_KEY_HOMO_B64=... \
//       ARCA_CUIT=30717611590 ARCA_PTOVTA_HOMO=1 \
//       node --import tsx scripts/arca-spike-homo.ts

// Factura C. Class C is what an IVA-exempt issuer emits; see the header.
const CBTE_TIPO_FACTURA_C = 11;

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

  // 3. Last authorized, only to narrate the correlative (createNextVoucher
  //    resolves it on its own anyway).
  const last = await billing.getLastVoucher(ptoVta, CBTE_TIPO_FACTURA_C);
  console.log(
    `✓ FECompUltimoAutorizado(PtoVta=${ptoVta}, CbteTipo=${CBTE_TIPO_FACTURA_C}): último=${last.cbteNro}, siguiente=${last.cbteNro + 1}\n`,
  );

  // 4. Factura C to an anonymous final consumer (DocTipo 99 / DocNro 0).
  //    No itemized IVA: ImpNeto = subtotal, the rest 0, ImpTotal = ImpNeto.
  const importe = 1000;
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
  };
  const outPath = `${outputDir}comprobante-${emittedCbteNro}.json`;
  writeFileSync(outPath, JSON.stringify(comprobante, null, 2));
  console.log(`\n   Persistido en: ${outPath}`);

  // Exit non-zero once the evidence is safely on disk: an unconfirmed
  // assumption is a failed run, and every other failure branch here exits 1.
  if (!allChecksPassed) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("\n✗ El spike falló con una excepción:");
  console.error(error);
  process.exit(1);
});
