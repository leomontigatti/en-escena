import { ChevronDown, Plus, Save, Settings2, Trash, X } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import type * as React from "react";
import { Link } from "react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Controller, type SubmitHandler, useForm } from "react-hook-form";
import { z } from "zod";

import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
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
} from "@/components/ui/field";
import type { modalities, submodalities } from "@/db/schema";
import type { ActionData } from "@/lib/admin/events/bases-action.server";
import type { EventBasesLoaderData } from "@/lib/admin/events/bases-route.server";
import {
  requiredFieldMessage,
  useApplyServerFieldErrors,
} from "@/lib/shared/forms";
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

type NameFormValues = z.infer<typeof nameFormSchema>;

const emptyModalityFieldErrors: Record<string, string> = {};
const emptySubmodalityFieldErrors: Record<string, string> = {};

export function EventModalitiesRouteView({
  loaderData,
}: {
  loaderData: EventBasesLoaderData;
}) {
  return (
    <AdminResourceLayout
      loaderData={loaderData}
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
      loaderData={loaderData}
      title="Nueva modalidad"
      description="Definí una modalidad para organizar las coreografías del evento activo."
      breadcrumbItems={[
        { label: "Modalidades", to: buildModalidadesListPath(null) },
        { label: "Nueva" },
      ]}
    >
      <ModalityFormPanel>
        <ModalityForm
          formId="create-modality-form"
          intent="create-modality"
          fieldErrors={getModalityFieldErrors(providedActionData)}
        />
      </ModalityFormPanel>
      <ModalityFormActions
        formId="create-modality-form"
        submitLabel="Guardar"
      />
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
      loaderData={loaderData}
      title={modality ? "Editar modalidad" : "Modalidad no encontrada"}
      description={
        modality
          ? "Editá la modalidad y gestioná sus submodalidades."
          : "No encontramos esa modalidad dentro del evento activo."
      }
      headerAction={modality ? <ModalityActions modality={modality} /> : null}
      breadcrumbItems={[
        { label: "Modalidades", to: buildModalidadesListPath(null) },
        { label: modality?.name ?? "Editar" },
      ]}
    >
      {modality ? (
        <div className="flex flex-col gap-6">
          <ModalityFormPanel>
            <ModalityForm
              formId="update-modality-form"
              id={modality.id}
              intent="update-modality"
              name={modality.name}
              fieldErrors={getModalityFieldErrors(
                providedActionData,
                modality.id,
              )}
            />
            <SubmodalitiesField
              actionData={providedActionData}
              modalityId={modality.id}
              submodalities={modalitySubmodalities}
            />
          </ModalityFormPanel>
          <ModalityFormActions
            formId="update-modality-form"
            submitLabel="Guardar"
          />
        </div>
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
        <Link
          to={buildModalidadDetallePath(modality.id, selectedEventId)}
          className="text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {modality.name}
        </Link>
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
}: {
  fieldErrors?: Record<string, string>;
  formId: string;
  id?: string;
  intent: string;
  name?: string;
}) {
  const form = useForm<NameFormValues>({
    defaultValues: { name: name ?? "" },
    mode: "onSubmit",
    resolver: zodResolver(nameFormSchema),
  });

  useEffect(() => {
    form.reset({ name: name ?? "" });
  }, [form, name]);

  useApplyServerFieldErrors(form, fieldErrors);

  function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const formElement = event.currentTarget;
    const submitNativeForm: SubmitHandler<NameFormValues> = () => {
      formElement.submit();
    };

    void form.handleSubmit(submitNativeForm)(event);
  }

  return (
    <form
      id={formId}
      method="post"
      className="flex w-full flex-col gap-4"
      onSubmit={handleSubmit}
    >
      <input type="hidden" name="intent" value={intent} />
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <NameField
        form={form}
        id="modality-name"
        serverError={fieldErrors.name}
      />
    </form>
  );
}

function NameField({
  form,
  id,
  serverError,
}: {
  form: ReturnType<typeof useForm<NameFormValues>>;
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
  submitLabel,
}: {
  formId: string;
  submitLabel: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <Button asChild variant="outline">
        <Link to={buildModalidadesListPath(null)}>Volver</Link>
      </Button>
      <Button type="submit" form={formId}>
        <Save data-icon="inline-start" />
        {submitLabel}
      </Button>
    </div>
  );
}

function ModalityFormPanel({ children }: { children: ReactNode }) {
  return (
    <Card>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ModalityActions({ modality }: { modality: ModalityRow }) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            <Settings2 data-icon="inline-start" />
            Acciones
            <ChevronDown data-icon="inline-end" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuGroup>
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setDeleteDialogOpen(true)}
            >
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
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
            categorías o bloques horarios relacionados. No se puede deshacer.
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
            <Button type="submit" variant="destructive">
              <Trash data-icon="inline-start" />
              Eliminar
            </Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SubmodalitiesField({
  actionData,
  modalityId,
  submodalities,
}: {
  actionData?: ActionData;
  modalityId: string;
  submodalities: SubmodalityRow[];
}) {
  const submodalityFieldErrors = getSubmodalityFieldErrors(
    actionData,
    modalityId,
  );
  const [createDialogOpen, setCreateDialogOpen] = useState(() =>
    shouldOpenCreateSubmodalityDialog(actionData, modalityId),
  );

  useEffect(() => {
    if (shouldOpenCreateSubmodalityDialog(actionData, modalityId)) {
      setCreateDialogOpen(true);
    }
  }, [actionData, modalityId]);

  return (
    <div className="mt-4 flex flex-col gap-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium">Submodalidades</p>
        <Button
          type="button"
          variant="outline"
          onClick={() => setCreateDialogOpen(true)}
        >
          <Plus data-icon="inline-start" />
          Agregar
        </Button>
      </div>

      <div className="flex min-h-7 flex-wrap items-center gap-2">
        {submodalities.length > 0 ? (
          submodalities.map((submodality) => (
            <SubmodalityDeletableBadge
              key={submodality.id}
              submodality={submodality}
            />
          ))
        ) : (
          <span className="text-sm leading-7 text-muted-foreground">
            Sin submodalidades todavía.
          </span>
        )}
      </div>
      {submodalityFieldErrors.name ? (
        <p className="text-sm font-medium text-destructive">
          {submodalityFieldErrors.name}
        </p>
      ) : null}

      <CreateSubmodalityDialog
        actionData={actionData}
        modalityId={modalityId}
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </div>
  );
}

function SubmodalityDeletableBadge({
  submodality,
}: {
  submodality: SubmodalityRow;
}) {
  return (
    <Badge variant="secondary" className="h-7 gap-1 pr-1 text-sm">
      {submodality.name}
      <form method="post">
        <input type="hidden" name="intent" value="delete-submodality" />
        <input type="hidden" name="id" value={submodality.id} />
        <Button
          type="submit"
          aria-label={`Borrar submodalidad ${submodality.name}`}
          size="icon-xs"
          variant="ghost"
        >
          <X />
        </Button>
      </form>
    </Badge>
  );
}

function CreateSubmodalityDialog({
  actionData,
  modalityId,
  open,
  onOpenChange,
}: {
  actionData?: ActionData;
  modalityId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const fieldErrors = getSubmodalityFieldErrors(actionData, modalityId);
  const form = useForm<NameFormValues>({
    defaultValues: { name: "" },
    mode: "onSubmit",
    resolver: zodResolver(nameFormSchema),
  });

  useApplyServerFieldErrors(form, fieldErrors);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      form.reset();
    }

    onOpenChange(nextOpen);
  }

  function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const formElement = event.currentTarget;
    const submitNativeForm: SubmitHandler<NameFormValues> = () => {
      formElement.submit();
    };

    void form.handleSubmit(submitNativeForm)(event);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent forceMount>
        <DialogHeader>
          <DialogTitle>Crear submodalidad</DialogTitle>
        </DialogHeader>
        <form method="post" onSubmit={handleSubmit}>
          <input type="hidden" name="intent" value="create-submodality" />
          <input type="hidden" name="modalityId" value={modalityId} />
          <FieldGroup>
            <NameField
              form={form}
              id="submodality-name"
              serverError={fieldErrors.name}
            />
            <DialogFooter className="flex-row justify-between sm:justify-between">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit">
                <Save data-icon="inline-start" />
                Guardar
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
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

function getSubmodalityFieldErrors(
  actionData: ActionData | undefined,
  modalityId: string,
) {
  if (
    matchesActionScope(actionData, { intent: "create-submodality", modalityId })
  ) {
    return actionData?.fieldErrors ?? emptySubmodalityFieldErrors;
  }

  return emptySubmodalityFieldErrors;
}

function shouldOpenCreateSubmodalityDialog(
  actionData: ActionData | undefined,
  modalityId: string,
) {
  return matchesActionScope(actionData, {
    intent: "create-submodality",
    modalityId,
  });
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
