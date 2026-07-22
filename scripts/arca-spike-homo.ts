import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Arca, FileSystemTicketStorage } from "@arcasdk/core";

// Spike de des-riesgo (#428): emite UNA Factura C de punta a punta contra el
// entorno de HOMOLOGACIÓN de ARCA para confirmar que el circuito completo
// (WSAA + cache de TA + WSFEv1 → CAE) cierra, antes de construir el modelo
// `Comprobante` real (#326), la lógica de emisión, la UX (#339), NC (#328) y el
// impreso (#329/#334).
//
// Flujo (documentado en la research #321, rama research/arca-wsfev1):
//   1. WSAA: firma CMS del TRA con cert+key y `loginCms` → Token+Sign. El TA se
//      cachea en disco (~12h) porque ARCA rechaza pedidos repetidos.
//   2. WSFEv1: `FECompUltimoAutorizado` para el correlativo y `FECAESolicitar`
//      (vía createNextVoucher, que auto-numera) para obtener el CAE.
//
// El emisor es Proyecciones Artísticas Asociación Civil (CUIT 30717611590),
// EXENTA frente al IVA. Los sujetos exentos también emiten clase C, así que la
// Factura C (`CbteTipo` 11) y el payload de WSFEv1 se mantienen intactos.
//
// NO se persiste un `Comprobante` en la base: para un spike alcanza con volcar
// el resultado a un JSON local (ver OUTPUT_DIR). El schema real es #326.
//
// Correr:  ARCA_CERT_HOMO_B64=... ARCA_KEY_HOMO_B64=... \
//          ARCA_CUIT=30717611590 ARCA_PTOVTA_HOMO=1 \
//          node --import tsx scripts/arca-spike-homo.ts

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

  // production:false apunta el SDK a los endpoints de homologación
  // (wsaahomo/wswhomo). El FileSystemTicketStorage cachea el TA por (CUIT,
  // ambiente, servicio) para respetar la ventana de ~12h.
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

  // 1. Sanity de conectividad + WSAA (dispara el loginCms y cachea el TA).
  const status = await billing.getServerStatus();
  console.log(
    `✓ WSFEv1 dummy: app=${status.appServer} db=${status.dbServer} auth=${status.authServer}\n`,
  );

  // 2. Condición IVA del receptor (RG 5616): no se hardcodea, se resuelve en
  //    runtime contra los códigos de clase "C".
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

  // 3. Último autorizado, solo para narrar el correlativo (createNextVoucher
  //    igual lo resuelve solo).
  const last = await billing.getLastVoucher(ptoVta, 11);
  console.log(
    `✓ FECompUltimoAutorizado(PtoVta=${ptoVta}, CbteTipo=11): último=${last.cbteNro}, siguiente=${last.cbteNro + 1}\n`,
  );

  // 4. Factura C (CbteTipo 11) a consumidor final anónimo (DocTipo 99 / DocNro 0).
  //    Sin IVA discriminado: ImpNeto = subtotal, el resto en 0, ImpTotal = ImpNeto.
  const importe = 1000;
  const voucher = {
    CantReg: 1,
    PtoVta: ptoVta,
    CbteTipo: 11,
    Concepto: 1, // Productos
    DocTipo: 99, // Consumidor final anónimo
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

  if (resultado !== "A" || !result.cae) {
    console.error("\n✗ ARCA NO aprobó el comprobante.");
    console.error(`  Resultado: ${resultado}`);
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
    `   Comprobante: PtoVta ${ptoVta} · Nro ${det?.CbteDesde} · Tipo 11`,
  );

  // Persistencia mínima del "comprobante" (JSON local, no la base).
  const comprobante = {
    ambiente: "homologacion",
    cuitEmisor: cuit,
    ptoVta,
    cbteTipo: 11,
    cbteNro: det?.CbteDesde,
    cbteFch: det?.CbteFch,
    cae: result.cae,
    caeFchVto: result.caeFchVto,
    condicionIvaReceptorId: voucher.CondicionIVAReceptorId,
    impTotal: voucher.ImpTotal,
    emitidoEn: new Date().toISOString(),
    responseCruda: result.response,
  };
  const outPath = `${outputDir}comprobante-${det?.CbteDesde ?? Date.now()}.json`;
  writeFileSync(outPath, JSON.stringify(comprobante, null, 2));
  console.log(`\n   Persistido en: ${outPath}`);
}

main().catch((error) => {
  console.error("\n✗ El spike falló con una excepción:");
  console.error(error);
  process.exit(1);
});
