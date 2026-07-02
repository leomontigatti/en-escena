import { asc, eq } from "drizzle-orm";

import {
  db,
  modalities,
  submodalities,
} from "@/lib/events/bases-repository/shared.server";

export {
  createModality,
  createSubmodality,
  deleteModality,
  deleteSubmodality,
  listChoreographyRegistrationBaseOptionsData,
  updateModality,
  updateModalityWithSubmodalities,
  updateSubmodality,
} from "@/lib/events/bases-repository/modalities.server";
export type {
  EventBasesDeleteResult,
  EventBasesMutationResult,
} from "@/lib/events/bases-repository/shared.server";

export async function listModalities(eventId: string) {
  return db.query.modalities.findMany({
    where: eq(modalities.eventId, eventId),
    orderBy: [asc(modalities.name)],
  });
}

export async function listSubmodalities(eventId: string) {
  return db.query.submodalities.findMany({
    where: eq(submodalities.eventId, eventId),
    orderBy: [asc(submodalities.name)],
  });
}
