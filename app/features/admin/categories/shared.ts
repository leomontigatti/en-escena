import type { ActionData } from "@/lib/admin/events/bases-action/shared.server";
import type { categories, modalities } from "@/db/schema";

type CategoryRow = Omit<typeof categories.$inferSelect, "experienceLevels"> & {
  modalityIds: string[];
  experienceLevels: string[];
};

type ModalityRow = typeof modalities.$inferSelect;
type CategoryActionData = ActionData;
type CategoriesListLoaderData = {
  selectedEventId: string | null;
  categories: CategoryRow[];
};
type CategoryFormLoaderData = {
  selectedEventId: string | null;
  modalities: ModalityRow[];
};
type CategoryDetailLoaderData = CategoryFormLoaderData & {
  category: CategoryRow | null;
};

const basePath = "/administracion/categorias";

export type {
  CategoryActionData,
  CategoryDetailLoaderData,
  CategoryFormLoaderData,
  CategoriesListLoaderData,
  CategoryRow,
  ModalityRow,
};
export { basePath };
