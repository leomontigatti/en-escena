import { useState } from "react";

import {
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { DeleteDialog } from "@/components/shared/delete-dialog";
import { EmptyResourceState } from "@/components/shared/empty-resource-state";
import { ReasonList } from "@/components/shared/reason-list";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useServerActionToast } from "@/lib/shared/toasts";

import {
  CategoryForm,
  CategoryFormActions,
  getCategorySubmittedValues,
  useCategoryForm,
} from "../form";
import {
  getCategoryDeleteBlockReasons,
  type CategoryActionData,
  type CategoryDetailLoaderData,
  type CategoryRow,
} from "../shared";

type CategoryDetailViewProps = {
  loaderData: CategoryDetailLoaderData;
  actionData?: CategoryActionData;
  initialDeleteDialogOpen?: boolean;
};

function CategoryDetailView({
  loaderData,
  actionData,
  initialDeleteDialogOpen = false,
}: CategoryDetailViewProps) {
  useServerActionToast(actionData);

  const category = loaderData.category;
  const form = useCategoryForm({
    experienceLevels: category?.experienceLevels,
    groupTypes: category?.groupTypes,
    maxAge: category?.maxAge,
    minAge: category?.minAge,
    modalityIds: category?.modalityIds,
    name: category?.name,
    submittedValues: getCategorySubmittedValues(
      actionData,
      "update-category",
      category?.id,
    ),
  });

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title={category ? category.name : "Categoría no encontrada"}
      description={
        category
          ? "Editá el rango de edad, los tipos de grupo y las modalidades de la categoría."
          : "No encontramos esa categoría dentro del evento activo."
      }
      headerAction={
        category ? (
          <CategoryActions
            category={category}
            deleteBlockReasons={getCategoryDeleteBlockReasons(
              loaderData.deleteBlockers,
            )}
            initialDeleteDialogOpen={initialDeleteDialogOpen}
          />
        ) : null
      }
    >
      {category ? (
        <>
          <AdminResourceFormCard
            footer={
              <CategoryFormActions
                form={form}
                formId="update-category-form"
                pendingScope={{
                  intent: "update-category",
                  fields: { id: category.id },
                }}
              />
            }
          >
            <CategoryForm
              form={form}
              formId="update-category-form"
              id={category.id}
              intent="update-category"
              modalities={loaderData.modalities}
            />
          </AdminResourceFormCard>
        </>
      ) : (
        <EmptyResourceState>No encontramos esa categoría.</EmptyResourceState>
      )}
    </AdminResourceLayout>
  );
}

function CategoryActions({
  category,
  deleteBlockReasons,
  initialDeleteDialogOpen,
}: {
  category: CategoryRow;
  deleteBlockReasons: string[];
  initialDeleteDialogOpen: boolean;
}) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(
    initialDeleteDialogOpen,
  );

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
      <DeleteDialog
        blockedTitle="No se puede eliminar la categoría"
        description={
          deleteBlockReasons.length > 0
            ? "Se puede eliminar cuando no tenga coreografías y ningún cronograma la use."
            : `La categoría ${category.name} se elimina del evento.`
        }
        isBlocked={deleteBlockReasons.length > 0}
        blockedDescription={<ReasonList reasons={deleteBlockReasons} />}
        intentValue="delete-category"
        title="¿Eliminar la categoría?"
        recordId={category.id}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />
    </>
  );
}

export { type CategoryDetailViewProps, CategoryDetailView };
