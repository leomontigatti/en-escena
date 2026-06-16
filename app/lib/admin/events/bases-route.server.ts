import { redirect } from "react-router";

import type {
  categories,
  experienceLevels,
  modalities,
  submodalities,
} from "@/db/schema";
import {
  runEventBasesAction,
  type ActionData,
} from "@/lib/admin/events/bases-action.server";
import {
  loadAdminEventContext,
  type AdminEventContext,
} from "@/lib/admin/event-context.server";
import {
  getEventBases,
  type PriceListItem,
  type ScheduleBlockListItem,
} from "@/lib/events/bases.server";
import { requireAdminPanelUser } from "@/lib/auth/internal-navigation.server";

export type { ActionData } from "@/lib/admin/events/bases-action.server";

type ModalityRow = typeof modalities.$inferSelect;
type SubmodalityRow = typeof submodalities.$inferSelect;
type ExperienceLevelRow = typeof experienceLevels.$inferSelect;
type CategoryRow = typeof categories.$inferSelect & {
  modalityIds: string[];
  experienceLevelIds: string[];
};

export type EventBasesLoaderData = {
  selectedEventId: string | null;
  modalities: ModalityRow[];
  submodalities: SubmodalityRow[];
  experienceLevels: ExperienceLevelRow[];
  categories: CategoryRow[];
  scheduleBlocks: ScheduleBlockListItem[];
  prices: PriceListItem[];
};

export async function loadEventBasesRouteData(request: Request) {
  await requireAdminPanelUser(request);
  const eventContext = await loadAdminEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const selectedEventId = eventContext.selectedEventId;
  const eventBases = selectedEventId
    ? await getEventBases(selectedEventId)
    : {
        categories: [],
        modalities: [],
        submodalities: [],
        experienceLevels: [],
        scheduleBlocks: [],
        prices: [],
      };

  return {
    selectedEventId,
    ...eventBases,
  } satisfies EventBasesLoaderData;
}

export async function loader({ request }: { request: Request }) {
  return loadEventBasesRouteData(request);
}

export async function runEventBasesRouteAction(request: Request) {
  await requireAdminPanelUser(request);

  const eventContext = await loadAdminEventContext(request);
  const eventId = eventContext.selectedEventId;

  if (!eventId) {
    return {
      status: "error",
      message: "Elegí un Evento activo antes de guardar las Bases del evento.",
      fieldErrors: {},
      scope: null,
    } satisfies ActionData;
  }

  return runEventBasesAction({ eventId, request });
}

export async function action({ request }: { request: Request }) {
  return runEventBasesRouteAction(request);
}
