import { Plus, Trash } from "lucide-react";
import { useEffect, useMemo, type ReactNode } from "react";
import {
  useFieldArray,
  useForm,
  useWatch,
  type UseFormReturn,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { AdminResourceFormCard } from "@/components/admin/resource-layout";
import { DateOnlyField } from "@/components/shared/date-only-field";
import { IntegerInputField } from "@/components/shared/integer-input-field";
import { MultiComboboxField } from "@/components/shared/multi-combobox-field";
import { SelectField } from "@/components/shared/select-field";
import { TextInputField } from "@/components/shared/text-input-field";
import { TimeOnlyField } from "@/components/shared/time-only-field";
import { Button } from "@/components/ui/button";
import { FieldGroup, FieldSet } from "@/components/ui/field";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ScheduleActionValues } from "@/lib/admin/events/bases-action/shared.server";
import { groupTypeOptions } from "@/lib/events/group-types";
import type { ScheduleListItem } from "@/lib/events/bases.server";
import {
  createValidatedRouteSubmitHandler,
  type RouteFormPendingScope,
  useOptionalFormAction,
  useOptionalSubmit,
} from "@/lib/shared/forms";

import { EventBasesFormActions } from "../events/bases-form-actions";
import {
  createEmptyScheduleCapacityFormValues,
  describeAvailablePlaces,
  emptyScheduleCapacities,
  formatAvailablePlacesSuffix,
  resolveLiveAvailablePlaces,
  emptySelection,
  getAvailableScheduleCapacityGroupTypeOptions,
  getScheduleCategoryOptions,
  scheduleCategoriesPlaceholder,
  scheduleFormSchema,
  toScheduleCapacityFormValues,
  type ScheduleFormValues,
} from "./view-shared";
import {
  basePath,
  type EventScheduleCategoryRow,
  type EventScheduleModalityRow,
} from "./shared";

type ScheduleFormController = UseFormReturn<ScheduleFormValues>;

/**
 * The form's state, owned by the page rather than by the fields, because
 * "Guardar" lives outside the `<form>` and stays disabled until something
 * actually changed.
 */
export function useScheduleForm({
  categoryIds = emptySelection,
  modalityIds = emptySelection,
  name,
  scheduleCapacities = emptyScheduleCapacities,
  scheduledDate,
  startTime,
  submittedValues,
  totalCapacity,
}: {
  categoryIds?: string[];
  modalityIds?: string[];
  name?: string;
  scheduleCapacities?: ScheduleListItem["scheduleCapacities"];
  scheduledDate?: string;
  startTime?: string;
  submittedValues?: ScheduleActionValues;
  totalCapacity?: number;
}): ScheduleFormController {
  const defaultValues = useMemo(
    () =>
      submittedValues ?? {
        name: name ?? "",
        scheduledDate: scheduledDate ?? "",
        startTime: startTime ?? "",
        totalCapacity: totalCapacity?.toString() ?? "",
        modalityIds,
        categoryIds,
        scheduleCapacities: scheduleCapacities.map(
          toScheduleCapacityFormValues,
        ),
      },
    [
      categoryIds,
      modalityIds,
      name,
      scheduleCapacities,
      scheduledDate,
      startTime,
      submittedValues,
      totalCapacity,
    ],
  );
  const form = useForm<ScheduleFormValues>({
    resolver: zodResolver(scheduleFormSchema),
    defaultValues,
  });

  useEffect(() => {
    form.reset(defaultValues);
  }, [defaultValues, form]);

  return form;
}

export function ScheduleForm({
  categories,
  form,
  formId,
  id,
  intent,
  modalities,
  occupiedCount,
  scheduleCapacities = emptyScheduleCapacities,
}: {
  categories: EventScheduleCategoryRow[];
  form: ScheduleFormController;
  formId?: string;
  id?: string;
  intent: string;
  modalities: EventScheduleModalityRow[];
  /** Absent on the create form, where nothing can occupy the schedule yet. */
  occupiedCount?: number;
  scheduleCapacities?: ScheduleListItem["scheduleCapacities"];
}) {
  const modalityOptions = useMemo(
    () =>
      modalities.map((modality) => ({
        value: modality.id,
        label: modality.name,
      })),
    [modalities],
  );
  const occupiedCountByScheduleCapacityId = useMemo(
    () =>
      new Map(
        scheduleCapacities.map((scheduleCapacity) => [
          scheduleCapacity.id,
          scheduleCapacity.occupiedCount,
        ]),
      ),
    [scheduleCapacities],
  );
  const formAction = useOptionalFormAction();
  const submit = useOptionalSubmit();

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
        <ScheduleTextField form={form} label="Nombre" name="name" />
        <ScheduleTotalCapacityField form={form} occupiedCount={occupiedCount} />
        <DateOnlyField
          control={form.control}
          name="scheduledDate"
          id={`schedule-date-${id ?? intent}`}
          label="Fecha"
          buttonClassName="w-full"
        />
        <TimeOnlyField control={form.control} label="Hora" name="startTime" />
        <ScheduleMultipleSelectField
          className="sm:col-span-2"
          form={form}
          name="modalityIds"
          options={modalityOptions}
          title="Modalidades"
        />
        <ScheduleCategoriesField
          className="sm:col-span-2"
          categories={categories}
          form={form}
        />
      </FieldGroup>
      <ScheduleCapacitiesInlineFieldArray
        form={form}
        occupiedCountByScheduleCapacityId={occupiedCountByScheduleCapacityId}
      />
    </form>
  );
}

export function ScheduleFormActions({
  form,
  formId,
  pendingScope,
}: {
  form: ScheduleFormController;
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

export function ScheduleFormPanel({ children }: { children: ReactNode }) {
  return <AdminResourceFormCard>{children}</AdminResourceFormCard>;
}

function ScheduleTextField({
  form,
  label,
  name,
}: {
  form: ScheduleFormController;
  label: string;
  name: "name";
}) {
  return (
    <TextInputField
      control={form.control}
      id={name}
      label={label}
      name={name}
    />
  );
}

function ScheduleTotalCapacityField({
  form,
  occupiedCount,
}: {
  form: ScheduleFormController;
  occupiedCount?: number;
}) {
  const label = "Cupo total";
  const typedCapacity = useWatch({
    control: form.control,
    name: "totalCapacity",
  });
  const availablePlaces = resolveLiveAvailablePlaces({
    occupiedCount,
    typedCapacity,
  });

  return (
    <IntegerInputField
      control={form.control}
      id="totalCapacity"
      // The visible label stays just the label; the accessible name carries
      // the count that the decorative suffix cannot.
      aria-label={
        availablePlaces
          ? `${label}. ${describeAvailablePlaces(availablePlaces)}`
          : undefined
      }
      label={label}
      min={1}
      name="totalCapacity"
      step={1}
      suffix={
        availablePlaces
          ? formatAvailablePlacesSuffix(availablePlaces.availablePlaces)
          : undefined
      }
    />
  );
}

function ScheduleCapacitiesInlineFieldArray({
  form,
  occupiedCountByScheduleCapacityId,
}: {
  form: ScheduleFormController;
  occupiedCountByScheduleCapacityId: Map<string, number>;
}) {
  const { append, fields, remove } = useFieldArray({
    control: form.control,
    keyName: "fieldId",
    name: "scheduleCapacities",
  });
  const scheduleCapacityValues =
    useWatch({
      control: form.control,
      name: "scheduleCapacities",
    }) ?? [];
  const selectedGroupTypes = scheduleCapacityValues
    .map((scheduleCapacity) => scheduleCapacity.groupType)
    .filter(Boolean);
  const canAddScheduleCapacity =
    selectedGroupTypes.length < groupTypeOptions.length;

  return (
    <InlineFieldArray
      canAdd={canAddScheduleCapacity}
      fields={fields}
      onAdd={() => append(createEmptyScheduleCapacityFormValues())}
      onRemove={remove}
      renderItem={(field, index, removeItem) => (
        <ScheduleCapacityInlineFields
          occupiedCount={
            field.id
              ? occupiedCountByScheduleCapacityId.get(field.id)
              : undefined
          }
          field={field}
          form={form}
          index={index}
          options={getAvailableScheduleCapacityGroupTypeOptions(
            scheduleCapacityValues,
            index,
          )}
          onRemove={() => removeItem(index)}
        />
      )}
    />
  );
}

function InlineFieldArray<TField extends { fieldId: string }>({
  canAdd,
  fields,
  onAdd,
  onRemove,
  renderItem,
}: {
  canAdd: boolean;
  fields: TField[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  renderItem: (
    field: TField,
    index: number,
    onRemove: (index: number) => void,
  ) => ReactNode;
}) {
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
                aria-label="Dividir cupo"
                disabled={!canAdd}
                onClick={onAdd}
              >
                <Plus className="size-5" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Dividir cupo</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      {fields.length > 0 ? (
        <div className="flex flex-col gap-2">
          <div className="hidden gap-4 text-sm font-medium sm:grid sm:grid-cols-[minmax(0,1fr)_14rem_2rem]">
            <div>Tipo de grupo</div>
            <div>Cupo</div>
            <div />
          </div>
          <ul className="flex flex-col gap-3">
            {fields.map((field, index) => (
              <li key={field.fieldId}>{renderItem(field, index, onRemove)}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </FieldSet>
  );
}

function ScheduleCapacityInlineFields({
  field,
  form,
  index,
  occupiedCount,
  options,
  onRemove,
}: {
  field: { id?: string };
  form: ScheduleFormController;
  index: number;
  occupiedCount?: number;
  options: Array<{ value: string; label: string }>;
  onRemove: () => void;
}) {
  const idFieldName = `scheduleCapacities.${index}.id` as const;
  const groupTypeFieldName = `scheduleCapacities.${index}.groupType` as const;
  const capacityFieldName = `scheduleCapacities.${index}.capacity` as const;
  const typedCapacity = useWatch({
    control: form.control,
    name: capacityFieldName,
  });
  const availablePlaces = resolveLiveAvailablePlaces({
    occupiedCount,
    typedCapacity,
  });

  return (
    <FieldGroup className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_14rem_2rem] sm:items-start">
      {field.id ? (
        <input type="hidden" name={idFieldName} value={field.id} />
      ) : null}
      <SelectField
        control={form.control}
        name={groupTypeFieldName}
        label="Tipo de grupo"
        labelClassName="sr-only"
        options={options}
        placeholder="Elegí un tipo"
      />
      <IntegerInputField
        control={form.control}
        name={capacityFieldName}
        id={`schedule-capacity-capacity-${index}`}
        // The label is already sr-only here, so it is where the count the
        // decorative suffix cannot carry belongs.
        label={
          availablePlaces
            ? `Cupo. ${describeAvailablePlaces(availablePlaces)}`
            : "Cupo"
        }
        labelClassName="sr-only"
        min={1}
        step={1}
        suffix={
          availablePlaces
            ? formatAvailablePlacesSuffix(availablePlaces.availablePlaces)
            : undefined
        }
      />
      <Button
        type="button"
        variant="destructive"
        size="icon-sm"
        aria-label="Quitar cupo de cronograma"
        onClick={onRemove}
      >
        <Trash aria-hidden="true" />
      </Button>
    </FieldGroup>
  );
}

/**
 * The categories the schedule accepts. Optional: leaving it empty is the
 * schedule accepting every category, which is what the placeholder says. Only
 * the categories sharing a modality with the modalities currently selected are
 * offered, so the field follows the modalities field as it changes.
 */
function ScheduleCategoriesField({
  categories,
  className,
  form,
}: {
  categories: EventScheduleCategoryRow[];
  className?: string;
  form: ScheduleFormController;
}) {
  const selectedModalityIds = useWatch({
    control: form.control,
    name: "modalityIds",
  });
  const categoryOptions = useMemo(
    () => getScheduleCategoryOptions(categories, selectedModalityIds ?? []),
    [categories, selectedModalityIds],
  );

  return (
    <MultiComboboxField
      className={className}
      control={form.control}
      emptyMessage="Sin categorías disponibles"
      inputName="categoryIds"
      label="Categorías"
      name="categoryIds"
      options={categoryOptions}
      placeholder={scheduleCategoriesPlaceholder}
    />
  );
}

function ScheduleMultipleSelectField({
  className,
  form,
  name,
  options,
  title,
}: {
  className?: string;
  form: ScheduleFormController;
  name: "modalityIds";
  options: Array<{ value: string; label: string }>;
  title: string;
}) {
  return (
    <MultiComboboxField
      className={className}
      control={form.control}
      emptyMessage="Sin modalidades disponibles"
      inputName={name}
      label={title}
      name={name}
      options={options}
      placeholder="Seleccioná modalidades"
    />
  );
}
