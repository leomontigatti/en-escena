// PROTOTYPE — throwaway, lives only on branch `prototype/890-seminar-money-admin`.
//
// Part of the admin seminar-money prototype for wayfinder ticket #890 (map #884):
// the tier rows edited inline, with their form values and validation.
import { Plus, Trash } from "lucide-react";
import { useFieldArray, useWatch, type UseFormReturn } from "react-hook-form";
import { DateOnlyField } from "@/components/shared/date-only-field";
import { IntegerInputField } from "@/components/shared/integer-input-field";
import { Button } from "@/components/ui/button";
import { FieldDescription, FieldGroup } from "@/components/ui/field";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatAmount } from "@/lib/finances/formatters";
import { requiredFieldMessage } from "@/lib/shared/forms";
import { cn } from "@/lib/shared/utils";
import { depositFor, type TierUsage } from "./seminar-money-fixtures.prototype";

type TierFormRow = {
  tierId: string;
  paymentDeadline: string;
  participantAmount: string;
  nonParticipantAmount: string;
};

export type SeminarPrototypeFormValues = {
  instructorName: string;
  scheduledDate: string;
  startTime: string;
  quota: string;
  requiredDepositPercentage: string;
  tiers: TierFormRow[];
};

export type SeminarForm = UseFormReturn<SeminarPrototypeFormValues>;

/**
 * The tiers as inline rows, on the schedule-capacities pattern: the add button
 * centred on top, a column header, one row per tier with its remove button.
 * An empty deadline is the tier that applies once every dated one has expired.
 * The deposit each amount buys is the field's decorative suffix, as `quedan N`
 * is on the quota.
 */
export function SeminarTierRows({
  form,
  tierUsage,
}: {
  form: SeminarForm;
  tierUsage: { [tierId: string]: TierUsage };
}) {
  const { append, fields, remove } = useFieldArray({
    control: form.control,
    keyName: "fieldId",
    name: "tiers",
  });
  const rows = useWatch({ control: form.control, name: "tiers" }) ?? [];
  const rate =
    Number(
      useWatch({ control: form.control, name: "requiredDepositPercentage" }),
    ) || 0;
  const gridClassName =
    "sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_minmax(0,14rem)_2rem]";

  return (
    <div className="flex flex-col gap-3">
      <FieldDescription>
        Dejá sin fecha el precio que aplica cuando vencieron todos los demás. La
        seña de cada importe se calcula con el porcentaje del seminario.
      </FieldDescription>
      <div className="flex justify-center">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon-lg"
                aria-label="Agregar precio"
                onClick={() =>
                  append({
                    tierId: "",
                    paymentDeadline: "",
                    participantAmount: "",
                    nonParticipantAmount: "",
                  })
                }
              >
                <Plus className="size-5" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Agregar precio</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      {fields.length > 0 ? (
        <div className="flex flex-col gap-2">
          <div
            className={cn(
              "hidden gap-4 text-sm font-medium sm:grid",
              gridClassName,
            )}
          >
            <div>Fecha límite de pago</div>
            <div>Precio participante</div>
            <div>Precio no participante</div>
            <div />
          </div>
          <ul className="flex flex-col gap-3">
            {fields.map((field, index) => {
              const usage = field.tierId ? tierUsage[field.tierId] : undefined;
              const isHeld = usage?.heldByCovered ?? false;
              const referencedCount = usage?.referencedCount ?? 0;
              const row = rows[index];

              return (
                <li key={field.fieldId}>
                  <FieldGroup
                    className={cn("grid gap-4 sm:items-start", gridClassName)}
                  >
                    <DateOnlyField
                      control={form.control}
                      name={`tiers.${index}.paymentDeadline`}
                      id={`prototype-tier-deadline-${index}`}
                      label="Fecha límite de pago"
                      labelClassName="sr-only"
                      buttonClassName="w-full"
                    />
                    <IntegerInputField
                      control={form.control}
                      name={`tiers.${index}.participantAmount`}
                      id={`prototype-tier-participant-${index}`}
                      label="Precio participante"
                      labelClassName="sr-only"
                      min={1}
                      step={1}
                      disabled={isHeld}
                      suffix={formatDepositSuffix(row?.participantAmount, rate)}
                    />
                    <IntegerInputField
                      control={form.control}
                      name={`tiers.${index}.nonParticipantAmount`}
                      id={`prototype-tier-non-participant-${index}`}
                      label="Precio no participante"
                      labelClassName="sr-only"
                      min={1}
                      step={1}
                      disabled={isHeld}
                      suffix={formatDepositSuffix(
                        row?.nonParticipantAmount,
                        rate,
                      )}
                    />
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon-sm"
                              aria-label="Quitar precio"
                              disabled={referencedCount > 0}
                              onClick={() => remove(index)}
                            >
                              <Trash aria-hidden="true" />
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {referencedCount > 0
                            ? `Lo tienen guardado ${referencedCount} inscripciones: no se puede quitar.`
                            : "Quitar precio"}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </FieldGroup>
                  {isHeld ? (
                    <FieldDescription className="mt-1">
                      Hay inscripciones con la seña cubierta con este precio: el
                      importe no se puede cambiar. Agregá un precio nuevo si
                      necesitás otro.
                    </FieldDescription>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <FieldDescription className="text-center">
          Todavía no hay precios: las inscripciones se registran, pero no se
          pueden cobrar.
        </FieldDescription>
      )}
    </div>
  );
}

function formatDepositSuffix(value: string | undefined, rate: number) {
  const amount = Number(value);

  return value && amount > 0 && rate > 0
    ? ` · seña ${formatAmount(depositFor(amount, rate))}`
    : undefined;
}

export function validateTierRows(rows: TierFormRow[], form: SeminarForm) {
  let isValid = true;
  const seenDeadlines = new Set<string>();

  rows.forEach((row, index) => {
    for (const key of ["participantAmount", "nonParticipantAmount"] as const) {
      if (row[key] === "" || Number(row[key]) < 1) {
        form.setError(`tiers.${index}.${key}`, {
          message:
            row[key] === ""
              ? requiredFieldMessage
              : "Ingresá un importe mayor a cero.",
        });
        isValid = false;
      }
    }

    if (Number(row.participantAmount) > Number(row.nonParticipantAmount)) {
      form.setError(`tiers.${index}.participantAmount`, {
        message: "No puede superar al precio no participante.",
      });
      isValid = false;
    }

    const deadlineKey = row.paymentDeadline || "sin-fecha";

    if (seenDeadlines.has(deadlineKey)) {
      form.setError(`tiers.${index}.paymentDeadline`, {
        message: row.paymentDeadline
          ? "Ya hay un precio con esa fecha."
          : "Ya hay un precio sin fecha límite.",
      });
      isValid = false;
    }

    seenDeadlines.add(deadlineKey);
  });

  return isValid;
}
