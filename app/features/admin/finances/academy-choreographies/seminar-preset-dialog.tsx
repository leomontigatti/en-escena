import { Check, CircleAlert } from "lucide-react";
import { useEffect } from "react";
import { useFetcher } from "react-router";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import type { CobroStage } from "@/lib/finances/choreography-cobro-presets.server";
import type { OperationalFinanceAmount } from "@/lib/finances/operational-summary";
import { useOptionalFormAction } from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";

import { PresetTotals } from "./preset-dialog";
import {
  financePresetIntent,
  financePresetLabels,
  seminarIdFieldName,
} from "./presets";
import type { AcademyFinancesActionData } from "./server";

/**
 * The preset dialog over the selected `(seminar, academy)` rows. It has nothing
 * to ask: every active inscription of the academy in those seminars is charged
 * what it owes for the stage, at the price it holds or, when it holds none, the
 * one that applies to the person today. So it posts the stage and the seminars,
 * and the server recomputes the rest.
 *
 * A refusal (a seminar short of places, a pool that cannot cover the charge)
 * names what blocked it, so it stays in the dialog as an alert where the
 * administrator can read it against the selection, instead of a toast that
 * leaves. A success closes the dialog with a toast over the list the loader
 * has just revalidated, as the choreography preset does.
 */
export function SeminarPresetDialog({
  availableBalanceAmount,
  onOpenChange,
  owedAmount,
  selectedSeminarIds,
  stage,
}: {
  availableBalanceAmount: number;
  onOpenChange: (open: boolean) => void;
  owedAmount: OperationalFinanceAmount;
  selectedSeminarIds: string[];
  stage: CobroStage;
}) {
  const fetcher = useFetcher<AcademyFinancesActionData>();
  const formAction = useOptionalFormAction();
  const isSaving = fetcher.state !== "idle";
  const refusal =
    fetcher.state === "idle" && fetcher.data?.status === "error"
      ? fetcher.data.message
      : null;
  const isDone = fetcher.data?.status === "success";

  useServerActionToast(isDone ? fetcher.data : undefined);

  useEffect(() => {
    if (isDone) {
      onOpenChange(false);
    }
  }, [isDone, onOpenChange]);

  return (
    <Dialog open onOpenChange={(next) => !isSaving && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{financePresetLabels[stage]}</DialogTitle>
          <DialogDescription>
            {selectedSeminarIds.length === 1
              ? "1 seminario elegido."
              : `${selectedSeminarIds.length} seminarios elegidos.`}{" "}
            Sale del saldo disponible de la academia y se asigna a cada
            inscripción activa lo que adeuda. Las que no tienen precio toman el
            que les corresponde hoy; las que ya tienen uno lo conservan.
          </DialogDescription>
        </DialogHeader>

        <fetcher.Form
          action={formAction}
          method="post"
          className="flex flex-col gap-4"
        >
          <input
            type="hidden"
            name="intent"
            value={financePresetIntent(stage, "seminars")}
          />
          {selectedSeminarIds.map((seminarId) => (
            <input
              key={seminarId}
              type="hidden"
              name={seminarIdFieldName}
              value={seminarId}
            />
          ))}

          <PresetTotals
            availableBalanceAmount={availableBalanceAmount}
            owedAmount={owedAmount}
            stage={stage}
          />

          {refusal ? (
            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertTitle>No se pudo asignar</AlertTitle>
              <AlertDescription>{refusal}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSaving}>
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? (
                <Spinner aria-hidden="true" data-icon="inline-start" />
              ) : (
                <Check aria-hidden="true" data-icon="inline-start" />
              )}
              Guardar
            </Button>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}
