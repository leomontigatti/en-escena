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
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatGroupTypeLabel,
  type ChoreographyGroupType,
} from "@/lib/portal/choreographies";

import { formatAmount, formatOperationalAmount } from "../formatters";
import {
  choreographyIdFieldName,
  financePresetIntent,
  financePresetLabels,
  presetPriceFieldName,
  type FinancePresetStage,
} from "./presets";
import type { PresetPriceOption } from "./server";
import type { AcademyFinancesLoaderData } from "./types";

type ChoreographyFinanceRow =
  AcademyFinancesLoaderData["choreographyFinanceRows"][number];

/**
 * The preset dialog of the list actions. It pre-fills the owed figure of every
 * selected choreography — the whole point of a preset — and asks for the price
 * to fix on the inscriptions that have no money on them yet.
 *
 * There is no payment picker: the money comes out of the academy's
 * `Saldo disponible`, and which payments fund it is the pool rule's business.
 * What it writes is indistinguishable from a hand-typed allocation.
 */
export function FinancePresetDialog({
  availableBalanceAmount,
  onOpenChange,
  open,
  priceOptionsByGroupType,
  selectedRows,
  stage,
}: {
  availableBalanceAmount: number;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  priceOptionsByGroupType: Record<string, PresetPriceOption[]>;
  selectedRows: ChoreographyFinanceRow[];
  stage: FinancePresetStage;
}) {
  const fetcher = useFetcher<{ status: "error"; message: string }>();
  const isSaving = fetcher.state !== "idle";
  const owed = sumOwedAmount(selectedRows, stage);
  const groupTypes = [
    ...new Set(selectedRows.map((row) => row.groupType)),
  ].sort();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !isSaving && onOpenChange(next)}
    >
      <DialogContent overlayClassName="backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>{financePresetLabels[stage]}</DialogTitle>
          <DialogDescription>
            {selectedRows.length === 1
              ? "1 coreografía elegida."
              : `${selectedRows.length} coreografías elegidas.`}{" "}
            Sale del saldo disponible de la academia y se asigna a cada
            inscripción lo que adeuda.
          </DialogDescription>
        </DialogHeader>

        <fetcher.Form method="post" className="flex flex-col gap-4">
          <input
            type="hidden"
            name="intent"
            value={financePresetIntent(stage)}
          />
          {selectedRows.map((row) => (
            <input
              key={row.id}
              type="hidden"
              name={choreographyIdFieldName}
              value={row.id}
            />
          ))}

          {groupTypes.map((groupType) => (
            <PresetPriceField
              key={groupType}
              groupType={groupType}
              options={priceOptionsByGroupType[groupType] ?? []}
              showGroupType={groupTypes.length > 1}
            />
          ))}

          <PresetTotals
            availableBalanceAmount={availableBalanceAmount}
            owedAmount={owed}
            stage={stage}
          />

          {owed.status === "incomplete" ? (
            <Alert variant="warning">
              <AlertTriangle aria-hidden="true" />
              <AlertDescription>
                Alguna inscripción todavía no tiene precio, así que la cifra que
                ves no es toda la deuda. Elegí un precio abajo para completarla.
              </AlertDescription>
            </Alert>
          ) : null}

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
              Asignar
            </Button>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The price prompt, one per group type in the selection. It is named by its
 * group type only when the selection spans more than one, since otherwise the
 * qualifier says nothing.
 */
function PresetPriceField({
  groupType,
  options,
  showGroupType,
}: {
  groupType: ChoreographyGroupType;
  options: PresetPriceOption[];
  showGroupType: boolean;
}) {
  const fieldName = presetPriceFieldName(groupType);
  const label = showGroupType
    ? `Precio · ${formatGroupTypeLabel(groupType)}`
    : "Precio";
  const [priceId, setPriceId] = useState(options[0]?.id ?? "");

  if (options.length === 0) {
    return (
      <Alert variant="warning">
        <AlertTriangle aria-hidden="true" />
        <AlertDescription>
          No hay precios cargados para {formatGroupTypeLabel(groupType)}.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Field>
      <FieldLabel htmlFor={fieldName}>{label}</FieldLabel>
      {/* Radix's `Select` is not a form control, so the picked row travels in a
          hidden input, the same way `SelectField` does it. */}
      <input type="hidden" name={fieldName} value={priceId} />
      <Select value={priceId} onValueChange={setPriceId}>
        <SelectTrigger id={fieldName} className="w-full">
          <SelectValue placeholder="Elegí un precio" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name} · {formatAmount(option.amount)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

/**
 * What the preset is about to allocate against what there is to allocate it
 * from. The administrator no longer picks a payment, so what they need to read
 * is that the money suffices.
 */
function PresetTotals({
  availableBalanceAmount,
  owedAmount,
  stage,
}: {
  availableBalanceAmount: number;
  owedAmount: OwedAmount;
  stage: FinancePresetStage;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md border bg-muted/50 px-3 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-muted-foreground">
          {stage === "deposit" ? "Seña adeudada" : "Saldo adeudado"}
        </span>
        <span className="text-sm font-medium tabular-nums">
          {formatOperationalAmount(owedAmount)}
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

type OwedAmount = ChoreographyFinanceRow["owedDepositAmount"];

/**
 * The pre-filled figure: the sum of the selected rows' shortfall against the
 * preset's threshold. It stays `incomplete` as soon as one row is, because a
 * figure that silently drops an unpriced inscription would understate the debt.
 */
function sumOwedAmount(
  rows: ChoreographyFinanceRow[],
  stage: FinancePresetStage,
): OwedAmount {
  let amount = 0;
  let missingPriceCount = 0;

  for (const row of rows) {
    const owed =
      stage === "deposit" ? row.owedDepositAmount : row.owedBalanceAmount;

    amount += owed.amount;

    if (owed.status === "incomplete") {
      missingPriceCount += owed.missingPriceCount;
    }
  }

  return missingPriceCount > 0
    ? { amount, missingPriceCount, status: "incomplete" }
    : { amount, status: "complete" };
}
