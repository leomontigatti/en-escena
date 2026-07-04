import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { IntegerInputField } from "@/components/shared/integer-input-field";
import { MultiComboboxField } from "@/components/shared/multi-combobox-field";
import { TextInputField } from "@/components/shared/text-input-field";
import { FieldGroup } from "@/components/ui/field";
import type {
  ActionData,
  CategoryActionValues,
} from "@/lib/admin/events/bases-action/shared.server";
import { experienceLevelOptions } from "@/lib/events/experience-levels";
import { groupTypeOptions } from "@/lib/events/group-types";
import {
  createValidatedRouteSubmitHandler,
  requiredFieldMessage,
  type RouteFormPendingScope,
  useOptionalFormAction,
  useOptionalSubmit,
} from "@/lib/shared/forms";

import { EventBasesFormActions } from "../events/bases-form-actions";
import { basePath, type ModalityRow } from "./shared";

const categoryFormSchema = z
  .object({
    name: z.string().trim().min(1, requiredFieldMessage),
    minAge: z
      .string()
      .min(1, requiredFieldMessage)
      .refine(
        (value) => Number.isInteger(Number(value)) && Number(value) >= 0,
        {
          message: "Ingresá una edad válida.",
        },
      ),
    maxAge: z
      .string()
      .min(1, requiredFieldMessage)
      .refine(
        (value) => Number.isInteger(Number(value)) && Number(value) >= 0,
        {
          message: "Ingresá una edad válida.",
        },
      ),
    groupTypes: z.array(z.string()).min(1, requiredFieldMessage),
    modalityIds: z.array(z.string()).min(1, requiredFieldMessage),
    experienceLevels: z.array(z.string()),
  })
  .superRefine((values, context) => {
    const minAge = Number(values.minAge);
    const maxAge = Number(values.maxAge);

    if (
      Number.isInteger(minAge) &&
      Number.isInteger(maxAge) &&
      maxAge < minAge
    ) {
      context.addIssue({
        code: "custom",
        message: "La edad máxima debe ser mayor o igual a la mínima.",
        path: ["maxAge"],
      });
    }
  });

type CategoryFormValues = z.infer<typeof categoryFormSchema>;

const emptyCategorySelection: string[] = [];

function CategoryForm({
  experienceLevels = emptyCategorySelection,
  formId,
  groupTypes = emptyCategorySelection,
  id,
  intent,
  maxAge,
  minAge,
  modalities,
  modalityIds = emptyCategorySelection,
  name,
  submittedValues,
}: {
  experienceLevels?: string[];
  formId: string;
  groupTypes?: string[];
  id?: string;
  intent: string;
  maxAge?: number;
  minAge?: number;
  modalities: ModalityRow[];
  modalityIds?: string[];
  name?: string;
  submittedValues?: CategoryActionValues;
}) {
  const defaultValues = useMemo(
    () =>
      submittedValues ?? {
        name: name ?? "",
        minAge: minAge === undefined ? "" : String(minAge),
        maxAge: maxAge === undefined ? "" : String(maxAge),
        groupTypes,
        modalityIds,
        experienceLevels,
      },
    [
      experienceLevels,
      groupTypes,
      maxAge,
      minAge,
      modalityIds,
      name,
      submittedValues,
    ],
  );
  const form = useForm<CategoryFormValues>({
    defaultValues,
    mode: "onSubmit",
    resolver: zodResolver(categoryFormSchema),
  });
  const formAction = useOptionalFormAction();
  const submit = useOptionalSubmit();

  useEffect(() => {
    form.reset(defaultValues);
  }, [defaultValues, form]);

  return (
    <form
      id={formId}
      method="post"
      className="flex w-full flex-col gap-5"
      onSubmit={createValidatedRouteSubmitHandler(form, submit, formAction)}
    >
      <input type="hidden" name="intent" value={intent} />
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <TextInputField
          control={form.control}
          label="Nombre"
          name="name"
          placeholder="Ingresá el nombre de la categoría"
        />
        <IntegerInputField
          control={form.control}
          label="Edad mínima"
          min="0"
          name="minAge"
          placeholder="Inclusive"
        />
        <IntegerInputField
          control={form.control}
          label="Edad máxima"
          min="0"
          name="maxAge"
          placeholder="Inclusive"
        />
        <MultiComboboxField
          control={form.control}
          label="Tipos de grupo"
          name="groupTypes"
          inputName="groupTypes"
          options={groupTypeOptions}
          placeholder="Seleccioná tipos de grupo"
        />
        <MultiComboboxField
          control={form.control}
          label="Niveles de experiencia"
          name="experienceLevels"
          inputName="experienceLevels"
          options={experienceLevelOptions}
          placeholder="Seleccioná niveles"
        />
        <MultiComboboxField
          control={form.control}
          label="Modalidades"
          name="modalityIds"
          inputName="modalityIds"
          options={modalities.map((modality) => ({
            value: modality.id,
            label: modality.name,
          }))}
          className="sm:col-span-2"
          placeholder="Seleccioná modalidades"
        />
      </FieldGroup>
    </form>
  );
}

function CategoryFormActions({
  formId,
  pendingScope,
}: {
  formId: string;
  pendingScope: RouteFormPendingScope;
}) {
  return (
    <EventBasesFormActions
      basePath={basePath}
      className="flex items-center justify-end gap-2"
      formId={formId}
      pendingScope={pendingScope}
    />
  );
}

function getCategorySubmittedValues(
  actionData: ActionData | undefined,
  intent: string,
  recordId?: string,
) {
  if (
    actionData?.scope?.intent !== intent ||
    actionData.scope.recordId !== recordId ||
    !isCategoryActionValues(actionData.values)
  ) {
    return undefined;
  }

  return actionData.values;
}

function isCategoryActionValues(
  values: ActionData["values"] | undefined,
): values is CategoryActionValues {
  return (
    values !== undefined &&
    "minAge" in values &&
    "maxAge" in values &&
    "modalityIds" in values &&
    "experienceLevels" in values
  );
}

export { CategoryForm, getCategorySubmittedValues, CategoryFormActions };
