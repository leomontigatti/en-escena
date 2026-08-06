import type {
  CreateVoucherResultDto,
  LastVoucherResultDto,
  VoucherInfoResultDto,
} from "@arcasdk/core";
import { describe, expect, test, vi } from "vitest";

import {
  ARCA_TIMEOUTS,
  ArcaClient,
  readArcaClientConfig,
  type ArcaBillingPort,
} from "./client.server";
import type { ArcaVoucher } from "./factura-c";
import {
  facturaCAprobada,
  facturaCConsultada,
  notaCreditoCAprobada,
  ultimoAutorizado,
  ultimoNotaCreditoAutorizado,
} from "./fixtures";

// Timeouts en milisegundos: los tests ejercitan el corte real, sin fake timers.
const FAST_TIMEOUTS = { lookup: 20, authorization: 20 };

function neverAnswers(): Promise<never> {
  return new Promise<never>(() => {});
}

const CERT_PEM = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----";
const KEY_PEM = "-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----";

function toBase64(pem: string): string {
  return Buffer.from(pem, "utf8").toString("base64");
}

function fakeBilling(
  overrides: Partial<ArcaBillingPort> = {},
): ArcaBillingPort {
  return {
    getLastVoucher: vi.fn(
      async (): Promise<LastVoucherResultDto> => ultimoAutorizado,
    ),
    createVoucher: vi.fn(
      async (): Promise<CreateVoucherResultDto> => facturaCAprobada,
    ),
    // Sólo se consulta cuando la autorización se cae: por defecto ARCA no tiene
    // ese comprobante.
    getVoucherInfo: vi.fn(
      async (): Promise<VoucherInfoResultDto | null> => null,
    ),
    ...overrides,
  };
}

const emissionInput = {
  ptoVta: 1,
  cbteNro: 43,
  cbteFch: "20260722",
  importe: 1000,
  condicionIvaReceptorId: 5,
};

describe("ArcaClient", () => {
  test("consulta el último autorizado para Factura C (tipo 11) y lo interpreta", async () => {
    const billing = fakeBilling();
    const client = new ArcaClient(billing);

    const result = await client.getLastFacturaCNumber(1);

    expect(billing.getLastVoucher).toHaveBeenCalledWith(1, 11);
    expect(result.lastCbteNro).toBe(42);
    expect(result.nextCbteNro).toBe(43);
  });

  test("emite enviando un FECAESolicitar de Factura C y devuelve el CAE", async () => {
    let sent: ArcaVoucher | undefined;
    const billing = fakeBilling({
      createVoucher: vi.fn(async (req: ArcaVoucher) => {
        sent = req;
        return facturaCAprobada;
      }),
    });
    const client = new ArcaClient(billing);

    const result = await client.emitFacturaC(emissionInput);

    expect(sent?.CbteTipo).toBe(11);
    expect(sent?.ImpNeto).toBe(sent?.ImpTotal);
    expect(sent?.Iva).toBeUndefined();
    expect(result.approved).toBe(true);
    expect(result.cae).toBe("41124578989845");
  });

  test("propaga el error de validación del builder sin llamar a ARCA", async () => {
    const billing = fakeBilling();
    const client = new ArcaClient(billing);

    await expect(
      client.emitFacturaC({ ...emissionInput, importe: 0 }),
    ).rejects.toThrow(/ImpTotal/);
    expect(billing.createVoucher).not.toHaveBeenCalled();
  });

  test("consulta el último autorizado para Nota de crédito C (tipo 13)", async () => {
    const billing = fakeBilling({
      getLastVoucher: vi.fn(async () => ultimoNotaCreditoAutorizado),
    });
    const client = new ArcaClient(billing);

    const result = await client.getLastNotaCreditoCNumber(1);

    expect(billing.getLastVoucher).toHaveBeenCalledWith(1, 13);
    expect(result.lastCbteNro).toBe(7);
    expect(result.nextCbteNro).toBe(8);
  });

  test("emite una Nota de crédito C espejo (tipo 13) con CbtesAsoc y devuelve el CAE", async () => {
    let sent: ArcaVoucher | undefined;
    const billing = fakeBilling({
      createVoucher: vi.fn(async (req: ArcaVoucher) => {
        sent = req;
        return notaCreditoCAprobada;
      }),
    });
    const client = new ArcaClient(billing);

    const result = await client.emitNotaCreditoC({
      ...emissionInput,
      cbteNro: 8,
      importe: 7000,
      emisorCuit: "30717611590",
      asociado: { cbteTipo: 11, ptoVta: 1, cbteNro: 43 },
    });

    expect(sent?.CbteTipo).toBe(13);
    expect(sent?.CbtesAsoc).toEqual([
      { Tipo: 11, PtoVta: 1, Nro: 43, Cuit: "30717611590" },
    ]);
    expect(result.approved).toBe(true);
    expect(result.cae).toBe("41124599990011");
  });

  test("consulta un comprobante puntual (FECompConsultar) con el orden posicional del SDK", async () => {
    const billing = fakeBilling({
      getVoucherInfo: vi.fn(async () => facturaCConsultada),
    });
    const client = new ArcaClient(billing);

    const voucher = await client.getVoucherInfo({
      ptoVta: 1,
      cbteTipo: 11,
      cbteNro: 43,
    });

    expect(billing.getVoucherInfo).toHaveBeenCalledWith(43, 1, 11);
    expect(voucher).toEqual({
      cae: "41124578989845",
      caeVto: "20260801",
      impTotal: 1000,
      cbteFch: "20260722",
    });
  });

  test("un comprobante inexistente vuelve como null, no como error", async () => {
    const client = new ArcaClient(fakeBilling());

    await expect(
      client.getVoucherInfo({ ptoVta: 1, cbteTipo: 11, cbteNro: 999 }),
    ).resolves.toBeNull();
  });
});

// El SDK no impone timeout en ninguna capa: sin el nuestro, una llamada que
// nunca responde deja la promesa colgada para siempre (ADR-0012 decisión 2).
describe("ArcaClient (timeouts)", () => {
  test("acota FECompUltimoAutorizado con el timeout de consulta", async () => {
    const billing = fakeBilling({ getLastVoucher: vi.fn(neverAnswers) });
    const client = new ArcaClient(billing, FAST_TIMEOUTS);

    await expect(client.getLastFacturaCNumber(1)).rejects.toThrow(
      /FECompUltimoAutorizado/,
    );
  });

  test("acota FECAESolicitar con el timeout de autorización", async () => {
    const billing = fakeBilling({ createVoucher: vi.fn(neverAnswers) });
    const client = new ArcaClient(billing, FAST_TIMEOUTS);

    await expect(client.emitFacturaC(emissionInput)).rejects.toThrow(
      /FECAESolicitar/,
    );
  });

  test("acota también la consulta del último de la serie tipo 13 y su emisión", async () => {
    const client = new ArcaClient(
      fakeBilling({
        getLastVoucher: vi.fn(neverAnswers),
        createVoucher: vi.fn(neverAnswers),
      }),
      FAST_TIMEOUTS,
    );

    await expect(client.getLastNotaCreditoCNumber(1)).rejects.toThrow(
      /FECompUltimoAutorizado/,
    );
    await expect(
      client.emitNotaCreditoC({
        ...emissionInput,
        cbteNro: 8,
        emisorCuit: "30717611590",
        asociado: { cbteTipo: 11, ptoVta: 1, cbteNro: 43 },
      }),
    ).rejects.toThrow(/FECAESolicitar/);
  });

  test("acota FECompConsultar: la recuperación no puede quedar colgada", async () => {
    const billing = fakeBilling({ getVoucherInfo: vi.fn(neverAnswers) });
    const client = new ArcaClient(billing, FAST_TIMEOUTS);

    await expect(
      client.getVoucherInfo({ ptoVta: 1, cbteTipo: 11, cbteNro: 43 }),
    ).rejects.toThrow(/FECompConsultar/);
  });

  test("una llamada que responde a tiempo no se ve afectada", async () => {
    const client = new ArcaClient(fakeBilling(), FAST_TIMEOUTS);

    await expect(client.getLastFacturaCNumber(1)).resolves.toMatchObject({
      nextCbteNro: 43,
    });
  });

  test("los timeouts por defecto son 15s de consulta y 30s de autorización", () => {
    expect(ARCA_TIMEOUTS).toEqual({ lookup: 15_000, authorization: 30_000 });
  });
});

describe("readArcaClientConfig", () => {
  const validEnv = (): NodeJS.ProcessEnv => ({
    ARCA_CERT_B64: toBase64(CERT_PEM),
    ARCA_KEY_B64: toBase64(KEY_PEM),
    ARCA_CUIT: "30717611590",
    ARCA_PRODUCTION: "false",
  });

  test("decodifica cert+key base64 a PEM y lee el CUIT", () => {
    const config = readArcaClientConfig(validEnv());

    expect(config.cert).toContain("-----BEGIN CERTIFICATE-----");
    expect(config.key).toContain("-----BEGIN PRIVATE KEY-----");
    expect(config.cuit).toBe(30717611590);
    expect(config.production).toBe(false);
  });

  test("homologación es el ambiente por defecto y producción se habilita explícitamente", () => {
    const { ARCA_PRODUCTION: _omit, ...withoutFlag } = validEnv();
    expect(readArcaClientConfig(withoutFlag).production).toBe(false);

    expect(
      readArcaClientConfig({ ...validEnv(), ARCA_PRODUCTION: "true" })
        .production,
    ).toBe(true);
  });

  test("rechaza un base64 que no decodifica a un PEM", () => {
    expect(() =>
      readArcaClientConfig({
        ...validEnv(),
        ARCA_CERT_B64: toBase64("no soy un pem"),
      }),
    ).toThrow(/PEM/);
  });

  test("exige el certificado", () => {
    const { ARCA_CERT_B64: _omit, ...withoutCert } = validEnv();

    expect(() => readArcaClientConfig(withoutCert)).toThrow(/ARCA_CERT_B64/);
  });

  test("rechaza un CUIT no entero", () => {
    expect(() =>
      readArcaClientConfig({ ...validEnv(), ARCA_CUIT: "no-numero" }),
    ).toThrow(/ARCA_CUIT/);
  });
});
