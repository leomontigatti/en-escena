import { AlertTriangle, Check, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CobroStage } from "@/lib/finances/choreography-cobro-presets.server";
import {
  formatGroupTypeLabel,
  type ChoreographyGroupType,
} from "@/lib/portal/choreographies";
import { useServerActionToast } from "@/lib/shared/toasts";

import { formatAmount, formatOperationalAmount } from "../formatters";
import {
  choreographyIdFieldName,
  financePresetIntent,
  financePresetLabels,
  keepCurrentPriceLabel,
  keepCurrentPriceValue,
  presetPriceFieldName,
  selectPresetPriceOptions,
  type PresetPriceOption,
} from "./presets";
import type { AcademyFinancesActionData } from "./server";
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
 *
 * It is a dialog over a list, so the write does not redirect: the outcome comes
 * back in `fetcher.data` and is announced with a toast, and a success closes the
 * dialog over the list the loader has just revalidated.
 */
export function FinancePresetDialog({
  availableBalanceAmount,
  onOpenChange,
  open,
  priceOptionsByGroupType,
  pricingScheduleIdByChoreography,
  selectedRows,
  stage,
}: {
  availableBalanceAmount: number;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  priceOptionsByGroupType: Record<string, PresetPriceOption[]>;
  pricingScheduleIdByChoreography: Record<string, string | null>;
  selectedRows: ChoreographyFinanceRow[];
  stage: CobroStage;
}) {
  const fetcher = useFetcher<AcademyFinancesActionData>();
  const isSaving = fetcher.state !== "idle";
  const owed = sumOwedAmount(selectedRows, stage);
  const priceFields = buildPresetPriceFields({
    priceOptionsByGroupType,
    pricingScheduleIdByChoreography,
    selectedRows,
  });

  useServerActionToast(fetcher.data);

  const isDone = fetcher.data?.status === "success";
  useEffect(() => {
    if (isDone) {
      onOpenChange(false);
    }
  }, [isDone, onOpenChange]);

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

          {priceFields.map((field) => (
            <PresetPriceField
              key={field.groupType}
              groupType={field.groupType}
              options={field.options}
              showGroupType={priceFields.length > 1}
              spansSeveralSchedules={field.spansSeveralSchedules}
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

type PresetPriceFieldSpec = {
  groupType: ChoreographyGroupType;
  options: PresetPriceOption[];
  spansSeveralSchedules: boolean;
};

/**
 * One price prompt per group type in the selection, each already narrowed to
 * the rows the writer would accept for the choreographies of that group type.
 */
function buildPresetPriceFields(input: {
  priceOptionsByGroupType: Record<string, PresetPriceOption[]>;
  pricingScheduleIdByChoreography: Record<string, string | null>;
  selectedRows: ChoreographyFinanceRow[];
}): PresetPriceFieldSpec[] {
  const groupTypes = [
    ...new Set(input.selectedRows.map((row) => row.groupType)),
  ].sort();

  return groupTypes.map((groupType) => {
    const scheduleIds = input.selectedRows
      .filter((row) => row.groupType === groupType)
      .map((row) => input.pricingScheduleIdByChoreography[row.id] ?? null);

    return {
      groupType,
      options: selectPresetPriceOptions({
        options: input.priceOptionsByGroupType[groupType] ?? [],
        scheduleIds,
      }),
      spansSeveralSchedules: new Set(scheduleIds).size > 1,
    };
  });
}

/**
 * The price prompt, one per group type in the selection. It is named by its
 * group type only when the selection spans more than one, since otherwise the
 * qualifier says nothing.
 *
 * It defaults to keeping the price that already resolves for each inscription,
 * which is the price the figure above was computed from. Picking a row is the
 * deliberate act of re-pricing the inscriptions that hold no money yet, and the
 * description says so, because it moves the figure.
 */
function PresetPriceField({
  groupType,
  options,
  showGroupType,
  spansSeveralSchedules,
}: {
  groupType: ChoreographyGroupType;
  options: PresetPriceOption[];
  showGroupType: boolean;
  spansSeveralSchedules: boolean;
}) {
  const fieldName = presetPriceFieldName(groupType);
  const label = showGroupType
    ? `Precio · ${formatGroupTypeLabel(groupType)}`
    : "Precio";
  const [priceId, setPriceId] = useState<string>(keepCurrentPriceValue);

  if (options.length === 0) {
    return (
      <Alert variant="warning">
        <AlertTriangle aria-hidden="true" />
        <AlertDescription>
          {spansSeveralSchedules
            ? `Las coreografías de ${formatGroupTypeLabel(groupType)} que elegiste están en cronogramas distintos y no comparten ninguna fila de precio. Cada inscripción queda con el precio que ya le rige.`
            : `No hay precios cargados para ${formatGroupTypeLabel(groupType)}. Cada inscripción queda con el precio que ya le rige.`}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Field>
      <FieldLabel htmlFor={fieldName}>{label}</FieldLabel>
      {/* Radix's `Select` is not a form control, so the picked row travels in a
          hidden input, the same way `SelectField` does it. Keeping the current
          price travels as no pick at all. */}
      <input
        type="hidden"
        name={fieldName}
        value={priceId === keepCurrentPriceValue ? "" : priceId}
      />
      <Select value={priceId} onValueChange={setPriceId}>
        <SelectTrigger id={fieldName} className="w-full">
          <SelectValue placeholder="Elegí un precio" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={keepCurrentPriceValue}>
            {keepCurrentPriceLabel}
          </SelectItem>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name} · {formatAmount(option.amount)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {priceId === keepCurrentPriceValue ? null : (
        <FieldDescription>
          Se fija en las inscripciones elegidas que todavía no tienen plata
          asignada, así que la cifra de arriba se recalcula al confirmar.
        </FieldDescription>
      )}
      {spansSeveralSchedules ? (
        <FieldDescription>
          Las coreografías elegidas están en cronogramas distintos, así que sólo
          ves los precios generales.
        </FieldDescription>
      ) : null}
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
  stage: CobroStage;
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
  stage: CobroStage,
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
