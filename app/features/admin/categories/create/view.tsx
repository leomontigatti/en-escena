import {
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { useServerActionToast } from "@/lib/shared/toasts";

import {
  CategoryForm,
  CategoryFormActions,
  getCategorySubmittedValues,
  useCategoryForm,
} from "../form";
import type { CategoryActionData, CategoryFormLoaderData } from "../shared";

export type CategoryCreateViewProps = {
  loaderData: CategoryFormLoaderData;
  actionData?: CategoryActionData;
};

export function CategoryCreateView({
  loaderData,
  actionData,
}: CategoryCreateViewProps) {
  useServerActionToast(actionData);

  const form = useCategoryForm({
    submittedValues: getCategorySubmittedValues(actionData, "create-category"),
  });

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Nueva categoría"
      description="Definí rango de edad, tipos de grupo, modalidades y niveles de experiencia."
    >
      <AdminResourceFormCard>
        <CategoryForm
          form={form}
          formId="create-category-form"
          intent="create-category"
          modalities={loaderData.modalities}
        />
        <CategoryFormActions
          form={form}
          formId="create-category-form"
          pendingScope={{ intent: "create-category" }}
        />
      </AdminResourceFormCard>
    </AdminResourceLayout>
  );
}
