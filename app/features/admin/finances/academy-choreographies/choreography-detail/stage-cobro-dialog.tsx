import { AlertTriangle, Check, LoaderCircle } from "lucide-react";
import { useFetcher } from "react-router";

import { Alert, AlertDescription } from "@/components/ui/alert";
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

import { formatAmount } from "../../formatters";
import type { loadChoreographyFinanceDetail } from "./server";
import { payBalanceIntent, payDepositIntent } from "./shared";

type ChoreographyFinanceDetailLoaderData = Awaited<
  ReturnType<typeof loadChoreographyFinanceDetail>
>;

export type StageTotal = NonNullable<
  ChoreographyFinanceDetailLoaderData["stageTotalAmount"]
>;
export type CobroStage = NonNullable<
  ChoreographyFinanceDetailLoaderData["stage"]
>;

/**
 * The stage's cobro preset. It no longer picks a payment: it names the owed
 * amount and the system funds it from the academy's `Saldo disponible`, oldest
 * payment first. That is why the dialog only confirms.
 */
export function StageCobroDialog({
  availableBalanceAmount,
  open,
  onOpenChange,
  stage,
  stageTotalAmount,
}: {
  availableBalanceAmount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stage: CobroStage;
  stageTotalAmount: StageTotal;
}) {
  const fetcher = useFetcher<{ status: "error"; message: string }>();
  const isSaving = fetcher.state !== "idle";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !isSaving && onOpenChange(next)}
    >
      <DialogContent overlayClassName="backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>
            {stage === "deposit" ? "Pagar seña" : "Pagar saldo"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Confirmá la asignación de la etapa completa de la coreografía desde
            el saldo disponible de la academia.
          </DialogDescription>
        </DialogHeader>

        <fetcher.Form method="post" className="flex flex-col gap-4">
          <input
            type="hidden"
            name="intent"
            value={stage === "deposit" ? payDepositIntent : payBalanceIntent}
          />

          <StageTotalSummary
            availableBalanceAmount={availableBalanceAmount}
            stage={stage}
            stageTotalAmount={stageTotalAmount}
          />

          {fetcher.data?.status === "error" ? (
            <Alert variant="destructive">
              <AlertTriangle aria-hidden="true" />
              <AlertDescription>{fetcher.data.message}</AlertDescription>
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
                <LoaderCircle
                  aria-hidden="true"
                  className="animate-spin"
                  data-icon="inline-start"
                />
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

/**
 * What the preset will allocate and where it comes from: the stage's owed
 * figure against the academy's `Saldo disponible`. The administrator no longer
 * picks a payment, so what they need to see is that the money suffices.
 */
function StageTotalSummary({
  availableBalanceAmount,
  stage,
  stageTotalAmount,
}: {
  availableBalanceAmount: number;
  stage: CobroStage;
  stageTotalAmount: StageTotal;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md border bg-muted/50 px-3 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-muted-foreground">
          {stage === "deposit" ? "Seña a cobrar" : "Saldo a cobrar"}
        </span>
        <span className="text-sm font-medium tabular-nums">
          {formatAmount(stageTotalAmount.amount)}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-muted-foreground">Saldo disponible</span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {formatAmount(availableBalanceAmount)}
        </span>
      </div>
    </div>
  );
}
