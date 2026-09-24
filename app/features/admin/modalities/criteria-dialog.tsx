import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useFieldArray, useForm, type UseFormReturn } from "react-hook-form";

import { IntegerInputField } from "@/components/shared/integer-input-field";
import { SelectField } from "@/components/shared/select-field";
import { TextInputField } from "@/components/shared/text-input-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import {
  addingCriteriaTotal,
  addingCriteriaTotalMessage,
  sumAddingCriteriaMaxima,
} from "@/lib/judging/criteria";
import {
  createValidatedRouteSubmitHandler,
  useOptionalFormAction,
  useOptionalSubmit,
} from "@/lib/shared/forms";

import type {
  EventSubmodalityCriterionRow,
  EventSubmodalityRow,
} from "./shared";
import {
  submodalityCriteriaFormSchema,
  type SubmodalityCriteriaFormValues,
} from "./view-shared";

const emptyCriteriaCopy =
  "Sin criterios, se puntúa con un único valor de 0 a 100";

const lockedCriteriaCopy =
  "Esta submodalidad ya tiene puntajes, así que sus criterios no se pueden cambiar.";

const kindOptions = [
  { value: "adds", label: "Suma" },
  { value: "deducts", label: "Descuenta" },
] as const;

type CriteriaFormController = UseFormReturn<SubmodalityCriteriaFormValues>;

type SubmodalityCriteriaDialogProps = {
  criteria: EventSubmodalityCriterionRow[];
  locked?: boolean;
  modalityId: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  submodality: EventSubmodalityRow;
};

/**
 * Where a submodality's scoring sheet is defined. The counter against 100 is
 * live because the total is the whole point of the screen: a sheet whose adding
 * maxima do not reach 100 could never give a 100, so the administrator has to
 * see the shortfall while distributing it rather than on submitting.
 */
export function SubmodalityCriteriaDialog({
  criteria,
  locked = false,
  modalityId,
  onOpenChange,
  open,
  submodality,
}: SubmodalityCriteriaDialogProps) {
  const form = useSubmodalityCriteriaForm(criteria);
  const { append, fields, remove } = useFieldArray({
    control: form.control,
    keyName: "fieldId",
    name: "criteria",
  });
  const formAction = useOptionalFormAction();
  const submit = useOptionalSubmit();
  const watchedCriteria = form.watch("criteria");
  const addingTotal = sumAddingCriteriaMaxima(watchedCriteria ?? []);
  const totalInvalid = fields.length > 0 && addingTotal !== addingCriteriaTotal;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{`Criterios de ${submodality.name}`}</DialogTitle>
          <DialogDescription>
            {fields.length === 0 ? emptyCriteriaCopy : null}
          </DialogDescription>
        </DialogHeader>
        {locked ? (
          <Alert variant="destructive">
            <AlertDescription>{lockedCriteriaCopy}</AlertDescription>
          </Alert>
        ) : null}
        <form
          id={`submodality-criteria-form-${submodality.id}`}
          method="post"
          className="flex w-full flex-col gap-4"
          onSubmit={createValidatedRouteSubmitHandler(form, submit, formAction)}
        >
          <input
            type="hidden"
            name="intent"
            value="save-submodality-criteria"
          />
          <input type="hidden" name="id" value={submodality.id} />
          <input type="hidden" name="modalityId" value={modalityId} />
          <FieldSet>
            <ul className="flex flex-col gap-3">
              {fields.map((field, index) => (
                <li key={field.fieldId}>
                  <CriterionFields
                    disabled={locked}
                    form={form}
                    index={index}
                    onRemove={() => remove(index)}
                  />
                </li>
              ))}
            </ul>
            <AddingTotalCounter invalid={totalInvalid} total={addingTotal} />
          </FieldSet>
        </form>
        <DialogFooter className="sm:justify-between">
          {locked ? null : (
            <Button
              type="button"
              variant="outline"
              onClick={() => append({ kind: "adds", maximum: "", name: "" })}
            >
              <Plus aria-hidden="true" />
              Agregar criterio
            </Button>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {locked ? "Cerrar" : "Cancelar"}
            </Button>
            {locked ? null : (
              <Button
                type="submit"
                form={`submodality-criteria-form-${submodality.id}`}
              >
                Guardar
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The counter and its label, red together: the label names what is being
 * counted, so leaving it black while the number turns red would read as if the
 * number were the only thing at fault. The `Field` is what makes them red — it
 * carries the invalid state its own error message hangs off, exactly as a field
 * with an input does.
 */
function AddingTotalCounter({
  invalid,
  total,
}: {
  invalid: boolean;
  total: number;
}) {
  return (
    <Field data-adding-total data-invalid={invalid ? "true" : undefined}>
      <div className="flex items-center justify-between gap-2">
        <FieldTitle>Suman</FieldTitle>
        <span className="text-sm font-medium" role="status">
          {`${total} / ${addingCriteriaTotal}`}
        </span>
      </div>
      <FieldError>{invalid ? addingCriteriaTotalMessage : null}</FieldError>
    </Field>
  );
}

function CriterionFields({
  disabled,
  form,
  index,
  onRemove,
}: {
  disabled: boolean;
  form: CriteriaFormController;
  index: number;
  onRemove: () => void;
}) {
  return (
    <FieldGroup className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_7rem_9rem_2rem] sm:items-start">
      <TextInputField
        control={form.control}
        disabled={disabled}
        id={`criterion-name-${index}`}
        label="Criterio"
        labelClassName="sr-only"
        name={`criteria.${index}.name`}
      />
      <IntegerInputField
        control={form.control}
        disabled={disabled}
        id={`criterion-maximum-${index}`}
        label="Máximo"
        labelClassName="sr-only"
        name={`criteria.${index}.maximum`}
      />
      <SelectField
        control={form.control}
        disabled={disabled}
        id={`criterion-kind-${index}`}
        label="Suma o descuenta"
        labelClassName="sr-only"
        name={`criteria.${index}.kind`}
        options={kindOptions}
      />
      {disabled ? null : (
        <Button
          type="button"
          variant="destructive"
          size="icon-sm"
          aria-label="Quitar criterio"
          onClick={onRemove}
        >
          <Trash aria-hidden="true" />
        </Button>
      )}
    </FieldGroup>
  );
}

function useSubmodalityCriteriaForm(
  criteria: EventSubmodalityCriterionRow[],
): CriteriaFormController {
  const defaultValues = useMemo(
    (): SubmodalityCriteriaFormValues => ({
      criteria: criteria.map((criterion) => ({
        kind: criterion.kind,
        maximum: String(criterion.maximum),
        name: criterion.name,
      })),
    }),
    [criteria],
  );
  const form = useForm<SubmodalityCriteriaFormValues>({
    defaultValues,
    mode: "onSubmit",
    resolver: zodResolver(submodalityCriteriaFormSchema),
  });

  useEffect(() => {
    form.reset(defaultValues);
  }, [defaultValues, form]);

  return form;
}
