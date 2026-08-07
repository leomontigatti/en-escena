import { AlertTriangle, Check, LoaderCircle, Trash2 } from "lucide-react";
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
import { deleteAllocationIntent, payInscriptionBalanceIntent } from "./shared";

type ChoreographyFinanceDetailLoaderData = Awaited<
  ReturnType<typeof loadChoreographyFinanceDetail>
>;
type InscriptionRow =
  ChoreographyFinanceDetailLoaderData["inscriptions"][number];

/**
 * Per-row dialog for the extraordinary balance charge of a `señada` orphan in
 * a mixed choreography. No payment is picked any more: the owed balance is
 * funded from the academy's `Saldo disponible`, oldest payment first. A
 * `señada` already has its deposit allocated, so the dialog also offers undoing
 * it and returning the inscription to `impaga`.
 */
export function InscriptionBalanceDialog({
  inscription,
  open,
  onOpenChange,
}: {
  inscription: InscriptionRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const fetcher = useFetcher<{ status: "error"; message: string }>();
  const deleteFetcher = useFetcher<{ status: "error"; message: string }>();
  const isSaving = fetcher.state !== "idle";
  const isDeleting = deleteFetcher.state !== "idle";
  const isBusy = isSaving || isDeleting;
  const balanceAmount = inscription.owedBalanceAmount ?? 0;
  const undoableAllocation = inscription.undoableAllocation;
  const formId = `assign-balance-${inscription.inscriptionId ?? "row"}`;

  return (
    <Dialog open={open} onOpenChange={(next) => !isBusy && onOpenChange(next)}>
      <DialogContent overlayClassName="backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>Asignar saldo</DialogTitle>
          <DialogDescription>
            Se asigna desde el saldo disponible de la academia.
          </DialogDescription>
        </DialogHeader>

        <fetcher.Form id={formId} method="post" className="flex flex-col gap-4">
          <input
            type="hidden"
            name="intent"
            value={payInscriptionBalanceIntent}
          />
          <input
            type="hidden"
            name="inscriptionId"
            value={inscription.inscriptionId ?? ""}
          />

          <div className="flex flex-col gap-1.5 rounded-md border bg-muted/50 px-3 py-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-muted-foreground">
                Saldo a cobrar
              </span>
              <span className="text-sm font-medium tabular-nums">
                {formatAmount(balanceAmount)}
              </span>
            </div>
          </div>

          {fetcher.data?.status === "error" ? (
            <Alert variant="destructive">
              <AlertTriangle aria-hidden="true" />
              <AlertDescription>{fetcher.data.message}</AlertDescription>
            </Alert>
          ) : null}
        </fetcher.Form>

        {deleteFetcher.data?.status === "error" ? (
          <Alert variant="destructive">
            <AlertTriangle aria-hidden="true" />
            <AlertDescription>{deleteFetcher.data.message}</AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter className="sm:justify-between">
          {undoableAllocation ? (
            <deleteFetcher.Form method="post">
              <input
                type="hidden"
                name="intent"
                value={deleteAllocationIntent}
              />
              <input
                type="hidden"
                name="allocationId"
                value={undoableAllocation.id}
              />
              <Button type="submit" variant="destructive" disabled={isBusy}>
                {isDeleting ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                ) : (
                  <Trash2 aria-hidden="true" data-icon="inline-start" />
                )}
                Eliminar
              </Button>
            </deleteFetcher.Form>
          ) : (
            <span />
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isBusy}>
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" form={formId} disabled={isBusy}>
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
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
