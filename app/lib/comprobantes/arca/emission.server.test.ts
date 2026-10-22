import type {
  CreateVoucherResultDto,
  LastVoucherResultDto,
  VoucherInfoResultDto,
} from "@arcasdk/core";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { ArcaClient, type ArcaBillingPort } from "./client.server";
import {
  abandonReservedAttempt,
  emitWithContingency,
  recheckReservedAttempt,
  toArcaDate,
  type ArcaEmissionChoreography,
  type ArcaEmissionFailure,
  type ArcaEmissionRequest,
  type ArcaReservedAttempt,
} from "./emission.server";
import type { ArcaVoucher } from "./factura-c";
import {
  facturaCAprobada,
  facturaCConsultada,
  facturaCRechazada,
  notaRechazada10197,
  ultimoAutorizado,
} from "./wsfe-responses.test-support";
import {
  parseCreateVoucherResult,
  type FacturaCEmissionResult,
} from "./responses";

// The comprobante persisted in the test: the choreography does not know what it
// is, only that `persist` returns it.
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

// What happens to the reservation, observed: the emission decides which of the
// moves runs, and each test asserts the one it expects.
function reservationMoves() {
  return {
    persist: vi.fn(
      async (
        authorized: Omit<PersistedVoucher, "requestedCbteFch">,
        request: ArcaEmissionRequest,
      ): Promise<PersistedVoucher> => ({
        ...authorized,
        requestedCbteFch: request.cbteFch,
      }),
    ),
    release: vi.fn(async () => {}),
    markNumberTaken: vi.fn(async () => {}),
  };
}

// The default choreography: it reserves, emits approved and persists. Each test
// overrides the part it exercises.
function choreography(
  overrides: Partial<ArcaEmissionChoreography<PersistedVoucher>> = {},
  billing: ArcaBillingPort = fakeBilling(),
) {
  return {
    client: new ArcaClient(billing),
    subject: "comprobante" as const,
    ptoVta: 1,
    cbteTipo: 11,
    cbteFch: "20260722",
    impTotal: 1000,
    emit: vi.fn(async (): Promise<FacturaCEmissionResult> =>
      parseCreateVoucherResult(facturaCAprobada),
    ),
    reserve: vi.fn(async (): Promise<ArcaEmissionFailure | null> => null),
    ...reservationMoves(),
    ...overrides,
  };
}

// Reservation 43 of `Factura C`, left live with what was submitted at it.
function reserved(
  overrides: Partial<ArcaReservedAttempt<PersistedVoucher>> = {},
  billing: ArcaBillingPort = fakeBilling(),
) {
  return {
    client: new ArcaClient(billing),
    subject: "comprobante" as const,
    ptoVta: 1,
    cbteTipo: 11,
    cbteNro: 43,
    impTotal: 1000,
    cbteFch: "20260722",
    state: "unverified" as const,
    taken: null,
    ...reservationMoves(),
    ...overrides,
  };
}

function connectionLost(): Promise<never> {
  return Promise.reject(new Error("socket hang up"));
}

function rejection(
  emission: Partial<FacturaCEmissionResult>,
): () => Promise<FacturaCEmissionResult> {
  return async () => ({
    approved: false,
    cae: null,
    caeVto: null,
    cbteNro: null,
    cbteFch: null,
    resultado: "R",
    errors: [],
    observaciones: [],
    ...emission,
  });
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("emitWithContingency", () => {
  test("authorized by ARCA: persists the CAE, which retires the reservation, and is not marked recovered", async () => {
    const emission = choreography();

    const outcome = await emitWithContingency(emission);

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
    expect(emission.release).not.toHaveBeenCalled();
  });

  test("reserves the series' next number before asking ARCA to authorize it", async () => {
    const emission = choreography();

    await emitWithContingency(emission);

    const request = { cbteNro: 43, cbteFch: "20260722" };
    expect(emission.reserve).toHaveBeenCalledWith(request);
    expect(emission.emit).toHaveBeenCalledWith(request);
    expect(
      vi.mocked(emission.reserve).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(emission.emit).mock.invocationCallOrder[0]);
  });

  test("a series held by another reservation stops before ARCA authorizes anything", async () => {
    const held: ArcaEmissionFailure = {
      ok: false,
      reason: "unverified",
      message: "Hay otra emisión sin resolver.",
      attempt: { ptoVta: 1, cbteTipo: 11, cbteNro: 40 },
    };
    const emission = choreography({ reserve: vi.fn(async () => held) });

    await expect(emitWithContingency(emission)).resolves.toBe(held);
    expect(emission.emit).not.toHaveBeenCalled();
  });

  test("with the sequence lookup cut off, nothing is reserved and nothing is authorized", async () => {
    const emission = choreography(
      {},
      fakeBilling({ getLastVoucher: vi.fn(connectionLost) }),
    );

    const outcome = await emitWithContingency(emission);

    expect(outcome).toEqual({
      ok: false,
      reason: "not-emitted",
      message:
        "No pudimos comunicarnos con ARCA: no se emitió el comprobante. " +
        "Reintentá en unos minutos.",
    });
    expect(emission.reserve).not.toHaveBeenCalled();
    expect(emission.emit).not.toHaveBeenCalled();
  });

  // A rejected `FECAESolicitar` consumes no number (#686).
  test("ARCA rejects: it persists nothing, retires the reservation and returns the rejection detail", async () => {
    const emission = choreography({
      emit: vi.fn(async () => parseCreateVoucherResult(facturaCRechazada)),
    });

    const outcome = await emitWithContingency(emission);

    expect(outcome).toMatchObject({
      ok: false,
      reason: "rejected",
      arca: { resultado: "R" },
    });
    expect(emission.persist).not.toHaveBeenCalled();
    expect(emission.release).toHaveBeenCalledOnce();
  });

  // With the authorization cut off at the transport level, the follow-up lookup
  // is final: if ARCA does not have it, nothing was emitted.
  test("authorization cut off and ARCA does not have it: nothing was emitted and the number is released", async () => {
    const emission = choreography({ emit: vi.fn(connectionLost) });

    const outcome = await emitWithContingency(emission);

    expect(outcome).toMatchObject({ ok: false, reason: "not-emitted" });
    expect(emission.persist).not.toHaveBeenCalled();
    expect(emission.release).toHaveBeenCalledOnce();
  });

  test("authorization cut off and ARCA does have it: persists the recovered CAE", async () => {
    const emission = choreography(
      { emit: vi.fn(connectionLost) },
      fakeBilling({ getVoucherInfo: vi.fn(async () => facturaCConsultada) }),
    );

    const outcome = await emitWithContingency(emission);

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
    expect(emission.release).not.toHaveBeenCalled();
  });

  test("authorization cut off and ARCA holds another comprobante at the number: number-taken, and the reservation keeps the evidence", async () => {
    const emission = choreography(
      { emit: vi.fn(connectionLost) },
      fakeBilling({
        getVoucherInfo: vi.fn(async () => ({
          ...facturaCConsultada,
          impTotal: 99999,
          cbteFch: "20260720",
        })),
      }),
    );

    const outcome = await emitWithContingency(emission);

    expect(outcome).toEqual({
      ok: false,
      reason: "number-taken",
      message: expect.stringMatching(
        /Factura C 0001-00000043 existe en ARCA por \$\s?99\.999 con fecha 20\/07\/2026, y no coincide con lo que se envió \(\$\s?1\.000, 22\/07\/2026\)/,
      ),
      attempt: { ptoVta: 1, cbteTipo: 11, cbteNro: 43 },
    });
    expect(emission.markNumberTaken).toHaveBeenCalledWith({
      impTotal: 99999,
      cbteFch: "20260720",
    });
    expect(emission.persist).not.toHaveBeenCalled();
    expect(emission.release).not.toHaveBeenCalled();
  });

  test("authorization cut off and the lookup does not resolve either: it stays unverified and the reservation stays live", async () => {
    const emission = choreography(
      { emit: vi.fn(connectionLost) },
      fakeBilling({ getVoucherInfo: vi.fn(connectionLost) }),
    );

    const outcome = await emitWithContingency(emission);

    expect(outcome).toMatchObject({
      ok: false,
      reason: "unverified",
      attempt: { ptoVta: 1, cbteTipo: 11, cbteNro: 43 },
    });
    expect(emission.persist).not.toHaveBeenCalled();
    expect(emission.release).not.toHaveBeenCalled();
  });

  // The subject only picks how the document is named in the message to the
  // operator.
  test("the subject names the document in the contingency message", async () => {
    const outcome = await emitWithContingency(
      choreography(
        { subject: "nota de crédito" },
        fakeBilling({ getLastVoucher: vi.fn(connectionLost) }),
      ),
    );

    expect(outcome).toMatchObject({
      ok: false,
      message:
        "No pudimos comunicarnos con ARCA: no se emitió la nota de crédito. " +
        "Reintentá en unos minutos.",
    });
  });

  // The reason for the rejection is read from the first error, and failing that
  // it falls back to the observation and to the raw `Resultado`.
  test.each([
    {
      caso: "error",
      emission: {
        errors: [{ code: 10015, msg: "Documento inválido" }],
        observaciones: [{ code: 10049, msg: "Faltan fechas" }],
      },
      esperado: "ARCA no autorizó el comprobante (Documento inválido).",
    },
    {
      caso: "observación",
      emission: { observaciones: [{ code: 10049, msg: "Faltan fechas" }] },
      esperado: "ARCA no autorizó el comprobante (Faltan fechas).",
    },
    {
      caso: "resultado crudo",
      emission: {},
      esperado: "ARCA no autorizó el comprobante (R).",
    },
    {
      caso: "nada",
      emission: { resultado: null },
      esperado: "ARCA no autorizó el comprobante (sin detalle).",
    },
  ])(
    "a rejection with $caso explains the reason",
    async ({ emission, esperado }) => {
      const outcome = await emitWithContingency(
        choreography({ emit: vi.fn(rejection(emission)) }),
      );

      expect(outcome).toMatchObject({
        ok: false,
        reason: "rejected",
        message: esperado,
      });
    },
  );

  // 10016 holds two rules under one code (#612). If ARCA's last number is still
  // the one before ours, our number was right, so the date was not.
  test("a 10016 rejection whose number was still the next one says it is about the date, and of which series", async () => {
    const outcome = await emitWithContingency(
      choreography({
        cbteTipo: 13,
        subject: "nota de crédito",
        emit: vi.fn(async () => parseCreateVoucherResult(facturaCRechazada)),
      }),
    );

    expect(outcome).toMatchObject({
      ok: false,
      reason: "rejected",
      message:
        "ARCA no aceptó la fecha 22/07/2026 para la nota de crédito: en la serie " +
        "Nota de crédito C, punto de venta 0001 la fecha no puede ser anterior a " +
        "la del último comprobante autorizado ni de más de 10 días atrás " +
        "(código 10016). Elegí otra fecha y volvé a emitir.",
    });
  });

  test("a 10016 rejection after another comprobante took the number says it is about the number", async () => {
    const getLastVoucher = vi
      .fn(async (): Promise<LastVoucherResultDto> => ultimoAutorizado)
      .mockResolvedValueOnce(ultimoAutorizado)
      .mockResolvedValueOnce({ ...ultimoAutorizado, cbteNro: 43 });

    const outcome = await emitWithContingency(
      choreography(
        {
          emit: vi.fn(async () => parseCreateVoucherResult(facturaCRechazada)),
        },
        fakeBilling({ getLastVoucher }),
      ),
    );

    expect(outcome).toMatchObject({
      ok: false,
      reason: "rejected",
      message: expect.stringContaining(
        "ARCA no aceptó el número 43 para el comprobante: en la serie Factura C, punto de venta 0001 se autorizó otro comprobante",
      ),
    });
  });

  // #686: ARCA sends 10197 in `Observaciones` with no `Errors` node at all.
  test("a 10197 refusal with only Observaciones is a rejection that names the missing associated comprobante", async () => {
    const emission = choreography({
      subject: "nota de débito",
      cbteTipo: 12,
      emit: vi.fn(async () => parseCreateVoucherResult(notaRechazada10197)),
    });

    const outcome = await emitWithContingency(emission);

    expect(outcome).toMatchObject({
      ok: false,
      reason: "rejected",
      message: expect.stringContaining(
        "ARCA no autorizó la nota de débito: una nota tiene que indicar el comprobante que ajusta (código 10197",
      ),
      arca: { resultado: "R", errors: [], observaciones: [{ code: 10197 }] },
    });
    expect(emission.persist).not.toHaveBeenCalled();
  });

  // An "approved" without a CAE does not count as authorized (ADR-0012): nothing
  // is persisted.
  test("approved with no CAE: it persists nothing and counts as a rejection", async () => {
    const emission = choreography({
      emit: vi.fn(async (): Promise<FacturaCEmissionResult> => ({
        approved: true,
        cae: null,
        caeVto: null,
        cbteNro: 43,
        cbteFch: "20260722",
        resultado: "A",
        errors: [],
        observaciones: [],
      })),
    });

    const outcome = await emitWithContingency(emission);

    expect(outcome).toMatchObject({ ok: false, reason: "rejected" });
    expect(emission.persist).not.toHaveBeenCalled();
  });
});

describe("toArcaDate", () => {
  test("strips the dashes from the business date", () => {
    expect(toArcaDate("2026-07-22")).toBe("20260722");
  });
});

describe("recheckReservedAttempt", () => {
  test("the reserved number shows up matching what was submitted: it is persisted with the reservation's date, without authorizing again", async () => {
    const billing = fakeBilling({
      getVoucherInfo: vi.fn(async () => facturaCConsultada),
    });
    const attempt = reserved({}, billing);

    const outcome = await recheckReservedAttempt(attempt);

    expect(billing.getVoucherInfo).toHaveBeenCalledWith(43, 1, 11);
    expect(billing.createVoucher).not.toHaveBeenCalled();
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

  test("a different amount at the reserved number is number-taken, not unverified", async () => {
    const attempt = reserved(
      { impTotal: 9999 },
      fakeBilling({ getVoucherInfo: vi.fn(async () => facturaCConsultada) }),
    );

    const outcome = await recheckReservedAttempt(attempt);

    expect(outcome).toMatchObject({ ok: false, reason: "number-taken" });
    expect(attempt.markNumberTaken).toHaveBeenCalledWith({
      impTotal: 1000,
      cbteFch: "20260722",
    });
    expect(attempt.persist).not.toHaveBeenCalled();
  });

  /**
   * It can only prove the positive: nobody has measured how long a request can
   * live on ARCA's side, so a `null` never releases the number, no matter how
   * much time has passed since the attempt (ADR-0012 decision 2).
   */
  test("ARCA still does not have it: it stays unverified and the reservation stays live", async () => {
    const attempt = reserved();

    const outcome = await recheckReservedAttempt(attempt);

    expect(outcome).toMatchObject({ ok: false, reason: "unverified" });
    expect(attempt.release).not.toHaveBeenCalled();
  });

  test("the lookup fails: it stays unverified and does not persist", async () => {
    const attempt = reserved(
      {},
      fakeBilling({ getVoucherInfo: vi.fn(connectionLost) }),
    );

    const outcome = await recheckReservedAttempt(attempt);

    expect(attempt.persist).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({
      ok: false,
      reason: "unverified",
      attempt: { ptoVta: 1, cbteTipo: 11, cbteNro: 43 },
    });
  });
});

describe("abandonReservedAttempt", () => {
  test("a number-taken reservation is released without asking ARCA anything, logging ARCA's evidence beside what was sent", async () => {
    const billing = fakeBilling();
    const attempt = reserved(
      {
        state: "number-taken",
        taken: { impTotal: 99999, cbteFch: "20260720" },
      },
      billing,
    );

    await expect(abandonReservedAttempt(attempt)).resolves.toEqual({
      ok: true,
      released: true,
    });
    expect(attempt.release).toHaveBeenCalledOnce();
    expect(billing.getLastVoucher).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      "[arca:attempt-abandoned]",
      expect.objectContaining({
        submitted: { impTotal: 1000, cbteFch: "20260722" },
        taken: { impTotal: 99999, cbteFch: "20260720" },
      }),
    );
  });

  test("an unverified reservation ARCA has not reached yet is released, and the log keeps what was given up", async () => {
    const attempt = reserved();

    await expect(abandonReservedAttempt(attempt)).resolves.toEqual({
      ok: true,
      released: true,
    });
    expect(attempt.release).toHaveBeenCalledOnce();
    expect(console.warn).toHaveBeenCalledWith("[arca:attempt-abandoned]", {
      ptoVta: 1,
      cbteTipo: 11,
      cbteNro: 43,
      state: "unverified",
      submitted: { impTotal: 1000, cbteFch: "20260722" },
      taken: null,
    });
  });

  test("once ARCA has reached the number, it is resolved by what ARCA holds there, not released", async () => {
    const attempt = reserved(
      {},
      fakeBilling({
        getLastVoucher: vi.fn(async () => ({
          ...ultimoAutorizado,
          cbteNro: 43,
        })),
        getVoucherInfo: vi.fn(async () => facturaCConsultada),
      }),
    );

    await expect(abandonReservedAttempt(attempt)).resolves.toMatchObject({
      ok: true,
      recovered: true,
    });
    expect(attempt.release).not.toHaveBeenCalled();
  });

  test("with ARCA unreachable nothing is released", async () => {
    const attempt = reserved(
      {},
      fakeBilling({ getLastVoucher: vi.fn(connectionLost) }),
    );

    await expect(abandonReservedAttempt(attempt)).resolves.toMatchObject({
      ok: false,
      reason: "unverified",
    });
    expect(attempt.release).not.toHaveBeenCalled();
  });
});
