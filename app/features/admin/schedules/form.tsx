import { Link } from "react-router";
import { Clock, Plus, Trash } from "lucide-react";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
  type UseFormReturn,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { AdminResourceFormCard } from "@/components/admin/resource-layout";
import { SubmitButton } from "@/components/shared/action-buttons";
import { DateOnlyField } from "@/components/shared/date-only-field";
import { IntegerInput } from "@/components/shared/integer-input-field";
import { MultiCombobox } from "@/components/shared/multi-combobox";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  isRouteFormPending,
  type RouteFormPendingScope,
  useOptionalFormAction,
  useOptionalNavigation,
  useOptionalSubmit,
} from "@/lib/shared/forms";
import { buildListPath } from "@/lib/shared/navigation";

import {
  createEmptyScheduleCapacityFormValues,
  emptyScheduleCapacities,
  emptySelection,
  getAvailableScheduleCapacityGroupTypeOptions,
  parseTimeValue,
  scheduleFormSchema,
  timePickerHourOptions,
  timePickerMinuteOptions,
  toScheduleCapacityFormValues,
  type ScheduleFormValues,
} from "./view-shared";
import { basePath, type EventScheduleModalityRow } from "./shared";

type ScheduleFormController = UseFormReturn<ScheduleFormValues>;

export function ScheduleForm({
  formId,
  id,
  intent,
  modalities,
  modalityIds = emptySelection,
  name,
  scheduleCapacities = emptyScheduleCapacities,
  scheduledDate,
  startTime,
  submittedValues,
  totalCapacity,
}: {
  formId?: string;
  id?: string;
  intent: string;
  modalities: EventScheduleModalityRow[];
  modalityIds?: string[];
  name?: string;
  scheduleCapacities?: ScheduleListItem["scheduleCapacities"];
  scheduledDate?: string;
  startTime?: string;
  submittedValues?: ScheduleActionValues;
  totalCapacity?: number;
}) {
  const modalityOptions = useMemo(
    () =>
      modalities.map((modality) => ({
        value: modality.id,
        label: modality.name,
      })),
    [modalities],
  );
  const defaultValues = useMemo(
    () =>
      submittedValues ?? {
        name: name ?? "",
        scheduledDate: scheduledDate ?? "",
        startTime: startTime ?? "",
        totalCapacity: totalCapacity?.toString() ?? "",
        modalityIds,
        scheduleCapacities: scheduleCapacities.map(
          toScheduleCapacityFormValues,
        ),
      },
    [
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
        <ScheduleTextField form={form} label="Nombre" name="name" />
        <ScheduleTextField
          form={form}
          label="Cupo total"
          min={1}
          name="totalCapacity"
          step={1}
        />
        <Controller
          control={form.control}
          name="scheduledDate"
          render={({ field, fieldState }) => (
            <DateOnlyField
              id={`schedule-date-${id ?? intent}`}
              label="Fecha"
              name="scheduledDate"
              buttonClassName="w-full"
              defaultValue={scheduledDate ?? ""}
              value={field.value}
              onBlur={field.onBlur}
              onValueChange={field.onChange}
              error={
                fieldState.error?.type === "server"
                  ? undefined
                  : fieldState.error?.message
              }
            />
          )}
        />
        <ScheduleTimePickerField form={form} label="Hora" name="startTime" />
        <ScheduleMultipleSelectField
          className="sm:col-span-2"
          form={form}
          name="modalityIds"
          options={modalityOptions}
          title="Modalidades"
        />
      </FieldGroup>
      <ScheduleCapacitiesInlineFieldArray form={form} />
    </form>
  );
}

export function ScheduleFormActions({
  formId,
  pendingScope,
}: {
  formId: string;
  pendingScope: RouteFormPendingScope;
}) {
  const navigation = useOptionalNavigation();
  const isPending = isRouteFormPending(navigation, pendingScope);

  return (
    <div className="flex justify-end gap-2">
      <Button asChild variant="outline">
        <Link to={buildListPath(basePath, null)}>Volver</Link>
      </Button>
      <SubmitButton form={formId} isPending={isPending} />
    </div>
  );
}

export function ScheduleFormPanel({ children }: { children: ReactNode }) {
  return <AdminResourceFormCard>{children}</AdminResourceFormCard>;
}

function ScheduleTextField({
  className,
  form,
  label,
  min,
  name,
  step,
}: {
  className?: string;
  form: ScheduleFormController;
  label: string;
  min?: number;
  name: "name" | "startTime" | "totalCapacity";
  step?: number;
}) {
  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field, fieldState }) => {
        const error =
          fieldState.error?.type === "server"
            ? undefined
            : fieldState.error?.message;

        return (
          <Field className={className} data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor={name}>{label}</FieldLabel>
            {name === "totalCapacity" ? (
              <IntegerInput
                id={name}
                aria-invalid={error ? true : undefined}
                min={min}
                step={step}
                {...field}
              />
            ) : (
              <Input
                id={name}
                aria-invalid={error ? true : undefined}
                {...field}
              />
            )}
            <FieldError>{error}</FieldError>
          </Field>
        );
      }}
    />
  );
}

function ScheduleTimePickerField({
  form,
  label,
  name,
}: {
  form: ScheduleFormController;
  label: string;
  name: "startTime";
}) {
  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field, fieldState }) => {
        const error =
          fieldState.error?.type === "server"
            ? undefined
            : fieldState.error?.message;

        return (
          <TimePickerField
            error={error}
            label={label}
            name={name}
            onBlur={field.onBlur}
            onChange={field.onChange}
            value={field.value}
          />
        );
      }}
    />
  );
}

function TimePickerField({
  error,
  label,
  name,
  onBlur,
  onChange,
  value,
}: {
  error?: string;
  label: string;
  name: string;
  onBlur: () => void;
  onChange: (value: string) => void;
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const { hour, minute } = parseTimeValue(value);
  const errorId = `${name}-error`;

  function updateTime(nextPart: { hour?: string; minute?: string }) {
    const nextHour = nextPart.hour ?? hour ?? "00";
    const nextMinute = nextPart.minute ?? minute ?? "00";

    onChange(`${nextHour}:${nextMinute}`);
  }

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <input type="hidden" name={name} value={value} />
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);

          if (!nextOpen) {
            onBlur();
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id={name}
            type="button"
            variant="outline"
            className="w-full cursor-pointer justify-between font-normal"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          >
            {value || "Seleccioná hora"}
            <Clock data-icon="inline-end" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64" align="start">
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel>Hora</FieldLabel>
              <Select
                value={hour ?? ""}
                onValueChange={(nextHour) => updateTime({ hour: nextHour })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Hora" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {timePickerHourOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Minutos</FieldLabel>
              <Select
                value={minute ?? ""}
                onValueChange={(nextMinute) =>
                  updateTime({ minute: nextMinute })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Min." />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {timePickerMinuteOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </PopoverContent>
      </Popover>
      <FieldError id={errorId}>{error}</FieldError>
    </Field>
  );
}

function ScheduleCapacitiesInlineFieldArray({
  form,
}: {
  form: ScheduleFormController;
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
          <div className="hidden gap-4 text-sm font-medium sm:grid sm:grid-cols-[minmax(0,1fr)_12rem_2rem]">
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
  options,
  onRemove,
}: {
  field: { id?: string };
  form: ScheduleFormController;
  index: number;
  options: Array<{ value: string; label: string }>;
  onRemove: () => void;
}) {
  const idFieldName = `scheduleCapacities.${index}.id` as const;

  return (
    <FieldGroup className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem_2rem] sm:items-start">
      {field.id ? (
        <input type="hidden" name={idFieldName} value={field.id} />
      ) : null}
      <Controller
        control={form.control}
        name={`scheduleCapacities.${index}.groupType`}
        render={({ field: controllerField, fieldState }) => (
          <ScheduleCapacitySelectFieldView
            error={
              fieldState.error?.type === "server"
                ? undefined
                : fieldState.error?.message
            }
            name={`scheduleCapacities.${index}.groupType`}
            onBlur={controllerField.onBlur}
            onChange={controllerField.onChange}
            options={options}
            placeholder="Elegí un tipo"
            value={controllerField.value}
            labelClassName="sr-only"
            title="Tipo de grupo"
          />
        )}
      />
      <Controller
        control={form.control}
        name={`scheduleCapacities.${index}.capacity`}
        render={({ field: controllerField, fieldState }) => {
          const error =
            fieldState.error?.type === "server"
              ? undefined
              : fieldState.error?.message;

          return (
            <Field data-invalid={error ? true : undefined}>
              <FieldLabel
                className="sr-only"
                htmlFor={`schedule-capacity-capacity-${index}`}
              >
                Cupo
              </FieldLabel>
              <IntegerInput
                id={`schedule-capacity-capacity-${index}`}
                aria-invalid={error ? true : undefined}
                min={1}
                step={1}
                {...controllerField}
              />
              <FieldError>{error}</FieldError>
            </Field>
          );
        }}
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
    <Controller
      control={form.control}
      name={name}
      render={({ field, fieldState }) => {
        const error =
          fieldState.error?.type === "server"
            ? undefined
            : fieldState.error?.message;

        return (
          <Field className={className} data-invalid={error ? true : undefined}>
            <FieldLabel>{title}</FieldLabel>
            <MultiCombobox
              emptyMessage="Sin modalidades disponibles"
              error={Boolean(error)}
              name={name}
              onBlur={field.onBlur}
              onValueChange={field.onChange}
              options={options}
              placeholder="Seleccioná modalidades"
              value={field.value}
            />
            <FieldError>{error}</FieldError>
          </Field>
        );
      }}
    />
  );
}

function ScheduleCapacitySelectFieldView({
  className,
  error,
  labelClassName,
  name,
  onBlur,
  onChange,
  options,
  placeholder,
  value,
  title,
}: {
  className?: string;
  error?: string;
  labelClassName?: string;
  name: string;
  onBlur: () => void;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
  value: string;
  title: string;
}) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <Field className={className} data-invalid={error ? true : undefined}>
      <FieldLabel className={labelClassName} htmlFor={id}>
        {title}
      </FieldLabel>
      <input type="hidden" name={name} value={value} />
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          id={id}
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? true : undefined}
          className="w-full"
          onBlur={onBlur}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <FieldError id={errorId}>{error}</FieldError>
    </Field>
  );
}
