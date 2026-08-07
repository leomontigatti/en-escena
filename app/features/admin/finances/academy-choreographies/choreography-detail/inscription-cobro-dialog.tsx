import { AlertTriangle, Check, LoaderCircle } from "lucide-react";
import { useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatAmount } from "../../formatters";
import type { loadChoreographyFinanceDetail } from "./server";
import { payInscriptionDepositIntent } from "./shared";

type ChoreographyFinanceDetailLoaderData = Awaited<
  ReturnType<typeof loadChoreographyFinanceDetail>
>;
type InscriptionRow =
  ChoreographyFinanceDetailLoaderData["inscriptions"][number];
type InscriptionDepositOptions = NonNullable<
  ChoreographyFinanceDetailLoaderData["inscriptionDeposit"]
>;
type InscriptionPriceRow = InscriptionDepositOptions["priceRows"][number];

export function formatDancerName(input: {
  firstName: string;
  lastName: string;
}) {
  return `${input.firstName} ${input.lastName}`;
}

/**
 * Per-row dialog for the extraordinary deposit charge of an orphan: pick a
 * price row (bounded by the floor, already filtered in the loader). The payment
 * is not picked: the deposit is funded from the academy's `Saldo disponible`,
 * oldest payment first. The server re-validates the floor and the pool.
 */
export function InscriptionCobroDialog({
  inscription,
  open,
  onOpenChange,
  priceRows,
}: {
  inscription: InscriptionRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  priceRows: InscriptionPriceRow[];
}) {
  const fetcher = useFetcher<{ status: "error"; message: string }>();
  const [selectedPriceId, setSelectedPriceId] = useState<string | null>(null);
  const isSaving = fetcher.state !== "idle";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !isSaving && onOpenChange(next)}
    >
      <DialogContent overlayClassName="backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>Asignar seña</DialogTitle>
          <DialogDescription>
            Elegí el precio; se asigna desde el saldo disponible de la academia.
          </DialogDescription>
        </DialogHeader>

        <fetcher.Form method="post" className="flex flex-col gap-4">
          <input
            type="hidden"
            name="intent"
            value={payInscriptionDepositIntent}
          />
          <input
            type="hidden"
            name="inscriptionId"
            value={inscription.inscriptionId ?? ""}
          />

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Precio</span>
            <Select
              name="priceId"
              value={selectedPriceId ?? ""}
              onValueChange={setSelectedPriceId}
              disabled={isSaving}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Elegí un precio" />
              </SelectTrigger>
              <SelectContent>
                {priceRows.map((price) => (
                  <SelectItem key={price.id} value={price.id}>
                    {price.name} · {formatAmount(price.amount)} · seña{" "}
                    {formatAmount(price.depositAmount)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
            <Button type="submit" disabled={!selectedPriceId || isSaving}>
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
