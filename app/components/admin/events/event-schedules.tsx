import { Link } from "react-router";
import { Clock, LoaderCircle, Plus, Trash } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import type * as React from "react";
import type { ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Controller,
  useFieldArray,
  useWatch,
  type FieldPath,
  useForm,
  type UseFormReturn,
} from "react-hook-form";
import { z } from "zod";

import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import {
  DestroyButton,
  SubmitButton,
} from "@/components/shared/action-buttons";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DateOnlyField } from "@/components/shared/date-only-field";
import { MultiCombobox } from "@/components/shared/multi-combobox";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
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
import type {
  ActionData,
  ScheduleActionValues,
  ScheduleCapacityActionValues,
} from "@/lib/admin/events/bases-action.server";
import { formatGroupTypes, groupTypeOptions } from "@/lib/events/group-types";
import type { ScheduleListItem } from "@/lib/events/bases.server";
import type { EventBasesLoaderData } from "@/lib/admin/events/bases-route.server";
import {
  createValidatedRouteSubmitHandler,
  isRouteFormPending,
  requiredFieldMessage,
  type RouteFormPendingScope,
  useApplyServerFieldErrors,
  useOptionalFormAction,
  useOptionalNavigation,
  useOptionalSubmit,
} from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";
import { cn } from "@/lib/shared/utils";

type EventBaseAreaProps = {
  loaderData: EventBasesLoaderData;
  actionData?: ActionData;
};

const scheduleDateFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const timePickerHourOptions = Array.from({ length: 24 }, (_, hour) =>
  String(hour).padStart(2, "0"),
);
const timePickerMinuteOptions = Array.from({ length: 60 }, (_, minute) =>
  String(minute).padStart(2, "0"),
);

const scheduleCapacityFormSchema = z.object({
  groupType: z.string().trim().min(1, requiredFieldMessage),
  capacity: z
    .string()
    .trim()
    .min(1, requiredFieldMessage)
    .refine(isPositiveIntegerString, "Ingresá un cupo mayor a cero."),
});

const inlineScheduleCapacityFormSchema = scheduleCapacityFormSchema.extend({
  id: z.string().optional(),
});

const scheduleFormSchema = z
  .object({
    name: z.string().trim().min(1, requiredFieldMessage),
    scheduledDate: z.string().trim().min(1, requiredFieldMessage),
    startTime: z.string().trim().min(1, requiredFieldMessage),
    totalCapacity: z
      .string()
      .trim()
      .min(1, requiredFieldMessage)
      .refine(isPositiveIntegerString, "Ingresá un cupo total mayor a cero."),
    modalityIds: z.array(z.string()).min(1, requiredFieldMessage),
    scheduleCapacities: z.array(inlineScheduleCapacityFormSchema),
  })
  .superRefine((values, context) => {
    const firstIndexByGroupType = new Map<string, number>();

    values.scheduleCapacities.forEach((scheduleCapacity, index) => {
      const groupType = scheduleCapacity.groupType.trim();

      if (!groupType) {
        return;
      }

      const firstIndex = firstIndexByGroupType.get(groupType);

      if (firstIndex === undefined) {
        firstIndexByGroupType.set(groupType, index);
        return;
      }

      context.addIssue({
        code: "custom",
        message: "Revisá el tipo de grupo del cupo de cronograma.",
        path: ["scheduleCapacities", firstIndex, "groupType"],
      });
      context.addIssue({
        code: "custom",
        message: "Ya existe un cupo de cronograma para ese tipo de grupo.",
        path: ["scheduleCapacities", index, "groupType"],
      });
    });
  });

type ScheduleFormValues = z.infer<typeof scheduleFormSchema>;
type ScheduleCapacityFormValues = z.infer<typeof scheduleCapacityFormSchema>;
type ScheduleFormController = UseFormReturn<ScheduleFormValues>;
type ScheduleCapacityFormController = UseFormReturn<ScheduleCapacityFormValues>;

const emptyScheduleFieldErrors: Record<string, string> = {};
const emptySelection: string[] = [];
const emptyScheduleCapacities: ScheduleListItem["scheduleCapacities"] = [];
const createScheduleFormId = "create-schedule-form";

export function EventSchedulesRouteView({
  loaderData,
}: {
  loaderData: EventBasesLoaderData;
}) {
  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Cronogramas"
      description="Consultá capacidad, modalidades aceptadas y ocupación reservada por cupos de cronograma."
      action={{
        label: "Nuevo cronograma",
        to: buildNewSchedulePath(loaderData.selectedEventId),
      }}
    >
      {loaderData.schedules.length > 0 ? (
        <ScheduleList
          schedules={loaderData.schedules}
          selectedEventId={loaderData.selectedEventId}
        />
      ) : (
        <AdminEmptyState
          title="Todavía no hay cronogramas creados."
          description="Creá el primer cronograma para definir cupo, hora y modalidades aceptadas del evento activo."
        />
      )}
    </AdminResourceLayout>
  );
}

export function NewEventScheduleRouteView({
  loaderData,
  actionData,
}: EventBaseAreaProps) {
  useServerActionToast(actionData);

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Nuevo cronograma"
      description="Definí fecha, hora, cupo total y modalidades aceptadas para este cronograma."
    >
      <ScheduleFormPanel>
        <ScheduleForm
          formId={createScheduleFormId}
          intent="create-schedule"
          modalities={loaderData.modalities}
          fieldErrors={getScheduleFieldErrors(actionData)}
          submittedValues={getScheduleSubmittedValues(
            actionData,
            "create-schedule",
          )}
        />
        <ScheduleFormActions
          formId={createScheduleFormId}
          pendingScope={{ intent: "create-schedule" }}
        />
      </ScheduleFormPanel>
    </AdminResourceLayout>
  );
}

export function EventScheduleDetailRouteView({
  actionData,
  loaderData,
  scheduleId,
}: EventBaseAreaProps & { scheduleId: string }) {
  useServerActionToast(actionData);

  const schedule = loaderData.schedules.find(
    (schedule) => schedule.id === scheduleId,
  );
  const scheduleName = schedule?.name ?? "Cronograma";

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title={schedule ? "Editar cronograma" : scheduleName}
      description={
        schedule
          ? "Editá fecha, hora, cupo total y modalidades aceptadas."
          : "No encontramos ese cronograma para este Evento."
      }
      headerAction={schedule ? <ScheduleActions schedule={schedule} /> : null}
    >
      {schedule ? (
        <ScheduleFormPanel>
          <ScheduleForm
            formId="update-schedule-form"
            id={schedule.id}
            intent="update-schedule"
            modalities={loaderData.modalities}
            name={schedule.name}
            scheduledDate={schedule.scheduledDate}
            startTime={schedule.startTime}
            totalCapacity={schedule.totalCapacity}
            modalityIds={schedule.modalityIds}
            scheduleCapacities={schedule.scheduleCapacities}
            fieldErrors={getScheduleFieldErrors(actionData, schedule.id)}
            submittedValues={getScheduleSubmittedValues(
              actionData,
              "update-schedule",
              schedule.id,
            )}
          />
          <ScheduleFormActions
            formId="update-schedule-form"
            pendingScope={{
              intent: "update-schedule",
              fields: { id: schedule.id },
            }}
          />
        </ScheduleFormPanel>
      ) : (
        <EmptyResourceState>
          No encontramos ese cronograma para este Evento.
        </EmptyResourceState>
      )}
    </AdminResourceLayout>
  );
}
function ScheduleForm({
  fieldErrors = emptyScheduleFieldErrors,
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
  fieldErrors?: Record<string, string>;
  formId?: string;
  id?: string;
  intent: string;
  modalities: EventBasesLoaderData["modalities"];
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

  useApplyServerFieldErrors(form, fieldErrors, resolveScheduleFieldName);

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
        <ScheduleTextField
          form={form}
          label="Nombre"
          name="name"
          serverError={fieldErrors.name}
        />
        <ScheduleTextField
          form={form}
          label="Cupo total"
          min={1}
          name="totalCapacity"
          serverError={fieldErrors.totalCapacity}
          step={1}
          type="number"
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
              error={fieldState.error?.message ?? fieldErrors.scheduledDate}
            />
          )}
        />
        <ScheduleTimePickerField
          form={form}
          label="Hora"
          name="startTime"
          serverError={fieldErrors.startTime}
        />
        <ScheduleMultipleSelectField
          className="sm:col-span-2"
          form={form}
          name="modalityIds"
          options={modalityOptions}
          serverError={fieldErrors.modalityIds}
          title="Modalidades"
        />
      </FieldGroup>
      <ScheduleCapacitiesInlineFieldArray
        form={form}
        fieldErrors={fieldErrors}
      />
    </form>
  );
}

function ScheduleFormActions({
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
        <Link to={buildSchedulesPath(null)}>Volver</Link>
      </Button>
      <SubmitButton form={formId} isPending={isPending} />
    </div>
  );
}

function ScheduleFormPanel({ children }: { children: ReactNode }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-6">{children}</CardContent>
    </Card>
  );
}

function ScheduleTextField({
  className,
  form,
  label,
  min,
  name,
  serverError,
  step,
  type = "text",
}: {
  className?: string;
  form: ScheduleFormController;
  label: string;
  min?: number;
  name: "name" | "startTime" | "totalCapacity";
  serverError?: string;
  step?: number;
  type?: "number" | "text";
}) {
  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field, fieldState }) => {
        const error = fieldState.error?.message ?? serverError;

        return (
          <Field className={className} data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor={name}>{label}</FieldLabel>
            <Input
              id={name}
              aria-invalid={error ? true : undefined}
              type={type}
              min={min}
              step={step}
              {...field}
            />
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
  serverError,
}: {
  form: ScheduleFormController;
  label: string;
  name: "startTime";
  serverError?: string;
}) {
  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field, fieldState }) => {
        const error = fieldState.error?.message ?? serverError;

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

function parseTimeValue(value: string) {
  const [hour, minute] = value.split(":");

  return {
    hour: hour && timePickerHourOptions.includes(hour) ? hour : undefined,
    minute:
      minute && timePickerMinuteOptions.includes(minute) ? minute : undefined,
  };
}

function ScheduleCapacitiesInlineFieldArray({
  fieldErrors,
  form,
}: {
  fieldErrors: Record<string, string>;
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
          fieldErrors={fieldErrors}
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
      {fields.length > 0 && (
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
      )}
    </FieldSet>
  );
}

function ScheduleCapacityInlineFields({
  field,
  fieldErrors,
  form,
  index,
  options,
  onRemove,
}: {
  field: { id?: string };
  fieldErrors: Record<string, string>;
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
              fieldState.error?.message ??
              fieldErrors[`scheduleCapacities.${index}.groupType`]
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
            fieldState.error?.message ??
            fieldErrors[`scheduleCapacities.${index}.capacity`];

          return (
            <Field data-invalid={error ? true : undefined}>
              <FieldLabel
                className="sr-only"
                htmlFor={`schedule-capacity-capacity-${index}`}
              >
                Cupo
              </FieldLabel>
              <Input
                id={`schedule-capacity-capacity-${index}`}
                aria-invalid={error ? true : undefined}
                type="number"
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

function ScheduleCapacityTextField({
  form,
  label,
  min,
  name,
  serverError,
  step,
  type = "text",
}: {
  form: ScheduleCapacityFormController;
  label: string;
  min?: number;
  name: "capacity";
  serverError?: string;
  step?: number;
  type?: "number" | "text";
}) {
  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field, fieldState }) => {
        const error = fieldState.error?.message ?? serverError;

        return (
          <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor={name}>{label}</FieldLabel>
            <Input
              id={name}
              aria-invalid={error ? true : undefined}
              type={type}
              min={min}
              step={step}
              {...field}
            />
            <FieldError>{error}</FieldError>
          </Field>
        );
      }}
    />
  );
}

function ScheduleMultipleSelectField({
  className,
  form,
  name,
  options,
  serverError,
  title,
}: {
  className?: string;
  form: ScheduleFormController;
  name: "modalityIds";
  options: Array<{ value: string; label: string }>;
  serverError?: string;
  title: string;
}) {
  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field, fieldState }) => {
        const error = fieldState.error?.message ?? serverError;

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

function ScheduleCapacitySelectField({
  form,
  name,
  options,
  placeholder,
  serverError,
  title,
}: {
  form: ScheduleCapacityFormController;
  name: "groupType";
  options: Array<{ value: string; label: string }>;
  placeholder: string;
  serverError?: string;
  title: string;
}) {
  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field, fieldState }) => (
        <ScheduleCapacitySelectFieldView
          error={fieldState.error?.message ?? serverError}
          name={name}
          onBlur={field.onBlur}
          onChange={field.onChange}
          options={options}
          placeholder={placeholder}
          value={field.value}
          title={title}
        />
      )}
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

function MultipleComboboxFieldView({
  className,
  error,
  name,
  onBlur,
  onChange,
  options,
  placeholder,
  selectedValues,
  title,
}: {
  className?: string;
  error?: string;
  name: string;
  onBlur: () => void;
  onChange: (value: string[]) => void;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
  selectedValues: string[];
  title: string;
}) {
  return (
    <FieldSet className={className} data-invalid={error ? true : undefined}>
      <FieldLegend variant="label" className={cn(error && "text-destructive")}>
        {title}
      </FieldLegend>
      <MultiCombobox
        emptyMessage="Sin opciones disponibles"
        error={error ? true : false}
        name={name}
        onBlur={onBlur}
        onValueChange={onChange}
        options={options}
        placeholder={placeholder}
        value={selectedValues}
      />
      <FieldError>{error}</FieldError>
    </FieldSet>
  );
}

function ScheduleList({
  schedules,
  selectedEventId,
}: {
  schedules: ScheduleListItem[];
  selectedEventId: string | null;
}) {
  const columns: DataTableColumn<ScheduleListItem>[] = [
    {
      id: "name",
      header: "Nombre",
      className: "min-w-56 font-medium",
      cell: (schedule) => (
        <Link
          to={buildScheduleDetailPath(schedule.id, selectedEventId)}
          className="text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {schedule.name}
        </Link>
      ),
      filterValue: (schedule) => schedule.name,
    },
    {
      id: "modalities",
      header: "Modalidades",
      className: "min-w-64 lg:w-[31rem] lg:max-w-[31rem]",
      headerClassName: "min-w-64 lg:w-[31rem] lg:max-w-[31rem]",
      cell: (schedule) => <ScheduleModalityBadges schedule={schedule} />,
      filterValues: (schedule) =>
        schedule.modalities.map((modality) => modality.id),
      filterValue: (schedule) =>
        schedule.modalities.map((modality) => modality.name).join(" "),
    },
    {
      id: "scheduledDate",
      header: "Fecha",
      cell: (schedule) => formatDate(schedule.scheduledDate),
      className: "text-muted-foreground",
      sortValue: (schedule) =>
        `${schedule.scheduledDate} ${schedule.startTime}`,
    },
    {
      id: "startTime",
      header: "Hora",
      cell: (schedule) => schedule.startTime,
      className: "text-muted-foreground",
      sortValue: (schedule) => schedule.startTime,
    },
    {
      id: "occupancy",
      header: "Ocupación",
      cell: (schedule) => formatScheduleOccupancy(schedule),
      className: "font-medium",
    },
  ];

  return (
    <DataTable
      mode="client"
      rows={schedules}
      columns={columns}
      getRowKey={(schedule) => schedule.id}
      searchPlaceholder="Buscar cronograma por nombre"
      textFilterColumnId="name"
      facetedFilters={buildScheduleFacetedFilters(schedules)}
      emptyMessage="No hay cronogramas que coincidan con la búsqueda."
      initialSort={{ columnId: "scheduledDate", direction: "asc" }}
    />
  );
}

function buildScheduleFacetedFilters(schedules: ScheduleListItem[]) {
  return [
    {
      columnId: "modalities",
      label: "Filtros",
      groups: [
        {
          label: "Modalidad",
          options: getScheduleModalityOptions(schedules),
        },
      ],
    },
  ];
}

function getScheduleModalityOptions(schedules: ScheduleListItem[]) {
  const modalities = schedules.flatMap((schedule) => schedule.modalities);

  return Array.from(
    new Map(
      modalities.map((modality) => [
        modality.id,
        { label: modality.name, value: modality.id },
      ]),
    ).values(),
  ).sort((firstOption, secondOption) =>
    firstOption.label.localeCompare(secondOption.label, "es-AR"),
  );
}

function createEmptyScheduleCapacityFormValues(): ScheduleFormValues["scheduleCapacities"][number] {
  return {
    groupType: "",
    capacity: "",
  };
}

function toScheduleCapacityFormValues(
  scheduleCapacity: ScheduleListItem["scheduleCapacities"][number],
): ScheduleFormValues["scheduleCapacities"][number] {
  return {
    id: scheduleCapacity.id,
    groupType: scheduleCapacity.groupType,
    capacity: scheduleCapacity.capacity.toString(),
  };
}

function getAvailableScheduleCapacityGroupTypeOptions(
  scheduleCapacityValues: ScheduleFormValues["scheduleCapacities"],
  currentIndex: number,
) {
  const currentValue = scheduleCapacityValues[currentIndex]?.groupType;
  const unavailableGroupTypes = new Set(
    scheduleCapacityValues
      .map((scheduleCapacity, index) =>
        index === currentIndex ? "" : scheduleCapacity.groupType,
      )
      .filter(Boolean),
  );

  return groupTypeOptions.filter(
    (option) =>
      option.value === currentValue || !unavailableGroupTypes.has(option.value),
  );
}

function ScheduleCapacitySummary({
  scheduleCapacity,
}: {
  scheduleCapacity: ScheduleListItem["scheduleCapacities"][number];
}) {
  return (
    <div className="flex flex-col gap-1 text-sm text-muted-foreground">
      <p className="font-semibold text-foreground">
        {formatGroupTypes([scheduleCapacity.groupType])}
      </p>
      <p>{scheduleCapacity.capacity} cupos</p>
    </div>
  );
}

function ScheduleCapacitiesPanel({
  actionData,
  schedule,
}: {
  actionData?: ActionData;
  schedule: ScheduleListItem;
}) {
  return (
    <div className="flex flex-col gap-3">
      <ScheduleCapacityForm
        intent="create-schedule-capacity"
        scheduleId={schedule.id}
        buttonLabel="Nuevo cupo"
        fieldErrors={getCreateScheduleCapacityFieldErrors(
          actionData,
          schedule.id,
        )}
        submittedValues={getScheduleCapacitySubmittedValues(
          actionData,
          "create-schedule-capacity",
          undefined,
          schedule.id,
        )}
      />
      {schedule.scheduleCapacities.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {schedule.scheduleCapacities.map((scheduleCapacity) => (
            <li key={scheduleCapacity.id}>
              <Card>
                <CardContent className="flex flex-col gap-3">
                  <ScheduleCapacitySummary
                    scheduleCapacity={scheduleCapacity}
                  />
                  <ScheduleCapacityForm
                    id={scheduleCapacity.id}
                    intent="update-schedule-capacity"
                    groupType={scheduleCapacity.groupType}
                    capacity={scheduleCapacity.capacity}
                    buttonLabel="Guardar"
                    fieldErrors={getUpdateScheduleCapacityFieldErrors(
                      actionData,
                      scheduleCapacity.id,
                    )}
                    submittedValues={getScheduleCapacitySubmittedValues(
                      actionData,
                      "update-schedule-capacity",
                      scheduleCapacity.id,
                    )}
                  />
                  <ResourceDeleteForm
                    id={scheduleCapacity.id}
                    intent="delete-schedule-capacity"
                    buttonLabel="Borrar Cupo de cronograma"
                  />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ScheduleCapacityForm({
  buttonLabel,
  capacity,
  fieldErrors = emptyScheduleFieldErrors,
  groupType = "",
  id,
  intent,
  scheduleId,
  submittedValues,
}: {
  buttonLabel: string;
  capacity?: number;
  fieldErrors?: Record<string, string>;
  groupType?: string;
  id?: string;
  intent: string;
  scheduleId?: string;
  submittedValues?: ScheduleCapacityActionValues;
}) {
  const defaultValues = useMemo(
    () =>
      submittedValues ?? {
        groupType,
        capacity: capacity?.toString() ?? "",
      },
    [capacity, groupType, submittedValues],
  );
  const form = useForm<ScheduleCapacityFormValues>({
    resolver: zodResolver(scheduleCapacityFormSchema),
    defaultValues,
  });
  const formAction = useOptionalFormAction();
  const submit = useOptionalSubmit();
  const navigation = useOptionalNavigation();

  useEffect(() => {
    form.reset(defaultValues);
  }, [defaultValues, form]);

  useApplyServerFieldErrors(
    form,
    fieldErrors,
    resolveScheduleCapacityFieldName,
  );
  const pendingScope: RouteFormPendingScope = {
    intent,
    fields: getScheduleCapacityPendingFields({ id, scheduleId }),
  };
  let buttonIcon: ReactNode = null;
  let buttonText = buttonLabel;

  const isPending = isRouteFormPending(navigation, pendingScope);

  if (isPending) {
    buttonIcon = (
      <LoaderCircle aria-hidden="true" className="animate-spin" data-icon />
    );
    buttonText = "Guardando cupo...";
  } else if (buttonLabel === "Nuevo cupo") {
    buttonIcon = <Plus data-icon="inline-start" />;
  }

  return (
    <form
      method="post"
      onSubmit={createValidatedRouteSubmitHandler(form, submit, formAction)}
      className="mt-3"
    >
      <input type="hidden" name="intent" value={intent} />
      {id ? <input type="hidden" name="id" value={id} /> : null}
      {scheduleId ? (
        <input type="hidden" name="scheduleId" value={scheduleId} />
      ) : null}
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <ScheduleCapacitySelectField
            form={form}
            name="groupType"
            options={groupTypeOptions}
            placeholder="Elegí un tipo"
            serverError={fieldErrors.groupType}
            title="Tipo de grupo"
          />
          <ScheduleCapacityTextField
            form={form}
            label="Cupo"
            min={1}
            name="capacity"
            serverError={fieldErrors.capacity}
            step={1}
            type="number"
          />
        </div>
        <div>
          <Button type="submit" disabled={isPending}>
            {buttonIcon}
            {buttonText}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

function getScheduleCapacityPendingFields({
  id,
  scheduleId,
}: {
  id?: string;
  scheduleId?: string;
}): Record<string, string> | undefined {
  if (id) {
    return { id };
  }

  if (scheduleId) {
    return { scheduleId };
  }

  return undefined;
}

function getScheduleFieldErrors(actionData?: ActionData, scheduleId?: string) {
  if (matchesActionScope(actionData, { intent: "create-schedule" })) {
    return actionData?.fieldErrors ?? emptyScheduleFieldErrors;
  }

  if (
    matchesActionScope(actionData, {
      intent: "update-schedule",
      recordId: scheduleId,
    })
  ) {
    return actionData?.fieldErrors ?? emptyScheduleFieldErrors;
  }

  return emptyScheduleFieldErrors;
}

function getCreateScheduleCapacityFieldErrors(
  actionData: ActionData | undefined,
  scheduleId: string,
) {
  if (
    matchesActionScope(actionData, {
      intent: "create-schedule-capacity",
      parentRecordId: scheduleId,
    })
  ) {
    return actionData?.fieldErrors ?? emptyScheduleFieldErrors;
  }

  return emptyScheduleFieldErrors;
}

function getUpdateScheduleCapacityFieldErrors(
  actionData: ActionData | undefined,
  scheduleCapacityId: string,
) {
  if (
    matchesActionScope(actionData, {
      intent: "update-schedule-capacity",
      recordId: scheduleCapacityId,
    })
  ) {
    return actionData?.fieldErrors ?? emptyScheduleFieldErrors;
  }

  return emptyScheduleFieldErrors;
}

function matchesActionScope(
  actionData: ActionData | undefined,
  {
    intent,
    parentRecordId,
    recordId,
  }: {
    intent: string;
    parentRecordId?: string;
    recordId?: string;
  },
) {
  if (actionData?.scope?.intent !== intent) {
    return false;
  }

  if (recordId && actionData.scope.recordId !== recordId) {
    return false;
  }

  if (parentRecordId && actionData.scope.parentRecordId !== parentRecordId) {
    return false;
  }

  return true;
}

function getScheduleSubmittedValues(
  actionData: ActionData | undefined,
  intent: string,
  recordId?: string,
) {
  if (
    !matchesActionScope(actionData, { intent, recordId }) ||
    !isScheduleActionValues(actionData?.values)
  ) {
    return undefined;
  }

  return actionData.values;
}

function getScheduleCapacitySubmittedValues(
  actionData: ActionData | undefined,
  intent: string,
  recordId?: string,
  parentRecordId?: string,
) {
  if (
    !matchesActionScope(actionData, { intent, recordId, parentRecordId }) ||
    !isScheduleCapacityActionValues(actionData?.values)
  ) {
    return undefined;
  }

  return actionData.values;
}

function isScheduleActionValues(
  values: ActionData["values"] | undefined,
): values is ScheduleActionValues {
  return (
    values !== undefined &&
    "scheduledDate" in values &&
    "startTime" in values &&
    "totalCapacity" in values &&
    "modalityIds" in values &&
    "scheduleCapacities" in values
  );
}

function isScheduleCapacityActionValues(
  values: ActionData["values"] | undefined,
): values is ScheduleCapacityActionValues {
  return (
    values !== undefined &&
    "groupType" in values &&
    "capacity" in values &&
    !("scheduleCapacities" in values)
  );
}

function ScheduleActions({ schedule }: { schedule: ScheduleListItem }) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  return (
    <>
      <ResourceActionsMenu contentClassName="w-48" size="icon">
        <DropdownMenuGroup>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setDeleteDialogOpen(true)}
          >
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </ResourceActionsMenu>
      <DeleteScheduleDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        schedule={schedule}
      />
    </>
  );
}

function DeleteScheduleDialog({
  open,
  onOpenChange,
  schedule,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule: ScheduleListItem;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Eliminar cronograma</DialogTitle>
          <DialogDescription>
            Esta acción borra {schedule.name} si no tiene cupos de cronograma ni
            otras dependencias asociadas. No se puede deshacer.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancelar
            </Button>
          </DialogClose>
          <form method="post">
            <input type="hidden" name="intent" value="delete-schedule" />
            <input type="hidden" name="id" value={schedule.id} />
            <input type="hidden" name="confirmDelete" value="yes" />
            <DestroyButton />
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleModalityBadges({ schedule }: { schedule: ScheduleListItem }) {
  const compactHiddenModalitiesCount = schedule.modalities.length - 2;
  const largeHiddenModalitiesCount = schedule.modalities.length - 4;

  return (
    <div className="flex flex-wrap gap-2">
      {schedule.modalities.slice(0, 4).map((modality, index) => (
        <ResourceBadge
          key={modality.id}
          className={index >= 2 ? "hidden lg:inline-flex" : undefined}
        >
          {modality.name}
        </ResourceBadge>
      ))}
      {compactHiddenModalitiesCount > 0 ? (
        <ResourceBadge className="lg:hidden">
          {compactHiddenModalitiesCount}+
        </ResourceBadge>
      ) : null}
      {largeHiddenModalitiesCount > 0 ? (
        <ResourceBadge className="hidden lg:inline-flex">
          {largeHiddenModalitiesCount}+
        </ResourceBadge>
      ) : null}
    </div>
  );
}

function ResourceSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-lg font-semibold">{title}</h3>
      <div>{children}</div>
    </section>
  );
}

function ResourceDeleteForm({
  buttonLabel,
  id,
  intent,
}: {
  buttonLabel: string;
  id: string;
  intent: string;
}) {
  return (
    <form method="post">
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="destructive">
        {buttonLabel}
      </Button>
    </form>
  );
}

function ResourceBadge({
  children,
  className,
  tone = "primary",
}: {
  children: ReactNode;
  className?: string;
  tone?: "info" | "neutral" | "primary";
}) {
  return (
    <Badge
      className={className}
      variant={tone === "neutral" ? "outline" : "secondary"}
    >
      {children}
    </Badge>
  );
}

function EmptyResourceState({ children }: { children: ReactNode }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>Sin datos</EmptyTitle>
        <EmptyDescription>{children}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function buildSchedulesPath(selectedEventId: string | null) {
  return appendSelectedEventId("/administracion/cronogramas", selectedEventId);
}

export function buildNewSchedulePath(selectedEventId: string | null) {
  return appendSelectedEventId(
    "/administracion/cronogramas/nuevo",
    selectedEventId,
  );
}

export function buildScheduleDetailPath(
  scheduleId: string,
  selectedEventId: string | null,
) {
  return appendSelectedEventId(
    `/administracion/cronogramas/${scheduleId}`,
    selectedEventId,
  );
}

export function isScheduleDetailPath(requestUrl: string) {
  return new RegExp("^/administracion/cronogramas/[^/]+$").test(
    new URL(requestUrl).pathname,
  );
}

function appendSelectedEventId(
  pathname: string,
  _selectedEventId: string | null,
) {
  return pathname;
}

function formatScheduleOccupancy(schedule: ScheduleListItem) {
  return `${schedule.occupiedCapacity}/${schedule.totalCapacity}`;
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");

  if (!year || !month || !day) {
    return value;
  }

  return scheduleDateFormatter.format(new Date(`${value}T00:00:00Z`));
}

function isPositiveIntegerString(value: string) {
  const parsedValue = Number(value);

  return Number.isInteger(parsedValue) && parsedValue > 0;
}

function isScheduleFormField(
  fieldName: string,
): fieldName is keyof Omit<ScheduleFormValues, "scheduleCapacities"> {
  return [
    "name",
    "scheduledDate",
    "startTime",
    "totalCapacity",
    "modalityIds",
  ].includes(fieldName);
}

function isScheduleCapacityFormField(
  fieldName: string,
): fieldName is keyof ScheduleCapacityFormValues {
  return ["groupType", "capacity"].includes(fieldName);
}

function resolveScheduleFieldName(fieldName: string) {
  if (isScheduleFormField(fieldName)) {
    return fieldName;
  }

  if (/^scheduleCapacities\.\d+\.(id|groupType|capacity)$/.test(fieldName)) {
    return fieldName as FieldPath<ScheduleFormValues>;
  }

  return null;
}

function resolveScheduleCapacityFieldName(fieldName: string) {
  return isScheduleCapacityFormField(fieldName) ? fieldName : null;
}
