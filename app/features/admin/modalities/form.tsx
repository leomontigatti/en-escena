import { zodResolver } from "@hookform/resolvers/zod";
import { ListChecks, Plus, Trash } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useFieldArray, useForm, type UseFormReturn } from "react-hook-form";

import { AdminResourceFormCard } from "@/components/admin/resource-layout";
import { TextInputField } from "@/components/shared/text-input-field";
import { Button } from "@/components/ui/button";
import { FieldGroup, FieldSet, FieldTitle } from "@/components/ui/field";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  ActionData,
  ModalityActionValues,
  NameActionValues,
} from "@/lib/admin/events/bases-action/shared.server";
import {
  createValidatedRouteSubmitHandler,
  type RouteFormPendingScope,
  useOptionalFormAction,
  useOptionalSubmit,
} from "@/lib/shared/forms";

import { EventBasesFormActions } from "../events/bases-form-actions";
import { SubmodalityCriteriaDialog } from "./criteria-dialog";
import {
  basePath,
  type EventSubmodalityCriterionRow,
  type EventSubmodalityRow,
} from "./shared";
import { modalityFormSchema, type ModalityFormValues } from "./view-shared";

type ModalityFormController = UseFormReturn<ModalityFormValues>;

const emptySubmodalities: EventSubmodalityRow[] = [];

/**
 * The form's state, owned by the page rather than by the fields, because
 * "Guardar" lives outside the `<form>` and stays disabled until something
 * actually changed.
 */
function useEventModalityForm({
  name,
  submodalities = emptySubmodalities,
  submittedValues,
}: {
  name?: string;
  submodalities?: EventSubmodalityRow[];
  submittedValues?: NameActionValues | ModalityActionValues;
}): ModalityFormController {
  const defaultValues = useMemo(
    (): ModalityFormValues => ({
      name: submittedValues?.name ?? name ?? "",
      submodalities:
        submittedValues && "submodalities" in submittedValues
          ? submittedValues.submodalities
          : submodalities.map(toSubmodalityFormValues),
    }),
    [name, submodalities, submittedValues],
  );
  const form = useForm<ModalityFormValues>({
    defaultValues,
    mode: "onSubmit",
    resolver: zodResolver(modalityFormSchema),
  });

  useEffect(() => {
    form.reset(defaultValues);
  }, [defaultValues, form]);

  return form;
}

function ModalityForm({
  criteriaSetup,
  form,
  formId,
  id,
  intent,
}: {
  criteriaSetup?: SubmodalityCriteriaSetup;
  form: ModalityFormController;
  formId: string;
  id?: string;
  intent: string;
}) {
  const formAction = useOptionalFormAction();
  const submit = useOptionalSubmit();

  return (
    <form
      id={formId}
      method="post"
      className="flex w-full flex-col gap-4"
      onSubmit={createValidatedRouteSubmitHandler(form, submit, formAction)}
    >
      <input type="hidden" name="intent" value={intent} />
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <input type="hidden" name="submodalitiesMode" value="replace" />
      <NameField form={form} id="modality-name" />
      <SubmodalitiesInlineFieldArray
        criteriaSetup={criteriaSetup}
        form={form}
      />
    </form>
  );
}

function NameField({ form, id }: { form: ModalityFormController; id: string }) {
  return (
    <TextInputField control={form.control} id={id} label="Nombre" name="name" />
  );
}

function ModalityFormActions({
  form,
  formId,
  pendingScope,
}: {
  form: ModalityFormController;
  formId: string;
  pendingScope: RouteFormPendingScope;
}) {
  return (
    <EventBasesFormActions
      basePath={basePath}
      control={form.control}
      formId={formId}
      pendingScope={pendingScope}
    />
  );
}

function ModalityFormPanel({ children }: { children: ReactNode }) {
  return <AdminResourceFormCard>{children}</AdminResourceFormCard>;
}

/**
 * What the criteria dialog needs from the page: the modality the rows belong to,
 * the event's criteria and which submodalities are locked. It is optional so the
 * create form, whose submodalities have no id yet, renders without it.
 */
type SubmodalityCriteriaSetup = {
  criteria: EventSubmodalityCriterionRow[];
  lockedSubmodalityIds: string[];
  modalityId: string;
  submodalities: EventSubmodalityRow[];
};

function SubmodalitiesInlineFieldArray({
  criteriaSetup,
  form,
}: {
  criteriaSetup?: SubmodalityCriteriaSetup;
  form: ModalityFormController;
}) {
  const { append, fields, remove } = useFieldArray({
    control: form.control,
    keyName: "fieldId",
    name: "submodalities",
  });

  return (
    <FieldSet>
      <div className="flex justify-center">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon-lg"
                aria-label="Agregar submodalidad"
                onClick={() => append(createEmptySubmodalityFormValues())}
              >
                <Plus aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Agregar submodalidad</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      {fields.length > 0 ? (
        <>
          <FieldTitle>Submodalidades</FieldTitle>
          <ul className="flex flex-col gap-3">
            {fields.map((field, index) => (
              <li key={field.fieldId}>
                <SubmodalityInlineFields
                  criteriaSetup={criteriaSetup}
                  field={field}
                  form={form}
                  index={index}
                  onRemove={() => remove(index)}
                />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </FieldSet>
  );
}

function SubmodalityInlineFields({
  criteriaSetup,
  field,
  form,
  index,
  onRemove,
}: {
  criteriaSetup?: SubmodalityCriteriaSetup;
  field: { id?: string };
  form: ModalityFormController;
  index: number;
  onRemove: () => void;
}) {
  const idFieldName = `submodalities.${index}.id` as const;
  const nameFieldName = `submodalities.${index}.name` as const;

  return (
    <FieldGroup className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_2rem_2rem] sm:items-start">
      {field.id ? (
        <input type="hidden" name={idFieldName} value={field.id} />
      ) : null}
      <TextInputField
        control={form.control}
        name={nameFieldName}
        id={`submodality-name-${index}`}
        label="Submodalidad"
        labelClassName="sr-only"
      />
      {field.id && criteriaSetup ? (
        <SubmodalityCriteriaAction
          criteriaSetup={criteriaSetup}
          submodalityId={field.id}
        />
      ) : null}
      <Button
        type="button"
        variant="destructive"
        size="icon-sm"
        aria-label="Quitar submodalidad"
        onClick={onRemove}
      >
        <Trash aria-hidden="true" />
      </Button>
    </FieldGroup>
  );
}

function SubmodalityCriteriaAction({
  criteriaSetup,
  submodalityId,
}: {
  criteriaSetup: SubmodalityCriteriaSetup;
  submodalityId: string;
}) {
  const [open, setOpen] = useState(false);
  const submodality = criteriaSetup.submodalities.find(
    (record) => record.id === submodalityId,
  );

  if (!submodality) {
    return null;
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-label={`Criterios de ${submodality.name}`}
        onClick={() => setOpen(true)}
      >
        <ListChecks aria-hidden="true" />
      </Button>
      <SubmodalityCriteriaDialog
        criteria={criteriaSetup.criteria.filter(
          (criterion) => criterion.submodalityId === submodalityId,
        )}
        locked={criteriaSetup.lockedSubmodalityIds.includes(submodalityId)}
        modalityId={criteriaSetup.modalityId}
        onOpenChange={setOpen}
        open={open}
        submodality={submodality}
      />
    </>
  );
}

function getNameSubmittedValues(
  actionData: ActionData | undefined,
  intent: string,
  recordId?: string,
  parentRecordId?: string,
) {
  if (
    actionData?.scope?.intent !== intent ||
    actionData.scope.recordId !== recordId ||
    actionData.scope.parentRecordId !== parentRecordId ||
    !isNameActionValues(actionData.values)
  ) {
    return undefined;
  }

  return actionData.values;
}

function getModalitySubmittedValues(
  actionData: ActionData | undefined,
  modalityId: string,
) {
  const submittedValues = getNameSubmittedValues(
    actionData,
    "update-modality",
    modalityId,
  );

  if (!submittedValues) {
    return undefined;
  }

  return {
    name: submittedValues.name,
    submodalities:
      "submodalities" in submittedValues ? submittedValues.submodalities : [],
  };
}

function isNameActionValues(
  values: ActionData["values"] | undefined,
): values is NameActionValues | ModalityActionValues {
  return values !== undefined && "name" in values;
}

function createEmptySubmodalityFormValues(): ModalityFormValues["submodalities"][number] {
  return {
    name: "",
  };
}

function toSubmodalityFormValues(
  submodality: EventSubmodalityRow,
): ModalityFormValues["submodalities"][number] {
  return {
    id: submodality.id,
    name: submodality.name,
  };
}

export {
  getModalitySubmittedValues,
  getNameSubmittedValues,
  ModalityForm,
  ModalityFormActions,
  ModalityFormPanel,
  useEventModalityForm,
};
