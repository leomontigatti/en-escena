import { CircleAlert, CircleCheck } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  // The genuinely ambiguous one: nobody knows whether ARCA authorized the
  // reserved number. The reservation stays live and blocks its series, and so
  // does the submit, because retrying blindly is exactly how a duplicate fiscal
  // comprobante gets emitted. It is also what an emission meets on a series
  // another attempt still holds.
  | ({ status: "unverified"; message: string } & ReservedAttempt)
  // ARCA holds another comprobante at the reserved number: re-checking cannot
  // clear it, abandoning the attempt does (ADR-0014 §7).
  | ({ status: "number-taken"; message: string } & ReservedAttempt)
  // A re-verification found the comprobante and it was recorded. Terminal.
  | { status: "recovered" }
  // The attempt was abandoned and its series is free: emitting is safe again.
  | { status: "released" };

type ReservedAttempt = { ptoVta: number; cbteTipo: number; cbteNro: number };

const contingencyTitles = {
  "not-emitted": "No se emitió",
  rejected: "Rechazado por ARCA",
  unverified: "Sin confirmar en ARCA",
  "number-taken": "ARCA tiene otro comprobante en este número",
} as const;

const contingencyRecoveredMessage =
  "El comprobante ya estaba autorizado en ARCA. Lo recuperamos y quedó registrado.";

const contingencyReleasedMessage =
  "Abandonamos el intento y su serie quedó libre: ya podés volver a emitir.";

// What to do with the button that triggers the destructive operation.
export type ContingencySubmitState =
  | "enabled"
  // A live reservation: retrying could duplicate, and the series is held.
  | "blocked"
  // `recovered`: the operation is over. It is removed, not disabled — a disabled
  // button reads as "hold on a moment" and invites a retry, and here retrying
  // emits a second comprobante for the same amount.
  | "removed";

export function resolveContingencySubmitState(
  contingency: ComprobanteContingency | null,
): ContingencySubmitState {
  if (contingency?.status === "recovered") {
    return "removed";
  }

  if (
    contingency?.status === "unverified" ||
    contingency?.status === "number-taken"
  ) {
    return "blocked";
  }

  return "enabled";
}

// Once the operation is over, cancelling is no longer what the button does.
export function contingencyCancelLabel(state: ContingencySubmitState): string {
  return state === "removed" ? "Cerrar" : "Cancelar";
}

/**
 * The single surface for ARCA contingencies, in the emission dialog of both
 * financial details.
 *
 * A live reservation offers the only two ways out the operator has: query ARCA
 * again for that number without leaving the dialog, which is the only one that
 * **persists** a recovered comprobante, or abandon the attempt, which frees its
 * series. On `unverified` abandoning is the operator's declaration that they
 * checked ARCA's portal; on `number-taken` it follows the evidence the message
 * lays out.
 *
 * Abandoning takes a second, explicit step (#578): the first click only asks,
 * beside the evidence, and nothing is posted until the operator confirms.
 *
 * The intents come in as props: each feature posts its own.
 */
export function ContingencyAlert({
  abandonIntent,
  contingency,
  isBusy = false,
  onSubmit,
  recheckIntent,
}: {
  abandonIntent: string;
  contingency: ComprobanteContingency;
  isBusy?: boolean;
  // Receives the payload already assembled: only the attempt's `cbteTipo` and
  // `cbteNro` travel from the client. What the comprobante found there is
  // checked against is the reservation the server keeps.
  onSubmit: (payload: Record<string, string>) => void;
  recheckIntent: string;
}) {
  if (contingency.status === "recovered" || contingency.status === "released") {
    return (
      <Alert variant="success">
        <CircleCheck aria-hidden="true" />
        <AlertTitle>
          {contingency.status === "recovered"
            ? "Comprobante recuperado"
            : "Intento abandonado"}
        </AlertTitle>
        <AlertDescription>
          {contingency.status === "recovered"
            ? contingencyRecoveredMessage
            : contingencyReleasedMessage}
        </AlertDescription>
      </Alert>
    );
  }

  const attempt =
    contingency.status === "unverified" || contingency.status === "number-taken"
      ? {
          cbteTipo: String(contingency.cbteTipo),
          cbteNro: String(contingency.cbteNro),
        }
      : null;

  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden="true" />
      <AlertTitle>{contingencyTitles[contingency.status]}</AlertTitle>
      <AlertDescription>
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <span>{contingency.message}</span>
            {contingency.status === "rejected" &&
            contingency.errors.length + contingency.observaciones.length > 0 ? (
              <ul className="list-disc pl-5">
                {[...contingency.errors, ...contingency.observaciones].map(
                  (detail) => (
                    <li key={detail}>{detail}</li>
                  ),
                )}
              </ul>
            ) : null}
          </div>

          {attempt ? (
            <AttemptActions
              abandonLabel={
                contingency.status === "number-taken"
                  ? "Abandonar este intento"
                  : "Ya verifiqué en ARCA"
              }
              isBusy={isBusy}
              onAbandon={() => onSubmit({ intent: abandonIntent, ...attempt })}
              onRecheck={() => onSubmit({ intent: recheckIntent, ...attempt })}
            />
          ) : null}
        </div>
      </AlertDescription>
    </Alert>
  );
}

// The two ways out of a live attempt. Abandoning asks once more before it
// posts, since it frees the series without recording anything.
function AttemptActions({
  abandonLabel,
  isBusy,
  onAbandon,
  onRecheck,
}: {
  abandonLabel: string;
  isBusy: boolean;
  onAbandon: () => void;
  onRecheck: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="flex flex-col gap-2">
        <span>
          Abandonar el intento libera su serie sin registrar ningún comprobante.
          ¿Confirmás que ARCA no lo tiene como tuyo?
        </span>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isBusy}
            onClick={() => {
              setConfirming(false);
              onAbandon();
            }}
          >
            Sí, abandonar
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isBusy}
            onClick={() => setConfirming(false)}
          >
            Volver
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isBusy}
        onClick={onRecheck}
      >
        Verificar ahora
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isBusy}
        onClick={() => setConfirming(true)}
      >
        {abandonLabel}
      </Button>
    </div>
  );
}
