import {
  Arca,
  type CreateVoucherResultDto,
  type LastVoucherResultDto,
  type VoucherInfoResultDto,
} from "@arcasdk/core";

import {
  buildFacturaCVoucher,
  FACTURA_C_CBTE_TIPO,
  NOTA_CREDITO_C_CBTE_TIPO,
  type ArcaVoucher,
  type FacturaCVoucherInput,
} from "./factura-c";
import {
  buildNotaCreditoCVoucher,
  type NotaCreditoCVoucherInput,
} from "./nota-credito";
import {
  parseCreateVoucherResult,
  parseLastVoucher,
  parseVoucherInfo,
  type FacturaCEmissionResult,
  type LastVoucherResult,
  type VoucherInfoResult,
} from "./responses";
import { InMemoryTaCache } from "./ta-cache.server";

// The minimal surface of WSFEv1 the wrapper uses. It is a port, so the client
// can be exercised against fixtures without building a real `Arca` or touching
// the network: in production `arca.electronicBillingService` fulfils it.
export type ArcaBillingPort = {
  getLastVoucher(
    salesPoint: number,
    type: number,
  ): Promise<LastVoucherResultDto>;
  createVoucher(req: ArcaVoucher): Promise<CreateVoucherResultDto>;
  getVoucherInfo(
    number: number,
    salesPoint: number,
    type: number,
  ): Promise<VoucherInfoResultDto | null>;
};

// Per-call timeouts, in milliseconds (ADR-0012 decision 2). They are code
// constants, not environment variables: a required one would break the
// existing deploys, and an optional one is a knob nobody has needed yet.
export const ARCA_TIMEOUTS = {
  // Lookup: giving up early is free, and a fast failure gets the operator
  // retrying sooner.
  lookup: 15_000,
  // Authorization: deliberately generous. WSFEv1 takes tens of seconds under
  // load, and every premature cut-off manufactures the ambiguity that then has
  // to be resolved.
  authorization: 30_000,
} as const;

export type ArcaTimeouts = {
  lookup: number;
  authorization: number;
};

/**
 * A call's timeout elapsed, which is different from the call having failed: the
 * exception is ours, not the transport's, and the request is still in flight.
 * Telling them apart matters because after an authorization timeout ARCA may
 * still grant the CAE, so an immediate lookup that does not find the
 * comprobante does not prove it was never emitted (ADR-0012 decision 3).
 */
export class ArcaTimeoutError extends Error {
  constructor(operation: string, ms: number) {
    super(`ARCA no respondió ${operation} en ${ms}ms.`);
    this.name = "ArcaTimeoutError";
  }
}

/**
 * Bounds a call to ARCA with its timeout. `@arcasdk/core` imposes none at any
 * layer, so a socket that opens and never answers leaves the promise pending
 * forever: there is no exception to classify and the operator waits until some
 * proxy gives up on their behalf.
 *
 * Winning the race does NOT cancel the in-flight call: ARCA may authorize the
 * comprobante anyway, after we stop waiting. That is expected, and it is why
 * the error is distinguished: the later recovery cannot read an "I don't have
 * it" as final while the authorization may still be in progress. The SDK also
 * offers no way to propagate an `AbortSignal`.
 */
async function withTimeout<T>(
  ms: number,
  operation: string,
  run: () => Promise<T>,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      run(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new ArcaTimeoutError(operation, ms)),
          ms,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// WSAA + WSFEv1 client, scoped to the Factura C circuit. It does not decide
// sequence numbers or derive state: that is the emission logic (#446). Here we
// only build the payload, talk to ARCA and interpret the response.
export class ArcaClient {
  constructor(
    private readonly billing: ArcaBillingPort,
    // Injectable so the tests can shrink them down to milliseconds.
    private readonly timeouts: ArcaTimeouts = ARCA_TIMEOUTS,
  ) {}

  // `FECompUltimoAutorizado` for Factura C (type 11): the last authorized
  // sequence number and the next one to request.
  async getLastFacturaCNumber(ptoVta: number): Promise<LastVoucherResult> {
    const result = await withTimeout(
      this.timeouts.lookup,
      "FECompUltimoAutorizado",
      () => this.billing.getLastVoucher(ptoVta, FACTURA_C_CBTE_TIPO),
    );

    return parseLastVoucher(result);
  }

  // `FECAESolicitar` for a Factura C: builds the payload, authorizes it and
  // returns CAE/expiry along with errors/observations.
  async emitFacturaC(
    input: FacturaCVoucherInput,
  ): Promise<FacturaCEmissionResult> {
    const voucher = buildFacturaCVoucher(input);
    const result = await withTimeout(
      this.timeouts.authorization,
      "FECAESolicitar",
      () => this.billing.createVoucher(voucher),
    );

    return parseCreateVoucherResult(result);
  }

  // `FECompUltimoAutorizado` for Nota de crédito C (type 13): its sequence runs
  // on a series of its own, separate from Factura C's.
  async getLastNotaCreditoCNumber(ptoVta: number): Promise<LastVoucherResult> {
    const result = await withTimeout(
      this.timeouts.lookup,
      "FECompUltimoAutorizado",
      () => this.billing.getLastVoucher(ptoVta, NOTA_CREDITO_C_CBTE_TIPO),
    );

    return parseLastVoucher(result);
  }

  // `FECAESolicitar` for a Nota de crédito C: builds the mirror payload with
  // `CbtesAsoc`, authorizes it and returns CAE/expiry along with
  // errors/observations.
  async emitNotaCreditoC(
    input: NotaCreditoCVoucherInput,
  ): Promise<FacturaCEmissionResult> {
    const voucher = buildNotaCreditoCVoucher(input);
    const result = await withTimeout(
      this.timeouts.authorization,
      "FECAESolicitar",
      () => this.billing.createVoucher(voucher),
    );

    return parseCreateVoucherResult(result);
  }

  /**
   * `FECompConsultar`: fetches the exact comprobante
   * (`PtoVta`/`CbteTipo`/`CbteNro`) as ARCA has it on record. It is the call
   * that resolves an authorization left without a response. Returns `null` when
   * ARCA does not have that comprobante. Runs with the lookup timeout.
   */
  async getVoucherInfo(input: {
    ptoVta: number;
    cbteTipo: number;
    cbteNro: number;
  }): Promise<VoucherInfoResult | null> {
    const result = await withTimeout(
      this.timeouts.lookup,
      "FECompConsultar",
      () =>
        this.billing.getVoucherInfo(
          input.cbteNro,
          input.ptoVta,
          input.cbteTipo,
        ),
    );

    return parseVoucherInfo(result);
  }
}

export type ArcaClientConfig = {
  // Certificate and private key in PEM, already decoded from base64.
  cert: string;
  key: string;
  cuit: number;
  // `false` points the SDK at homologación (wsaahomo/wswhomo); `true`, at
  // production.
  production: boolean;
};

function requireEnv(name: string, env: NodeJS.ProcessEnv): string {
  const value = env[name];

  if (!value || value.trim() === "") {
    throw new Error(`Falta la variable de entorno ${name}.`);
  }

  return value;
}

// The cert and the key are injected as base64 (a single line, suitable for a
// CI/env secret) and turned into PEM here. A malformed base64 does not contain
// the PEM header once decoded, so it is rejected early with a clear message.
function decodePem(base64: string, kind: string): string {
  const pem = Buffer.from(base64, "base64").toString("utf8");

  if (!pem.includes("-----BEGIN")) {
    throw new Error(
      `${kind} no parece un PEM válido tras decodificar base64 ` +
        `(no contiene "-----BEGIN"). ¿La variable está bien codificada?`,
    );
  }

  return pem;
}

// Reads the client configuration from the environment. The real issuer is
// Proyecciones Artísticas Asociación Civil (CUIT 30717611590); homologación is
// the default environment and production is enabled explicitly.
export function readArcaClientConfig(
  env: NodeJS.ProcessEnv = process.env,
): ArcaClientConfig {
  const cert = decodePem(requireEnv("ARCA_CERT_B64", env), "El certificado");
  const key = decodePem(requireEnv("ARCA_KEY_B64", env), "La clave privada");

  const cuitRaw = requireEnv("ARCA_CUIT", env);
  const cuit = Number(cuitRaw);

  if (!Number.isInteger(cuit)) {
    throw new Error(`ARCA_CUIT="${cuitRaw}" no es un entero.`);
  }

  return {
    cert,
    key,
    cuit,
    production: (env.ARCA_PRODUCTION ?? "").toLowerCase() === "true",
  };
}

// Builds a real `ArcaClient` from a config, with the in-process TA cache.
export function createArcaClient(config: ArcaClientConfig): ArcaClient {
  const arca = new Arca({
    production: config.production,
    cert: config.cert,
    key: config.key,
    cuit: config.cuit,
    ticketStorage: new InMemoryTaCache(),
  });

  return new ArcaClient(arca.electronicBillingService);
}

let memoizedClient: { key: string; client: ArcaClient } | null = null;

// Process-wide shared client. Memoizing keeps the same TA cache alive across
// requests, which is what avoids re-authenticating against WSAA on every call
// during the ticket's ~12 h window.
export function getArcaClient(
  env: NodeJS.ProcessEnv = process.env,
): ArcaClient {
  const config = readArcaClientConfig(env);
  const key = `${config.cuit}-${config.production}`;

  if (memoizedClient?.key === key) {
    return memoizedClient.client;
  }

  const client = createArcaClient(config);
  memoizedClient = { key, client };

  return client;
}
