import type { ActionData } from "@/lib/admin/events/bases-action/shared.server";
import type { OfferedSheets } from "@/lib/judging/sheet-criteria";
import type { ModalityDeleteBlocker } from "@/lib/modalities/delete-blockers.server";
import type {
  modalities,
  submodalities,
  submodalityCriteria,
} from "@/db/schema";

export type EventModalityActionData = ActionData;

export type EventModalityRow = typeof modalities.$inferSelect;
export type EventSubmodalityRow = typeof submodalities.$inferSelect;
export type EventSubmodalityCriterionRow =
  typeof submodalityCriteria.$inferSelect;

export type EventModalitiesLoaderData = {
  selectedEventId: string | null;
  modalities: EventModalityRow[];
  submodalities: EventSubmodalityRow[];
  submodalityCriteria: EventSubmodalityCriterionRow[];
  lockedSubmodalityIds: string[];
  /** The sheets each modality is scored on, keyed by modality. */
  modalitySheets: Record<string, OfferedSheets>;
};

export type EventModalityDetailLoaderData = EventModalitiesLoaderData & {
  /** What keeps the modality from being deleted; empty means it can be. */
  deleteBlockers: ModalityDeleteBlocker[];
};

const modalityDeleteBlockReasons = {
  submodalities: "Tiene submodalidades.",
  categories: "La usan categorías.",
  schedules: "La usan cronogramas.",
  choreographies: "Tiene coreografías.",
} satisfies Record<ModalityDeleteBlocker, string>;

/** Why `Eliminar` cannot run, one sentence per blocker. */
export function getModalityDeleteBlockReasons(
  blockers: ModalityDeleteBlocker[],
) {
  return blockers.map((blocker) => modalityDeleteBlockReasons[blocker]);
}

const basePath = "/administracion/modalidades";

export { basePath };
