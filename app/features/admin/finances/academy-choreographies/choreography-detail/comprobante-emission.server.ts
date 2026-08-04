import { redirect } from "react-router";

import { toContingencyActionData } from "@/lib/comprobantes/contingency-view";
import {
  emitChoreographyFacturaC,
  recheckChoreographyFacturaC,
  type FacturaCEmissionDeps,
} from "@/lib/comprobantes/emit-factura-c.server";
import { redirectWithFlashNotification } from "@/lib/shared/flash-notification.server";
import type { NotificationKey } from "@/lib/shared/notification-toasts";

import {
  choreographyDetailUrl,
  emitComprobanteConfirmValue,
  type ChoreographyFinanceActionData,
} from "./shared";

/*
 * Eje de emisión del detalle financiero: emitir la Factura C y re-verificar una
 * emisión que quedó sin resolver (ADR-0011, ADR-0012). Vive aparte del server del
 * detalle porque es la única parte que habla con ARCA y la única que decide entre
 * redirigir y quedarse en el diálogo.
 */

/**
 * Dispara la emisión de la Factura C tras la confirmación irreversible. Un CAE
 * aprobado recarga el detalle (badge Vigente); un rechazo o contingencia de ARCA
 * vuelve como `emission-error` con el estado crudo, sin persistir nada ni dejar
 * la UI inconsistente (la recarga sólo ocurre en el camino feliz).
 */
export async function handleEmitComprobante(input: {
  academyId: string;
  choreographyId: string;
  confirm: string;
  eventId: string;
  resolveEmissionDeps: () => FacturaCEmissionDeps;
}): Promise<ChoreographyFinanceActionData | never> {
  if (input.confirm !== emitComprobanteConfirmValue) {
    return {
      status: "error",
      message: "Confirmá la emisión irreversible para continuar.",
    };
  }

  const outcome = await emitChoreographyFacturaC(
    { choreographyId: input.choreographyId, eventId: input.eventId },
    input.resolveEmissionDeps(),
  );

  if (outcome.ok) {
    // Una emisión recuperada redirige igual que cualquier otra, así que el aviso
    // viaja por flash session (docs/agents/form-feedback.md). Es deliberado que
    // no se parezca al `recovered` del diálogo: así el operador puede distinguir
    // "se recuperó solo" de "lo recuperé yo".
    throw await redirectToDetail(
      input.academyId,
      input.choreographyId,
      input.eventId,
      outcome.recovered ? "comprobante-recuperado" : undefined,
    );
  }

  return toContingencyActionData(outcome);
}

/**
 * Re-consulta a ARCA por la emisión que quedó sin resolver, sin salir del
 * diálogo (#577). Del form sólo se lee el correlativo: el importe y la fecha con
 * los que se valida el comprobante consultado los recalcula
 * `recheckChoreographyFacturaC` desde la coreografía (ADR-0012 decisión 4).
 */
export async function handleRecheckComprobante(input: {
  academyId: string;
  cbteNro: string;
  choreographyId: string;
  eventId: string;
  resolveEmissionDeps: () => FacturaCEmissionDeps;
}): Promise<ChoreographyFinanceActionData> {
  const cbteNro = Number(input.cbteNro);

  if (!Number.isInteger(cbteNro) || cbteNro <= 0) {
    return {
      status: "error",
      message: "No pudimos identificar el comprobante a verificar.",
    };
  }

  const outcome = await recheckChoreographyFacturaC(
    { choreographyId: input.choreographyId, eventId: input.eventId, cbteNro },
    input.resolveEmissionDeps(),
  );

  // La recuperación por re-verificación se queda en el diálogo: no cruza un
  // redirect, así que llega como estado del alert y no como toast.
  if (outcome.ok) {
    return { status: "contingency", contingency: { status: "recovered" } };
  }

  return toContingencyActionData(outcome);
}

function redirectToDetail(
  academyId: string,
  choreographyId: string,
  eventId: string,
  notification?: NotificationKey,
) {
  const url = choreographyDetailUrl(academyId, choreographyId, eventId);

  return notification
    ? redirectWithFlashNotification(url, notification)
    : redirect(url);
}
