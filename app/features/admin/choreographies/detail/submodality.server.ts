import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { choreographies, submodalities } from "@/db/schema";
import { validateSubmodalitySelection } from "@/lib/choreographies/registration-resolution.server";

import type { ChoreographyDetail } from "./server";
import {
  choreographySavedSuccess,
  type ChoreographyFieldUpdateErrorData,
  type ChoreographySuccessData,
} from "./shared";

/**
 * Las opciones que la vista ofrece son exactamente las que el intent acepta:
 * las submodalidades de la modalidad de la coreografía. La modalidad es
 * inmutable, así que la lista no depende de nada más.
 */
export async function listSubmodalitiesForModality(modalityId: string) {
  return await db
    .select({
      id: submodalities.id,
      name: submodalities.name,
    })
    .from(submodalities)
    .where(eq(submodalities.modalityId, modalityId))
    .orderBy(asc(submodalities.name));
}

export async function updateChoreographySubmodality(input: {
  choreography: ChoreographyDetail;
  formData: FormData;
}): Promise<ChoreographyFieldUpdateErrorData | ChoreographySuccessData> {
  // Una coreografía con presentación mantiene la submodalidad en solo lectura,
  // igual que el roster: el intent la rechaza aunque el form la mande.
  if (input.choreography.hasPresentation) {
    return {
      message:
        "No se puede cambiar la submodalidad: la coreografía ya tiene presentación.",
      status: "error",
    };
  }

  const availableSubmodalities = await listSubmodalitiesForModality(
    input.choreography.modalityId,
  );
  const submodalityId = readRequestedSubmodalityId(input.formData);
  const validation = validateSubmodalitySelection({
    availableSubmodalities,
    submodalityId,
  });

  if (!validation.ok) {
    return {
      message: validation.failure.error,
      status: "error",
    };
  }

  await db
    .update(choreographies)
    .set({
      submodalityId,
      updatedAt: new Date(),
    })
    .where(eq(choreographies.id, input.choreography.id));

  return choreographySavedSuccess();
}

function readRequestedSubmodalityId(formData: FormData) {
  const value = formData.get("submodalityId");

  return typeof value === "string" && value.length > 0 ? value : null;
}
