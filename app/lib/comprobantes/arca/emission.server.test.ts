import type {
  CreateVoucherResultDto,
  LastVoucherResultDto,
  VoucherInfoResultDto,
} from "@arcasdk/core";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { ArcaClient, type ArcaBillingPort } from "./client.server";
import {
  emitWithContingency,
  recheckWithContingency,
  toArcaDate,
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

  // Sin `cbteFch` explícito (producción: sólo los tests inyectan uno) la fecha
  // sale del huso horario de negocio, no del huso del servidor.
  test("sin fecha explícita, el comprobante sale con la fecha de negocio", async () => {
    vi.useFakeTimers();
    // 01:30 UTC del 23 → todavía 22 en Córdoba (UTC-3).
    vi.setSystemTime(new Date("2026-07-23T01:30:00Z"));

    const emit = vi.fn(
      async (): Promise<FacturaCEmissionResult> =>
        parseCreateVoucherResult(facturaCAprobada),
    );

    const outcome = await emitWithContingency(
      choreography({ cbteFch: undefined, emit }),
    );

    expect(emit).toHaveBeenCalledWith({ cbteNro: 43, cbteFch: "20260722" });
    expect(outcome).toMatchObject({
      ok: true,
      voucher: { requestedCbteFch: "20260722" },
    });

    vi.useRealTimers();
  });

  // El motivo del rechazo se lee del primer error, y si no lo hay se va cayendo
  // a la observación y al `Resultado` crudo.
  test.each([
    {
      caso: "error",
      emission: {
        errors: [{ code: 10016, msg: "Correlativo fuera de orden" }],
        observaciones: [{ code: 10049, msg: "Faltan fechas" }],
        resultado: "R",
      },
      esperado: "ARCA no autorizó el comprobante (Correlativo fuera de orden).",
    },
    {
      caso: "observación",
      emission: {
        errors: [],
        observaciones: [{ code: 10049, msg: "Faltan fechas" }],
        resultado: "R",
      },
      esperado: "ARCA no autorizó el comprobante (Faltan fechas).",
    },
    {
      caso: "resultado crudo",
      emission: { errors: [], observaciones: [], resultado: "R" },
      esperado: "ARCA no autorizó el comprobante (R).",
    },
    {
      caso: "nada",
      emission: { errors: [], observaciones: [], resultado: null },
      esperado: "ARCA no autorizó el comprobante (sin detalle).",
    },
  ])(
    "un rechazo con $caso explica el motivo",
    async ({ emission, esperado }) => {
      const outcome = await emitWithContingency(
        choreography({
          emit: async (): Promise<FacturaCEmissionResult> => ({
            approved: false,
            cae: null,
            caeVto: null,
            cbteNro: null,
            cbteFch: null,
            ...emission,
          }),
        }),
      );

      expect(outcome).toMatchObject({ ok: false, reason: "rejected" });
      expect(outcome).toMatchObject({ message: esperado });
    },
  );

  // Un "aprobado" sin CAE no cuenta como autorizado (ADR-0012): no se persiste.
  test("aprobado sin CAE: no persiste nada y cuenta como rechazo", async () => {
    const persist = vi.fn();

    const outcome = await emitWithContingency(
      choreography({
        emit: async (): Promise<FacturaCEmissionResult> => ({
          approved: true,
          cae: null,
          caeVto: null,
          cbteNro: 43,
          cbteFch: "20260722",
          resultado: "A",
          errors: [],
          observaciones: [],
        }),
        persist,
      }),
    );

    expect(outcome).toMatchObject({ ok: false, reason: "rejected" });
    expect(persist).not.toHaveBeenCalled();
  });
});

describe("toArcaDate", () => {
  test("saca los guiones de la fecha de negocio", () => {
    expect(toArcaDate("2026-07-22")).toBe("20260722");
  });
});

describe("recheckWithContingency", () => {
  test("consulta el correlativo pedido, con el importe y la fecha del server", async () => {
    const getVoucherInfo = vi.fn(
      async (): Promise<VoucherInfoResultDto | null> => facturaCConsultada,
    );

    await recheckWithContingency(
      choreography({}, fakeBilling({ getVoucherInfo })),
      43,
    );

    expect(getVoucherInfo).toHaveBeenCalledWith(43, 1, 11);
  });

  test("el comprobante aparece y coincide: se persiste y queda recuperado", async () => {
    const outcome = await recheckWithContingency(
      choreography(
        {},
        fakeBilling({
          getVoucherInfo: vi.fn(async () => facturaCConsultada),
        }),
      ),
      43,
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

  // No autoriza nada: la re-verificación es sólo `FECompConsultar`.
  test("no reintenta la autorización", async () => {
    const createVoucher = vi.fn(
      async (): Promise<CreateVoucherResultDto> => facturaCAprobada,
    );

    await recheckWithContingency(
      choreography(
        {},
        fakeBilling({
          createVoucher,
          getVoucherInfo: vi.fn(async () => facturaCConsultada),
        }),
      ),
      43,
    );

    expect(createVoucher).not.toHaveBeenCalled();
  });

  // Un `cbteNro` adulterado o viejo hace que el importe recalculado no coincida:
  // el resultado se queda en `unverified`, que es la dirección segura.
  test("importe que no coincide: no persiste y sigue sin verificar", async () => {
    const persist = vi.fn();
    const outcome = await recheckWithContingency(
      choreography(
        { impTotal: 9999, persist },
        fakeBilling({
          getVoucherInfo: vi.fn(async () => facturaCConsultada),
        }),
      ),
      43,
    );

    expect(persist).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: false, reason: "unverified" });
  });

  test("fecha que no coincide: no persiste y sigue sin verificar", async () => {
    const outcome = await recheckWithContingency(
      choreography(
        { cbteFch: "20260723" },
        fakeBilling({
          getVoucherInfo: vi.fn(async () => facturaCConsultada),
        }),
      ),
      43,
    );

    expect(outcome).toMatchObject({ ok: false, reason: "unverified" });
  });

  /**
   * Sólo puede probar el positivo: nadie midió cuánto puede vivir una petición
   * del lado de ARCA, así que un `null` nunca asciende a `not-emitted` por más
   * tiempo que haya pasado desde el intento (ADR-0012 decisión 2).
   */
  test("ARCA sigue sin tenerlo: se queda en no verificado, nunca en no emitido", async () => {
    const outcome = await recheckWithContingency(
      choreography(
        {},
        fakeBilling({ getVoucherInfo: vi.fn(async () => null) }),
      ),
      43,
    );

    expect(outcome).toMatchObject({ ok: false, reason: "unverified" });
    expect(outcome).not.toMatchObject({ reason: "not-emitted" });
  });

  test("la consulta falla: sigue sin verificar y no persiste", async () => {
    const persist = vi.fn();
    const outcome = await recheckWithContingency(
      choreography(
        { persist },
        fakeBilling({ getVoucherInfo: vi.fn(connectionLost) }),
      ),
      43,
    );

    expect(persist).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: false, reason: "unverified" });
    if (!outcome.ok) {
      expect(outcome.attempt).toEqual({ ptoVta: 1, cbteTipo: 11, cbteNro: 43 });
    }
  });
});
