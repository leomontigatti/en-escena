import { Check, LoaderCircle, Trash } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import type * as React from "react";
import { Link } from "react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Controller, useForm, type UseFormReturn } from "react-hook-form";
import { z } from "zod";

import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { MultiComboboxField } from "@/components/shared/multi-combobox-field";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import type { categories, experienceLevels, modalities } from "@/db/schema";
import type {
  ActionData,
  CategoryActionValues,
} from "@/lib/admin/events/bases-action.server";
import { experienceLevelOptions } from "@/lib/events/experience-levels";
import { groupTypeLabels, groupTypeOptions } from "@/lib/events/group-types";
import {
  createValidatedRouteSubmitHandler,
  isRouteFormPending,
  requiredFieldMessage,
  useApplyServerFieldErrors,
  useOptionalFormAction,
  useOptionalNavigation,
  useOptionalSubmit,
} from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";
import type { EventBasesLoaderData } from "@/lib/admin/events/bases-route.server";

type ModalityRow = typeof modalities.$inferSelect;
type ExperienceLevelRow = typeof experienceLevels.$inferSelect;
type CategoryRow = typeof categories.$inferSelect & {
  modalityIds: string[];
  experienceLevelIds: string[];
};

type EventBaseAreaProps = {
  loaderData: EventBasesLoaderData;
  actionData?: ActionData;
};

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
    experienceLevelIds: z.array(z.string()),
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
type CategoryFormController = UseFormReturn<CategoryFormValues>;

const emptyCategoryFieldErrors: Record<string, string> = {};
const emptyCategorySelection: string[] = [];

export function EventCategoriesRouteView({
  loaderData,
}: {
  loaderData: EventBasesLoaderData;
}) {
  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Categorías"
      description="Gestioná las categorías, tipos de grupo, modalidades y niveles de experiencia del evento activo."
      action={{
        label: "Nueva categoría",
        to: buildCategoryCreatePath(loaderData.selectedEventId),
      }}
    >
      {loaderData.categories.length > 0 ? (
        <CategoriesTable
          categories={loaderData.categories}
          selectedEventId={loaderData.selectedEventId}
          experienceLevels={loaderData.experienceLevels}
        />
      ) : (
        <AdminEmptyState
          title="Todavía no hay categorías creadas."
          description="Creá la primera categoría para definir rangos de edad y aplicabilidad competitiva del evento activo."
        />
      )}
    </AdminResourceLayout>
  );
}

export function NewEventCategoryRouteView({
  loaderData,
  actionData: providedActionData,
}: EventBaseAreaProps) {
  useServerActionToast(providedActionData);

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Nueva categoría"
      description="Definí rango de edad, tipos de grupo, modalidades y niveles de experiencia."
    >
      <CategoryFormPanel>
        <CategoryForm
          formId="create-category-form"
          intent="create-category"
          modalities={loaderData.modalities}
          experienceLevels={loaderData.experienceLevels}
          fieldErrors={providedActionData?.fieldErrors}
          submittedValues={getCategorySubmittedValues(
            providedActionData,
            "create-category",
          )}
        />
        <CategoryFormActions
          formId="create-category-form"
          pendingLabel="Guardando categoría..."
          pendingScope={{ intent: "create-category" }}
          submitLabel="Guardar"
        />
      </CategoryFormPanel>
    </AdminResourceLayout>
  );
}

export function EventCategoryDetailRouteView({
  loaderData,
  actionData: providedActionData,
  categoryId,
}: EventBaseAreaProps & { categoryId: string }) {
  useServerActionToast(providedActionData);

  const category = loaderData.categories.find(
    (currentCategory) => currentCategory.id === categoryId,
  );

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title={category ? "Editar categoría" : "Categoría no encontrada"}
      description={
        category
          ? "Editá la categoría y su aplicabilidad competitiva."
          : "No encontramos esa categoría dentro del evento activo."
      }
      headerAction={category ? <CategoryActions category={category} /> : null}
    >
      {category ? (
        <CategoryFormPanel>
          <CategoryForm
            formId="update-category-form"
            id={category.id}
            intent="update-category"
            modalities={loaderData.modalities}
            experienceLevels={loaderData.experienceLevels}
            name={category.name}
            minAge={category.minAge}
            maxAge={category.maxAge}
            groupTypes={category.groupTypes}
            modalityIds={category.modalityIds}
            experienceLevelIds={category.experienceLevelIds}
            fieldErrors={providedActionData?.fieldErrors}
            submittedValues={getCategorySubmittedValues(
              providedActionData,
              "update-category",
              category.id,
            )}
          />
          <CategoryFormActions
            formId="update-category-form"
            pendingLabel="Guardando categoría..."
            pendingScope={{
              intent: "update-category",
              fields: { id: category.id },
            }}
            submitLabel="Guardar"
          />
        </CategoryFormPanel>
      ) : (
        <EmptyResourceState>No encontramos esa categoría.</EmptyResourceState>
      )}
    </AdminResourceLayout>
  );
}

function CategoriesTable({
  categories,
  experienceLevels,
  selectedEventId,
}: {
  categories: CategoryRow[];
  experienceLevels: ExperienceLevelRow[];
  selectedEventId: string | null;
}) {
  const columns: DataTableColumn<CategoryRow>[] = [
    {
      id: "name",
      header: "Nombre",
      className: "min-w-56 font-medium",
      cell: (category) => (
        <Link
          to={buildCategoryDetailPath(category.id, selectedEventId)}
          className="text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {category.name}
        </Link>
      ),
      filterValue: (category) => category.name,
    },
    {
      id: "ages",
      header: "Edades",
      className: "text-muted-foreground",
      cell: (category) => `${category.minAge} a ${category.maxAge} años`,
      filterValue: (category) => `${category.minAge} ${category.maxAge}`,
      sortValue: getCategoryAgeSortValue,
    },
    {
      id: "groupTypes",
      header: "Tipos de grupo",
      cell: (category) => (
        <BadgeList
          labels={category.groupTypes.map(
            (groupType) => groupTypeLabels[groupType] ?? groupType,
          )}
          emptyLabel="Sin tipos de grupo"
        />
      ),
      filterValues: (category) => category.groupTypes,
      filterValue: (category) =>
        category.groupTypes
          .map((groupType) => groupTypeLabels[groupType] ?? groupType)
          .join(" "),
    },
    {
      id: "experienceLevels",
      header: "Niveles",
      cell: (category) => (
        <BadgeList
          labels={formatNamesAsArray(
            experienceLevels,
            category.experienceLevelIds,
          )}
        />
      ),
      filterValue: (category) =>
        formatNamesAsArray(experienceLevels, category.experienceLevelIds).join(
          " ",
        ),
    },
  ];

  return (
    <DataTable
      mode="client"
      rows={categories}
      columns={columns}
      getRowKey={(category) => category.id}
      searchPlaceholder="Buscar categoría por nombre"
      textFilterColumnId="name"
      facetedFilters={[
        {
          columnId: "groupTypes",
          label: "Filtros",
          groups: [
            {
              label: "Tipo de grupo",
              options: groupTypeOptions,
            },
          ],
        },
      ]}
      emptyMessage="No hay categorías que coincidan con la búsqueda."
      initialSort={{ columnId: "ages", direction: "asc" }}
    />
  );
}

function getCategoryAgeSortValue(category: CategoryRow) {
  return [
    category.minAge.toString().padStart(3, "0"),
    category.maxAge.toString().padStart(3, "0"),
    category.name,
  ].join("-");
}

function BadgeList({
  emptyLabel,
  labels,
}: {
  emptyLabel?: string;
  labels: string[];
}) {
  if (labels.length === 0) {
    return emptyLabel ? (
      <p className="text-sm text-muted-foreground">{emptyLabel}</p>
    ) : null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {labels.map((label) => (
        <Badge key={label} variant="secondary">
          {label}
        </Badge>
      ))}
    </div>
  );
}

function CategoryActions({ category }: { category: CategoryRow }) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  return (
    <>
      <ResourceActionsMenu contentClassName="w-48">
        <DropdownMenuGroup>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setDeleteDialogOpen(true)}
          >
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </ResourceActionsMenu>
      <DeleteCategoryDialog
        category={category}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />
    </>
  );
}

function DeleteCategoryDialog({
  category,
  open,
  onOpenChange,
}: {
  category: CategoryRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Eliminar categoría</DialogTitle>
          <DialogDescription>
            Esta acción borra {category.name} si no tiene coreografías
            relacionadas. No se puede deshacer.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancelar
            </Button>
          </DialogClose>
          <form method="post">
            <input type="hidden" name="intent" value="delete-category" />
            <input type="hidden" name="id" value={category.id} />
            <input type="hidden" name="confirmDeletion" value={category.id} />
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

function CategoryForm({
  experienceLevelIds = emptyCategorySelection,
  experienceLevels,
  fieldErrors = emptyCategoryFieldErrors,
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
  experienceLevelIds?: string[];
  experienceLevels: ExperienceLevelRow[];
  fieldErrors?: Record<string, string>;
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
  const selectedExperienceLevelValues = useMemo(
    () =>
      experienceLevelIds
        .map((experienceLevelId) => {
          return experienceLevels.find(
            (level) => level.id === experienceLevelId,
          )?.name;
        })
        .filter((levelName): levelName is string => Boolean(levelName)),
    [experienceLevelIds, experienceLevels],
  );
  const defaultValues = useMemo(
    () =>
      submittedValues ?? {
        name: name ?? "",
        minAge: minAge === undefined ? "" : String(minAge),
        maxAge: maxAge === undefined ? "" : String(maxAge),
        groupTypes,
        modalityIds,
        experienceLevelIds: selectedExperienceLevelValues,
      },
    [
      groupTypes,
      maxAge,
      minAge,
      modalityIds,
      name,
      selectedExperienceLevelValues,
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

  useApplyServerFieldErrors(form, fieldErrors, resolveCategoryFieldName);

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
        <CategoryTextField
          className="sm:col-span-2"
          form={form}
          label="Nombre de la categoría"
          name="name"
        />
        <CategoryTextField
          form={form}
          label="Edad mínima"
          min="0"
          name="minAge"
          placeholder="Inclusive"
          type="number"
        />
        <CategoryTextField
          form={form}
          label="Edad máxima"
          min="0"
          name="maxAge"
          placeholder="Inclusive"
          type="number"
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
          name="experienceLevelIds"
          inputName="experienceLevelIds"
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

function CategoryTextField({
  className,
  form,
  label,
  name,
  ...inputProps
}: {
  className?: string;
  form: CategoryFormController;
  label: string;
  name: "name" | "minAge" | "maxAge";
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "form" | "name">) {
  const error = form.formState.errors[name]?.message;

  return (
    <Field className={className} data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={`category-${name}`}>{label}</FieldLabel>
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <Input
            id={`category-${name}`}
            aria-invalid={error ? true : undefined}
            autoComplete="off"
            {...inputProps}
            {...field}
          />
        )}
      />
      <FieldError>{error}</FieldError>
    </Field>
  );
}

function CategoryFormActions({
  formId,
  pendingScope,
  pendingLabel,
  submitLabel,
}: {
  formId: string;
  pendingScope: { intent: string; fields?: Record<string, string> };
  pendingLabel: string;
  submitLabel: string;
}) {
  const navigation = useOptionalNavigation();
  const isPending = isRouteFormPending(navigation, pendingScope);

  return (
    <div className="flex items-center justify-end gap-2">
      <Button asChild variant="outline">
        <Link to={buildCategoriasListPath(null)}>Volver</Link>
      </Button>
      <Button type="submit" form={formId} disabled={isPending}>
        {isPending ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" data-icon />
        ) : (
          <Check aria-hidden="true" data-icon="inline-start" />
        )}
        {isPending ? pendingLabel : submitLabel}
      </Button>
    </div>
  );
}

function CategoryFormPanel({ children }: { children: ReactNode }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-6">{children}</CardContent>
    </Card>
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

export function buildCategoryCreatePath(selectedEventId: string | null) {
  return appendSelectedEventId(
    "/administracion/categorias/nueva",
    selectedEventId,
  );
}

export function buildCategoriasListPath(selectedEventId: string | null) {
  return appendSelectedEventId("/administracion/categorias", selectedEventId);
}

export function buildCategoryDetailPath(
  categoryId: string,
  selectedEventId: string | null,
) {
  return appendSelectedEventId(
    `/administracion/categorias/${categoryId}`,
    selectedEventId,
  );
}

function appendSelectedEventId(
  pathname: string,
  _selectedEventId: string | null,
) {
  return pathname;
}

function formatNamesAsArray(
  records: Array<{ id: string; name: string }>,
  selectedIds: string[],
) {
  return selectedIds
    .map((id) => records.find((record) => record.id === id)?.name)
    .filter((name): name is string => Boolean(name));
}

function resolveCategoryFieldName(fieldName: string) {
  return (fieldName === "ageRange" ? "maxAge" : fieldName) as
    | keyof CategoryFormValues
    | null;
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
    "experienceLevelIds" in values
  );
}
