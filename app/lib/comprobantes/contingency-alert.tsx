import { AlertTriangle, CircleCheck } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Lo que quedó resuelto de un intento contra ARCA, tal como se lo cuenta al
 * operador (ADR-0012 decisión 6). Keyea el **desenlace**, no la llamada SOAP que
 * se rompió: la fase es un insumo de la lógica de recuperación del server y no
 * llega hasta acá.
 *
 * Es un tipo compartido a propósito. Estaba duplicado —una copia en el diálogo de
 * emisión, otra inline en el detalle del comprobante— y una unión donde un estado
 * bloquea un submit destructivo no puede darse el lujo de divergir entre los dos
 * caminos: la consecuencia de la deriva es un segundo comprobante fiscal.
 *
 * El `message` de los tres estados de falla lo escribe el server, que sabe si el
 * sujeto es "el comprobante" o "la nota de crédito" y si ARCA puede seguir
 * autorizando; reescribirlo acá perdería esas distinciones.
 */
export type ComprobanteContingency =
  // ARCA respondió y dijo que no. No se generó nada y reintentar no puede
  // duplicar: el submit sigue habilitado.
  | {
      status: "rejected";
      message: string;
      resultado: string | null;
      errors: string[];
      observaciones: string[];
    }
  // No se generó nada y reintentar es seguro. Cubre tanto la falla consultando el
  // correlativo como la autorización que la consulta resolvió en negativo: fases
  // distintas, lo mismo para decir.
  | { status: "not-emitted"; message: string }
  // El ambiguo de verdad: la emisión puede haberse autorizado o no. El submit se
  // bloquea, porque reintentar a ciegas es exactamente como se emite un
  // comprobante fiscal duplicado.
  | {
      status: "unverified";
      message: string;
      ptoVta: number;
      cbteTipo: number;
      cbteNro: number;
    }
  // Una re-verificación encontró el comprobante y quedó registrado. Terminal.
  | { status: "recovered" };

export const contingencyRecoveredMessage =
  "El comprobante ya estaba autorizado en ARCA. Lo recuperamos y quedó registrado.";

// Qué hacer con el botón que dispara la operación destructiva.
export type ContingencySubmitState =
  | "enabled"
  // `unverified` sin verificación: reintentar podría duplicar.
  | "blocked"
  // `recovered`: la operación terminó. Se saca, no se deshabilita — un botón
  // deshabilitado se lee como "esperá un momento" e invita a reintentar, y acá
  // reintentar emite un segundo comprobante por el mismo importe.
  | "removed";

export function resolveContingencySubmitState(
  contingency: ComprobanteContingency | null,
  acknowledged: boolean,
): ContingencySubmitState {
  if (contingency?.status === "recovered") {
    return "removed";
  }

  if (contingency?.status === "unverified" && !acknowledged) {
    return "blocked";
  }

  return "enabled";
}

// Con la operación terminada, cancelar ya no es lo que el botón hace.
export function contingencyCancelLabel(state: ContingencySubmitState): string {
  return state === "removed" ? "Cerrar" : "Cancelar";
}

/**
 * Superficie única de la contingencia de ARCA, compartida por el diálogo de
 * emisión y el de anulación.
 *
 * `unverified` ofrece las dos únicas salidas que tiene el operador: re-consultar
 * a ARCA por ese comprobante sin salir del diálogo, o declarar que ya verificó
 * por su cuenta y desbloquear el reintento. La primera es la única que
 * **persiste** un comprobante recuperado; la segunda no puede hacerlo, porque la
 * app no tiene el CAE.
 *
 * El intent de la re-verificación entra por prop: cada feature postea el suyo.
 */
export function ContingencyAlert({
  acknowledged,
  contingency,
  isBusy = false,
  onAcknowledge,
  onRecheck,
  recheckIntent,
}: {
  acknowledged: boolean;
  contingency: ComprobanteContingency;
  isBusy?: boolean;
  onAcknowledge: () => void;
  // Recibe el payload ya armado: del cliente sólo viaja el `cbteNro`. El importe
  // y la fecha contra los que se valida el comprobante consultado los recalcula
  // el server (ADR-0012 decisión 4); mandarlos desde el form colapsaría esa
  // validación a un solo campo efectivo.
  onRecheck: (payload: Record<string, string>) => void;
  recheckIntent: string;
}) {
  if (contingency.status === "recovered") {
    return (
      <Alert variant="success">
        <CircleCheck aria-hidden="true" />
        <AlertDescription>{contingencyRecoveredMessage}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="destructive">
      <AlertTriangle aria-hidden="true" />
      <AlertDescription>
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <span>{contingency.message}</span>
            {contingency.status === "rejected"
              ? [...contingency.errors, ...contingency.observaciones].map(
                  (detail) => <span key={detail}>{detail}</span>,
                )
              : null}
          </div>

          {contingency.status === "unverified" ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isBusy}
                onClick={() =>
                  onRecheck({
                    intent: recheckIntent,
                    cbteNro: String(contingency.cbteNro),
                  })
                }
              >
                Verificar ahora
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isBusy || acknowledged}
                onClick={onAcknowledge}
              >
                Ya verifiqué en ARCA
              </Button>
            </div>
          ) : null}
        </div>
      </AlertDescription>
    </Alert>
  );
}
