import type {
  CreateVoucherResultDto,
  LastVoucherResultDto,
  VoucherInfoResultDto,
} from "@arcasdk/core";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { ArcaClient, type ArcaBillingPort } from "./client.server";
import {
  emitWithContingency,
  formatArcaMessage,
  type ArcaEmissionChoreography,
  type ArcaEmissionRequest,
} from "./emission.server";
import type { ArcaVoucher } from "./factura-c";
import {
  facturaCAprobada,
  facturaCConsultada,
  facturaCRechazada,
  ultimoAutorizado,
} from "./fixtures";
import {
  parseCreateVoucherResult,
  parseLastVoucher,
  type FacturaCEmissionResult,
  type LastVoucherResult,
} from "./responses";

// El comprobante persistido en el test: la coreografía no sabe qué es, sólo que
// `persist` lo devuelve.
type PersistedVoucher = {
  cae: string;
  caeVto: string;
  cbteNro: number;
  cbteFch: string;
  requestedCbteFch: string;
};

function fakeBilling(
  overrides: Partial<ArcaBillingPort> = {},
): ArcaBillingPort {
  return {
    getLastVoucher: vi.fn(
      async (): Promise<LastVoucherResultDto> => ultimoAutorizado,
    ),
    createVoucher: vi.fn(
      async (_voucher: ArcaVoucher): Promise<CreateVoucherResultDto> =>
        facturaCAprobada,
    ),
    getVoucherInfo: vi.fn(
      async (): Promise<VoucherInfoResultDto | null> => null,
    ),
    ...overrides,
  };
}

// La coreografía por defecto: consulta el correlativo, emite aprobado y
// persiste. Cada test sobrescribe la parte que ejercita.
function choreography(
  overrides: Partial<ArcaEmissionChoreography<PersistedVoucher>> = {},
  billing: ArcaBillingPort = fakeBilling(),
): ArcaEmissionChoreography<PersistedVoucher> {
  return {
    client: new ArcaClient(billing),
    subject: "comprobante",
    ptoVta: 1,
    cbteTipo: 11,
    cbteFch: "20260722",
    impTotal: 1000,
    getLastNumber: async (): Promise<LastVoucherResult> =>
      parseLastVoucher(ultimoAutorizado),
    emit: async (): Promise<FacturaCEmissionResult> =>
      parseCreateVoucherResult(facturaCAprobada),
    persist: async (
      authorized,
      request: ArcaEmissionRequest,
    ): Promise<PersistedVoucher> => ({
      ...authorized,
      requestedCbteFch: request.cbteFch,
    }),
    ...overrides,
  };
}

function connectionLost(): Promise<never> {
  return Promise.reject(new Error("socket hang up"));
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("emitWithContingency", () => {
  test("autorizado por ARCA: persiste el CAE y no lo marca como recuperado", async () => {
    const outcome = await emitWithContingency(choreography());

    expect(outcome).toEqual({
      ok: true,
      recovered: false,
      voucher: {
        cae: "41124578989845",
        caeVto: "20260801",
        cbteNro: 43,
        cbteFch: "20260722",
        requestedCbteFch: "20260722",
      },
    });
  });

  test("el correlativo a emitir sale de la consulta del último autorizado", async () => {
    const emit = vi.fn(
      async (): Promise<FacturaCEmissionResult> =>
        parseCreateVoucherResult(facturaCAprobada),
    );

    await emitWithContingency(choreography({ emit }));

    expect(emit).toHaveBeenCalledWith({ cbteNro: 43, cbteFch: "20260722" });
  });

  test("cortada la consulta del correlativo, no se emitió nada y no se autoriza", async () => {
    const emit = vi.fn(
      async (): Promise<FacturaCEmissionResult> =>
        parseCreateVoucherResult(facturaCAprobada),
    );

    const outcome = await emitWithContingency(
      choreography({ getLastNumber: connectionLost, emit }),
    );

    expect(outcome).toEqual({
      ok: false,
      reason: "not-emitted",
      message:
        "No pudimos comunicarnos con ARCA: no se emitió el comprobante. " +
        "Reintentá en unos minutos.",
    });
    expect(emit).not.toHaveBeenCalled();
  });

  test("ARCA rechaza: no persiste nada y devuelve el detalle del rechazo", async () => {
    const persist = vi.fn();

    const outcome = await emitWithContingency(
      choreography({
        emit: async () => parseCreateVoucherResult(facturaCRechazada),
        persist,
      }),
    );

    expect(outcome).toMatchObject({
      ok: false,
      reason: "rejected",
      arca: { resultado: "R" },
    });
    expect(persist).not.toHaveBeenCalled();
  });

  // Cortada la autorización en el transporte, la consulta posterior es
  // definitiva: si ARCA no lo tiene, no se emitió nada (ADR-0012 decisión 5).
  test("cortada la autorización y ARCA no lo tiene: no se emitió nada", async () => {
    const persist = vi.fn();

    const outcome = await emitWithContingency(
      choreography({ emit: connectionLost, persist }),
    );

    expect(outcome).toMatchObject({ ok: false, reason: "not-emitted" });
    expect(persist).not.toHaveBeenCalled();
  });

  test("cortada la autorización y ARCA sí lo tiene: persiste el CAE recuperado", async () => {
    const billing = fakeBilling({
      getVoucherInfo: vi.fn(async () => facturaCConsultada),
    });

    const outcome = await emitWithContingency(
      choreography({ emit: connectionLost }, billing),
    );

    expect(outcome).toEqual({
      ok: true,
      recovered: true,
      voucher: {
        cae: "41124578989845",
        caeVto: "20260801",
        cbteNro: 43,
        cbteFch: "20260722",
        requestedCbteFch: "20260722",
      },
    });
  });

  test("cortada la autorización y la consulta tampoco resuelve: queda sin verificar", async () => {
    const persist = vi.fn();
    const billing = fakeBilling({ getVoucherInfo: connectionLost });

    const outcome = await emitWithContingency(
      choreography({ emit: connectionLost, persist }, billing),
    );

    expect(outcome).toMatchObject({
      ok: false,
      reason: "unverified",
      attempt: { ptoVta: 1, cbteTipo: 11, cbteNro: 43 },
    });
    expect(persist).not.toHaveBeenCalled();
  });

  // El sujeto sólo elige cómo se nombra el documento en el mensaje al operador.
  test("el sujeto nombra el documento en el mensaje de contingencia", async () => {
    const outcome = await emitWithContingency(
      choreography({
        subject: "nota de crédito",
        getLastNumber: connectionLost,
      }),
    );

    expect(outcome).toMatchObject({
      ok: false,
      message:
        "No pudimos comunicarnos con ARCA: no se emitió la nota de crédito. " +
        "Reintentá en unos minutos.",
    });
  });
});

describe("formatArcaMessage", () => {
  test("agrega el código de ARCA cuando lo hay", () => {
    expect(formatArcaMessage({ code: 10049, msg: "Faltan fechas" })).toBe(
      "Faltan fechas (código 10049)",
    );
  });

  test("sin código deja el mensaje solo", () => {
    expect(formatArcaMessage({ code: 0, msg: "Faltan fechas" })).toBe(
      "Faltan fechas",
    );
  });
});
