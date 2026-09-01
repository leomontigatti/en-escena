import type {
  CreateVoucherResultDto,
  LastVoucherResultDto,
  VoucherInfoResultDto,
} from "@arcasdk/core";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  ArcaClient,
  ArcaTimeoutError,
  type ArcaBillingPort,
} from "./client.server";
import {
  attemptArca,
  buildNotEmittedMessage,
  buildUnverifiedMessage,
  recoverAuthorization,
  type ArcaCallFailure,
} from "./contingency.server";
import type { ArcaVoucher } from "./factura-c";
import {
  facturaCAprobada,
  facturaCConsultada,
  ultimoAutorizado,
} from "./fixtures";

// The comprobante that was attempted, with the amount and date that were sent to
// ARCA: that is what the queried one is validated against.
const submitted = {
  ptoVta: 1,
  cbteTipo: 11,
  cbteNro: 43,
  impTotal: 1000,
  cbteFch: "20260722",
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

function clientConsulting(
  getVoucherInfo: ArcaBillingPort["getVoucherInfo"],
): ArcaClient {
  return new ArcaClient(fakeBilling({ getVoucherInfo }));
}

// The authorization failed at the transport level: the request finished, so
// whatever ARCA says on the lookup is final.
const transportFailure: ArcaCallFailure = {
  phase: "authorization",
  timedOut: false,
  detail: "socket hang up",
};

// The authorization was cut off by OUR timeout: it is still in flight and ARCA
// may still grant the CAE after we stop waiting.
const timeoutFailure: ArcaCallFailure = {
  phase: "authorization",
  timedOut: true,
  detail: "ARCA no respondió FECAESolicitar en 30000ms.",
};

// The failure is logged (it is the only part of the detail that survives), so it
// is silenced to keep the output of the tests exercising it clean.
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("attemptArca", () => {
  test("a call that responds comes back as a success with its value", async () => {
    await expect(attemptArca("lookup", async () => 42)).resolves.toEqual({
      ok: true,
      value: 42,
    });
  });

  test("a communication failure is classified with its phase and does not escape", async () => {
    const attempt = await attemptArca("authorization", () =>
      Promise.reject(new Error("socket hang up")),
    );

    expect(attempt).toEqual({
      ok: false,
      failure: {
        phase: "authorization",
        timedOut: false,
        detail: "socket hang up",
      },
    });
  });

  test("a throw that is not an Error is still classified, without breaking", async () => {
    const attempt = await attemptArca("lookup", () =>
      Promise.reject("ECONNRESET"),
    );

    expect(attempt).toMatchObject({
      ok: false,
      failure: { phase: "lookup", timedOut: false, detail: "ECONNRESET" },
    });
  });

  // Our own timeout is distinguished from the transport's because it leaves the
  // request in flight: that is what decides whether an "ARCA does not have it"
  // can be read as final.
  test("our own timeout is marked apart from a transport failure", async () => {
    const attempt = await attemptArca("authorization", () =>
      Promise.reject(new ArcaTimeoutError("FECAESolicitar", 30_000)),
    );

    expect(attempt).toMatchObject({
      ok: false,
      failure: { phase: "authorization", timedOut: true },
    });
  });

  test("the detail stays in the server log: that is the only thing that keeps it", async () => {
    await attemptArca("authorization", () =>
      Promise.reject(new Error("socket hang up")),
    );

    expect(console.error).toHaveBeenCalledWith("[arca:unreachable]", {
      phase: "authorization",
      timedOut: false,
      detail: "socket hang up",
    });
  });
});

describe("recoverAuthorization", () => {
  test("queries the exact point of sale, type and sequence number that were attempted", async () => {
    const getVoucherInfo = vi.fn(async () => null);

    await recoverAuthorization(
      clientConsulting(getVoucherInfo),
      submitted,
      transportFailure,
    );

    expect(getVoucherInfo).toHaveBeenCalledWith(43, 1, 11);
  });

  test("the queried comprobante matches what was sent: its CAE is recovered", async () => {
    const recovery = await recoverAuthorization(
      clientConsulting(vi.fn(async () => facturaCConsultada)),
      submitted,
      transportFailure,
    );

    expect(recovery).toEqual({
      status: "recovered",
      cae: "41124578989845",
      caeVto: "20260801",
      cbteFch: "20260722",
    });
  });

  // A timeout does not prevent recovery either: if ARCA already has it and it
  // matches, the question is answered and the in-flight request is irrelevant.
  test("it is recovered all the same if authorization was cut off by a timeout", async () => {
    const recovery = await recoverAuthorization(
      clientConsulting(vi.fn(async () => facturaCConsultada)),
      submitted,
      timeoutFailure,
    );

    expect(recovery).toMatchObject({ status: "recovered" });
  });

  test("authorization failed in transport and ARCA does not have it: nothing was emitted", async () => {
    const recovery = await recoverAuthorization(
      clientConsulting(vi.fn(async () => null)),
      submitted,
      transportFailure,
    );

    expect(recovery).toEqual({ status: "not-emitted" });
  });

  // The case double emission needs: the authorization was cut off by a timeout,
  // is still in flight, and the lookup — issued milliseconds later — is looking
  // at a CAE ARCA may be about to grant. Reading that `null` as "nothing was
  // emitted" would invite a retry and a second comprobante for the same amount.
  test("authorization timed out and ARCA does not have it: it stays unverified", async () => {
    const recovery = await recoverAuthorization(
      clientConsulting(vi.fn(async () => null)),
      submitted,
      timeoutFailure,
    );

    expect(recovery).toEqual({
      status: "unverified",
      reason: "authorization-in-flight",
    });
  });

  test("the lookup fails too: nothing can be asserted", async () => {
    const recovery = await recoverAuthorization(
      clientConsulting(
        vi.fn(() => Promise.reject(new Error("socket hang up"))),
      ),
      submitted,
      transportFailure,
    );

    expect(recovery).toEqual({
      status: "unverified",
      reason: "consult-inconclusive",
    });
  });

  // Sequence numbers are not reserved: the number we attempted may belong to a
  // different comprobante (ADR-0012 decision 4).
  test("a different amount under the same number is not our comprobante", async () => {
    const recovery = await recoverAuthorization(
      clientConsulting(
        vi.fn(async () => ({ ...facturaCConsultada, impTotal: 9999 })),
      ),
      submitted,
      transportFailure,
    );

    expect(recovery).toEqual({
      status: "unverified",
      reason: "consult-inconclusive",
    });
  });

  test("a different date under the same number is not either", async () => {
    const recovery = await recoverAuthorization(
      clientConsulting(
        vi.fn(async () => ({ ...facturaCConsultada, cbteFch: "20260101" })),
      ),
      submitted,
      transportFailure,
    );

    expect(recovery).toEqual({
      status: "unverified",
      reason: "consult-inconclusive",
    });
  });

  // A comprobante without a CAE is not an authorization: persisting it would
  // leave a fiscal row with the field that backs it empty.
  test("a matching comprobante that comes back with no CAE is not recovered", async () => {
    const recovery = await recoverAuthorization(
      clientConsulting(
        vi.fn(async () => ({ ...facturaCConsultada, codAutorizacion: "" })),
      ),
      submitted,
      transportFailure,
    );

    expect(recovery).toEqual({
      status: "unverified",
      reason: "consult-inconclusive",
    });
  });

  test("a matching comprobante that comes back with no expiry is not either", async () => {
    const recovery = await recoverAuthorization(
      clientConsulting(
        vi.fn(async () => ({ ...facturaCConsultada, fchVto: "" })),
      ),
      submitted,
      transportFailure,
    );

    expect(recovery).toEqual({
      status: "unverified",
      reason: "consult-inconclusive",
    });
  });
});

describe("mensajes de contingencia", () => {
  test("not emitted: it says nothing was emitted and that retrying is safe", () => {
    expect(buildNotEmittedMessage("comprobante")).toBe(
      "No pudimos comunicarnos con ARCA: no se emitió el comprobante. " +
        "Reintentá en unos minutos.",
    );
    expect(buildNotEmittedMessage("nota de crédito")).toContain(
      "no se emitió la nota de crédito",
    );
  });

  test("unverified: it carries the comprobante that could not be resolved", () => {
    const message = buildUnverifiedMessage(
      "comprobante",
      { ptoVta: 1, cbteTipo: 11, cbteNro: 43 },
      "consult-inconclusive",
    );

    // Identified as in the rest of the app and in ARCA's portal: it is the exact
    // string the operator has to go and look for (#577).
    expect(message).toContain("Factura C 0001-00000043");
    expect(message).not.toContain("tipo 11");
    expect(message).not.toContain("número 43");
    expect(message).toContain("antes de reintentar");
  });

  test("unverified names the nota de crédito by its type, not by its code", () => {
    const message = buildUnverifiedMessage(
      "nota de crédito",
      { ptoVta: 1, cbteTipo: 13, cbteNro: 8 },
      "consult-inconclusive",
    );

    expect(message).toContain("Nota de crédito C 0001-00000008");
  });

  test("unverified agrees in gender with nota de crédito", () => {
    const message = buildUnverifiedMessage(
      "nota de crédito",
      { ptoVta: 1, cbteTipo: 13, cbteNro: 8 },
      "consult-inconclusive",
    );

    expect(message).toContain("se autorizaba la nota de crédito");
    // No masculine "consultarlo"/"emitido" over a feminine subject.
    expect(message).not.toMatch(/consultarlo|autorizado\b/);
  });

  // Saying "the lookup did not resolve" here would be false: the lookup answered,
  // and it answered that ARCA does not have it. What is unresolved is whether it
  // will.
  test("authorization in flight: it says ARCA does not have it yet, not that the lookup failed", () => {
    const message = buildUnverifiedMessage(
      "comprobante",
      { ptoVta: 1, cbteTipo: 11, cbteNro: 43 },
      "authorization-in-flight",
    );

    expect(message).toContain("todavía no lo tiene registrado");
    expect(message).toContain("puede seguir en curso");
    expect(message).toContain("Factura C 0001-00000043");
    expect(message).toContain("antes de reintentar");
    expect(message).not.toContain("Se cortó la comunicación");
  });
});
