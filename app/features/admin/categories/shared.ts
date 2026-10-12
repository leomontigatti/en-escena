import type { ActionData } from "@/lib/admin/events/bases-action/shared.server";
import type { categories, modalities } from "@/db/schema";
import type { CategoryDeleteBlocker } from "@/lib/categories/repository.server";

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
  /** What keeps the category from being deleted; empty means it can be. */
  deleteBlockers: CategoryDeleteBlocker[];
};

const categoryDeleteBlockReasons = {
  choreographies: "Tiene coreografías.",
  schedules: "La usan cronogramas.",
} satisfies Record<CategoryDeleteBlocker, string>;

/** Why `Eliminar` cannot run, one sentence per blocker. */
function getCategoryDeleteBlockReasons(blockers: CategoryDeleteBlocker[]) {
  return blockers.map((blocker) => categoryDeleteBlockReasons[blocker]);
}

const basePath = "/administracion/categorias";

export type {
  CategoryActionData,
  CategoryDetailLoaderData,
  CategoryFormLoaderData,
  CategoriesListLoaderData,
  CategoryRow,
  ModalityRow,
};
export { basePath, getCategoryDeleteBlockReasons };
