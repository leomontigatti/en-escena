import { AlertTriangle, CircleCheck } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * What was settled about an attempt against ARCA, as it is told to the operator
 * (ADR-0012 decision 6). It is keyed on the **outcome**, not on the SOAP call
 * that broke: the phase is an input to the server's recovery logic and does not
 * reach this far.
 *
 * It is a shared type on purpose. It used to be duplicated — one copy in the
 * emission dialog, another inline in the comprobante detail — and a union where
 * one state blocks a destructive submit cannot afford to diverge between the two
 * paths: the consequence of that drift is a second fiscal comprobante.
 *
 * The `message` for the three failure states is written by the server, which
 * knows whether the subject is "el comprobante" or "la nota de crédito" and
 * whether ARCA may still be authorizing; rewriting it here would lose those
 * distinctions.
 */
export type ComprobanteContingency =
  // ARCA responded and said no. Nothing was generated and retrying cannot
  // duplicate: the submit stays enabled.
  | {
      status: "rejected";
      message: string;
      resultado: string | null;
      errors: string[];
      observaciones: string[];
    }
  // Nothing was generated and retrying is safe. It covers both the failure while
  // looking up the sequence number and the authorization the lookup resolved in
  // the negative: different phases, the same thing to say.
  | { status: "not-emitted"; message: string }
  // The genuinely ambiguous one: the emission may or may not have been
  // authorized. The submit is blocked, because retrying blindly is exactly how a
  // duplicate fiscal comprobante gets emitted.
  | {
      status: "unverified";
      message: string;
      ptoVta: number;
      cbteTipo: number;
      cbteNro: number;
    }
  // A re-verification found the comprobante and it was recorded. Terminal.
  | { status: "recovered" };

export const contingencyRecoveredMessage =
  "El comprobante ya estaba autorizado en ARCA. Lo recuperamos y quedó registrado.";

// What to do with the button that triggers the destructive operation.
export type ContingencySubmitState =
  | "enabled"
  // `unverified` without verification: retrying could duplicate.
  | "blocked"
  // `recovered`: the operation is over. It is removed, not disabled — a disabled
  // button reads as "hold on a moment" and invites a retry, and here retrying
  // emits a second comprobante for the same amount.
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

// Once the operation is over, cancelling is no longer what the button does.
export function contingencyCancelLabel(state: ContingencySubmitState): string {
  return state === "removed" ? "Cerrar" : "Cancelar";
}

/**
 * The single surface for ARCA contingencies, shared by the emission dialog and
 * the annulment one.
 *
 * `unverified` offers the only two ways out the operator has: query ARCA again
 * for that comprobante without leaving the dialog, or declare that they have
 * already verified it themselves and unblock the retry. The first is the only
 * one that **persists** a recovered comprobante; the second cannot, because the
 * app does not have the CAE.
 *
 * The re-verification intent comes in as a prop: each feature posts its own.
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
  // Receives the payload already assembled: only the `cbteNro` travels from the
  // client. The amount and the date the queried comprobante is validated against
  // are recomputed by the server (ADR-0012 decision 4); sending them from the
  // form would collapse that validation to a single effective field.
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
