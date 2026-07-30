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

// Superficie mínima de WSFEv1 que usa el wrapper. Es un puerto para poder
// ejercitar el cliente contra fixtures sin construir un `Arca` real ni tocar la
// red: en producción lo cumple `arca.electronicBillingService`.
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

// Timeouts por llamada, en milisegundos (ADR-0012 decisión 2). Son constantes de
// código, no variables de entorno: una requerida rompería los deploys existentes
// y una opcional es una perilla que nadie necesitó todavía.
export const ARCA_TIMEOUTS = {
  // Consulta: abandonar temprano es gratis y una falla rápida pone al operador a
  // reintentar antes.
  lookup: 15_000,
  // Autorización: deliberadamente generoso. WSFEv1 tarda decenas de segundos bajo
  // carga y cada corte prematuro fabrica la ambigüedad que hay que ir a resolver.
  authorization: 30_000,
} as const;

export type ArcaTimeouts = {
  lookup: number;
  authorization: number;
};

/**
 * Se agotó el timeout de una llamada, que es distinto de que la llamada haya
 * fallado: la excepción es nuestra, no del transporte, y la petición sigue en
 * vuelo. Distinguirla importa porque después de un timeout de autorización ARCA
 * todavía puede otorgar el CAE, así que una consulta inmediata que no encuentra
 * el comprobante no prueba que no se haya emitido (ADR-0012 decisión 3).
 */
export class ArcaTimeoutError extends Error {
  constructor(operation: string, ms: number) {
    super(`ARCA no respondió ${operation} en ${ms}ms.`);
    this.name = "ArcaTimeoutError";
  }
}

/**
 * Acota una llamada a ARCA con su timeout. `@arcasdk/core` no impone ninguno en
 * ninguna capa, así que un socket que abre y nunca responde deja la promesa
 * pendiente para siempre: no hay excepción que clasificar y el operador espera
 * hasta que un proxy se rinda por él.
 *
 * Ganar la carrera NO cancela la llamada en vuelo: ARCA puede autorizar el
 * comprobante igual, después de que dejamos de esperar. Eso es esperado, y es
 * por lo que el error se distingue: la recuperación posterior no puede leer un
 * "no lo tengo" como definitivo mientras la autorización pueda seguir en curso.
 * El SDK tampoco ofrece forma de propagar un `AbortSignal`.
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

// Cliente WSAA + WSFEv1 acotado al circuito de Factura C. No decide correlativos
// ni deriva estado: eso es la lógica de emisión (#446). Acá sólo se arma el
// payload, se habla con ARCA y se interpreta la respuesta.
export class ArcaClient {
  constructor(
    private readonly billing: ArcaBillingPort,
    // Inyectables para que los tests los achiquen a milisegundos.
    private readonly timeouts: ArcaTimeouts = ARCA_TIMEOUTS,
  ) {}

  // `FECompUltimoAutorizado` para Factura C (tipo 11): último correlativo
  // autorizado y el siguiente a solicitar.
  async getLastFacturaCNumber(ptoVta: number): Promise<LastVoucherResult> {
    const result = await withTimeout(
      this.timeouts.lookup,
      "FECompUltimoAutorizado",
      () => this.billing.getLastVoucher(ptoVta, FACTURA_C_CBTE_TIPO),
    );

    return parseLastVoucher(result);
  }

  // `FECAESolicitar` de una Factura C: arma el payload, lo autoriza y devuelve
  // CAE/vencimiento junto con errores/observaciones.
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

  // `FECompUltimoAutorizado` para Nota de crédito C (tipo 13): su correlativo
  // corre por una serie propia, separada de la de Factura C.
  async getLastNotaCreditoCNumber(ptoVta: number): Promise<LastVoucherResult> {
    const result = await withTimeout(
      this.timeouts.lookup,
      "FECompUltimoAutorizado",
      () => this.billing.getLastVoucher(ptoVta, NOTA_CREDITO_C_CBTE_TIPO),
    );

    return parseLastVoucher(result);
  }

  // `FECAESolicitar` de una Nota de crédito C: arma el payload espejo con
  // `CbtesAsoc`, lo autoriza y devuelve CAE/vencimiento junto con
  // errores/observaciones.
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
   * `FECompConsultar`: trae el comprobante exacto (`PtoVta`/`CbteTipo`/`CbteNro`)
   * tal como ARCA lo tiene registrado. Es la llamada con la que se resuelve una
   * autorización que quedó sin respuesta. Devuelve `null` cuando ARCA no tiene
   * ese comprobante. Corre con el timeout de consulta.
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
  // Certificado y clave privada en PEM, ya decodificados desde base64.
  cert: string;
  key: string;
  cuit: number;
  // `false` apunta el SDK a homologación (wsaahomo/wswhomo); `true`, a producción.
  production: boolean;
};

function requireEnv(name: string, env: NodeJS.ProcessEnv): string {
  const value = env[name];

  if (!value || value.trim() === "") {
    throw new Error(`Falta la variable de entorno ${name}.`);
  }

  return value;
}

// El cert y la key se inyectan en base64 (una sola línea, apta para un secreto de
// CI/env) y acá se vuelven PEM. Un base64 mal armado no contiene el encabezado
// PEM tras decodificar, así que se rechaza temprano con un mensaje claro.
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

// Lee la configuración del cliente desde el entorno. El emisor real es
// Proyecciones Artísticas Asociación Civil (CUIT 30717611590); homologación es
// el ambiente por defecto y producción se habilita explícitamente.
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

// Construye un `ArcaClient` real desde una config, con el cache de TA in-process.
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

// Cliente compartido a nivel de proceso. Memoizar mantiene vivo el mismo cache de
// TA entre requests, que es lo que evita re-autenticar contra WSAA en cada
// llamada durante la ventana de ~12h del ticket.
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
