import { eq } from "drizzle-orm";

import { db } from "@/db";
import { choreographies } from "@/db/schema";
import { invalidExperienceLevelMessage } from "@/lib/choreographies/choreography-messages";
import { validateExperienceLevelSelection } from "@/lib/choreographies/registration-resolution.server";
import { isExperienceLevel } from "@/lib/events/experience-levels";

import type { ChoreographyDetail } from "./server";
import {
  assignedExperienceLevelFieldName,
  choreographySavedSuccess,
  type ChoreographyFieldUpdateErrorData,
  type ChoreographySuccessData,
} from "./shared";

export async function updateChoreographyExperienceLevel(input: {
  choreography: ChoreographyDetail;
  formData: FormData;
}): Promise<ChoreographyFieldUpdateErrorData | ChoreographySuccessData> {
  // The same hard block as the roster, the submodality and the capacity: with a
  // presentation the level is not touched, even if the form sends one.
  if (input.choreography.hasPresentation) {
    return {
      message:
        "No se puede cambiar el nivel de experiencia: la coreografía ya tiene presentación.",
      status: "error",
    };
  }

  // The same condition that closes the field in the loader, revalidated against
  // the category the choreography has saved. Without it the intent accepts a
  // level the view refuses to offer: with a category that declares no levels, a
  // hand-crafted POST would write a column the rest of the domain assumes is
  // null.
  if (!input.choreography.requiresExperienceLevel) {
    return {
      message:
        "No se puede cambiar el nivel de experiencia: la categoría de esta coreografía no lo requiere.",
      status: "error",
    };
  }

  const requestedExperienceLevelId = readRequestedExperienceLevelId(
    input.formData,
  );
  const validation = validateExperienceLevelSelection({
    availableExperienceLevels: input.choreography.experienceLevelOptions,
    experienceLevelId: requestedExperienceLevelId,
  });

  if (!validation.ok) {
    return {
      message: validation.failure.error,
      status: "error",
    };
  }

  // Validation has already guaranteed membership of the category's options; this
  // guard is what proves to the column's type that the string is a value of the
  // enum.
  if (
    requestedExperienceLevelId === null ||
    !isExperienceLevel(requestedExperienceLevelId)
  ) {
    return {
      message: invalidExperienceLevelMessage,
      status: "error",
    };
  }

  await db
    .update(choreographies)
    .set({
      experienceLevelId: requestedExperienceLevelId,
      updatedAt: new Date(),
    })
    .where(eq(choreographies.id, input.choreography.id));

  return choreographySavedSuccess();
}

function readRequestedExperienceLevelId(formData: FormData) {
  const value = formData.get(assignedExperienceLevelFieldName);

  return typeof value === "string" && value.length > 0 ? value : null;
}
