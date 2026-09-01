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

// Timeouts in milliseconds: the tests exercise the real cut-off, with no fake
// timers.
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
    // Only queried when the authorization falls over: by default ARCA does not
    // have that comprobante.
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
  test("queries the last authorized number for Factura C (type 11) and interprets it", async () => {
    const billing = fakeBilling();
    const client = new ArcaClient(billing);

    const result = await client.getLastFacturaCNumber(1);

    expect(billing.getLastVoucher).toHaveBeenCalledWith(1, 11);
    expect(result.lastCbteNro).toBe(42);
    expect(result.nextCbteNro).toBe(43);
  });

  test("emits by sending a Factura C FECAESolicitar and returns the CAE", async () => {
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

  test("propagates the builder's validation error without calling ARCA", async () => {
    const billing = fakeBilling();
    const client = new ArcaClient(billing);

    await expect(
      client.emitFacturaC({ ...emissionInput, importe: 0 }),
    ).rejects.toThrow(/ImpTotal/);
    expect(billing.createVoucher).not.toHaveBeenCalled();
  });

  test("queries the last authorized number for Nota de crédito C (type 13)", async () => {
    const billing = fakeBilling({
      getLastVoucher: vi.fn(async () => ultimoNotaCreditoAutorizado),
    });
    const client = new ArcaClient(billing);

    const result = await client.getLastNotaCreditoCNumber(1);

    expect(billing.getLastVoucher).toHaveBeenCalledWith(1, 13);
    expect(result.lastCbteNro).toBe(7);
    expect(result.nextCbteNro).toBe(8);
  });

  test("emits a mirror Nota de crédito C (type 13) with CbtesAsoc and returns the CAE", async () => {
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

  test("queries a single comprobante (FECompConsultar) with the SDK's positional order", async () => {
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

  test("a non-existent comprobante comes back as null, not as an error", async () => {
    const client = new ArcaClient(fakeBilling());

    await expect(
      client.getVoucherInfo({ ptoVta: 1, cbteTipo: 11, cbteNro: 999 }),
    ).resolves.toBeNull();
  });
});

// The SDK imposes no timeout at any layer: without ours, a call that never
// answers leaves the promise hanging forever (ADR-0012 decision 2).
describe("ArcaClient (timeouts)", () => {
  test("bounds FECompUltimoAutorizado with the lookup timeout", async () => {
    const billing = fakeBilling({ getLastVoucher: vi.fn(neverAnswers) });
    const client = new ArcaClient(billing, FAST_TIMEOUTS);

    await expect(client.getLastFacturaCNumber(1)).rejects.toThrow(
      /FECompUltimoAutorizado/,
    );
  });

  test("bounds FECAESolicitar with the authorization timeout", async () => {
    const billing = fakeBilling({ createVoucher: vi.fn(neverAnswers) });
    const client = new ArcaClient(billing, FAST_TIMEOUTS);

    await expect(client.emitFacturaC(emissionInput)).rejects.toThrow(
      /FECAESolicitar/,
    );
  });

  test("also bounds the type 13 series' last-number lookup and its emission", async () => {
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

  test("bounds FECompConsultar: recovery cannot be left hanging", async () => {
    const billing = fakeBilling({ getVoucherInfo: vi.fn(neverAnswers) });
    const client = new ArcaClient(billing, FAST_TIMEOUTS);

    await expect(
      client.getVoucherInfo({ ptoVta: 1, cbteTipo: 11, cbteNro: 43 }),
    ).rejects.toThrow(/FECompConsultar/);
  });

  test("a call that responds in time is unaffected", async () => {
    const client = new ArcaClient(fakeBilling(), FAST_TIMEOUTS);

    await expect(client.getLastFacturaCNumber(1)).resolves.toMatchObject({
      nextCbteNro: 43,
    });
  });

  test("the default timeouts are 15s for lookup and 30s for authorization", () => {
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

  test("decodes base64 cert+key into PEM and reads the CUIT", () => {
    const config = readArcaClientConfig(validEnv());

    expect(config.cert).toContain("-----BEGIN CERTIFICATE-----");
    expect(config.key).toContain("-----BEGIN PRIVATE KEY-----");
    expect(config.cuit).toBe(30717611590);
    expect(config.production).toBe(false);
  });

  test("homologación is the default environment and production is enabled explicitly", () => {
    const { ARCA_PRODUCTION: _omit, ...withoutFlag } = validEnv();
    expect(readArcaClientConfig(withoutFlag).production).toBe(false);

    expect(
      readArcaClientConfig({ ...validEnv(), ARCA_PRODUCTION: "true" })
        .production,
    ).toBe(true);
  });

  test("rejects base64 that does not decode into a PEM", () => {
    expect(() =>
      readArcaClientConfig({
        ...validEnv(),
        ARCA_CERT_B64: toBase64("no soy un pem"),
      }),
    ).toThrow(/PEM/);
  });

  test("requires the certificate", () => {
    const { ARCA_CERT_B64: _omit, ...withoutCert } = validEnv();

    expect(() => readArcaClientConfig(withoutCert)).toThrow(/ARCA_CERT_B64/);
  });

  test("rejects a non-integer CUIT", () => {
    expect(() =>
      readArcaClientConfig({ ...validEnv(), ARCA_CUIT: "no-numero" }),
    ).toThrow(/ARCA_CUIT/);
  });
});
