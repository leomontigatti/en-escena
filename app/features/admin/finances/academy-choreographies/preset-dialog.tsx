import { zodResolver } from "@hookform/resolvers/zod";
import { Check, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm, useWatch, type Control } from "react-hook-form";
import { useFetcher } from "react-router";
import { z } from "zod";

import { SelectField } from "@/components/shared/select-field";

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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import type { CobroStage } from "@/lib/finances/choreography-cobro-presets.server";
import {
  formatGroupTypeLabel,
  type ChoreographyGroupType,
} from "@/lib/portal/choreographies";
import { createValidatedReactRouterSubmitHandler } from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";

import type { OperationalFinanceAmount } from "@/lib/finances/operational-summary";
import {
  formatAmount,
  formatOperationalAmount,
} from "@/lib/finances/formatters";
import {
  hasRePriceableInscription,
  resolveCurrentPriceId,
  sumPresetOwedAmount,
  type PresetInscription,
} from "./preset-figures";
import {
  choreographyIdFieldName,
  financePresetIntent,
  financePresetLabels,
  presetPriceFieldName,
  selectPresetPriceOptions,
  type PresetPriceOption,
} from "./presets";
import type { AcademyFinancesActionData } from "./server";
import type { AcademyFinancesLoaderData } from "./types";

type ChoreographyFinanceRow =
  AcademyFinancesLoaderData["choreographyFinanceRows"][number];

/**
 * One pick per price prompt, keyed by the field name the writer reads
 * (`presetPriceFieldName`). Empty is a valid answer: it leaves every price
 * where it is.
 */
const presetPricesFormSchema = z.record(z.string(), z.string());

type PresetPricesFormValues = z.input<typeof presetPricesFormSchema>;

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
 * amount the confirm is not about to write. The figure watches every pick at
 * once, because it is about all of them.
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
  const selectedInscriptions = selectInscriptionsOf(inscriptions, selectedRows);
  const priceFields = buildPresetPriceFields({
    priceOptionsByGroupType,
    pricingScheduleIdByChoreography,
    selectedInscriptions,
    selectedRows,
  });
  // Seeded once: the dialog mounts on a selection that cannot change under it,
  // so re-seeding could only undo what the administrator has picked since.
  const [defaultPriceIds] = useState(() => resolveDefaultPriceIds(priceFields));
  const form = useForm<PresetPricesFormValues>({
    defaultValues: buildPresetPriceDefaults({ defaultPriceIds, priceFields }),
    resolver: zodResolver(presetPricesFormSchema),
  });
  const picks = useWatch({ control: form.control });
  // A field with no picker keeps the price it opened on, which is still the one
  // its figure is computed from.
  const priceIdByGroupType = {
    ...defaultPriceIds,
    ...Object.fromEntries(
      priceFields
        .filter((field) => isPresetPricePicker(field))
        .map((field) => [
          field.groupType,
          picks[presetPriceFieldName(field.groupType)] ?? "",
        ]),
    ),
  };
  const isSaving = fetcher.state !== "idle";
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{financePresetLabels[stage]}</DialogTitle>
          <DialogDescription>
            {selectedRows.length === 1
              ? "1 coreografía elegida."
              : `${selectedRows.length} coreografías elegidas.`}{" "}
            Sale del saldo disponible de la academia y se asigna a cada
            inscripción lo que adeuda. El precio elegido se fija en las que
            todavía no cubrieron su seña; las que ya la cubrieron quedan con el
            que tienen.
          </DialogDescription>
        </DialogHeader>

        <form
          method="post"
          noValidate
          onSubmit={createValidatedReactRouterSubmitHandler(
            form,
            fetcher.submit,
            { method: "post" },
          )}
          className="flex flex-col gap-4"
        >
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
              canRePrice={hasRePriceableInscription(field.inscriptions)}
              control={form.control}
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
              <TriangleAlert aria-hidden="true" />
              <AlertTitle>Deuda incompleta</AlertTitle>
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
                <Spinner aria-hidden="true" data-icon="inline-start" />
              ) : (
                <Check aria-hidden="true" data-icon="inline-start" />
              )}
              Asignar
            </Button>
          </DialogFooter>
        </form>
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
 * Whether the field asks for a price at all: it does only when a pick would
 * reach an inscription and there is a row to pick. The others render a note and
 * post nothing.
 */
function isPresetPricePicker(field: PresetPriceFieldSpec) {
  return (
    hasRePriceableInscription(field.inscriptions) && field.options.length > 0
  );
}

/**
 * The form's starting picks: one entry per picker, on the row it opens on or
 * empty, so the post carries exactly the fields shown.
 */
function buildPresetPriceDefaults(input: {
  defaultPriceIds: Record<string, string>;
  priceFields: PresetPriceFieldSpec[];
}): PresetPricesFormValues {
  return Object.fromEntries(
    input.priceFields
      .filter((field) => isPresetPricePicker(field))
      .map((field) => [
        presetPriceFieldName(field.groupType),
        input.defaultPriceIds[field.groupType] ?? "",
      ]),
  );
}

/**
 * What each picker opens on: the row that applies today to the inscriptions the
 * pick would reach. A field with no single such row is left out and opens empty,
 * which travels to the server as no pick at all.
 */
function resolveDefaultPriceIds(
  priceFields: PresetPriceFieldSpec[],
): Record<string, string> {
  const defaults: Record<string, string> = {};

  for (const field of priceFields) {
    const priceId = resolveCurrentPriceId({
      inscriptions: field.inscriptions,
      options: field.options,
    });

    if (priceId) {
      defaults[field.groupType] = priceId;
    }
  }

  return defaults;
}

/**
 * The picked row per group type, resolved against what that field actually
 * offers. An empty picker resolves to no entry at all, the same way it travels
 * to the server, so the projection and the write agree on what it means.
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
 * **It opens on the price that applies today**, which is the one the figure
 * above was computed from, so confirming without touching it charges what the
 * dialog already says. There is no row for *keep the current price*: it was the
 * same statement made twice, and the one that named no figure.
 *
 * The picker is empty only when there is no single price to open on — the
 * inscriptions sit on different rows, or the row in force is not among the ones
 * offered — and submitting it that way leaves every price where it is. The far
 * commoner reason to have nothing to open on, a selection whose inscriptions
 * have all covered their deposit, is not a picker at all: see the early return.
 *
 * Picking another row re-prices the inscriptions that have not covered their
 * deposit yet — money on the row does not spare it, only the crossing does. That
 * rule is stated in the dialog's subtitle and not here: it is the same sentence
 * for every field, so a selection spanning three group types said it three
 * times. What stays field-level is the note about spanning schedules, which is
 * about the rows *this* picker offers and is true of one field at a time.
 */
function PresetPriceField({
  canRePrice,
  control,
  groupType,
  options,
  showGroupType,
  spansSeveralSchedules,
}: {
  canRePrice: boolean;
  control: Control<PresetPricesFormValues>;
  groupType: ChoreographyGroupType;
  options: PresetPriceOption[];
  showGroupType: boolean;
  spansSeveralSchedules: boolean;
}) {
  const fieldName = presetPriceFieldName(groupType);
  const label = showGroupType
    ? `Precio · ${formatGroupTypeLabel(groupType)}`
    : "Precio";

  // Nothing a pick could reach, so there is no question to ask. It comes before
  // the missing-rows warning on purpose: which rows the catalogue offers cannot
  // matter to a selection no row would touch.
  if (!canRePrice) {
    return (
      <Field>
        <FieldLabel>{label}</FieldLabel>
        <FieldDescription>
          Las inscripciones elegidas ya cubrieron su seña, así que su precio no
          cambia.
        </FieldDescription>
      </Field>
    );
  }

  if (options.length === 0) {
    return (
      <Alert variant="warning">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>
          {spansSeveralSchedules
            ? "Sin precio en común"
            : "Sin precios cargados"}
        </AlertTitle>
        <AlertDescription>
          {spansSeveralSchedules
            ? `Las coreografías de ${formatGroupTypeLabel(groupType)} que elegiste están en cronogramas distintos y no comparten ninguna fila de precio. Cada inscripción queda con el precio que ya le rige.`
            : `No hay precios cargados para ${formatGroupTypeLabel(groupType)}. Cada inscripción queda con el precio que ya le rige.`}
        </AlertDescription>
      </Alert>
    );
  }

  // An empty picker travels as no pick at all, which the writer reads as
  // leaving every price where it is.
  return (
    <SelectField
      control={control}
      description={
        spansSeveralSchedules
          ? "Las coreografías elegidas están en cronogramas distintos, así que sólo ves los precios generales."
          : undefined
      }
      id={fieldName}
      label={label}
      name={fieldName}
      options={options.map((option) => ({
        label: `${option.name} · ${formatAmount(option.amount)}`,
        value: option.id,
      }))}
      placeholder="Elegí un precio"
    />
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
