import { Plus, Trash } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import type * as React from "react";
import { Link } from "react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Controller,
  useFieldArray,
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
import { DataTableLink } from "@/components/shared/data-table-link";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import type { modalities, submodalities } from "@/db/schema";
import type {
  ActionData,
  ModalityActionValues,
  NameActionValues,
} from "@/lib/admin/events/bases-action.server";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useServerActionToast } from "@/lib/shared/toasts";

type ModalityRow = typeof modalities.$inferSelect;
type SubmodalityRow = typeof submodalities.$inferSelect;

type EventBaseAreaProps = {
  loaderData: EventBasesLoaderData;
  actionData?: ActionData;
};

const nameFormSchema = z.object({
  name: z.string().trim().min(1, requiredFieldMessage),
});

const submodalityFormSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, requiredFieldMessage),
});
const modalityFormSchema = nameFormSchema.extend({
  submodalities: z.array(submodalityFormSchema),
});

type ModalityFormValues = z.infer<typeof modalityFormSchema>;
type ModalityFormController = UseFormReturn<ModalityFormValues>;

const emptyModalityFieldErrors: Record<string, string> = {};

export function EventModalitiesRouteView({
  loaderData,
}: {
  loaderData: EventBasesLoaderData;
}) {
  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Modalidades"
      description="Gestioná las modalidades y submodalidades del evento activo."
      action={{
        label: "Nueva modalidad",
        to: buildNuevaModalidadPath(loaderData.selectedEventId),
      }}
    >
      {loaderData.modalities.length > 0 ? (
        <ModalitiesTable
          modalities={loaderData.modalities}
          submodalities={loaderData.submodalities}
          selectedEventId={loaderData.selectedEventId}
        />
      ) : (
        <AdminEmptyState
          title="Todavía no hay modalidades creadas."
          description="Creá la primera modalidad para organizar las coreografías del evento activo y agregar sus submodalidades desde el detalle."
        />
      )}
    </AdminResourceLayout>
  );
}

export function NewEventModalityRouteView({
  loaderData,
  actionData: providedActionData,
}: EventBaseAreaProps) {
  useServerActionToast(providedActionData);

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Nueva modalidad"
      description="Definí una modalidad para organizar las coreografías del evento activo."
    >
      <ModalityFormPanel>
        <ModalityForm
          formId="create-modality-form"
          intent="create-modality"
          fieldErrors={getModalityFieldErrors(providedActionData)}
          submittedValues={getNameSubmittedValues(
            providedActionData,
            "create-modality",
          )}
        />
        <ModalityFormActions
          formId="create-modality-form"
          pendingScope={{ intent: "create-modality" }}
        />
      </ModalityFormPanel>
    </AdminResourceLayout>
  );
}

export function EventModalityDetailRouteView({
  loaderData,
  actionData: providedActionData,
  modalityId,
}: EventBaseAreaProps & { modalityId: string }) {
  useServerActionToast(providedActionData);

  const modality = loaderData.modalities.find(
    (record) => record.id === modalityId,
  );
  const modalitySubmodalities = loaderData.submodalities.filter(
    (submodality) => submodality.modalityId === modalityId,
  );

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title={modality ? "Editar modalidad" : "Modalidad no encontrada"}
      description={
        modality
          ? "Editá la modalidad y gestioná sus submodalidades."
          : "No encontramos esa modalidad dentro del evento activo."
      }
      headerAction={modality ? <ModalityActions modality={modality} /> : null}
    >
      {modality ? (
        <ModalityFormPanel>
          <ModalityForm
            formId="update-modality-form"
            id={modality.id}
            intent="update-modality"
            name={modality.name}
            submodalities={modalitySubmodalities}
            fieldErrors={getModalityFieldErrors(
              providedActionData,
              modality.id,
            )}
            submittedValues={getModalitySubmittedValues(
              providedActionData,
              modality.id,
            )}
          />
          <ModalityFormActions
            formId="update-modality-form"
            pendingScope={{
              intent: "update-modality",
              fields: { id: modality.id },
            }}
          />
        </ModalityFormPanel>
      ) : (
        <EmptyResourceState>No encontramos esa modalidad.</EmptyResourceState>
      )}
    </AdminResourceLayout>
  );
}

function groupSubmodalitiesByModalityId(submodalities: SubmodalityRow[]) {
  const submodalitiesByModalityId = new Map<string, SubmodalityRow[]>();

  for (const submodality of submodalities) {
    const groupedSubmodalities =
      submodalitiesByModalityId.get(submodality.modalityId) ?? [];

    groupedSubmodalities.push(submodality);
    submodalitiesByModalityId.set(submodality.modalityId, groupedSubmodalities);
  }

  return submodalitiesByModalityId;
}

function ModalitiesTable({
  modalities,
  selectedEventId,
  submodalities,
}: {
  modalities: ModalityRow[];
  selectedEventId: string | null;
  submodalities: SubmodalityRow[];
}) {
  const submodalitiesByModalityId =
    groupSubmodalitiesByModalityId(submodalities);
  const columns: DataTableColumn<ModalityRow>[] = [
    {
      id: "name",
      header: "Nombre",
      className: "min-w-56 font-medium",
      cell: (modality) => (
        <DataTableLink
          to={buildModalidadDetallePath(modality.id, selectedEventId)}
        >
          {modality.name}
        </DataTableLink>
      ),
      filterValue: (modality) => modality.name,
      sortValue: (modality) => modality.name,
    },
    {
      id: "submodalities",
      header: "Submodalidades",
      cell: (modality) => (
        <SubmodalityBadgeList
          submodalities={submodalitiesByModalityId.get(modality.id) ?? []}
        />
      ),
      filterValue: (modality) =>
        (submodalitiesByModalityId.get(modality.id) ?? [])
          .map((submodality) => submodality.name)
          .join(" "),
    },
  ];

  return (
    <DataTable
      mode="client"
      rows={modalities}
      columns={columns}
      getRowKey={(modality) => modality.id}
      searchPlaceholder="Buscar modalidad por nombre"
      textFilterColumnId="name"
      emptyMessage="No hay modalidades que coincidan con la búsqueda."
      initialSort={{ columnId: "name", direction: "asc" }}
    />
  );
}

function SubmodalityBadgeList({
  submodalities,
}: {
  submodalities: SubmodalityRow[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {submodalities.map((submodality) => (
        <Badge key={submodality.id} variant="secondary">
          {submodality.name}
        </Badge>
      ))}
    </div>
  );
}

function ModalityForm({
  fieldErrors = emptyModalityFieldErrors,
  formId,
  id,
  intent,
  name,
  submodalities,
  submittedValues,
}: {
  fieldErrors?: Record<string, string>;
  formId: string;
  id?: string;
  intent: string;
  name?: string;
  submodalities?: SubmodalityRow[];
  submittedValues?: NameActionValues | ModalityActionValues;
}) {
  const includeSubmodalities = submodalities !== undefined;
  const defaultValues = useMemo(
    (): ModalityFormValues => ({
      name: submittedValues?.name ?? name ?? "",
      submodalities:
        submittedValues && "submodalities" in submittedValues
          ? submittedValues.submodalities
          : (submodalities ?? []).map(toSubmodalityFormValues),
    }),
    [name, submodalities, submittedValues],
  );
  const form = useForm<ModalityFormValues>({
    defaultValues,
    mode: "onSubmit",
    resolver: zodResolver(modalityFormSchema),
  });
  const formAction = useOptionalFormAction();
  const submit = useOptionalSubmit();

  useEffect(() => {
    form.reset(defaultValues);
  }, [defaultValues, form]);

  useApplyServerFieldErrors(form, fieldErrors, resolveModalityFieldName);

  return (
    <form
      id={formId}
      method="post"
      className="flex w-full flex-col gap-4"
      onSubmit={createValidatedRouteSubmitHandler(form, submit, formAction)}
    >
      <input type="hidden" name="intent" value={intent} />
      {id ? <input type="hidden" name="id" value={id} /> : null}
      {includeSubmodalities ? (
        <input type="hidden" name="submodalitiesMode" value="replace" />
      ) : null}
      <NameField
        form={form}
        id="modality-name"
        serverError={fieldErrors.name}
      />
      {includeSubmodalities ? (
        <SubmodalitiesInlineFieldArray form={form} fieldErrors={fieldErrors} />
      ) : null}
    </form>
  );
}

function NameField({
  form,
  id,
  serverError,
}: {
  form: ModalityFormController;
  id: string;
  serverError?: string;
}) {
  const error = form.formState.errors.name?.message ?? serverError;

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>Nombre</FieldLabel>
      <Controller
        control={form.control}
        name="name"
        render={({ field }) => (
          <Input id={id} aria-invalid={error ? true : undefined} {...field} />
        )}
      />
      <FieldError>{error}</FieldError>
    </Field>
  );
}

function ModalityFormActions({
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
        <Link to={buildModalidadesListPath(null)}>Volver</Link>
      </Button>
      <SubmitButton form={formId} isPending={isPending} />
    </div>
  );
}

function ModalityFormPanel({ children }: { children: ReactNode }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-6">{children}</CardContent>
    </Card>
  );
}

function ModalityActions({ modality }: { modality: ModalityRow }) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  return (
    <>
      <ResourceActionsMenu contentClassName="w-48" size="icon-sm">
        <DropdownMenuGroup>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setDeleteDialogOpen(true)}
          >
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </ResourceActionsMenu>
      <DeleteModalityDialog
        modality={modality}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />
    </>
  );
}

function DeleteModalityDialog({
  modality,
  open,
  onOpenChange,
}: {
  modality: ModalityRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Eliminar modalidad</DialogTitle>
          <DialogDescription>
            Esta acción borra {modality.name} si no tiene submodalidades,
            categorías o cronogramas relacionados. No se puede deshacer.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-row justify-between sm:justify-between">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancelar
            </Button>
          </DialogClose>
          <form method="post">
            <input type="hidden" name="intent" value="delete-modality" />
            <input type="hidden" name="id" value={modality.id} />
            <input type="hidden" name="confirmDeletion" value={modality.id} />
            <DestroyButton />
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SubmodalitiesInlineFieldArray({
  fieldErrors,
  form,
}: {
  fieldErrors: Record<string, string>;
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
                  field={field}
                  fieldErrors={fieldErrors}
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
  field,
  fieldErrors,
  form,
  index,
  onRemove,
}: {
  field: { id?: string };
  fieldErrors: Record<string, string>;
  form: ModalityFormController;
  index: number;
  onRemove: () => void;
}) {
  const idFieldName = `submodalities.${index}.id` as const;

  return (
    <FieldGroup className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_2rem] sm:items-start">
      {field.id ? (
        <input type="hidden" name={idFieldName} value={field.id} />
      ) : null}
      <Controller
        control={form.control}
        name={`submodalities.${index}.name`}
        render={({ field: controllerField, fieldState }) => {
          const error =
            fieldState.error?.message ??
            fieldErrors[`submodalities.${index}.name`];

          return (
            <Field data-invalid={error ? true : undefined}>
              <FieldLabel
                className="sr-only"
                htmlFor={`submodality-name-${index}`}
              >
                Submodalidad
              </FieldLabel>
              <Input
                id={`submodality-name-${index}`}
                aria-invalid={error ? true : undefined}
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
        aria-label="Quitar submodalidad"
        onClick={onRemove}
      >
        <Trash aria-hidden="true" />
      </Button>
    </FieldGroup>
  );
}

function getModalityFieldErrors(actionData?: ActionData, modalityId?: string) {
  if (matchesActionScope(actionData, { intent: "create-modality" })) {
    return actionData?.fieldErrors ?? emptyModalityFieldErrors;
  }

  if (
    matchesActionScope(actionData, { intent: "update-modality", modalityId })
  ) {
    return actionData?.fieldErrors ?? emptyModalityFieldErrors;
  }

  return emptyModalityFieldErrors;
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

function matchesActionScope(
  actionData: ActionData | undefined,
  {
    intent,
    modalityId,
  }: {
    intent: string;
    modalityId?: string;
  },
) {
  if (actionData?.scope?.intent !== intent) {
    return false;
  }

  if (!modalityId) {
    return true;
  }

  return (
    actionData.scope.recordId === modalityId ||
    actionData.scope.parentRecordId === modalityId
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

function createEmptySubmodalityFormValues(): ModalityFormValues["submodalities"][number] {
  return {
    name: "",
  };
}

function toSubmodalityFormValues(
  submodality: SubmodalityRow,
): ModalityFormValues["submodalities"][number] {
  return {
    id: submodality.id,
    name: submodality.name,
  };
}

function resolveModalityFieldName(fieldName: string) {
  if (fieldName === "name") {
    return fieldName;
  }

  if (/^submodalities\.\d+\.(id|name)$/.test(fieldName)) {
    return fieldName as FieldPath<ModalityFormValues>;
  }

  return null;
}

const modalityRoutes = {
  detail: "/administracion/modalidades",
  list: "/administracion/modalidades",
  new: "/administracion/modalidades/nueva",
} as const;

export function buildModalidadesListPath(selectedEventId: string | null) {
  return appendSelectedEventId(modalityRoutes.list, selectedEventId);
}

export function buildNuevaModalidadPath(selectedEventId: string | null) {
  return appendSelectedEventId(modalityRoutes.new, selectedEventId);
}

export function buildModalidadDetallePath(
  modalityId: string,
  selectedEventId: string | null,
) {
  return appendSelectedEventId(
    `${modalityRoutes.detail}/${modalityId}`,
    selectedEventId,
  );
}

export function isModalityDetailPath(requestUrl: string) {
  return new RegExp(`^${modalityRoutes.detail}/[^/]+$`).test(
    new URL(requestUrl).pathname,
  );
}

function appendSelectedEventId(
  pathname: string,
  _selectedEventId: string | null,
) {
  return pathname;
}
