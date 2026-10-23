/**
 * The shape a withdrawn inscription opens on (#1065). What it holds is its
 * retained deposit, the `derecho de inscripción` the reglamento keeps, and the
 * clause allows two outcomes only: keep all of it, or release all of it to
 * `Saldo disponible` (the medical case). So there is no amount to type, and the
 * one removal is `Liberar` the whole of it. The app asks for no reason: the
 * clause never conditions the retention on an excuse (#654).
 *
 * A row holding more than its deposit, withdrawn before the withdrawal released
 * the excess or whose deposit moved down since, also offers to release just that
 * excess, which is how it reaches the outcome that keeps the deposit.
 */

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import type { AllocationTargetKind } from "@/lib/finances/allocation-target.server";
import { formatAmount, formatDancerName } from "@/lib/finances/formatters";
import { useOptionalFormAction } from "@/lib/shared/forms";

import {
  MoneyDialog,
  MoneyTargetFields,
  SubmitIcon,
  useMoneyWriteFetcher,
} from "./dialog-parts";
import { readWithdrawnFigures, type InscriptionRow } from "./figures";
import {
  releaseInscriptionExcessIntent,
  releaseRetainedDepositIntent,
} from "./intents";

export function WithdrawnInscriptionDialog({
  inscription,
  onOpenChange,
  targetKind,
}: {
  inscription: InscriptionRow;
  onOpenChange: (open: boolean) => void;
  targetKind: AllocationTargetKind;
}) {
  const fetcher = useMoneyWriteFetcher(onOpenChange);
  const formAction = useOptionalFormAction();
  const isSaving = fetcher.state !== "idle";
  // Which release is in flight, so its button and not the other one shows the
  // spinner.
  const [submittedIntent, setSubmittedIntent] = useState<string | null>(null);
  const { excessAmount, retainedAmount } = readWithdrawnFigures(inscription);
  const holdsMoney = inscription.allocatedAmount > 0;

  return (
    <MoneyDialog
      description={describeWithdrawnRow({ excessAmount, retainedAmount })}
      // Nothing is typed or picked here, so there is nothing to lose.
      isDirty={false}
      isSaving={isSaving}
      onOpenChange={onOpenChange}
      title={formatDancerName(inscription)}
    >
      {(requestClose) => (
        <form
          method="post"
          onSubmit={(event) => {
            event.preventDefault();
            // The button that submitted carries the intent, so the two
            // releases share one form and its target fields.
            const submitter = (event.nativeEvent as SubmitEvent).submitter;
            setSubmittedIntent(
              submitter instanceof HTMLButtonElement ? submitter.value : null,
            );
            void fetcher.submit(
              submitter instanceof HTMLButtonElement
                ? submitter
                : event.currentTarget,
              { action: formAction, method: "post" },
            );
          }}
          className="flex flex-col gap-4"
        >
          <MoneyTargetFields
            inscription={inscription}
            targetKind={targetKind}
          />

          <DialogFooter
            className={excessAmount > 0 ? "sm:justify-between" : ""}
          >
            {excessAmount > 0 ? (
              <Button
                type="submit"
                name="intent"
                value={releaseInscriptionExcessIntent}
                variant="outline"
                disabled={isSaving}
              >
                <SubmitIcon
                  isSaving={
                    isSaving &&
                    submittedIntent === releaseInscriptionExcessIntent
                  }
                />
                Liberar excedente {formatAmount(excessAmount)}
              </Button>
            ) : null}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isSaving}
                onClick={requestClose}
              >
                {holdsMoney ? "Cancelar" : "Cerrar"}
              </Button>
              {holdsMoney ? (
                <Button
                  type="submit"
                  name="intent"
                  value={releaseRetainedDepositIntent}
                  variant="destructive"
                  disabled={isSaving}
                >
                  <SubmitIcon
                    isSaving={
                      isSaving &&
                      submittedIntent === releaseRetainedDepositIntent
                    }
                  />
                  {excessAmount > 0 ? "Liberar todo" : "Liberar"}{" "}
                  {formatAmount(inscription.allocatedAmount)}
                </Button>
              ) : null}
            </div>
          </DialogFooter>
        </form>
      )}
    </MoneyDialog>
  );
}

function describeWithdrawnRow(input: {
  excessAmount: number;
  retainedAmount: number;
}): string {
  if (input.retainedAmount === 0 && input.excessAmount === 0) {
    return "Está retirada y no retiene dinero.";
  }

  const excess =
    input.excessAmount > 0
      ? ` Además tiene ${formatAmount(input.excessAmount)} de más.`
      : "";

  return `Está retirada y retiene ${formatAmount(input.retainedAmount)} de seña.${excess} La seña se retiene entera o se libera entera al saldo disponible de la academia.`;
}
