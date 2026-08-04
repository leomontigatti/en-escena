import { getBusinessDateOnly } from "@/lib/shared/business-time-zone";

import type { ArcaClient } from "./client.server";
import {
  attemptArca,
  buildNotEmittedMessage,
  buildUnverifiedMessage,
  recoverAuthorization,
  type ArcaAttemptedVoucher,
  type ArcaContingencySubject,
} from "./contingency.server";
import type {
  ArcaMessage,
  FacturaCEmissionResult,
  LastVoucherResult,
} from "./responses";

// El comprobante tal como se le pidió a ARCA: correlativo derivado del último
// autorizado y fecha resuelta. Lo reciben tanto la emisión como la persistencia,
// porque hay datos congelados (las fechas de servicio) que dependen de él.
export type ArcaEmissionRequest = {
  cbteNro: number;
  cbteFch: string;
};

// El comprobante ya autorizado. El camino feliz y la recuperación por consulta
// llegan acá con la misma forma: lo único que cambia es de dónde salen el CAE, el
// correlativo y la fecha.
export type ArcaAuthorizedVoucher = {
  cae: string;
  caeVto: string;
  cbteNro: number;
  cbteFch: string;
};

/**
 * Las partes que cambian entre un tipo de comprobante y otro: qué serie de
 * correlativos se consulta, qué se autoriza, cómo se nombra el documento en los
 * mensajes al operador, y cómo se persiste lo autorizado. Todo lo demás —el
 * orden de las llamadas y la clasificación de las fallas— lo decide
 * `emitWithContingency`.
 */
export type ArcaEmissionChoreography<TVoucher> = {
  client: ArcaClient;
  subject: ArcaContingencySubject;
  ptoVta: number;
  cbteTipo: number;
  // Fecha del comprobante en formato ARCA. Por defecto, la fecha de negocio.
  cbteFch?: string;
  // Importe enviado a ARCA: es contra este que se valida un comprobante
  // recuperado por consulta (ADR-0012 decisión 4).
  impTotal: number;
  getLastNumber: () => Promise<LastVoucherResult>;
  emit: (request: ArcaEmissionRequest) => Promise<FacturaCEmissionResult>;
  persist: (
    authorized: ArcaAuthorizedVoucher,
    request: ArcaEmissionRequest,
  ) => Promise<TVoucher>;
};

export type ArcaEmissionFailureReason =
  // ARCA respondió y no autorizó.
  | "rejected"
  // ARCA no respondió y quedó establecido que no se emitió nada: reintentar es
  // seguro (ADR-0012 decisión 6).
  | "not-emitted"
  // ARCA no respondió y la consulta posterior tampoco resolvió qué pasó.
  | "unverified";

export type ArcaEmissionFailure = {
  ok: false;
  reason: ArcaEmissionFailureReason;
  message: string;
  // Presente sólo en un rechazo de ARCA.
  arca?: {
    resultado: string | null;
    errors: ArcaMessage[];
    observaciones: ArcaMessage[];
  };
  // Presente sólo en `unverified`: el comprobante que no se pudo resolver.
  attempt?: ArcaAttemptedVoucher;
};

export type ArcaEmissionOutcome<TVoucher> =
  | {
      ok: true;
      voucher: TVoucher;
      // El CAE salió de la consulta posterior a una autorización sin respuesta,
      // no de `FECAESolicitar`. La emisión es igual de válida, pero el operador
      // pidió algo que no sabemos si llegó a ARCA y conviene decírselo (#577).
      recovered: boolean;
    }
  | ArcaEmissionFailure;

/**
 * Corre la coreografía de emisión contra WSFEv1: consulta el correlativo,
 * autoriza, y persiste sólo si ARCA otorgó un CAE.
 *
 * El `CbteNro` se deriva de `FECompUltimoAutorizado + 1`. Un rechazo de ARCA no
 * persiste nada.
 *
 * Si ARCA no responde, la falla se clasifica por fase (ADR-0012). Cortada la
 * consulta del correlativo no se autorizó nada. Cortada la autorización se
 * consulta a ARCA por el comprobante exacto que se intentó: si aparece y coincide
 * con lo enviado, SÍ se había autorizado y se persiste con ese CAE —la única
 * excepción a la invariante de que una contingencia no persiste nada, y existe
 * porque la fila corresponde a un documento fiscal que demostrablemente está en
 * ARCA—; si no aparece y la autorización había fallado en el transporte, no se
 * emitió nada. Si la consulta falla, devuelve otro comprobante, o no lo encuentra
 * pero la autorización venció por timeout —y entonces sigue en vuelo, pudiendo
 * autorizarse después—, el resultado es `unverified` y no se persiste nada.
 */
export async function emitWithContingency<TVoucher>(
  choreography: ArcaEmissionChoreography<TVoucher>,
): Promise<ArcaEmissionOutcome<TVoucher>> {
  const lookup = await attemptArca("lookup", () =>
    choreography.getLastNumber(),
  );

  if (!lookup.ok) {
    return {
      ok: false,
      reason: "not-emitted",
      message: buildNotEmittedMessage(choreography.subject),
    };
  }

  const request: ArcaEmissionRequest = {
    cbteNro: lookup.value.nextCbteNro,
    cbteFch: choreography.cbteFch ?? toArcaDate(getBusinessDateOnly()),
  };

  const authorization = await attemptArca("authorization", () =>
    choreography.emit(request),
  );

  if (!authorization.ok) {
    const attempt: ArcaAttemptedVoucher = {
      ptoVta: choreography.ptoVta,
      cbteTipo: choreography.cbteTipo,
      cbteNro: request.cbteNro,
    };
    const recovery = await recoverAuthorization(
      choreography.client,
      { ...attempt, impTotal: choreography.impTotal, cbteFch: request.cbteFch },
      authorization.failure,
    );

    if (recovery.status === "not-emitted") {
      return {
        ok: false,
        reason: "not-emitted",
        message: buildNotEmittedMessage(choreography.subject),
      };
    }

    if (recovery.status === "unverified") {
      return {
        ok: false,
        reason: "unverified",
        message: buildUnverifiedMessage(
          choreography.subject,
          attempt,
          recovery.reason,
        ),
        attempt,
      };
    }

    const voucher = await choreography.persist(
      {
        cae: recovery.cae,
        caeVto: recovery.caeVto,
        cbteNro: attempt.cbteNro,
        cbteFch: recovery.cbteFch,
      },
      request,
    );

    return { ok: true, voucher, recovered: true };
  }

  const emission = authorization.value;

  if (!emission.approved || !emission.cae || !emission.caeVto) {
    return {
      ok: false,
      reason: "rejected",
      message: buildRejectionMessage(emission),
      arca: {
        resultado: emission.resultado,
        errors: emission.errors,
        observaciones: emission.observaciones,
      },
    };
  }

  const voucher = await choreography.persist(
    {
      cae: emission.cae,
      caeVto: emission.caeVto,
      cbteNro: emission.cbteNro ?? request.cbteNro,
      cbteFch: emission.cbteFch ?? request.cbteFch,
    },
    request,
  );

  return { ok: true, voucher, recovered: false };
}

// El motivo del rechazo, en el orden en que ARCA lo explica: primero el error que
// lo impidió, después la observación, y como último recurso el `Resultado` crudo.
function buildRejectionMessage(emission: FacturaCEmissionResult): string {
  const detail =
    emission.errors[0]?.msg ??
    emission.observaciones[0]?.msg ??
    emission.resultado ??
    "sin detalle";

  return `ARCA no autorizó el comprobante (${detail}).`;
}

// Fecha de negocio `AAAA-MM-DD` → formato ARCA `AAAAMMDD`.
export function toArcaDate(dateOnly: string): string {
  return dateOnly.replace(/-/g, "");
}
