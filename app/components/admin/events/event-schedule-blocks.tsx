import { Link } from "react-router";
import { Save } from "lucide-react";
import { useEffect, useMemo } from "react";
import type * as React from "react";
import type { ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Controller,
  type SubmitHandler,
  useForm,
  type UseFormReturn,
} from "react-hook-form";
import { z } from "zod";

import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { DateOnlyField } from "@/components/shared/date-only-field";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
} from "@/components/ui/combobox";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ActionData } from "@/lib/admin/events/bases-action.server";
import { formatGroupTypes, groupTypeOptions } from "@/lib/events/group-types";
import type { ScheduleBlockListItem } from "@/lib/events/bases.server";
import type { EventBasesLoaderData } from "@/lib/admin/events/bases-route.server";
import {
  requiredFieldMessage,
  useApplyServerFieldErrors,
} from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";
import { cn } from "@/lib/shared/utils";

type EventBaseAreaProps = {
  loaderData: EventBasesLoaderData;
  actionData?: ActionData;
};

const scheduleBlockFormSchema = z.object({
  name: z.string().trim().min(1, requiredFieldMessage),
  scheduledDate: z.string().trim().min(1, requiredFieldMessage),
  startTime: z.string().trim().min(1, requiredFieldMessage),
  totalCapacity: z
    .string()
    .trim()
    .min(1, requiredFieldMessage)
    .refine(isPositiveIntegerString, "Ingresá un cupo total mayor a cero."),
  modalityIds: z.array(z.string()).min(1, requiredFieldMessage),
});

const scheduleEntryFormSchema = z.object({
  groupTypes: z.array(z.string()).min(1, requiredFieldMessage),
  capacity: z
    .string()
    .trim()
    .min(1, requiredFieldMessage)
    .refine(isPositiveIntegerString, "Ingresá un cupo mayor a cero."),
});

type ScheduleBlockFormValues = z.infer<typeof scheduleBlockFormSchema>;
type ScheduleEntryFormValues = z.infer<typeof scheduleEntryFormSchema>;
type ScheduleBlockFormController = UseFormReturn<ScheduleBlockFormValues>;
type ScheduleEntryFormController = UseFormReturn<ScheduleEntryFormValues>;

const emptyScheduleFieldErrors: Record<string, string> = {};
const emptySelection: string[] = [];
const createScheduleBlockFormId = "create-schedule-block-form";

export function EventScheduleBlocksRouteView({
  loaderData,
}: {
  loaderData: EventBasesLoaderData;
}) {
  return (
    <AdminResourceLayout
      loaderData={loaderData}
      title="Bloques horarios"
      description="Consultá capacidad, modalidades aceptadas y ocupación reservada por cronogramas."
      action={{
        label: "Nuevo bloque horario",
        to: buildNewScheduleBlockPath(loaderData.selectedEventId),
      }}
    >
      {loaderData.scheduleBlocks.length > 0 ? (
        <ScheduleBlockList
          scheduleBlocks={loaderData.scheduleBlocks}
          selectedEventId={loaderData.selectedEventId}
        />
      ) : (
        <AdminEmptyState
          title="Todavía no hay bloques horarios creados."
          description="Creá el primer bloque horario para definir cupo, hora y modalidades aceptadas del evento activo."
        />
      )}
    </AdminResourceLayout>
  );
}

export function NewEventScheduleBlockRouteView({
  loaderData,
  actionData,
}: EventBaseAreaProps) {
  useServerActionToast(actionData);

  return (
    <AdminResourceLayout
      loaderData={loaderData}
      title="Nuevo bloque horario"
      description="Definí fecha, hora, cupo total y modalidades aceptadas para este bloque horario."
    >
      <ScheduleBlockFormPanel>
        <ScheduleBlockForm
          formId={createScheduleBlockFormId}
          intent="create-schedule-block"
          modalities={loaderData.modalities}
          fieldErrors={getScheduleBlockFieldErrors(actionData)}
        />
      </ScheduleBlockFormPanel>
      <ScheduleBlockFormActions
        formId={createScheduleBlockFormId}
        submitLabel="Guardar"
      />
    </AdminResourceLayout>
  );
}

export function EventScheduleBlockDetailRouteView({
  actionData,
  loaderData,
  scheduleBlockId,
}: EventBaseAreaProps & { scheduleBlockId: string }) {
  useServerActionToast(actionData);

  const scheduleBlock = loaderData.scheduleBlocks.find(
    (block) => block.id === scheduleBlockId,
  );
  const scheduleBlockName = scheduleBlock?.name ?? "Bloque horario";

  return (
    <AdminResourceLayout
      loaderData={loaderData}
      title={scheduleBlockName}
      description="Editá el bloque horario y gestioná sus cronogramas dentro del mismo detalle."
    >
      {scheduleBlock ? (
        <div className="flex flex-col gap-6">
          <ResourceSection title="Detalle del bloque horario">
            <Card>
              <CardContent>
                <ScheduleBlockSummary scheduleBlock={scheduleBlock} />
              </CardContent>
            </Card>
            <Card className="mt-4">
              <CardContent>
                <ScheduleBlockForm
                  id={scheduleBlock.id}
                  intent="update-schedule-block"
                  modalities={loaderData.modalities}
                  name={scheduleBlock.name}
                  scheduledDate={scheduleBlock.scheduledDate}
                  startTime={scheduleBlock.startTime}
                  totalCapacity={scheduleBlock.totalCapacity}
                  modalityIds={scheduleBlock.modalityIds}
                  buttonLabel="Guardar cambios"
                  fieldErrors={getScheduleBlockFieldErrors(
                    actionData,
                    scheduleBlock.id,
                  )}
                />
              </CardContent>
            </Card>
          </ResourceSection>
          <ResourceSection title="Cronogramas">
            <ScheduleEntriesPanel
              actionData={actionData}
              scheduleBlock={scheduleBlock}
            />
          </ResourceSection>
          <ResourceSection title="Borrar bloque horario">
            <ScheduleBlockDeleteForm
              scheduleBlock={scheduleBlock}
              fieldErrors={getScheduleBlockDeleteFieldErrors(
                actionData,
                scheduleBlock.id,
              )}
            />
          </ResourceSection>
        </div>
      ) : (
        <EmptyResourceState>
          No encontramos ese bloque horario para este Evento.
        </EmptyResourceState>
      )}
    </AdminResourceLayout>
  );
}
function ScheduleBlockForm({
  buttonLabel,
  fieldErrors = emptyScheduleFieldErrors,
  formId,
  id,
  intent,
  modalities,
  modalityIds = emptySelection,
  name,
  scheduledDate,
  startTime,
  totalCapacity,
}: {
  buttonLabel?: string;
  fieldErrors?: Record<string, string>;
  formId?: string;
  id?: string;
  intent: string;
  modalities: EventBasesLoaderData["modalities"];
  modalityIds?: string[];
  name?: string;
  scheduledDate?: string;
  startTime?: string;
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
  const form = useForm<ScheduleBlockFormValues>({
    resolver: zodResolver(scheduleBlockFormSchema),
    defaultValues: {
      name: name ?? "",
      scheduledDate: scheduledDate ?? "",
      startTime: startTime ?? "",
      totalCapacity: totalCapacity?.toString() ?? "",
      modalityIds,
    },
  });

  useEffect(() => {
    form.reset({
      name: name ?? "",
      scheduledDate: scheduledDate ?? "",
      startTime: startTime ?? "",
      totalCapacity: totalCapacity?.toString() ?? "",
      modalityIds,
    });
  }, [form, modalityIds, name, scheduledDate, startTime, totalCapacity]);

  useApplyServerFieldErrors(form, fieldErrors, resolveScheduleBlockFieldName);

  const submitForm: SubmitHandler<ScheduleBlockFormValues> = (_, event) => {
    const formElement = event?.target as HTMLFormElement | undefined;
    formElement?.submit();
  };

  const handleSubmit: React.SubmitEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    void form.handleSubmit(submitForm)(event);
  };

  return (
    <form
      id={formId}
      method="post"
      className="flex w-full flex-col gap-5"
      onSubmit={handleSubmit}
    >
      <input type="hidden" name="intent" value={intent} />
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <ScheduleBlockTextField
          className="sm:col-span-2"
          form={form}
          label="Nombre del bloque horario"
          name="name"
          serverError={fieldErrors.name}
        />
        <Controller
          control={form.control}
          name="scheduledDate"
          render={({ field, fieldState }) => (
            <DateOnlyField
              id={`schedule-block-date-${id ?? intent}`}
              label="Fecha"
              name="scheduledDate"
              defaultValue={scheduledDate ?? ""}
              value={field.value}
              onBlur={field.onBlur}
              onValueChange={field.onChange}
              error={fieldState.error?.message ?? fieldErrors.scheduledDate}
            />
          )}
        />
        <ScheduleBlockTextField
          form={form}
          label="Hora"
          name="startTime"
          serverError={fieldErrors.startTime}
          type="time"
        />
        <ScheduleBlockTextField
          className="sm:col-span-2"
          form={form}
          label="Cupo total"
          min={1}
          name="totalCapacity"
          serverError={fieldErrors.totalCapacity}
          step={1}
          type="number"
        />
        <ScheduleBlockMultipleComboboxField
          className="sm:col-span-2"
          form={form}
          name="modalityIds"
          options={modalityOptions}
          placeholder="Elegí modalidades"
          serverError={fieldErrors.modalityIds}
          title="Modalidades aceptadas"
        />
        <FieldDescription className="sm:col-span-2">
          {modalities.length > 0
            ? "La ocupación reservada por cronogramas no puede superar el cupo total del bloque horario."
            : "Creá una modalidad antes de agregar bloques horarios."}
        </FieldDescription>
        {buttonLabel ? (
          <div className="sm:col-span-2">
            <Button type="submit">{buttonLabel}</Button>
          </div>
        ) : null}
      </FieldGroup>
    </form>
  );
}

function ScheduleBlockFormActions({
  formId,
  submitLabel,
}: {
  formId: string;
  submitLabel: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <Button asChild variant="outline">
        <Link to={buildScheduleBlocksPath(null)}>Volver</Link>
      </Button>
      <Button type="submit" form={formId}>
        <Save data-icon="inline-start" />
        {submitLabel}
      </Button>
    </div>
  );
}

function ScheduleBlockFormPanel({ children }: { children: ReactNode }) {
  return (
    <Card>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ScheduleBlockTextField({
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
  form: ScheduleBlockFormController;
  label: string;
  min?: number;
  name: "name" | "startTime" | "totalCapacity";
  serverError?: string;
  step?: number;
  type?: "number" | "text" | "time";
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

function ScheduleEntryTextField({
  form,
  label,
  min,
  name,
  serverError,
  step,
  type = "text",
}: {
  form: ScheduleEntryFormController;
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

function ScheduleBlockMultipleComboboxField({
  className,
  form,
  name,
  options,
  placeholder,
  serverError,
  title,
}: {
  className?: string;
  form: ScheduleBlockFormController;
  name: "modalityIds";
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
        <MultipleComboboxFieldView
          className={className}
          error={fieldState.error?.message ?? serverError}
          name={name}
          onBlur={field.onBlur}
          onChange={field.onChange}
          options={options}
          placeholder={placeholder}
          selectedValues={field.value}
          title={title}
        />
      )}
    />
  );
}

function ScheduleEntryMultipleComboboxField({
  form,
  name,
  options,
  placeholder,
  serverError,
  title,
}: {
  form: ScheduleEntryFormController;
  name: "groupTypes";
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
        <MultipleComboboxFieldView
          error={fieldState.error?.message ?? serverError}
          name={name}
          onBlur={field.onBlur}
          onChange={field.onChange}
          options={options}
          placeholder={placeholder}
          selectedValues={field.value}
          title={title}
        />
      )}
    />
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
  name: "groupTypes" | "modalityIds";
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
      {selectedValues.map((value) => (
        <input key={value} type="hidden" name={name} value={value} />
      ))}
      <Combobox
        items={options.map((option) => option.value)}
        itemToStringValue={(value) =>
          options.find((option) => option.value === value)?.label ?? value
        }
        multiple
        value={selectedValues}
        onValueChange={onChange}
      >
        <ComboboxChips aria-invalid={error ? true : undefined}>
          <ComboboxValue>
            {selectedValues.map((value) => (
              <ComboboxChip key={value}>
                {options.find((option) => option.value === value)?.label ??
                  value}
              </ComboboxChip>
            ))}
          </ComboboxValue>
          <ComboboxChipsInput
            disabled={options.length === 0}
            onBlur={onBlur}
            placeholder={
              options.length > 0 ? placeholder : "Sin opciones disponibles"
            }
          />
        </ComboboxChips>
        <ComboboxContent>
          <ComboboxEmpty>Sin resultados.</ComboboxEmpty>
          <ComboboxList>
            {(value) => (
              <ComboboxItem key={value} value={value}>
                {options.find((option) => option.value === value)?.label ??
                  value}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <FieldError>{error}</FieldError>
    </FieldSet>
  );
}

function ScheduleBlockSummary({
  scheduleBlock,
}: {
  scheduleBlock: ScheduleBlockListItem;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold">{scheduleBlock.name}</p>
      <dl className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-4">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide">
            Fecha
          </dt>
          <dd className="mt-1 text-sm text-foreground">
            {formatDate(scheduleBlock.scheduledDate)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide">
            Hora
          </dt>
          <dd className="mt-1 text-sm text-foreground">
            {scheduleBlock.startTime}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide">
            Ocupación
          </dt>
          <dd className="mt-1 text-sm text-foreground">
            {formatScheduleBlockOccupancy(scheduleBlock)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide">
            Cupo total
          </dt>
          <dd className="mt-1 text-sm text-foreground">
            {scheduleBlock.totalCapacity}
          </dd>
        </div>
      </dl>
      <ScheduleBlockModalityBadges scheduleBlock={scheduleBlock} />
    </div>
  );
}

function ScheduleBlockList({
  scheduleBlocks,
  selectedEventId,
}: {
  scheduleBlocks: ScheduleBlockListItem[];
  selectedEventId: string | null;
}) {
  return (
    <Card>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Modalidades</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Hora</TableHead>
              <TableHead>Ocupación</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {scheduleBlocks.map((scheduleBlock) => (
              <TableRow key={scheduleBlock.id}>
                <TableCell>
                  <Link
                    to={buildScheduleBlockDetailPath(
                      scheduleBlock.id,
                      selectedEventId,
                    )}
                    className="font-semibold underline-offset-4 hover:underline"
                  >
                    {scheduleBlock.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <ScheduleBlockModalityBadges scheduleBlock={scheduleBlock} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(scheduleBlock.scheduledDate)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {scheduleBlock.startTime}
                </TableCell>
                <TableCell className="font-medium">
                  {formatScheduleBlockOccupancy(scheduleBlock)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ScheduleEntrySummary({
  scheduleEntry,
}: {
  scheduleEntry: ScheduleBlockListItem["scheduleEntries"][number];
}) {
  return (
    <div className="flex flex-col gap-1 text-sm text-muted-foreground">
      <p className="font-semibold text-foreground">
        {formatGroupTypes(scheduleEntry.groupTypes)}
      </p>
      <p>{scheduleEntry.capacity} cupos</p>
    </div>
  );
}

function ScheduleEntriesPanel({
  actionData,
  scheduleBlock,
}: {
  actionData?: ActionData;
  scheduleBlock: ScheduleBlockListItem;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-sm font-semibold">Cronogramas</h4>
      <ScheduleEntryForm
        intent="create-schedule-entry"
        scheduleBlockId={scheduleBlock.id}
        buttonLabel="Crear Cronograma"
        fieldErrors={getCreateScheduleEntryFieldErrors(
          actionData,
          scheduleBlock.id,
        )}
      />
      {scheduleBlock.scheduleEntries.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {scheduleBlock.scheduleEntries.map((scheduleEntry) => (
            <li key={scheduleEntry.id}>
              <Card>
                <CardContent className="flex flex-col gap-3">
                  <ScheduleEntrySummary scheduleEntry={scheduleEntry} />
                  <ScheduleEntryForm
                    id={scheduleEntry.id}
                    intent="update-schedule-entry"
                    groupTypes={scheduleEntry.groupTypes}
                    capacity={scheduleEntry.capacity}
                    buttonLabel="Guardar"
                    fieldErrors={getUpdateScheduleEntryFieldErrors(
                      actionData,
                      scheduleEntry.id,
                    )}
                  />
                  <ResourceDeleteForm
                    id={scheduleEntry.id}
                    intent="delete-schedule-entry"
                    buttonLabel="Borrar Cronograma"
                  />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyResourceState>
          Todavía no hay cronogramas para este bloque horario.
        </EmptyResourceState>
      )}
    </div>
  );
}

function ScheduleEntryForm({
  buttonLabel,
  capacity,
  fieldErrors = emptyScheduleFieldErrors,
  groupTypes = emptySelection,
  id,
  intent,
  scheduleBlockId,
}: {
  buttonLabel: string;
  capacity?: number;
  fieldErrors?: Record<string, string>;
  groupTypes?: string[];
  id?: string;
  intent: string;
  scheduleBlockId?: string;
}) {
  const form = useForm<ScheduleEntryFormValues>({
    resolver: zodResolver(scheduleEntryFormSchema),
    defaultValues: {
      groupTypes,
      capacity: capacity?.toString() ?? "",
    },
  });

  useEffect(() => {
    form.reset({
      groupTypes,
      capacity: capacity?.toString() ?? "",
    });
  }, [capacity, form, groupTypes]);

  useApplyServerFieldErrors(form, fieldErrors, resolveScheduleEntryFieldName);

  const submitForm: SubmitHandler<ScheduleEntryFormValues> = (_, event) => {
    const formElement = event?.target as HTMLFormElement | undefined;
    formElement?.submit();
  };

  const handleSubmit: React.SubmitEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    void form.handleSubmit(submitForm)(event);
  };

  return (
    <form method="post" onSubmit={handleSubmit} className="mt-3">
      <input type="hidden" name="intent" value={intent} />
      {id ? <input type="hidden" name="id" value={id} /> : null}
      {scheduleBlockId ? (
        <input type="hidden" name="scheduleBlockId" value={scheduleBlockId} />
      ) : null}
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <ScheduleEntryMultipleComboboxField
            form={form}
            name="groupTypes"
            options={groupTypeOptions}
            placeholder="Elegí tipos"
            serverError={fieldErrors.groupTypes}
            title="Tipos de grupo"
          />
          <ScheduleEntryTextField
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
          <Button type="submit">{buttonLabel}</Button>
        </div>
      </FieldGroup>
    </form>
  );
}

function getScheduleBlockFieldErrors(
  actionData?: ActionData,
  scheduleBlockId?: string,
) {
  if (matchesActionScope(actionData, { intent: "create-schedule-block" })) {
    return actionData?.fieldErrors ?? emptyScheduleFieldErrors;
  }

  if (
    matchesActionScope(actionData, {
      intent: "update-schedule-block",
      recordId: scheduleBlockId,
    })
  ) {
    return actionData?.fieldErrors ?? emptyScheduleFieldErrors;
  }

  return emptyScheduleFieldErrors;
}

function getCreateScheduleEntryFieldErrors(
  actionData: ActionData | undefined,
  scheduleBlockId: string,
) {
  if (
    matchesActionScope(actionData, {
      intent: "create-schedule-entry",
      parentRecordId: scheduleBlockId,
    })
  ) {
    return actionData?.fieldErrors ?? emptyScheduleFieldErrors;
  }

  return emptyScheduleFieldErrors;
}

function getUpdateScheduleEntryFieldErrors(
  actionData: ActionData | undefined,
  scheduleEntryId: string,
) {
  if (
    matchesActionScope(actionData, {
      intent: "update-schedule-entry",
      recordId: scheduleEntryId,
    })
  ) {
    return actionData?.fieldErrors ?? emptyScheduleFieldErrors;
  }

  return emptyScheduleFieldErrors;
}

function getScheduleBlockDeleteFieldErrors(
  actionData: ActionData | undefined,
  scheduleBlockId: string,
) {
  if (
    matchesActionScope(actionData, {
      intent: "delete-schedule-block",
      recordId: scheduleBlockId,
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

function ScheduleBlockDeleteForm({
  fieldErrors = emptyScheduleFieldErrors,
  scheduleBlock,
}: {
  fieldErrors?: Record<string, string>;
  scheduleBlock: ScheduleBlockListItem;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Borrar bloque horario</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">
            Esta acción borra el bloque horario y sus relaciones de
            programación.
          </p>
          <p className="text-sm leading-6 text-muted-foreground">
            Solo podés borrarlo si no tiene cronogramas ni otras dependencias.
          </p>
          {fieldErrors.confirmDelete ? (
            <p className="text-sm font-medium text-destructive">
              {fieldErrors.confirmDelete}
            </p>
          ) : null}
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button className="w-fit" variant="destructive">
              Borrar bloque horario
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Borrar {scheduleBlock.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción no se puede deshacer. El sistema va a impedir el
                borrado si el bloque horario tiene cronogramas u otras
                dependencias.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <form method="post">
                <input
                  type="hidden"
                  name="intent"
                  value="delete-schedule-block"
                />
                <input type="hidden" name="id" value={scheduleBlock.id} />
                <input type="hidden" name="confirmDelete" value="yes" />
                <AlertDialogAction asChild variant="destructive">
                  <button type="submit">Borrar bloque horario</button>
                </AlertDialogAction>
              </form>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

function ScheduleBlockModalityBadges({
  scheduleBlock,
}: {
  scheduleBlock: ScheduleBlockListItem;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {scheduleBlock.modalities.map((modality) => (
        <ResourceBadge key={modality.id}>{modality.name}</ResourceBadge>
      ))}
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
  tone = "primary",
}: {
  children: ReactNode;
  tone?: "info" | "neutral" | "primary";
}) {
  return (
    <Badge variant={tone === "neutral" ? "outline" : "secondary"}>
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

export function buildScheduleBlocksPath(selectedEventId: string | null) {
  return appendSelectedEventId(
    "/administracion/bloques-horarios",
    selectedEventId,
  );
}

export function buildNewScheduleBlockPath(selectedEventId: string | null) {
  return appendSelectedEventId(
    "/administracion/bloques-horarios/nuevo",
    selectedEventId,
  );
}

export function buildScheduleBlockDetailPath(
  scheduleBlockId: string,
  selectedEventId: string | null,
) {
  return appendSelectedEventId(
    `/administracion/bloques-horarios/${scheduleBlockId}`,
    selectedEventId,
  );
}

export function isScheduleBlockDetailPath(requestUrl: string) {
  return new RegExp("^/administracion/bloques-horarios/[^/]+$").test(
    new URL(requestUrl).pathname,
  );
}

function appendSelectedEventId(
  pathname: string,
  _selectedEventId: string | null,
) {
  return pathname;
}

function formatScheduleBlockOccupancy(scheduleBlock: ScheduleBlockListItem) {
  return `${scheduleBlock.occupiedCapacity}/${scheduleBlock.totalCapacity}`;
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");

  if (!year || !month || !day) {
    return value;
  }

  return `${day}/${month}/${year}`;
}

function isPositiveIntegerString(value: string) {
  const parsedValue = Number(value);

  return Number.isInteger(parsedValue) && parsedValue > 0;
}

function isScheduleBlockFormField(
  fieldName: string,
): fieldName is keyof ScheduleBlockFormValues {
  return [
    "name",
    "scheduledDate",
    "startTime",
    "totalCapacity",
    "modalityIds",
  ].includes(fieldName);
}

function isScheduleEntryFormField(
  fieldName: string,
): fieldName is keyof ScheduleEntryFormValues {
  return ["groupTypes", "capacity"].includes(fieldName);
}

function resolveScheduleBlockFieldName(fieldName: string) {
  return isScheduleBlockFormField(fieldName) ? fieldName : null;
}

function resolveScheduleEntryFieldName(fieldName: string) {
  return isScheduleEntryFormField(fieldName) ? fieldName : null;
}
