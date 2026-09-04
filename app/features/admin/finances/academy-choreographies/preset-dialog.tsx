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

import type { OperationalFinanceAmount } from "@/lib/finances/operational-summary";
import {
  formatAmount,
  formatOperationalAmount,
} from "@/lib/finances/formatters";
import {
  formatKeepCurrentPriceLabel,
  sumPresetOwedAmount,
  type PresetInscription,
} from "./preset-figures";
import {
  choreographyIdFieldName,
  financePresetIntent,
  financePresetLabels,
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
 * to fix on the inscriptions that **have not covered their deposit yet**, which is
 * where the writer draws the line too: the crossing is what fixes a price, so an
 * inscription holding part of its deposit can still be re-priced.
 *
 * There is no payment picker: the money comes out of the academy's
 * `Saldo disponible`, and which payments fund it is the pool rule's business.
 * What it writes is indistinguishable from a hand-typed allocation.
 *
 * It is a dialog over a list, so the write does not redirect: the outcome comes
 * back in `fetcher.data` and is announced with a toast, and a success closes the
 * dialog over the list the loader has just revalidated.
 *
 * **The figure follows the picks.** Picking a price re-prices part of the
 * selection, so leaving the pre-filled figure at the loader's would name an
 * amount the confirm is not about to write. The picks are held here rather than
 * in each field for that reason: the figure is about all of them at once.
 */
export function FinancePresetDialog({
  availableBalanceAmount,
  inscriptions,
  onOpenChange,
  open,
  priceOptionsByGroupType,
  pricingScheduleIdByChoreography,
  selectedRows,
  stage,
}: {
  availableBalanceAmount: number;
  inscriptions: PresetInscription[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
  priceOptionsByGroupType: Record<string, PresetPriceOption[]>;
  pricingScheduleIdByChoreography: Record<string, string | null>;
  selectedRows: ChoreographyFinanceRow[];
  stage: CobroStage;
}) {
  const fetcher = useFetcher<AcademyFinancesActionData>();
  const [priceIdByGroupType, setPriceIdByGroupType] = useState<
    Record<string, string>
  >({});
  const isSaving = fetcher.state !== "idle";
  const selectedInscriptions = selectInscriptionsOf(inscriptions, selectedRows);
  const priceFields = buildPresetPriceFields({
    priceOptionsByGroupType,
    pricingScheduleIdByChoreography,
    selectedInscriptions,
    selectedRows,
  });
  const owed = sumPresetOwedAmount({
    groupTypeByChoreography: Object.fromEntries(
      selectedRows.map((row) => [row.id, row.groupType]),
    ),
    inscriptions: selectedInscriptions,
    pickedPriceByGroupType: resolvePickedPrices({
      priceFields,
      priceIdByGroupType,
    }),
    stage,
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
              keepCurrentLabel={formatKeepCurrentPriceLabel({
                inscriptions: field.inscriptions,
                options: field.options,
              })}
              onPriceIdChange={(priceId) =>
                setPriceIdByGroupType((current) => ({
                  ...current,
                  [field.groupType]: priceId,
                }))
              }
              options={field.options}
              priceId={
                priceIdByGroupType[field.groupType] ?? keepCurrentPriceValue
              }
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
                ves no es toda la deuda. Elegí un precio arriba para
                completarla.
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
  inscriptions: PresetInscription[];
  options: PresetPriceOption[];
  spansSeveralSchedules: boolean;
};

/**
 * One price prompt per group type in the selection, each already narrowed to
 * the rows the writer would accept for the choreographies of that group type,
 * and carrying the inscriptions it is about so it can name the price they are
 * on today.
 */
function buildPresetPriceFields(input: {
  priceOptionsByGroupType: Record<string, PresetPriceOption[]>;
  pricingScheduleIdByChoreography: Record<string, string | null>;
  selectedInscriptions: PresetInscription[];
  selectedRows: ChoreographyFinanceRow[];
}): PresetPriceFieldSpec[] {
  const groupTypes = [
    ...new Set(input.selectedRows.map((row) => row.groupType)),
  ].sort();

  return groupTypes.map((groupType) => {
    const rows = input.selectedRows.filter(
      (row) => row.groupType === groupType,
    );
    const scheduleIds = rows.map(
      (row) => input.pricingScheduleIdByChoreography[row.id] ?? null,
    );

    return {
      groupType,
      inscriptions: selectInscriptionsOf(input.selectedInscriptions, rows),
      options: selectPresetPriceOptions({
        options: input.priceOptionsByGroupType[groupType] ?? [],
        scheduleIds,
      }),
      spansSeveralSchedules: new Set(scheduleIds).size > 1,
    };
  });
}

/** The inscriptions of a set of choreographies, in the order they arrived. */
function selectInscriptionsOf(
  inscriptions: PresetInscription[],
  rows: ChoreographyFinanceRow[],
): PresetInscription[] {
  const choreographyIds = new Set(rows.map((row) => row.id));

  return inscriptions.filter((inscription) =>
    choreographyIds.has(inscription.choreographyId),
  );
}

/**
 * The picked row per group type, resolved against what that field actually
 * offers. Keeping the current price is *not* a pick — it travels as no entry at
 * all, the same way it travels to the server — so the projection and the write
 * agree on what a default confirm does: nothing to the prices.
 */
function resolvePickedPrices(input: {
  priceFields: PresetPriceFieldSpec[];
  priceIdByGroupType: Record<string, string>;
}): Record<string, PresetPriceOption> {
  const picked: Record<string, PresetPriceOption> = {};

  for (const field of input.priceFields) {
    const option = field.options.find(
      (candidate) => candidate.id === input.priceIdByGroupType[field.groupType],
    );

    if (option) {
      picked[field.groupType] = option;
    }
  }

  return picked;
}

/**
 * The price prompt, one per group type in the selection. It is named by its
 * group type only when the selection spans more than one, since otherwise the
 * qualifier says nothing.
 *
 * It defaults to keeping the price that already resolves for each inscription,
 * which is the price the figure above was computed from. The default names that
 * price whenever the inscriptions agree on one, so the reader can compare it
 * against the rows below without leaving the dialog.
 *
 * Picking a row is the deliberate act of re-pricing the inscriptions that have
 * not covered their deposit yet — money on the row does not spare it, only the
 * crossing does — and the description says so, because that is the part of the
 * selection the pick reaches.
 */
function PresetPriceField({
  groupType,
  keepCurrentLabel,
  onPriceIdChange,
  options,
  priceId,
  showGroupType,
  spansSeveralSchedules,
}: {
  groupType: ChoreographyGroupType;
  keepCurrentLabel: string;
  onPriceIdChange: (priceId: string) => void;
  options: PresetPriceOption[];
  priceId: string;
  showGroupType: boolean;
  spansSeveralSchedules: boolean;
}) {
  const fieldName = presetPriceFieldName(groupType);
  const label = showGroupType
    ? `Precio · ${formatGroupTypeLabel(groupType)}`
    : "Precio";

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
      <Select value={priceId} onValueChange={onPriceIdChange}>
        <SelectTrigger id={fieldName} className="w-full">
          <SelectValue placeholder="Elegí un precio" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={keepCurrentPriceValue}>
            {keepCurrentLabel}
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
          Se fija en las inscripciones elegidas que todavía no cubrieron su
          seña. Las que ya la cubrieron quedan con el precio que tienen.
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
 *
 * The owed figure is the projection against the current picks and not the
 * loader's, so it is always the amount the button below is about to move.
 */
function PresetTotals({
  availableBalanceAmount,
  owedAmount,
  stage,
}: {
  availableBalanceAmount: number;
  owedAmount: OperationalFinanceAmount;
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
