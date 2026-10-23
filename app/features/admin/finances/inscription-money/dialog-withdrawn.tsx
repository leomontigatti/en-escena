/**
 * The shape a withdrawn inscription opens on (#1065). What it holds is its
 * retained deposit, the `derecho de inscripción` the reglamento keeps, and the
 * clause allows two outcomes only: keep all of it, or release all of it to
 * `Saldo disponible` (the medical case). So there is no amount to type, and the
 * one removal is `Liberar` the whole of it. The app asks for no reason: the
 * clause never conditions the retention on an excuse (#654).
 *
 * A row can still hold more than its deposit when the deposit moved down after
 * the withdrawal (a row below its deposit is not price-locked). The description
 * says so, and the one release still takes all of it: the rows withdrawn before
 * #1065 were brought down to their deposit once, in production.
 */

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
import { releaseRetainedDepositIntent } from "./intents";

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
            void fetcher.submit(event.currentTarget, {
              action: formAction,
              method: "post",
            });
          }}
          className="flex flex-col gap-4"
        >
          <input
            type="hidden"
            name="intent"
            value={releaseRetainedDepositIntent}
          />
          <MoneyTargetFields
            inscription={inscription}
            targetKind={targetKind}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={requestClose}
            >
              {holdsMoney ? "Cancelar" : "Cerrar"}
            </Button>
            {holdsMoney ? (
              <Button type="submit" variant="destructive" disabled={isSaving}>
                <SubmitIcon isSaving={isSaving} />
                Liberar {formatAmount(inscription.allocatedAmount)}
              </Button>
            ) : null}
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
