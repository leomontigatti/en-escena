import { redirect } from "react-router";
import { eq } from "drizzle-orm";

import type {
  categories,
  experienceLevels,
  modalities,
  submodalities,
} from "@/db/schema";
import { db } from "@/db";
import { events } from "@/db/schema";
import {
  runEventBasesAction,
  type ActionData,
} from "@/lib/admin/events/bases-action.server";
import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import {
  getEventBases,
  type PriceListItem,
  type ScheduleListItem,
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
  requiredDepositPercentage: number | null;
  modalities: ModalityRow[];
  submodalities: SubmodalityRow[];
  experienceLevels: ExperienceLevelRow[];
  categories: CategoryRow[];
  schedules: ScheduleListItem[];
  prices: PriceListItem[];
};

export async function loadAdministrativeEventBases(request: Request) {
  await requireAdminPanelUser(request);
  const eventContext = await loadAdminEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const selectedEventId = eventContext.selectedEventId;
  const [selectedEvent, eventBases] = selectedEventId
    ? await Promise.all([
        db.query.events.findFirst({
          columns: { requiredDepositPercentage: true },
          where: eq(events.id, selectedEventId),
        }),
        getEventBases(selectedEventId),
      ])
    : [
        null,
        {
          categories: [],
          modalities: [],
          submodalities: [],
          experienceLevels: [],
          schedules: [],
          prices: [],
        },
      ];

  return {
    selectedEventId,
    requiredDepositPercentage: selectedEvent?.requiredDepositPercentage ?? null,
    ...eventBases,
  } satisfies EventBasesLoaderData;
}

export async function loader({ request }: { request: Request }) {
  return loadAdministrativeEventBases(request);
}

export async function handleAdministrativeEventBasesAction(request: Request) {
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
  return handleAdministrativeEventBasesAction(request);
}
