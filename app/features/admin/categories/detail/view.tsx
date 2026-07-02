import { useState } from "react";

import {
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { DeleteDialog } from "@/components/shared/delete-dialog";
import { EmptyResourceState } from "@/components/shared/empty-resource-state";
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
} from "../form";
import type {
  CategoryActionData,
  CategoryDetailLoaderData,
  CategoryRow,
} from "../shared";

type CategoryDetailViewProps = {
  loaderData: CategoryDetailLoaderData;
  actionData?: CategoryActionData;
  categoryId: string;
};

function CategoryDetailView({
  loaderData,
  actionData,
  categoryId,
}: CategoryDetailViewProps) {
  useServerActionToast(actionData);

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
        <AdminResourceFormCard>
          <CategoryForm
            formId="update-category-form"
            id={category.id}
            intent="update-category"
            modalities={loaderData.modalities}
            name={category.name}
            minAge={category.minAge}
            maxAge={category.maxAge}
            groupTypes={category.groupTypes}
            modalityIds={category.modalityIds}
            experienceLevelIds={category.experienceLevelIds}
            submittedValues={getCategorySubmittedValues(
              actionData,
              "update-category",
              category.id,
            )}
          />
          <CategoryFormActions
            formId="update-category-form"
            pendingScope={{
              intent: "update-category",
              fields: { id: category.id },
            }}
          />
        </AdminResourceFormCard>
      ) : (
        <EmptyResourceState>No encontramos esa categoría.</EmptyResourceState>
      )}
    </AdminResourceLayout>
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
      <DeleteDialog
        description={`Estás seguro que querés elimiar la categoría ${category.name} del evento.`}
        intentValue="delete-category"
        recordId={category.id}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />
    </>
  );
}

export { type CategoryDetailViewProps, CategoryDetailView };
