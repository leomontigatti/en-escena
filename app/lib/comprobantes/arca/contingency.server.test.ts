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

// El comprobante que se intentó autorizar, con el importe y la fecha que se le
// mandaron a ARCA: es contra eso que se valida lo consultado.
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

// La autorización falló en el transporte: la petición terminó, así que lo que
// ARCA diga al consultar es definitivo.
const transportFailure: ArcaCallFailure = {
  phase: "authorization",
  timedOut: false,
  detail: "socket hang up",
};

// La autorización se cortó por NUESTRO timeout: sigue en vuelo y ARCA todavía
// puede otorgar el CAE después de que dejamos de esperar.
const timeoutFailure: ArcaCallFailure = {
  phase: "authorization",
  timedOut: true,
  detail: "ARCA no respondió FECAESolicitar en 30000ms.",
};

// La falla se loguea (es lo único que sobrevive del detalle), así que se silencia
// para no ensuciar la salida de los tests que la ejercitan.
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("attemptArca", () => {
  test("una llamada que responde vuelve como éxito con su valor", async () => {
    await expect(attemptArca("lookup", async () => 42)).resolves.toEqual({
      ok: true,
      value: 42,
    });
  });

  test("una falla de comunicación se clasifica con la fase y no escapa", async () => {
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

  test("un throw que no es Error igual se clasifica, sin romper", async () => {
    const attempt = await attemptArca("lookup", () =>
      Promise.reject("ECONNRESET"),
    );

    expect(attempt).toMatchObject({
      ok: false,
      failure: { phase: "lookup", timedOut: false, detail: "ECONNRESET" },
    });
  });

  // Nuestro timeout se distingue del transporte porque deja la petición en vuelo:
  // es lo que decide si un "ARCA no lo tiene" puede leerse como definitivo.
  test("el timeout propio se marca aparte de una falla de transporte", async () => {
    const attempt = await attemptArca("authorization", () =>
      Promise.reject(new ArcaTimeoutError("FECAESolicitar", 30_000)),
    );

    expect(attempt).toMatchObject({
      ok: false,
      failure: { phase: "authorization", timedOut: true },
    });
  });

  test("el detalle queda en el log del servidor: es lo único que lo conserva", async () => {
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
  test("consulta el punto de venta, tipo y correlativo exactos que se intentaron", async () => {
    const getVoucherInfo = vi.fn(async () => null);

    await recoverAuthorization(
      clientConsulting(getVoucherInfo),
      submitted,
      transportFailure,
    );

    expect(getVoucherInfo).toHaveBeenCalledWith(43, 1, 11);
  });

  test("el comprobante consultado coincide con lo enviado: se recupera su CAE", async () => {
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

  // Un timeout tampoco impide recuperar: si ARCA ya lo tiene y coincide, la
  // pregunta quedó respondida y la petición en vuelo es irrelevante.
  test("se recupera igual si la autorización se cortó por timeout", async () => {
    const recovery = await recoverAuthorization(
      clientConsulting(vi.fn(async () => facturaCConsultada)),
      submitted,
      timeoutFailure,
    );

    expect(recovery).toMatchObject({ status: "recovered" });
  });

  test("la autorización falló en el transporte y ARCA no lo tiene: no se emitió nada", async () => {
    const recovery = await recoverAuthorization(
      clientConsulting(vi.fn(async () => null)),
      submitted,
      transportFailure,
    );

    expect(recovery).toEqual({ status: "not-emitted" });
  });

  // El caso que la doble emisión necesita: la autorización se cortó por timeout,
  // sigue en vuelo, y la consulta —emitida a los milisegundos— mira un CAE que
  // ARCA puede estar por otorgar. Leer ese `null` como "no se emitió" invitaría a
  // reintentar y a emitir un segundo comprobante por el mismo monto.
  test("la autorización venció por timeout y ARCA no lo tiene: sigue sin verificarse", async () => {
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

  test("la consulta también falla: no se puede afirmar nada", async () => {
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

  // Los correlativos no se reservan: el número que intentamos puede ser de otro
  // comprobante (ADR-0012 decisión 4).
  test("otro importe con el mismo número no es nuestro comprobante", async () => {
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

  test("otra fecha con el mismo número tampoco lo es", async () => {
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

  // Un comprobante sin CAE no es una autorización: persistirlo dejaría una fila
  // fiscal con el campo que la respalda vacío.
  test("un comprobante que coincide pero vuelve sin CAE no se recupera", async () => {
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

  test("un comprobante que coincide pero vuelve sin vencimiento tampoco", async () => {
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
  test("no emitido: dice que no se emitió y que reintentar es seguro", () => {
    expect(buildNotEmittedMessage("comprobante")).toBe(
      "No pudimos comunicarnos con ARCA: no se emitió el comprobante. " +
        "Reintentá en unos minutos.",
    );
    expect(buildNotEmittedMessage("nota de crédito")).toContain(
      "no se emitió la nota de crédito",
    );
  });

  test("no verificado: lleva el comprobante que no se pudo resolver", () => {
    const message = buildUnverifiedMessage(
      "comprobante",
      { ptoVta: 1, cbteTipo: 11, cbteNro: 43 },
      "consult-inconclusive",
    );

    expect(message).toContain("punto de venta 1, tipo 11, número 43");
    expect(message).toContain("antes de reintentar");
  });

  test("no verificado concuerda en género con la nota de crédito", () => {
    const message = buildUnverifiedMessage(
      "nota de crédito",
      { ptoVta: 1, cbteTipo: 13, cbteNro: 8 },
      "consult-inconclusive",
    );

    expect(message).toContain("se autorizaba la nota de crédito");
    // Nada de "consultarlo"/"emitido" en masculino sobre un sujeto femenino.
    expect(message).not.toMatch(/consultarlo|autorizado\b/);
  });

  // Decir "la consulta no resolvió" acá sería falso: la consulta respondió, y
  // respondió que no lo tiene. Lo que no está resuelto es si va a tenerlo.
  test("autorización en vuelo: dice que ARCA todavía no lo tiene, no que falló la consulta", () => {
    const message = buildUnverifiedMessage(
      "comprobante",
      { ptoVta: 1, cbteTipo: 11, cbteNro: 43 },
      "authorization-in-flight",
    );

    expect(message).toContain("todavía no lo tiene registrado");
    expect(message).toContain("puede seguir en curso");
    expect(message).toContain("punto de venta 1, tipo 11, número 43");
    expect(message).toContain("antes de reintentar");
    expect(message).not.toContain("Se cortó la comunicación");
  });
});
